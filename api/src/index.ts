import cron from "node-cron";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { releaseExpiredHolds } from "./services/bookings.js";

createApp().listen(config.port, () => console.log(`DMS Sports Arena API on :${config.port}`));

// Expired holds are deleted every minute; slot reads also ignore them, so a missed run never blocks anyone.
cron.schedule("* * * * *", () => {
  releaseExpiredHolds().catch((e) => console.error("hold cleanup failed", e));
});
