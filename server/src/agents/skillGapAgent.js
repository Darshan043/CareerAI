import { generateGeminiJson } from "../services/geminiService.js";
import { httpError } from "../utils/httpError.js";

const SKILL_RESOURCES = {
  javascript: [{ title: "MDN JavaScript Guide", url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide" }],
  react: [{ title: "React Learn", url: "https://react.dev/learn" }],
  "node.js": [{ title: "Node.js Learn", url: "https://nodejs.org/en/learn" }],
  express: [{ title: "Express Guide", url: "https://expressjs.com/en/guide/routing.html" }],
  mongodb: [{ title: "MongoDB University", url: "https://learn.mongodb.com/" }],
  mongoose: [{ title: "Mongoose Documentation", url: "https://mongoosejs.com/docs/" }],
  python: [{ title: "Python Tutorial", url: "https://docs.python.org/3/tutorial/" }],
  sql: [{ title: "SQLBolt Lessons", url: "https://sqlbolt.com/" }],
  html: [{ title: "MDN HTML Guide", url: "https://developer.mozilla.org/en-US/docs/Learn/HTML" }],
  css: [{ title: "MDN CSS Guide", url: "https://developer.mozilla.org/en-US/docs/Learn/CSS" }],
  tailwind: [{ title: "Tailwind CSS Documentation", url: "https://tailwindcss.com/docs" }],
  git: [{ title: "Git Book", url: "https://git-scm.com/book/en/v2" }],
  docker: [{ title: "Docker Get Started", url: "https://docs.docker.com/get-started/" }],
  aws: [{ title: "AWS Skill Builder", url: "https://skillbuilder.aws/" }],
  "data analysis": [{ title: "Kaggle Learn", url: "https://www.kaggle.com/learn" }],
  "machine learning": [{ title: "scikit-learn User Guide", url: "https://scikit-learn.org/stable/user_guide.html" }],
  nlp: [{ title: "Hugging Face NLP Course", url: "https://huggingface.co/learn/nlp-course" }],
  api: [{ title: "MDN Web APIs", url: "https://developer.mozilla.org/en-US/docs/Web/API" }],
  rest: [{ title: "REST API Tutorial", url: "https://restfulapi.net/" }],
  testing: [{ title: "Testing Library Docs", url: "https://testing-library.com/docs/" }],
  figma: [{ title: "Figma Resource Library", url: "https://www.figma.com/resource-library/" }],
  ui: [{ title: "Material Design Foundations", url: "https://m3.material.io/foundations" }],
  ux: [{ title: "Nielsen Norman Group UX Articles", url: "https://www.nngroup.com/articles/" }]
};

export function buildSkillGapReport(match) {
  const missingSkills = Array.isArray(match?.missingSkills) ? match.missingSkills : [];
  const projects = {
    javascript: "Build a small interactive feature with validation and tests.",
    react: "Create a responsive dashboard with reusable components and loading states.",
    "node.js": "Build a REST API with input validation, error handling, and tests.",
    express: "Add authenticated CRUD routes to a small Express service.",
    mongodb: "Model and query a small dataset with indexes and ownership rules.",
    python: "Write a script that cleans a public dataset and explains its output.",
    sql: "Design a relational schema and answer five questions with joins and aggregates.",
    testing: "Add unit and integration tests to an existing project and report coverage.",
    docker: "Containerize a small app and document how to run it locally.",
    aws: "Deploy a small app using a free tier and document the service boundaries.",
    figma: "Prototype a three-screen flow and test it with one person.",
    ui: "Implement a small accessible component set from a design reference.",
    ux: "Run a short usability review and iterate on the most frequent friction point."
  };
  return {
    internshipId: match?.internshipId,
    missingSkills,
    aiGenerated: false,
    aiProvider: "Rule-based",
    priorities: missingSkills.map((skill, index) => ({
      skill,
      priority: index < 2 ? "High" : "Medium",
      estimatedDays: index < 2 ? 7 : 14,
      suggestedAction: `Study the fundamentals of ${skill}, then practice it in a small project.`,
      miniProject: projects[skill.toLowerCase()] || `Build a focused project that demonstrates ${skill} and document your decisions.`,
      resources: SKILL_RESOURCES[skill.toLowerCase()] || [
        { title: "freeCodeCamp Learning Resources", url: "https://www.freecodecamp.org/news/" }
      ]
    }))
  };
}

export async function personalizeSkillGapReport(match, profile, internship) {
  const fallback = buildSkillGapReport(match);
  if (!fallback.missingSkills.length) return fallback;
  const generated = await generateGeminiJson(
    `Create a practical learning roadmap for a student targeting the supplied role. Use only the listed skill gaps and resume evidence. Return JSON with "priorities", an ordered array of objects with "skill", "priority" ("High" or "Medium"), "estimatedDays" (1-90), "suggestedAction" and "miniProject". Do not add skills outside the supplied list. Keep actions concise and projects achievable.\n` +
    `Role: ${String(internship?.title || "Target role").slice(0, 200)}\n` +
    `Resume skills: ${(profile?.skills || []).slice(0, 60).join(", ")}\n` +
    `Resume evidence: ${[...(profile?.projects || []), ...(profile?.experience || [])].slice(0, 12).join("; ").slice(0, 4000)}\n` +
    `Missing skills in match order: ${fallback.missingSkills.join(", ")}`
  );
  if (!generated) return fallback;
  if (!Array.isArray(generated.priorities)) {
    throw httpError(502, "Gemini returned an invalid skill roadmap.");
  }

  const allowed = new Set(fallback.missingSkills.map((skill) => skill.toLowerCase()));
  const bySkill = new Map(generated.priorities
    .filter((item) => item && typeof item.skill === "string" && allowed.has(item.skill.toLowerCase()))
    .map((item) => [item.skill.toLowerCase(), item]));
  return {
    ...fallback,
    aiGenerated: true,
    aiProvider: "Gemini",
    priorities: fallback.missingSkills.map((skill, index) => {
      const item = bySkill.get(skill.toLowerCase());
      return {
        ...fallback.priorities[index],
        priority: item?.priority === "High" ? "High" : "Medium",
        estimatedDays: Number.isFinite(item?.estimatedDays)
          ? Math.max(1, Math.min(90, Math.round(item.estimatedDays)))
          : fallback.priorities[index].estimatedDays,
        suggestedAction: typeof item?.suggestedAction === "string" && item.suggestedAction.trim()
          ? item.suggestedAction.trim().slice(0, 500)
          : fallback.priorities[index].suggestedAction,
        miniProject: typeof item?.miniProject === "string" && item.miniProject.trim()
          ? item.miniProject.trim().slice(0, 500)
          : fallback.priorities[index].miniProject
      };
    })
  };
}
