import { Router } from "express";
import { getDatabaseStatus } from "../../config/database.js";

export const healthRouter = Router();

healthRouter.get("/", (_req, res) => {
  res.json({
    service: "jtc-master-control-backend",
    status: "ok",
    database: getDatabaseStatus(),
    timestamp: new Date().toISOString(),
  });
});
