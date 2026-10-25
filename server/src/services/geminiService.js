import { env } from "../config/env.js";
import { httpError } from "../utils/httpError.js";

const REQUEST_TIMEOUT_MS = 20_000;

export function isGeminiConfigured() {
  return Boolean(env.geminiApiKey);
}

export async function generateGeminiJson(prompt, { fetchImpl = fetch } = {}) {
  const apiKey = typeof env.geminiApiKey === "string" ? env.geminiApiKey.trim() : "";
  if (!apiKey) {
    throw httpError(503, "Gemini is not configured on the server. Set GEMINI_API_KEY.");
  }
  let response;
  try {
    response = await fetchImpl(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.geminiModel)}:generateContent`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-goog-api-key": apiKey
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        body: JSON.stringify({
          contents: [{ parts: [{ text: String(prompt).slice(0, 24_000) }] }],
          generationConfig: { responseMimeType: "application/json" }
        })
      }
    );
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw httpError(504, "Gemini request timed out. Please try again.");
    }
    throw httpError(502, "Gemini is temporarily unavailable. Please try again.");
  }

  if (!response.ok) {
    let providerError = {};
    try {
      providerError = (await response.json())?.error || {};
    } catch {
      // Provider error bodies are optional; never forward them to the client.
    }

    const providerDetails = `${providerError.status || ""} ${providerError.message || ""} ${JSON.stringify(providerError.details || [])}`;
    if (
      response.status === 401
      || (response.status === 400 && /api[_ -]?key.{0,20}invalid|invalid.{0,20}api[_ -]?key|invalid credentials/i.test(providerDetails))
    ) {
      throw httpError(503, "Gemini rejected the configured API key. Check GEMINI_API_KEY.");
    }
    if (response.status === 403) {
      throw httpError(503, "Gemini access is forbidden. Check API key permissions and Gemini API access.");
    }
    if (response.status === 404) {
      throw httpError(503, "The configured Gemini model is unavailable. Check GEMINI_MODEL.");
    }
    if (response.status === 402) {
      throw httpError(429, "Gemini billing quota is exhausted. Check the project's quota and billing settings.");
    }
    if (response.status === 429) {
      if (/quota|resource_exhausted|billing/i.test(providerDetails)) {
        throw httpError(429, "Gemini quota is exhausted. Check the project's quota and billing settings.");
      }
      throw httpError(429, "Gemini rate limit reached. Please try again later.");
    }
    throw httpError(502, "Gemini could not complete this request. Please try again.");
  }

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
