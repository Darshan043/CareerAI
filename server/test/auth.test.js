import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, test } from "node:test";
import { errorHandler } from "../src/middleware/errorHandler.js";

process.env.JWT_SECRET ||= "careerpilot-node-test-secret-0123456789abcdef";

const [{ app }, repository, bcryptModule, { env, assertProductionConfig }] = await Promise.all([
  import("../src/app.js"),
  import("../src/services/repository.js"),
  import("bcryptjs"),
  import("../src/config/env.js")
]);
const bcrypt = bcryptModule.default || bcryptModule;

let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
});

test("registration, login, invalid credentials, and protected identity", async () => {
  const email = `auth-${randomUUID()}@example.invalid`;
  const password = "StrongTestPass123";
  let storedUser;
  try {
  const postJson = (path, body) => fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  const registrationResponse = await postJson("/api/auth/register", {
    name: "Test Student",
    email: email.toUpperCase(),
    password
  });
  assert.equal(registrationResponse.status, 201);
  const registration = await registrationResponse.json();
  assert.equal(registration.user.email, email);
  assert.ok(registration.profile?._id);
  assert.ok(registration.token);
  assert.equal("password" in registration.user, false);

  storedUser = await repository.getOne("users", { email });
  assert.notEqual(storedUser.password, password);
  assert.equal(await bcrypt.compare(password, storedUser.password), true);

  const duplicateResponse = await postJson("/api/auth/register", {
    name: "Duplicate",
    email,
    password
  });
  assert.equal(duplicateResponse.status, 409);

  const loginResponse = await postJson("/api/auth/login", { email, password });
  assert.equal(loginResponse.status, 200);
  const login = await loginResponse.json();
  assert.ok(login.token);

  const invalidLoginResponse = await postJson("/api/auth/login", { email, password: "incorrect-password" });
  assert.equal(invalidLoginResponse.status, 401);

  const missingTokenResponse = await fetch(`${baseUrl}/api/auth/me`);
  assert.equal(missingTokenResponse.status, 401);

  const invalidTokenResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { authorization: `Bearer ${login.token}tampered` }
  });
  assert.equal(invalidTokenResponse.status, 401);

  const identityResponse = await fetch(`${baseUrl}/api/auth/me`, {
    headers: { authorization: `Bearer ${login.token}` }
  });
  assert.equal(identityResponse.status, 200);
  assert.deepEqual((await identityResponse.json()).user, registration.user);

  } finally {
    storedUser ||= await repository.getOne("users", { email });
    if (storedUser) {
      await repository.deleteWhere("profiles", { userId: storedUser._id });
      await repository.deleteById("users", storedUser._id);
    }
  }
});

test("deployed Vercel origin is allowed for CORS preflight and API requests", async () => {
  const origin = "https://career-ai-indol-delta.vercel.app";
  const preflight = await fetch(`${baseUrl}/api/auth/login`, {
    method: "OPTIONS",
    headers: {
      origin,
      "access-control-request-method": "POST",
      "access-control-request-headers": "content-type,authorization"
    }
  });

  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), origin);
  assert.equal(preflight.headers.get("access-control-allow-credentials"), "true");
  assert.match(preflight.headers.get("access-control-allow-methods") || "", /POST/);

  const login = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify({ email: "missing@example.invalid", password: "incorrect" })
  });
  assert.equal(login.status, 401);
  assert.equal(login.headers.get("access-control-allow-origin"), origin);
});

test("server error logs include diagnostic stack details while redacting credentials and email", () => {
  const originalConsoleError = console.error;
  let loggedMessage;
  let loggedDetails;
  console.error = (message, details) => {
    loggedMessage = message;
    loggedDetails = details;
  };
  const response = {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
  const error = new Error(
    "Database operation failed for student@example.com password=hunter2 token=abc123 mongodb+srv://user:pass@cluster.example/db"
  );

  try {
    errorHandler(error, {}, response, () => {});
  } finally {
    console.error = originalConsoleError;
  }

  assert.equal(loggedMessage, "Unhandled API request error");
  assert.equal(loggedDetails.status, 500);
  assert.equal(loggedDetails.message.startsWith("Database operation failed"), true);
  assert.match(loggedDetails.stack, /Error: Database operation failed/);
  assert.match(loggedDetails.message, /\[REDACTED_EMAIL\]/);
  assert.match(loggedDetails.message, /password=\[REDACTED\]/);
  assert.match(loggedDetails.message, /token=\[REDACTED\]/);
  assert.match(loggedDetails.message, /\[REDACTED_MONGODB_URI\]/);
  assert.doesNotMatch(JSON.stringify(loggedDetails), /student@example\.com|hunter2|abc123|mongodb\+srv:\/\/user/);
  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, { message: "Something went wrong." });
});

test("Mongoose models enforce user and application fields", async () => {
  const [{ User }, { Application }] = await Promise.all([
    import("../src/models/User.js"),
    import("../src/models/Application.js")
  ]);

  const invalidUser = new User({});
  const userError = invalidUser.validateSync();
  assert.ok(userError.errors.name);
  assert.ok(userError.errors.email);
  assert.ok(userError.errors.password);

  const invalidApplication = new Application({
    userId: "507f1f77bcf86cd799439011",
    internshipId: "507f1f77bcf86cd799439012",
    status: "NOT_A_STATUS"
  });
  assert.ok(invalidApplication.validateSync().errors.status);
});

test("placeholder JWT secret rejects registration before writing a user", async () => {
  const previousSecret = env.jwtSecret;
  const email = `no-secret-${randomUUID()}@example.invalid`;
  env.jwtSecret = "replace-with-a-long-random-secret-at-least-32-characters";
  try {
    const response = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: "No Secret", email, password: "StrongTestPass123" })
    });
    assert.equal(response.status, 500);
    assert.equal(await repository.getOne("users", { email }), null);
  } finally {
    env.jwtSecret = previousSecret;
  }
});

test("production configuration requires persistence, a strong JWT secret, and HTTPS frontend origins", () => {
  const previous = {
    nodeEnv: env.nodeEnv,
    mongodbUri: env.mongodbUri,
    jwtSecret: env.jwtSecret,
    clientUrl: env.clientUrl,
    clientUrls: env.clientUrls
  };
  try {
    env.nodeEnv = "production";
    env.mongodbUri = "";
    env.jwtSecret = "a-production-secret-that-is-long-enough";
    env.clientUrl = "https://careerpilot.example";
    env.clientUrls = [];
    assert.throws(assertProductionConfig, /MONGODB_URI/);

    env.mongodbUri = "mongodb+srv://user:password@cluster.example/careerpilot";
    env.jwtSecret = "short";
    assert.throws(assertProductionConfig, /JWT_SECRET/);

    env.jwtSecret = "a-production-secret-that-is-long-enough";
    env.clientUrl = "http://careerpilot.example";
    assert.throws(assertProductionConfig, /HTTPS/);

    env.clientUrl = "https://careerpilot.example";
    env.clientUrls = ["https://admin.careerpilot.example"];
    assert.doesNotThrow(assertProductionConfig);
  } finally {
    Object.assign(env, previous);
  }
});

test("profile preferences are saved and returned only for the authenticated owner", async () => {
  const accounts = [
    { name: "Profile Owner", email: `profile-a-${randomUUID()}@example.invalid`, password: "StrongTestPass123" },
    { name: "Other Owner", email: `profile-b-${randomUUID()}@example.invalid`, password: "StrongTestPass123" }
  ];
  const createdIds = [];
  const postJson = (path, body) => fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const authHeaders = (token) => ({ authorization: `Bearer ${token}`, "content-type": "application/json" });
  try {
    const registrations = await Promise.all(accounts.map(async (account) => {
      const response = await postJson("/api/auth/register", account);
      assert.equal(response.status, 201);
      return response.json();
    }));
    createdIds.push(...registrations.map(({ user }) => user._id));
    const [owner, other] = registrations;
    const update = await fetch(`${baseUrl}/api/profile/preferences`, {
      method: "PATCH",
      headers: authHeaders(owner.token),
      body: JSON.stringify({ roles: "Frontend, MERN, frontend", location: "Remote", workMode: "Remote", stipendRange: "Paid" })
    });
    assert.equal(update.status, 200);
    const updated = await update.json();
    assert.deepEqual(updated.profile.preferences.roles, ["frontend", "mern"]);

    const ownerRead = await fetch(`${baseUrl}/api/profile`, { headers: authHeaders(owner.token) });
    const ownerProfile = (await ownerRead.json()).profile;
    assert.deepEqual(ownerProfile.preferences, updated.profile.preferences);

    const otherRead = await fetch(`${baseUrl}/api/profile`, { headers: authHeaders(other.token) });
    const otherProfile = (await otherRead.json()).profile;
    assert.notEqual(String(ownerProfile._id), String(otherProfile._id));
    assert.deepEqual(otherProfile.preferences.roles, []);

    const forbiddenUpdate = await fetch(`${baseUrl}/api/profile/preferences`, {
      method: "PATCH",
      headers: authHeaders(other.token),
      body: JSON.stringify({ roles: "Backend" })
    });
    assert.equal(forbiddenUpdate.status, 200);
    const ownerUnchanged = await (await fetch(`${baseUrl}/api/profile`, { headers: authHeaders(owner.token) })).json();
    assert.deepEqual(ownerUnchanged.profile.preferences.roles, ["frontend", "mern"]);

    const unauthenticated = await fetch(`${baseUrl}/api/profile`);
    assert.equal(unauthenticated.status, 401);
    const invalidMode = await fetch(`${baseUrl}/api/profile/preferences`, {
      method: "PATCH",
      headers: authHeaders(owner.token),
      body: JSON.stringify({ workMode: "Anywhere" })
    });
    assert.equal(invalidMode.status, 400);

    const resumeForm = new FormData();
    resumeForm.append("resume", new Blob(["not a PDF resume"], { type: "application/pdf" }), "invalid.pdf");
    const invalidResume = await fetch(`${baseUrl}/api/profile/upload-resume`, {
      method: "POST",
      headers: { authorization: `Bearer ${owner.token}` },
      body: resumeForm
    });
    assert.equal(invalidResume.status, 422);
    const profileAfterRejectedUpload = await (await fetch(`${baseUrl}/api/profile`, {
      headers: authHeaders(owner.token)
    })).json();
    assert.deepEqual(profileAfterRejectedUpload.profile.preferences.roles, ["frontend", "mern"]);
  } finally {
    for (const userId of createdIds) {
      await repository.deleteWhere("profiles", { userId });
      await repository.deleteById("users", userId);
    }
  }
});
