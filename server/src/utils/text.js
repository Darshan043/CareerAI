export const knownSkills = [
  "javascript",
  "react",
  "node.js",
  "express",
  "mongodb",
  "mongoose",
  "python",
  "sql",
  "html",
  "css",
  "tailwind",
  "git",
  "docker",
  "aws",
  "data analysis",
  "machine learning",
  "nlp",
  "api",
  "rest",
  "testing",
  "figma",
  "ui",
  "ux",
  "communication",
  "problem solving"
];

export function normalizeSkill(skill) {
  return String(skill || "").trim().toLowerCase();
}

export function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => String(value || "").trim()).filter(Boolean))];
}

export function extractSkills(text = "") {
  const normalized = String(text).toLowerCase();
  return knownSkills.filter((skill) => new RegExp(`(^|[^a-z0-9+#.])${skill.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9+#.]|$)`, "i").test(normalized));
}

export function summarizeText(text = "", maxLength = 220) {
  const normalized = String(text).replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

export function parseListInput(value) {
  const values = Array.isArray(value) ? value : typeof value === "string" ? value.split(",") : [];
  return [...new Set(values.map(normalizeSkill).filter(Boolean))];
}
