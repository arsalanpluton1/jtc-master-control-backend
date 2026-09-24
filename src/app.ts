import cors from "cors";
import express from "express";
import path from "node:path";
import { config } from "./config/env.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found-handler.js";
import { adminRouter } from "./modules/admin/admin.routes.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { healthRouter } from "./modules/health/health.routes.js";
import { managerRouter } from "./modules/manager/manager.routes.js";
import dns  from "node:dns";
// const dns = require("node:dns");

// Custom DNS for MongoDB Atlas SRV lookup
dns.setServers(["8.8.8.8", "1.1.1.1"]);

function isAllowedCorsOrigin(origin: string) {
  if (origin === config.corsOrigin) {
    return true;
  }

  return config.nodeEnv !== "production" && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(origin);
}

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || isAllowedCorsOrigin(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error(`CORS origin not allowed: ${origin}`));
      },
    }),
  );
  app.use(express.json());
  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

  app.use("/api/auth", authRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/manager", managerRouter);
  app.use("/api/health", healthRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
