import { dbState } from "../config/db.js";
import { env } from "../config/env.js";
import { seedInternships } from "../data/seedInternships.js";
import { seedDemoUser } from "./memoryStore.js";
import { upsert } from "./repository.js";

export async function seedInitialData() {
  if (dbState.mode === "mongo" && !env.seedSampleData) return;

  if (dbState.mode !== "mongo") {
    await seedDemoUser();
  }

  for (const internship of seedInternships) {
    const starter = { ...internship, source: "CareerPilot catalog", isSample: true };
    await upsert(
      "internships",
      { company: internship.company, title: internship.title, applyLink: internship.applyLink },
      starter,
      starter
    );
  }
}
