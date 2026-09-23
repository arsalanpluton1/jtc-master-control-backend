import { connectDatabase } from "../config/database.js";
import { config } from "../config/env.js";
import { UserAccountModel } from "../models/index.js";
import { hashPassword } from "../modules/auth/password.service.js";

function readEnv(key: string) {
  const value = process.env[key]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return value;
}

async function main() {
  const email = readEnv("INITIAL_ADMIN_EMAIL").toLowerCase();
  const displayName = readEnv("INITIAL_ADMIN_DISPLAY_NAME");
  const password = readEnv("INITIAL_ADMIN_PASSWORD");

  if (password.length < 12) {
    throw new Error("INITIAL_ADMIN_PASSWORD must be at least 12 characters");
  }

  await connectDatabase(config.mongodbUri);

  const passwordHash = await hashPassword(password);
  const result = await UserAccountModel.findOneAndUpdate(
    { email },
    {
      $set: {
        displayName,
        passwordHash,
        role: "admin",
        status: "active",
      },
    },
    {
      new: true,
      setDefaultsOnInsert: true,
      upsert: true,
    },
  ).lean();

  console.log(`Initial admin ready: ${result.email}`);
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    const { default: mongoose } = await import("mongoose");
    await mongoose.disconnect();
  });
