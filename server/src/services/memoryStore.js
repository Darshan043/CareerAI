import bcrypt from "bcryptjs";
import { randomUUID } from "crypto";
import { seedInternships } from "../data/seedInternships.js";

const now = () => new Date();

function withId(record) {
  const timestamp = now();
  return {
    ...record,
    _id: record._id || randomUUID(),
    createdAt: record.createdAt || timestamp,
    updatedAt: timestamp
  };
}

function clone(value) {
  return value == null ? value : structuredClone(value);
}

export const memory = {
  users: [],
  profiles: [],
  internships: [],
  matches: [],
  resumeVersions: [],
  resumeHistory: [],
  applications: [],
  notifications: []
};

export async function seedDemoUser() {
  let user = findOne("users", (item) => item.email === "demo@careerpilot.ai");
  if (!user) {
    user = insertOne("users", {
      name: "Demo Student",
      email: "demo@careerpilot.ai",
      password: await bcrypt.hash("Password@123", 12)
    });
  }
  if (!findOne("profiles", (item) => String(item.userId) === String(user._id))) {
    insertOne("profiles", { userId: user._id, skills: [], projects: [], experience: [], education: [] });
  }
}

export function list(collection) {
  return clone(memory[collection] || []);
}

export function findById(collection, id) {
  return clone((memory[collection] || []).find((record) => String(record._id) === String(id)) || null);
}

export function findOne(collection, predicate) {
  return clone((memory[collection] || []).find(predicate) || null);
}

export function findMany(collection, predicate) {
  return clone((memory[collection] || []).filter(predicate));
}

export function insertOne(collection, record) {
  if (!memory[collection]) throw new Error(`Unknown memory collection: ${collection}`);
  const saved = withId(record);
  memory[collection].push(saved);
  return clone(saved);
}

export function updateOne(collection, id, updates) {
  const record = (memory[collection] || []).find((item) => String(item._id) === String(id));
  if (!record) return null;
  Object.assign(record, clone(updates), { updatedAt: now() });
  return clone(record);
}

export function upsertOne(collection, predicate, createRecord, updateRecord = {}) {
  const record = (memory[collection] || []).find(predicate);
  return record ? updateOne(collection, record._id, updateRecord) : insertOne(collection, createRecord);
}

export function removeMany(collection, predicate) {
  if (!memory[collection]) throw new Error(`Unknown memory collection: ${collection}`);
  const before = memory[collection].length;
  memory[collection] = memory[collection].filter((record) => !predicate(record));
  return before - memory[collection].length;
}
