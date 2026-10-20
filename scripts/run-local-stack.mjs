import { spawn } from 'node:child_process';
import process from 'node:process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadKinimaEnv } from './load-env.mjs';

const projectRoot = resolve(fileURLToPath(new URL('../', import.meta.url)));
const envPath = resolve(loadKinimaEnv());

function run(command, args) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, { cwd: projectRoot, env: process.env, stdio: 'inherit' });
    child.once('error', (error) => {
      if (error.code === 'ENOENT' && command === 'docker') {
        rejectRun(new Error('No se encontró Docker. Instalá y abrí Docker Desktop para usar el entorno completo.'));
      } else rejectRun(error);
    });
    child.once('exit', (code, signal) => {
      if (code === 0) resolveRun();
      else rejectRun(new Error(`${command} terminó ${signal ? `por ${signal}` : `con código ${code}`}.`));
    });
  });
}

console.log('Iniciando PostgreSQL local…');
await run('docker', ['compose', '--env-file', envPath, 'up', '-d', '--wait', 'database']);
console.log('Aplicando el esquema de Kinima…');
await run(process.execPath, ['scripts/run-migrate.mjs']);

const services = [
  { label: 'API profesional', file: 'scripts/run-server.mjs' },
  { label: 'Consola local', file: 'scripts/run-device.mjs' }
].map(({ label, file }) => {
  const child = spawn(process.execPath, [file], { cwd: projectRoot, env: process.env, stdio: 'inherit' });
  const exited = new Promise((resolveExit, rejectExit) => {
    child.once('error', rejectExit);
    child.once('exit', (code, signal) => resolveExit({ code, signal }));
  });
  return { label, child, exited };
});

let stopping = false;
function stopServices() {
  if (stopping) return;
  stopping = true;
  for (const { child } of services) {
    if (child.exitCode === null && child.signalCode === null) child.kill();
  }
}
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    process.exitCode = signal === 'SIGINT' ? 130 : 143;
    stopServices();
  });
}

console.log('Consola: http://127.0.0.1:4173');
console.log('Portal profesional: http://127.0.0.1:4174/professional');
console.log('Presioná Ctrl+C para detener los servicios. PostgreSQL quedará activo con sus datos.');

try {
  const { label, result } = await Promise.race(services.map(async ({ label, exited }) => ({ label, result: await exited })));
  if (!stopping) {
    console.error(`${label} se detuvo${result.signal ? ` por ${result.signal}` : ` con código ${result.code}`}.`);
    process.exitCode = result.code || 1;
  }
} catch (error) {
  console.error(`No se pudo mantener el entorno local: ${error.message}`);
  process.exitCode = 1;
} finally {
  stopServices();
  await Promise.all(services.map(({ exited }) => exited.catch(() => undefined)));
}
