import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "./env.js";

export const dbState = {
  mode: "memory",
  connected: false
};

export async function connectDatabase() {
  const uri = env.mongodbUri.trim();
  if (!uri) {
    dbState.mode = "memory";
    dbState.connected = false;
    console.warn("MONGODB_URI is not configured; using non-persistent in-memory storage.");
    return dbState;
  }

  let databaseName;
  try {
    const parsedUri = new URL(uri);
    databaseName = decodeURIComponent(parsedUri.pathname.replace(/^\//, ""));
  } catch {
    dbState.mode = "error";
    dbState.connected = false;
    throw new Error("MONGODB_URI is not a valid MongoDB connection URI.");
  }
  if (!databaseName) {
    dbState.mode = "error";
    dbState.connected = false;
    throw new Error("MONGODB_URI must include the intended database name in its path; implicit MongoDB defaults are disabled.");
  }

  try {
    if (env.mongodbDnsServers.length) dns.setServers(env.mongodbDnsServers);
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
    dbState.mode = "mongo";
    dbState.connected = true;
    console.log("MongoDB connected.");
    return dbState;
  } catch (error) {
    dbState.mode = "error";
    dbState.connected = false;
    throw new Error("MongoDB connection failed. Check server/.env and database network settings.", { cause: error });
  }
}
