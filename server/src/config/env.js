import dotenv from "dotenv";
import { fileURLToPath } from "node:url";

dotenv.config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

export const env = {
  port: process.env.PORT || 5000,
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  clientUrls: (process.env.CLIENT_URLS || "")
    .split(",")
    .map((url) => url.trim())
    .filter(Boolean),
  mongodbUri: process.env.MONGODB_URI || "",
  mongodbDnsServers: (process.env.MONGODB_DNS_SERVERS || "")
    .split(",")
    .map((server) => server.trim())
    .filter(Boolean),
  jwtSecret: process.env.JWT_SECRET || "",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  jsearchApiKey: process.env.JSEARCH_API_KEY || "",
  himalayasApiKey: process.env.HIMALAYAS_API_KEY || "",
  geminiApiKey: process.env.GEMINI_API_KEY || "",
  geminiModel: process.env.GEMINI_MODEL || "gemini-3.6-flash",
  ollamaBaseUrl: process.env.OLLAMA_BASE_URL || "http://localhost:11434",
  ollamaChatModel: process.env.OLLAMA_CHAT_MODEL || "llama3.1:8b",
  ollamaEmbedModel: process.env.OLLAMA_EMBED_MODEL || "nomic-embed-text",
  redisUrl: process.env.UPSTASH_REDIS_URL || "",
  seedSampleData: process.env.SEED_SAMPLE_DATA === "true",
  enableLiveDiscovery: process.env.ENABLE_LIVE_DISCOVERY !== "false",
  nodeEnv: process.env.NODE_ENV || "development"
};

export function assertProductionConfig() {
  if (env.nodeEnv !== "production") return;

  if (!env.mongodbUri.trim()) {
    throw new Error("MONGODB_URI must be configured for production persistence.");
  }
  if (!env.jwtSecret || env.jwtSecret.startsWith("replace-with-") || env.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be a unique secret of at least 32 characters in production.");
  }

  const origins = [env.clientUrl, ...env.clientUrls].filter(Boolean);
  if (!origins.length || origins.some((origin) => {
    try {
      return new URL(origin).protocol !== "https:";
    } catch {
      return true;
    }
  })) {
    throw new Error("CLIENT_URL and CLIENT_URLS must contain valid HTTPS origins in production.");
  }
}
