import type { ErrorRequestHandler } from "express";
import { config } from "../config/env.js";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const statusCode = typeof error.statusCode === "number" ? error.statusCode : 500;
  const message = error instanceof Error ? error.message : "Unexpected server error";

  res.status(statusCode).json({
    error: {
      message: statusCode === 500 && config.nodeEnv === "production" ? "Internal server error" : message,
    },
  });
};
