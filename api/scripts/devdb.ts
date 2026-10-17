// Starts a throwaway local Postgres on :54329 (data in .devdb/) for development and tests.
import EmbeddedPostgres from "embedded-postgres";
import fs from "node:fs";

const dir = ".devdb";
const fresh = !fs.existsSync(dir);
const pg = new EmbeddedPostgres({ databaseDir: dir, user: "postgres", password: "postgres", port: 54329, persistent: true });
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase("arena");
console.log("Dev Postgres ready on postgresql://postgres:postgres@localhost:54329/arena");
process.on("SIGINT", async () => { await pg.stop(); process.exit(0); });
setInterval(() => {}, 1 << 30);
