import { createCipheriv, randomBytes, randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { appendFile, mkdir, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { loadKinimaEnv } from "./load-env.mjs";

const envFile = loadKinimaEnv();
const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));
const localEnv = process.env.LOCALAPPDATA
  ? resolve(process.env.LOCALAPPDATA, "Kinima", "kinima.env")
  : null;
const backupDirectory = localEnv && resolve(envFile) === localEnv
  ? join(dirname(envFile), "backups")
  : join(projectRoot, "data", "backups");
const user = process.env.PGUSER;
const database = process.env.PGDATABASE;
const keyText = process.env.BACKUP_DATA_KEY || "";
const key = Buffer.from(keyText, "base64url");
const MAGIC = Buffer.from("KINIMA-DB-BACKUP-V1\0", "utf8");
const TAG_BYTES = 16;

if (!user || !database) throw new Error("El entorno debe tener PGUSER y PGDATABASE.");
if (!/^[A-Za-z0-9_-]{43}$/.test(keyText) || key.length !== 32) {
  throw new Error("BACKUP_DATA_KEY debe ser una clave base64url de 32 bytes.");
}

await mkdir(backupDirectory, { recursive: true, mode: 0o700 });
const timestamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
const target = join(backupDirectory, `kinima-postgres-${timestamp}-${randomUUID().slice(0, 8)}.dump.enc`);
const temporary = `${target}.part`;
const iv = randomBytes(12);
const cipher = createCipheriv("aes-256-gcm", key, iv);
await writeFile(temporary, Buffer.concat([MAGIC, iv]), { flag: "wx", mode: 0o600 });
const output = createWriteStream(temporary, { flags: "a", mode: 0o600 });
const child = spawn("docker", ["compose", "--env-file", envFile, "exec", "-T", "database", "pg_dump", "-Fc", "-U", user, database], {
  cwd: projectRoot,
  stdio: ["ignore", "pipe", "pipe"]
});
const errors = [];
child.stderr.on("data", (chunk) => { if (Buffer.concat(errors).length < 65536) errors.push(chunk); });
const processResult = new Promise((resolveResult, rejectResult) => {
  child.once("error", rejectResult);
  child.once("close", (code, signal) => resolveResult({ code, signal }));
});

try {
  const [result] = await Promise.all([processResult, pipeline(child.stdout, cipher, output)]);
  if (result.code !== 0) {
    const details = Buffer.concat(errors).toString("utf8").trim();
    throw new Error(details || "Docker no pudo generar el respaldo; verificá que PostgreSQL esté activo.");
  }
  await appendFile(temporary, cipher.getAuthTag());
  if ((await stat(temporary)).size < MAGIC.length + iv.length + TAG_BYTES + 100) {
    throw new Error("El respaldo quedó vacío o incompleto.");
  }
  await rename(temporary, target);
  console.log(`Respaldo PostgreSQL cifrado creado: ${target}`);
  console.log("Guardá una copia protegida de BACKUP_DATA_KEY fuera del servidor; sin ella no se puede restaurar el respaldo.");
} catch (error) {
  child.kill();
  output.destroy();
  await unlink(temporary).catch(() => {});
  if (error.code === "ENOENT") throw new Error("No se encontró Docker. Instalá Docker y arrancá la base local.");
  throw error;
}
