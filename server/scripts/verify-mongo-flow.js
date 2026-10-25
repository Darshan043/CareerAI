import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { app } from "../src/app.js";
import { connectDatabase, dbState } from "../src/config/db.js";
import { env } from "../src/config/env.js";
import { deleteById, deleteWhere } from "../src/services/repository.js";

const uriDatabase = decodeURIComponent(new URL(env.mongodbUri).pathname.replace(/^\//, ""));
let server;
let createdUserId;
let stage = "mongo_connection";

try {
  await connectDatabase();
  assert.equal(dbState.mode, "mongo");
  assert.equal(dbState.connected, true);
  assert.equal(mongoose.connection.name, uriDatabase);
  console.log(JSON.stringify({ mongoConnected: true, selectedDatabaseMatchesEnv: true }));

  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const email = `careerpilot-verify-${randomUUID()}@example.invalid`;
  const password = `Verify-${randomUUID()}-A1`;
  const post = (path, body) => fetch(`${baseUrl}/api/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });

  stage = "registration";
  const registrationResponse = await post("auth/register", { name: "CareerPilot Verification", email, password });
  assert.equal(registrationResponse.status, 201);
  const registration = await registrationResponse.json();
  createdUserId = registration.user._id;
  assert.ok(registration.token);
  assert.equal("password" in registration.user, false);

  stage = "login";
  const loginResponse = await post("auth/login", { email, password });
  assert.equal(loginResponse.status, 200);
  const login = await loginResponse.json();
  assert.ok(login.token);
  const authorization = { authorization: `Bearer ${login.token}` };

  stage = "profile_read";
  const profileResponse = await fetch(`${baseUrl}/api/profile`, { headers: authorization });
  assert.equal(profileResponse.status, 200);
  const profile = (await profileResponse.json()).profile;
  assert.equal(String(profile.userId), createdUserId);

  stage = "preferences_update";
  const updateResponse = await fetch(`${baseUrl}/api/profile/preferences`, {
    method: "PATCH",
    headers: { ...authorization, "content-type": "application/json" },
    body: JSON.stringify({ roles: "frontend, AI product", location: "Remote", workMode: "Remote", stipendRange: "Paid" })
  });
  assert.equal(updateResponse.status, 200);

  stage = "preferences_readback";
  const readbackResponse = await fetch(`${baseUrl}/api/profile`, { headers: authorization });
  assert.equal(readbackResponse.status, 200);
  const readback = (await readbackResponse.json()).profile;
  assert.deepEqual(readback.preferences.roles, ["frontend", "ai product"]);
  assert.equal(readback.preferences.location, "Remote");
  console.log(JSON.stringify({ registration: 201, login: 200, ownedProfile: 200, preferencesSaved: true }));
} catch (error) {
  console.log(JSON.stringify({
    verified: false,
    stage,
    errorType: error.name || "Error",
    errorCode: error.code || error.cause?.code || "unavailable"
  }));
  process.exitCode = 1;
} finally {
  if (createdUserId) {
    await deleteWhere("profiles", { userId: createdUserId });
    await deleteById("users", createdUserId);
  }
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose.connection.readyState) await mongoose.disconnect();
}
