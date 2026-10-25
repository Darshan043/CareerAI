import { Queue } from "bullmq";
import IORedis from "ioredis";
import cron from "node-cron";
import { discoverInternships } from "../agents/discoveryAgent.js";
import { scoreInternship } from "../agents/matchingAgent.js";
import { env } from "../config/env.js";
import { create, getAll, getOne, upsert } from "../services/repository.js";

let queue;

export function startQueues() {
  // TODO: Create the BullMQ queue on the Upstash Redis connection when env.redisUrl is set.
  console.warn("startQueues is not implemented yet");
  return null;
}

async function syncInternshipsJob() {
  // TODO: Discover internships and upsert each one by title + company.
}

async function recalculateMatchesJob() {
  // TODO: Re-score every internship for every user profile and upsert the matches.
}

async function notifyUsersJob() {
  // TODO: For every user, raise notifications for deadlines inside three days, matches
  // TODO: scoring 80+, and applications with no follow-up after seven days, skipping
  // TODO: messages that already exist.
}

export function startCronJobs() {
  // TODO: Schedule the sync (every 6h), match recalculation (daily 02:00), and the
  // TODO: notification sweep (hourly).
  console.warn("startCronJobs is not implemented yet");
}

export async function runStartupJobs() {
  // TODO: Run all three jobs once and enqueue the startup health check.
}
