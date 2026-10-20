import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

const projectRoot = resolve(fileURLToPath(new URL("../", import.meta.url)));

export function loadKinimaEnv() {
  const candidates = [
    process.env.KINIMA_ENV_FILE,
    process.platform === "win32" && process.env.LOCALAPPDATA
      ? join(process.env.LOCALAPPDATA, "Kinima", "kinima.env")
      : null,
    join(projectRoot, ".env")
  ].filter(Boolean);
  const envPath = candidates.find(existsSync);
  if (!envPath) throw new Error("No se encontró el archivo de entorno local. Ejecutá scripts/prepare-local-env.ps1 en Windows o configurá .env en la carpeta del proyecto.");
  process.loadEnvFile(envPath);
  return envPath;
}
