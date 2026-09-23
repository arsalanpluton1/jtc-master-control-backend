import { createHmac, timingSafeEqual } from "node:crypto";
import { config } from "../../config/env.js";
import type { UserAccountRole } from "../../models/index.js";

export type AuthTokenPayload = {
  sub: string;
  email: string;
  displayName: string;
  role: Extract<UserAccountRole, "admin" | "manager">;
  storeId?: string;
  storeEmployeeId?: string;
  exp: number;
};

function encode(value: unknown) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function sign(value: string) {
  return createHmac("sha256", config.authTokenSecret).update(value).digest("base64url");
}

export function createAuthToken(payload: Omit<AuthTokenPayload, "exp">) {
  const exp = Math.floor(Date.now() / 1000) + config.authTokenTtlSeconds;
  const body = encode({ ...payload, exp });
  const signature = sign(body);

  return `${body}.${signature}`;
}

export function verifyAuthToken(token: string): AuthTokenPayload | null {
  const [body, signature] = token.split(".");

  if (!body || !signature) {
    return null;
  }

  const expectedSignature = sign(body);
  const provided = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as AuthTokenPayload;

    if (!payload.sub || !payload.email || !payload.role || payload.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
