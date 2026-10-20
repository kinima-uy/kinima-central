import { loadKinimaEnv } from "./load-env.mjs";
loadKinimaEnv();
const { default: app, pool, HOST, PORT } = await import("../server/index.js");

await pool.query('SELECT 1');
const server = app.listen(PORT, HOST, () => console.log(`Kinima API y portal profesional listos en http://${HOST}:${PORT}`));

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    server.close(async () => {
      await pool.end();
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  });
}
