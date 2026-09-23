import type { NextFunction, Request, RequestHandler, Response } from "express";
import { StoreEmployeeModel, StoreModel, UserAccountModel } from "../../models/index.js";
import { verifyAuthToken } from "./token.service.js";

function httpError(statusCode: number, message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const header = req.header("authorization");
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : undefined;

  if (!token) {
    next(httpError(401, "Authentication required"));
    return;
  }

  const payload = verifyAuthToken(token);

  if (!payload) {
    next(httpError(401, "Session is invalid or expired"));
    return;
  }

  const account = await UserAccountModel.findById(payload.sub).select("status role").lean();

  if (!account || account.status !== "active") {
    next(httpError(403, "Account is not active"));
    return;
  }

  if (account.role !== payload.role) {
    next(httpError(403, "Account role changed; please sign in again"));
    return;
  }

  req.auth = payload;
  next();
};

export function requireRole(...roles: Array<"admin" | "manager">) {
  const middleware: RequestHandler = (req, _res, next) => {
    if (!req.auth) {
      next(httpError(401, "Authentication required"));
      return;
    }

    if (!roles.includes(req.auth.role)) {
      next(httpError(403, "You do not have access to this area"));
      return;
    }

    next();
  };

  return middleware;
}

export async function assertStoreAccess(req: Request, _res: Response, next: NextFunction) {
  if (!req.auth) {
    next(httpError(401, "Authentication required"));
    return;
  }

  const requestedStoreId = req.params.storeId;

  if (req.auth.role === "admin") {
    next();
    return;
  }

  if (!req.auth.storeId || req.auth.storeId !== requestedStoreId) {
    next(httpError(403, "Store managers can only access their assigned store"));
    return;
  }

  const storeEmployee = await StoreEmployeeModel.findOne({
    _id: req.auth.storeEmployeeId,
    storeId: requestedStoreId,
    userAccountId: req.auth.sub,
    role: "manager",
    status: "active",
  }).lean();

  const store = await StoreModel.findOne({ _id: requestedStoreId, isActive: true }).lean();

  if (!storeEmployee || !store) {
    next(httpError(403, "Assigned store access is no longer active"));
    return;
  }

  next();
}
