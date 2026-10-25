import bcrypt from "bcryptjs";
import { create, deleteById, getOne } from "../services/repository.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { httpError } from "../utils/httpError.js";
import { assertJwtSecret, signToken } from "../utils/jwt.js";

function publicUser(user) {
  return { _id: String(user._id), name: user.name, email: user.email };
}

export const register = asyncHandler(async (req, res) => {
  assertJwtSecret();
  const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!name || !email || !password) throw httpError(400, "Name, email, and password are required.");
  if (name.length > 120) throw httpError(400, "Name must be 120 characters or fewer.");
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw httpError(400, "Enter a valid email address.");
  }
  if (password.length < 8 || Buffer.byteLength(password, "utf8") > 72) {
    throw httpError(400, "Password must be at least 8 characters and no more than 72 UTF-8 bytes.");
  }
  if (await getOne("users", { email })) throw httpError(409, "An account with this email already exists.");

  let user;
  try {
    user = await create("users", { name, email, password: await bcrypt.hash(password, 12) });
  } catch (error) {
    if (error.code === 11000) throw httpError(409, "An account with this email already exists.");
    throw error;
  }
  let profile;
  try {
    profile = await create("profiles", {
      userId: user._id,
      skills: [],
      projects: [],
      experience: [],
      education: [],
      preferences: { roles: [], location: "", workMode: "", stipendRange: "" }
    });
  } catch (error) {
    await deleteById("users", user._id);
    if (error.code === 11000) throw httpError(409, "An account with this email already exists.");
    throw error;
  }
  res.status(201).json({ user: publicUser(user), profile, token: signToken(user) });
});

export const login = asyncHandler(async (req, res) => {
  assertJwtSecret();
  const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
  const password = typeof req.body?.password === "string" ? req.body.password : "";
  if (!email || !password) throw httpError(400, "Email and password are required.");
  const user = await getOne("users", { email }, { select: "+password" });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    throw httpError(401, "Invalid email or password.");
  }
  res.json({ user: publicUser(user), token: signToken(user) });
});

export const me = asyncHandler(async (req, res) => {
  res.json({ user: req.user });
});
