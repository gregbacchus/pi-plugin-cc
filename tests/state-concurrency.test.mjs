import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { it } from "node:test";

import { listJobs, resolveStateFile, setConfig } from "../plugins/pi/scripts/lib/state.mjs";

function waitFor(child) {
  return new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("exit", (code) => code === 0 ? resolve() : reject(new Error(`worker exited ${code}`)));
  });
}

it("preserves valid state and every job under multi-process contention", async () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pi-state-contention-"));
  try {
    setConfig(cwd, "stopReviewGate", true);
    const startFile = path.join(cwd, "start");
    const worker = path.resolve("tests/fixtures/state-writer.mjs");
    const ids = Array.from({ length: 16 }, (_, index) => `worker-${index}`);
    const children = ids.map((id) => spawn(process.execPath, [worker, cwd, startFile, id], { stdio: "inherit" }));
    fs.writeFileSync(startFile, "go");
    await Promise.all(children.map(waitFor));

    assert.doesNotThrow(() => JSON.parse(fs.readFileSync(resolveStateFile(cwd), "utf8")));
    const stateJobs = listJobs(cwd);
    assert.deepEqual(new Set(stateJobs.map((job) => job.id)), new Set(ids));
    assert.equal(JSON.parse(fs.readFileSync(resolveStateFile(cwd), "utf8")).config.stopReviewGate, true);
  } finally {
    fs.rmSync(cwd, { recursive: true, force: true });
  }
});
