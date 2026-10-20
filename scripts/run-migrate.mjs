import { loadKinimaEnv } from "./load-env.mjs";
loadKinimaEnv();
await import("../server/migrate.js");
