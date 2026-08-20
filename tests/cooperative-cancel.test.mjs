import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, it } from "node:test";

import { createCancellationIdentity, requestWorkerCancellation, startCancellationServer } from "../plugins/pi/scripts/lib/cooperative-cancel.mjs";

const cleanups = [];
afterEach(async () => { while (cleanups.length) await cleanups.pop()(); });

it("only an authenticated request asks the worker to terminate", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-cancel-test-"));
  const identity = createCancellationIdentity(dir, "job-1");
  let terminations = 0;
  const server = await startCancellationServer(identity, () => { terminations += 1; });
  cleanups.push(async () => { await server.close(); fs.rmSync(dir, { recursive: true, force: true }); });

  const denied = await requestWorkerCancellation({ ...identity, token: "wrong" });
  assert.equal(denied.authenticated, false);
  assert.equal(terminations, 0);

  const accepted = await requestWorkerCancellation(identity);
  assert.equal(accepted.authenticated, true);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(terminations, 1);
});

it("fails safely when no authenticated worker endpoint exists", async () => {
  const identity = createCancellationIdentity(os.tmpdir(), "missing-job");
  const result = await requestWorkerCancellation(identity, { timeoutMs: 50 });
  assert.equal(result.authenticated, false);
  assert.equal(result.delivered, false);
});
