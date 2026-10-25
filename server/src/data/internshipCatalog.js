import { seedInternships } from "./seedInternships.js";

const days = (n) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

// A broader pool of internships across many roles/skills. Discovery selects from
// this catalog based on the candidate's resume (skills) and preferences, so Sync
// returns relevant, varied results instead of the same fixed five every time.
// The original five (seedInternships) are kept so existing links/repair logic and
// the deterministic fallback stay intact.
const additionalInternships = [
  {
    title: "React Frontend Intern",
    company: "PixelCraft",
    description:
      "Ship polished React interfaces with reusable components, CSS, Tailwind, and Git-based workflows for a design-led product team.",
    skillsRequired: ["react", "javascript", "css", "tailwind", "git"],
    location: "Remote",
    applyLink: "https://internshala.com/internships/react-js-internship/",
    source: "Internshala",
    deadline: days(12),
    postedDate: new Date()
  },
  {
    title: "Node.js Backend Intern",
    company: "DataForge",
    description:
      "Design Node.js and Express REST APIs, integrate MongoDB, and harden endpoints for a high-traffic analytics platform.",
    skillsRequired: ["node.js", "express", "api", "rest", "mongodb"],
    location: "Remote",
    applyLink: "https://internshala.com/internships/node-js-internship/",
    source: "Company career pages",
    deadline: days(16),
    postedDate: new Date()
  },
  {
    title: "Python Data Analyst Intern",
    company: "InsightLabs",
    description:
      "Wrangle datasets with Python and SQL, build dashboards, and turn data analysis into clear product recommendations.",
    skillsRequired: ["python", "sql", "data analysis", "communication"],
    location: "Bengaluru",
    applyLink: "https://internshala.com/internships/data-science-internship/",
    source: "Wellfound",
    deadline: days(20),
    postedDate: new Date()
  },
  {
    title: "Machine Learning Intern",
    company: "NeuralNest",
    description:
      "Prototype machine learning and NLP models, run experiments, and support data analysis for an applied research team.",
    skillsRequired: ["python", "machine learning", "nlp", "data analysis"],
    location: "Remote",
    applyLink: "https://internshala.com/internships/machine-learning-internship/",
    source: "Internshala",
    deadline: days(9),
    postedDate: new Date()
  },
  {
    title: "DevOps Intern",
    company: "CloudHarbor",
    description:
      "Automate builds and deployments with Docker and AWS, manage Git pipelines, and add testing to delivery workflows.",
    skillsRequired: ["docker", "aws", "git", "testing", "problem solving"],
    location: "Hyderabad",
    applyLink: "https://internshala.com/internships/devops-internship/",
    source: "Company career pages",
    deadline: days(22),
    postedDate: new Date()
  },
  {
    title: "Full Stack Developer Intern",
    company: "BuildStack",
    description:
      "Build full-stack features across React, Node.js, MongoDB and REST APIs, shipping end-to-end with Git.",
    skillsRequired: ["javascript", "react", "node.js", "mongodb", "api", "git"],
    location: "Remote",
    applyLink: "https://internshala.com/internships/full-stack-development-internship/",
    source: "Wellfound",
    deadline: days(15),
    postedDate: new Date()
  },
  {
    title: "QA Automation Intern",
    company: "TestWorks",
    description:
      "Write automated tests for JavaScript apps and REST APIs, improve coverage, and triage defects with the engineering team.",
    skillsRequired: ["testing", "javascript", "api", "rest", "problem solving"],
    location: "Pune",
    applyLink: "https://internshala.com/internships/software-testing-internship/",
    source: "Internshala",
    deadline: days(18),
    postedDate: new Date()
  },
  {
    title: "UI Designer Intern",
    company: "FormFactor",
    description:
      "Craft UI in Figma, translate flows into HTML/CSS, and refine UX with the product team.",
    skillsRequired: ["figma", "ui", "ux", "html", "css"],
    location: "Remote",
    applyLink: "https://internshala.com/internships/ui-ux-design-internship/",
    source: "Company career pages",
    deadline: days(13),
    postedDate: new Date()
  },
  {
    title: "Cloud Engineering Intern",
    company: "SkyOps",
    description:
      "Support cloud infrastructure on AWS with Docker, automate Python tooling, and integrate internal APIs.",
    skillsRequired: ["aws", "docker", "python", "api"],
    location: "Bengaluru",
    applyLink: "https://www.linkedin.com/jobs/search/?keywords=Cloud%20Engineering%20Intern&location=India",
    source: "LinkedIn",
    deadline: days(25),
    postedDate: new Date()
  },
  {
    title: "Frontend Tailwind Intern",
    company: "ThemeBase",
    description:
      "Build responsive marketing pages with HTML, CSS, Tailwind, JavaScript and React component patterns.",
    skillsRequired: ["html", "css", "tailwind", "javascript", "react"],
    location: "Remote",
    applyLink: "https://internshala.com/internships/web-development-internship/",
    source: "Internshala",
    deadline: days(11),
    postedDate: new Date()
  }
];

export const internshipCatalog = [...seedInternships, ...additionalInternships];
