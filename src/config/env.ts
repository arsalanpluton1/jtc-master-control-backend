import "dotenv/config";

const requiredEnv = ["MONGODB_URI", "AUTH_TOKEN_SECRET"] as const;

function getRequiredEnv(key: (typeof requiredEnv)[number]) {
  const value = process.env[key];

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  mongodbUri: getRequiredEnv("MONGODB_URI"),
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  nodeEnv: process.env.NODE_ENV ?? "development",
  authTokenSecret:
    process.env.AUTH_TOKEN_SECRET ??
    (process.env.NODE_ENV === "production" ? getRequiredEnv("AUTH_TOKEN_SECRET") : "dev-only-auth-token-secret"),
  authTokenTtlSeconds: Number(process.env.AUTH_TOKEN_TTL_SECONDS ?? 60 * 60 * 8),
} as const;
