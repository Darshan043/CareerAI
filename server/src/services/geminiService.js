import { env } from "../config/env.js";
import { httpError } from "../utils/httpError.js";

const REQUEST_TIMEOUT_MS = 20_000;

export function isGeminiConfigured() {
  return Boolean(env.geminiApiKey);
}

export async function generateGeminiJson(prompt, { fetchImpl = fetch } = {}) {
  if (!env.geminiApiKey) return null;
  let response;
  try {
    response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": env.geminiApiKey
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          contents: [{ parts: [{ text: String(prompt).slice(0, 24_000) }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      }
    );
  } catch {
    throw httpError(502, "Gemini is temporarily unavailable. Please try again.");
  }

  if (response.status === 429) throw httpError(429, "Gemini rate limit reached. Please try again later.");
  if (response.status === 401 || response.status === 403) {
    throw httpError(503, "Gemini is not available with the current server configuration.");
  }
  if (!response.ok) throw httpError(502, "Gemini could not complete this request.");

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw httpError(502, "Gemini returned an invalid response.");
  }
  const text = payload?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter((part) => typeof part === "string")
    .join("")
    .trim();
  if (!text) throw httpError(502, "Gemini returned no generated content.");

  try {
    const result = JSON.parse(text);
    if (!result || typeof result !== "object" || Array.isArray(result)) {
      throw new Error("Gemini returned a non-object JSON value.");
    }
    return result;
  } catch {
    throw httpError(502, "Gemini returned content that did not match the required format.");
  }
}
