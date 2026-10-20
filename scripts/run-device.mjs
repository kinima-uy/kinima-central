import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import process from "node:process";
import { loadKinimaEnv } from "./load-env.mjs";

loadKinimaEnv();
const [major, minor] = process.versions.node.split(".").map(Number);
const needsSqliteFlag = (major === 22 && minor < 13) || (major === 23 && minor < 4);
const deviceFile = fileURLToPath(new URL("../device/index.js", import.meta.url));
const args = [...(needsSqliteFlag ? ["--experimental-sqlite"] : []), deviceFile];
const child = spawn(process.execPath, args, { env: process.env, stdio: "inherit" });
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => child.kill(signal));
child.once("error", (error) => { console.error(`No se pudo iniciar el servicio local: ${error.message}`); process.exitCode = 1; });
child.once("exit", (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
