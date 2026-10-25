import { app } from "./app.js";
import { connectDatabase } from "./config/db.js";
import { assertProductionConfig, env } from "./config/env.js";
import { startCronJobs, startQueues } from "./jobs/backgroundJobs.js";
import { seedInitialData } from "./services/seedService.js";

async function startServer() {
  assertProductionConfig();
  await connectDatabase();
  await seedInitialData();
  startQueues();
  startCronJobs();

  app.listen(env.port, () => {
    console.log(`CareerPilot AI API running on http://localhost:${env.port}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start CareerPilot AI API.");
  console.error(error.message || "Unexpected startup error.");
  process.exit(1);
});
// CareerPilot AI application entry point
