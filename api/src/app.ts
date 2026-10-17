import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { config, isProd } from "./config.js";
import { HttpError, errorHandler } from "./http.js";
import { authRouter } from "./routes/auth.js";
import { playerRouter } from "./routes/player.js";
import { adminRouter } from "./routes/admin.js";

export function createApp() {
  const app = express();
  app.set("trust proxy", 1);

  // Must NOT touch the database, so the keep-awake ping never wakes Neon.
  app.get("/api/health", (_req, res) => { res.json({ ok: true }); });

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        frameSrc: ["https://www.google.com", "https://maps.google.com"],
        connectSrc: ["'self'"],
        workerSrc: ["'self'"],
        manifestSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cors({ origin: config.webOrigin, credentials: true }));
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());

  // CSRF defence in depth (cookie is SameSite=Lax): browsers send Origin on writes.
  app.use("/api", (req, _res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (origin) {
      let host = "";
      try { host = new URL(origin).host; } catch { /* ignore */ }
      if (origin !== config.webOrigin && host !== req.headers.host && (isProd || !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host))) return next(new HttpError(403, "Bad origin"));
    }
    next();
  });

  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api", playerRouter);
  app.use("/api", (_req, _res, next) => next(new HttpError(404, "Not found")));

  // Serve the built React app from the same origin (simplest for login cookies).
  const webDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist, { maxAge: "1h", index: false }));
    app.get("*", (_req, res) => { res.sendFile(path.join(webDist, "index.html")); });
  }

  app.use(errorHandler);
  return app;
}
