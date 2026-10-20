import { createDecipheriv } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";
import { open, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { loadKinimaEnv } from "./load-env.mjs";

const envFile = loadKinimaEnv();
const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const [backupArgument, restoreDatabase] = process.argv.slice(2);
const backupPath = backupArgument ? resolve(backupArgument) : "";
const user = process.env.PGUSER;
const activeDatabase = process.env.PGDATABASE;
const keyText = process.env.BACKUP_DATA_KEY || "";
const key = Buffer.from(keyText, "base64url");
const MAGIC = Buffer.from("KINIMA-DB-BACKUP-V1\0", "utf8");
const IV_BYTES = 12;
const TAG_BYTES = 16;

if (!backupPath || !restoreDatabase) {
  throw new Error("Uso: npm run db:restore-check -- <respaldo.dump.enc> <base_nueva_de_prueba>");
}
if (!user || !activeDatabase) throw new Error("El entorno debe tener PGUSER y PGDATABASE.");
if (!/^[A-Za-z0-9_-]{43}$/.test(keyText) || key.length !== 32) {
  throw new Error("BACKUP_DATA_KEY debe ser una clave base64url de 32 bytes.");
}
if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(restoreDatabase) || restoreDatabase.toLowerCase() === activeDatabase.toLowerCase()) {
  throw new Error("La base de destino debe tener un nombre simple y ser distinta de PGDATABASE.");
}

const metadata = await stat(backupPath);
const prefixBytes = MAGIC.length + IV_BYTES;
if (!metadata.isFile() || metadata.size < prefixBytes + TAG_BYTES + 100) throw new Error("El archivo no parece un respaldo cifrado Kinima válido.");
const handle = await open(backupPath, "r");
let header;
let iv;
let tag;
try {
  header = Buffer.alloc(MAGIC.length);
  iv = Buffer.alloc(IV_BYTES);
  tag = Buffer.alloc(TAG_BYTES);
  await handle.read(header, 0, header.length, 0);
  await handle.read(iv, 0, iv.length, MAGIC.length);
  await handle.read(tag, 0, tag.length, metadata.size - TAG_BYTES);
} finally {
  await handle.close();
}
if (!header.equals(MAGIC)) throw new Error("El formato del respaldo no corresponde a Kinima.");

function createDecryptStream() {
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const encrypted = createReadStream(backupPath, {
    start: prefixBytes,
    end: metadata.size - TAG_BYTES - 1
  });
  return { encrypted, decipher };
}
function compose(args, stdio) {
  return spawn("docker", ["compose", "--env-file", envFile, ...args], { cwd: projectRoot, stdio });
}
function listenForExit(child) {
  const errors = [];
  child.stderr?.on("data", (chunk) => { if (Buffer.concat(errors).length < 65536) errors.push(chunk); });
  const result = new Promise((resolveResult, rejectResult) => {
    child.once("error", rejectResult);
    child.once("close", (code, signal) => resolveResult({ code, signal, details: Buffer.concat(errors).toString("utf8").trim() }));
  });
  return result;
}
async function verifyArchive() {
  const child = compose(["exec", "-T", "database", "pg_restore", "--list", "-"], ["pipe", "ignore", "pipe"]);
  const resultPromise = listenForExit(child);
  const { encrypted, decipher } = createDecryptStream();
  try {
    const [result] = await Promise.all([resultPromise, pipeline(encrypted, decipher, child.stdin)]);
    if (result.code !== 0) throw new Error(result.details || "pg_restore no pudo leer el archivo.");
  } catch (error) {
    child.kill();
    throw error;
  }
}
async function runCompose(args) {
  const child = compose(args, ["ignore", "inherit", "pipe"]);
  const result = await listenForExit(child);
  if (result.code !== 0) throw new Error(result.details || `Docker terminó con código ${result.code ?? result.signal}.`);
}
async function restoreArchive() {
  const child = compose([
    "exec", "-T", "database", "pg_restore", "--exit-on-error", "--no-owner", "--username", user, "--dbname", restoreDatabase, "-"
  ], ["pipe", "inherit", "pipe"]);
  const resultPromise = listenForExit(child);
  const { encrypted, decipher } = createDecryptStream();
  try {
    const [result] = await Promise.all([resultPromise, pipeline(encrypted, decipher, child.stdin)]);
    if (result.code !== 0) throw new Error(result.details || "pg_restore no pudo completar la restauración.");
  } catch (error) {
    child.kill();
    throw error;
  }
}

try {
  console.log("Verificando el cifrado y el contenido del respaldo…");
  await verifyArchive();
  console.log(`El respaldo es válido. Creando la base vacía ${restoreDatabase}…`);
  await runCompose(["exec", "-T", "database", "createdb", "--username", user, restoreDatabase]);
  console.log("Restaurando en la base de prueba…");
  await restoreArchive();
  console.log(`Restauración de comprobación completada en ${restoreDatabase}. La base activa ${activeDatabase} no se modificó.`);
} catch (error) {
  if (error.code === "ENOENT") throw new Error("No se encontró Docker. Instalá Docker y arrancá PostgreSQL.");
  throw error;
}
