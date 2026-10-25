import axios from "axios";
import { env } from "../config/env.js";

const client = axios.create({
  baseURL: env.ollamaBaseUrl,
  timeout: 8000
});

export async function generateLocalText(prompt) {
  try {
    const { data } = await client.post("/api/generate", {
      model: env.ollamaChatModel,
      prompt: String(prompt).slice(0, 16000),
      stream: false
    });
    return typeof data.response === "string" ? data.response.trim() : "";
  } catch {
    return "";
  }
}

export async function generateEmbedding(text) {
  try {
    const { data } = await client.post("/api/embed", {
      model: env.ollamaEmbedModel,
      input: String(text).slice(0, 12000)
    });
    return Array.isArray(data.embeddings?.[0]) ? data.embeddings[0] : [];
  } catch {
    return [];
  }
}
