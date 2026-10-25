import { generateLocalText } from "../services/ollamaService.js";
import { generateGeminiJson } from "../services/geminiService.js";
import { normalizeSkill, uniqueStrings } from "../utils/text.js";
import { httpError } from "../utils/httpError.js";

const SKILL_CASING = {
  javascript: "JavaScript", react: "React", "node.js": "Node.js", express: "Express", mongodb: "MongoDB",
  mongoose: "Mongoose", python: "Python", sql: "SQL", html: "HTML", css: "CSS", tailwind: "Tailwind CSS",
  git: "Git", docker: "Docker", aws: "AWS", nlp: "NLP", api: "API", rest: "REST", ux: "UX", ui: "UI",
  figma: "Figma", "machine learning": "Machine Learning", "data analysis": "Data Analysis"
};

function prettySkill(skill) {
  const normalized = normalizeSkill(skill);
  return SKILL_CASING[normalized] || normalized.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function splitSkillTokens(text) {
  return uniqueStrings(String(text).replace(/^[\s•*\-]+/, "").split(/[,|/;•·]+/));
}

const SKILLS_HEADER = /^\s*(?:(?:technical|core|key)\s+)?skills?\s*:?[ \t]*(.*)$/i;
const OTHER_HEADER = /^\s*(?:summary|objective|profile|experience|work experience|employment|education|projects?|certifications?|achievements?|awards?|volunteer(?:ing)?|languages|interests|references|contact)\s*:?[ \t]*$/i;

function extractSkillSection(lines) {
  const start = lines.findIndex((line) => SKILLS_HEADER.test(line));
  if (start < 0) return { start, end: start, tokens: [] };
  const headerMatch = lines[start].match(SKILLS_HEADER);
  const tokens = headerMatch?.[1] ? splitSkillTokens(headerMatch[1]) : [];
  let end = start + 1;
  while (end < lines.length && !OTHER_HEADER.test(lines[end])) {
    tokens.push(...splitSkillTokens(lines[end]));
    end += 1;
  }
  return { start, end, tokens: uniqueStrings(tokens) };
}

function tailorSkillTokens(originalTokens, requiredSkills, matchedSkills) {
  const required = new Set(requiredSkills.map(normalizeSkill));
  const matched = new Set(matchedSkills.map(normalizeSkill));
  return originalTokens.slice().sort((left, right) => {
    const rank = (skill) => required.has(normalizeSkill(skill)) && matched.has(normalizeSkill(skill)) ? 0
      : matched.has(normalizeSkill(skill)) ? 1 : 2;
    return rank(left) - rank(right);
  });
}

function buildFallbackCopy(profile, internship, studentName, matchedSkills) {
  const candidate = studentName || "Applicant";
  const role = internship.title;
  const company = internship.company;
  const skills = matchedSkills.slice(0, 5).map(prettySkill);
  const experience = [...(profile.projects || []), ...(profile.experience || [])].slice(0, 2);
  const grounding = experience.length
    ? `My resume highlights ${experience.map((item) => item.replace(/[.\s]+$/, "")).join("; ")}.`
    : skills.length
      ? `My resume documents hands-on skills in ${skills.join(", ")}.`
      : "I am eager to contribute and continue learning through practical work.";
  return {
    coverLetter: `Dear Hiring Team,\n\nI am applying for the ${role} opportunity at ${company}. ${grounding}\n\nI would welcome the opportunity to discuss how my background fits the work. Thank you for your consideration.\n\nSincerely,\n${candidate}`,
    resumeBulletSuggestions: experience.map((item) => `Review this resume evidence for a role-relevant bullet: ${item}`),
    applicationAnswers: [
      {
        question: "Why are you interested in this internship?",
        answer: `I am interested in the ${role} opportunity at ${company} because it aligns with my career interests and gives me a chance to contribute while learning from a practical team.`
      },
      {
        question: "Which skills or experience would you bring?",
        answer: skills.length
          ? `${grounding} Relevant skills from my resume include ${skills.join(", ")}.`
          : grounding
      }
    ]
  };
}

async function generateApplicationCopy(profile, internship, studentName, matchedSkills) {
  const fallback = buildFallbackCopy(profile, internship, studentName, matchedSkills);
  const prompt = `Create role-tailored resume bullet suggestions, a concise cover letter and two short draft answers for this student. Use only the supplied resume facts and role details. Do not invent achievements, employers, dates, metrics, or qualifications. Bullet suggestions must be faithful rewrites of the supplied evidence; return an empty list if there is no evidence to rewrite. Return JSON: {"resumeBulletSuggestions":["..."],"coverLetter":"...","applicationAnswers":[{"question":"...","answer":"..."}]}.\n` +
    `Student: ${studentName || "Applicant"}\nRole: ${internship.title} at ${internship.company}\n` +
    `Matched resume skills: ${matchedSkills.join(", ")}\nResume evidence: ${[...(profile.projects || []), ...(profile.experience || [])].join("; ")}\n` +
    `Resume excerpt: ${String(profile.resumeText || "").slice(0, 5000)}`;
  const geminiResult = await generateGeminiJson(prompt);
  if (geminiResult) {
    if (typeof geminiResult !== "object" || Array.isArray(geminiResult)) {
      throw httpError(502, "Gemini returned invalid application material.");
    }
    return {
      coverLetter: typeof geminiResult.coverLetter === "string" && geminiResult.coverLetter.trim()
        ? geminiResult.coverLetter.trim().slice(0, 12000)
        : fallback.coverLetter,
      resumeBulletSuggestions: Array.isArray(geminiResult.resumeBulletSuggestions)
        ? geminiResult.resumeBulletSuggestions
          .filter((item) => typeof item === "string" && item.trim())
          .slice(0, 8)
          .map((item) => item.trim().slice(0, 1000))
        : fallback.resumeBulletSuggestions,
      applicationAnswers: Array.isArray(geminiResult.applicationAnswers)
        ? geminiResult.applicationAnswers
          .filter((item) => typeof item?.question === "string" && typeof item?.answer === "string")
          .slice(0, 5)
          .map((item) => ({
            question: item.question.trim().slice(0, 300),
            answer: item.answer.trim().slice(0, 4000)
          }))
        : fallback.applicationAnswers,
      aiGenerated: true,
      aiProvider: "Gemini"
    };
  }

  const response = await generateLocalText(prompt);
  if (!response) return { ...fallback, aiGenerated: false, aiProvider: "Rule-based" };
  try {
    const data = JSON.parse(response.replace(/^```(?:json)?\s*|\s*```$/g, ""));
    return {
      coverLetter: typeof data.coverLetter === "string" && data.coverLetter.trim() ? data.coverLetter.trim().slice(0, 12000) : fallback.coverLetter,
      resumeBulletSuggestions: Array.isArray(data.resumeBulletSuggestions)
        ? data.resumeBulletSuggestions.filter((item) => typeof item === "string").slice(0, 8).map((item) => item.slice(0, 1000))
        : fallback.resumeBulletSuggestions,
      applicationAnswers: Array.isArray(data.applicationAnswers)
        ? data.applicationAnswers
          .filter((item) => typeof item.question === "string" && typeof item.answer === "string")
          .slice(0, 5)
          .map((item) => ({ question: item.question.slice(0, 300), answer: item.answer.slice(0, 4000) }))
        : fallback.applicationAnswers,
      aiGenerated: true,
      aiProvider: "Ollama"
    };
  } catch {
    return { ...fallback, aiGenerated: false, aiProvider: "Rule-based" };
  }
}

export async function generateResumeVariant(profile, internship, studentName = "") {
  const resumeText = String(profile.resumeText || "").trim();
  if (!resumeText) throw new Error("Upload a readable resume before preparing application materials.");
  const requiredSkills = uniqueStrings(internship.skillsRequired || []).map(normalizeSkill);
  const profileSkills = new Set((profile.skills || []).map(normalizeSkill));
  const matchedSkills = requiredSkills.filter((skill) => profileSkills.has(skill));
  const missingSkills = requiredSkills.filter((skill) => !profileSkills.has(skill));
  const lines = resumeText.split(/\r?\n/);
  const section = extractSkillSection(lines);
  const originalTokens = section.tokens.length ? section.tokens : (profile.skills || []);
  const prioritized = tailorSkillTokens(originalTokens, requiredSkills, matchedSkills);
  const renderedSkills = prioritized.map(prettySkill);
  const tailored = lines.slice();
  if (section.start >= 0) {
    tailored.splice(section.start, section.end - section.start,
      renderedSkills.length ? `Skills: ${renderedSkills.join(", ")}` : "Skills");
  } else {
    const insertionPoint = Math.min(1, tailored.length);
    tailored.splice(insertionPoint, 0, "", renderedSkills.length ? `Skills: ${renderedSkills.join(", ")}` : "Skills", "");
  }
  const copy = await generateApplicationCopy(profile, internship, studentName, matchedSkills);
  return {
    content: tailored.join("\n").slice(0, 50000),
    coverLetter: copy.coverLetter,
    resumeBulletSuggestions: copy.resumeBulletSuggestions,
    applicationAnswers: copy.applicationAnswers,
    aiGenerated: copy.aiGenerated,
    aiProvider: copy.aiProvider,
    changeSummary: [
      renderedSkills.length ? `Reordered ${renderedSkills.length} resume skills to emphasize this role.` : "Added a skills heading for review.",
      missingSkills.length ? `Skill roadmap: build ${missingSkills.slice(0, 3).map(prettySkill).join(", ")}.` : "No listed role skills are missing from the resume."
    ],
    matchedSkills,
    missingSkills,
    approved: false
  };
}
