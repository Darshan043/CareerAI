import { PDFParse } from "pdf-parse";
import { generateEmbedding } from "../services/ollamaService.js";
import { generateGeminiJson } from "../services/geminiService.js";
import { extractSkills, summarizeText } from "../utils/text.js";
import { httpError } from "../utils/httpError.js";

function sectionLines(text, labels) {
  const lines = String(text).split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const heading = new RegExp(`\\b(?:${labels.join("|")})\\b`, "i");
  const headings = /^(?:summary|objective|skills|technical skills|experience|work experience|employment|education|projects|certifications|achievements|contact|references)\s*:?\s*$/i;
  const matches = [];
  let active = false;
  for (const line of lines) {
    if (headings.test(line)) {
      active = heading.test(line);
      continue;
    }
    if (active && matches.length < 8) matches.push(line.slice(0, 500));
    if (matches.length === 8) break;
  }
  return matches;
}

export async function parseResume(buffer, { roles = [] } = {}) {
  const parser = new PDFParse({ data: buffer });
  let parsed;
  try {
    parsed = await parser.getText();
  } finally {
    await parser.destroy();
  }
  const resumeText = String(parsed.text || "").replace(/\0/g, " ").trim().slice(0, 50000);
  if (!resumeText) return { resumeText: "", skills: [], projects: [], experience: [], education: [], summary: "", embedding: [] };
  const skills = extractSkills(resumeText);
  const [analysisResult, embedding] = await Promise.all([
    analyzeResumeText(resumeText, skills, roles),
    generateEmbedding(resumeText.slice(0, 12000))
  ]);
  const { summary, ...analysis } = analysisResult;
  return {
    resumeText,
    skills,
    projects: sectionLines(resumeText, ["projects", "project"]),
    experience: sectionLines(resumeText, ["experience", "work experience", "employment"]),
    education: sectionLines(resumeText, ["education"]),
    summary,
    analysis,
    embedding
  };
}

const ROLE_SKILLS = {
  frontend: ["javascript", "react", "html", "css"],
  "front end": ["javascript", "react", "html", "css"],
  backend: ["node.js", "express", "api", "testing"],
  "back end": ["node.js", "express", "api", "testing"],
  fullstack: ["javascript", "react", "node.js", "mongodb"],
  "full stack": ["javascript", "react", "node.js", "mongodb"],
  mern: ["javascript", "react", "node.js", "mongodb"],
  data: ["python", "sql", "data analysis"],
  analyst: ["python", "sql", "data analysis"],
  machine: ["python", "machine learning", "nlp"],
  ai: ["python", "machine learning", "nlp"],
  design: ["figma", "ui", "ux"]
};

function expectedSkills(roles = []) {
  const roleText = roles.join(" ").toLowerCase();
  return [...new Set(Object.entries(ROLE_SKILLS)
    .filter(([role]) => roleText.includes(role))
    .flatMap(([, skills]) => skills))];
}

function fallbackAnalysis(text, skills, roles) {
  const sections = text.toLowerCase();
  const strengths = [];
  const weaknesses = [];
  if (skills.length) strengths.push(`Resume evidence includes ${skills.slice(0, 6).join(", ")}${skills.length > 6 ? `, and ${skills.length - 6} more` : ""}.`);
  if (/\b(projects?|portfolio)\b/i.test(sections)) strengths.push("Project or portfolio experience is present.");
  if (/\b(experience|employment|internship)\b/i.test(sections)) strengths.push("Practical experience is present.");
  if (/\b(education|university|college|degree)\b/i.test(sections)) strengths.push("Education details are present.");
  if (text.length < 600) weaknesses.push("The resume has limited detail; add relevant projects, responsibilities, and outcomes.");
  if (!/\b(projects?|portfolio)\b/i.test(sections)) weaknesses.push("Add a projects section with your role, tools, and results.");
  if (!/\b(experience|employment|internship)\b/i.test(sections)) weaknesses.push("Add practical experience, volunteering, or coursework that shows applied skills.");
  if (!/\b(?:\d+\s*%|\d+\s+(?:users|customers|hours|projects|records|teams))\b/i.test(text)) {
    weaknesses.push("Add truthful, measurable outcomes where you can support them.");
  }
  const needed = expectedSkills(roles);
  const detected = new Set(skills);
  return {
    summary: summarizeText(text, 5000),
    strengths: strengths.length ? strengths : ["Resume text was extracted and is ready for review."],
    weaknesses: weaknesses.slice(0, 4),
    missingSkills: needed.filter((skill) => !detected.has(skill))
  };
}

function cleanItems(value, maxItems = 4) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.trim()).slice(0, maxItems).map((item) => item.trim().slice(0, 500))
    : [];
}

export async function analyzeResumeText(text, skills = extractSkills(text), roles = []) {
  const fallback = fallbackAnalysis(text, skills, roles);
  const prompt = `Review the supplied resume using only facts it contains. Return JSON with a concise summary string and arrays strengths and weaknesses (up to 4 short items each). Do not infer personal details or claim skills not evidenced. Identify concrete, truthful improvement suggestions in weaknesses.\n\nResume:\n${String(text).slice(0, 9000)}`;
  const geminiResult = await generateGeminiJson(prompt);
  if (
    !geminiResult || typeof geminiResult !== "object" || Array.isArray(geminiResult)
    || typeof geminiResult.summary !== "string" || !geminiResult.summary.trim()
    || !Array.isArray(geminiResult.strengths) || !Array.isArray(geminiResult.weaknesses)
  ) {
    throw httpError(502, "Gemini returned an invalid resume analysis.");
  }
  return {
    summary: geminiResult.summary.trim().slice(0, 5000),
    strengths: cleanItems(geminiResult.strengths),
    weaknesses: cleanItems(geminiResult.weaknesses),
    missingSkills: fallback.missingSkills,
    aiGenerated: true,
    aiProvider: "Gemini"
  };
}
