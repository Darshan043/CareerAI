import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export function assertJwtSecret() {
  if (!env.jwtSecret || env.jwtSecret.startsWith("replace-with-") || env.jwtSecret.length < 32) {
    throw new Error("JWT_SECRET must be set to a unique secret of at least 32 characters in the server environment.");
  }
}

export function signToken(user) {
  assertJwtSecret();
  return jwt.sign({ sub: String(user._id), email: user.email }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function verifyToken(token) {
  assertJwtSecret();
  return jwt.verify(token, env.jwtSecret);
}
