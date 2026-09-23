import { createApp } from "./app.js";
import { config } from "./config/env.js";
import { connectDatabase } from "./config/database.js";

async function startServer() {
  await connectDatabase(config.mongodbUri);

  const app = createApp();

  app.listen(config.port, () => {
    console.log(`JTC Master Control API listening on port ${config.port}`);
  });
}

startServer().catch((error: unknown) => {
  console.error("Failed to start JTC Master Control API", error);
  process.exit(1);
});
