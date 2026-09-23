import { Router } from "express";
import { StoreEmployeeModel, StoreModel, UserAccountModel } from "../../models/index.js";
import { requireAuth } from "./auth.middleware.js";
import { createAuthToken } from "./token.service.js";
import { verifyPassword } from "./password.service.js";

export const authRouter = Router();

function httpError(statusCode: number, message: string) {
  const error = new Error(message) as Error & { statusCode: number };
  error.statusCode = statusCode;
  return error;
}

function sessionUser(auth: NonNullable<Express.Request["auth"]>) {
  return {
    id: auth.sub,
    email: auth.email,
    displayName: auth.displayName,
    role: auth.role,
    storeId: auth.storeId,
    storeEmployeeId: auth.storeEmployeeId,
  };
}

authRouter.post("/login", async (req, res, next) => {
  try {
    const email = typeof req.body.email === "string" ? req.body.email.trim().toLowerCase() : "";
    const password = typeof req.body.password === "string" ? req.body.password : "";

    if (!email || !password) {
      throw httpError(400, "Email and password are required");
    }

    const user = await UserAccountModel.findOne({ email }).select("+passwordHash").lean();

    if (!user || !(await verifyPassword(password, user.passwordHash ?? undefined))) {
      throw httpError(401, "Invalid email or password");
    }

    if (user.status !== "active") {
      throw httpError(403, "Account is not active");
    }

    if (user.role !== "admin" && user.role !== "manager") {
      throw httpError(403, "This dashboard is only available to Admin and Store Manager accounts");
    }

    let storeId: string | undefined;
    let storeEmployeeId: string | undefined;

    if (user.role === "manager") {
      const storeEmployee = await StoreEmployeeModel.findOne({
        userAccountId: user._id,
        role: "manager",
        status: "active",
      }).lean();

      if (!storeEmployee) {
        throw httpError(403, "Store Manager account is not assigned to an active store");
      }

      const store = await StoreModel.findOne({ _id: storeEmployee.storeId, isActive: true }).lean();

      if (!store) {
        throw httpError(403, "Assigned store is not active");
      }

      storeId = storeEmployee.storeId.toString();
      storeEmployeeId = storeEmployee._id.toString();
    }

    await UserAccountModel.updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });

    const token = createAuthToken({
      sub: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      storeId,
      storeEmployeeId,
    });

    const auth = {
      sub: user._id.toString(),
      email: user.email,
      displayName: user.displayName,
      role: user.role,
      storeId,
      storeEmployeeId,
      exp: 0,
    } as const;

    res.json({
      token,
      user: sessionUser(auth),
    });
  } catch (error) {
    next(error);
  }
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({
    user: sessionUser(req.auth!),
  });
});
