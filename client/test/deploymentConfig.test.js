import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Vercel rewrites SPA deep links to the Vite entry document", async () => {
  const config = JSON.parse(await readFile(new URL("../vercel.json", import.meta.url), "utf8"));
  assert.ok(config.rewrites.some((rewrite) =>
    rewrite.source === "/(.*)" && rewrite.destination === "/index.html"
  ));
});
