import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";

import repositoryReadGuard from "../plugins/pi/scripts/extensions/repository-read-guard.mjs";
import { buildSpawnArgs } from "../plugins/pi/scripts/lib/pi.mjs";
import { assertPathInsideRepository } from "../plugins/pi/scripts/lib/repository-paths.mjs";

const tempDirs = [];

function makeFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-repository-guard-"));
  tempDirs.push(root);
  const repository = path.join(root, "repository");
  const outside = path.join(root, "outside");
  fs.mkdirSync(path.join(repository, "src"), { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.writeFileSync(path.join(repository, "src", "inside.txt"), "inside\n");
  fs.writeFileSync(path.join(outside, "secret.txt"), "secret\n");
  return { repository, outside };
}

afterEach(() => {
  while (tempDirs.length > 0) {
    fs.rmSync(tempDirs.pop(), { recursive: true, force: true });
  }
});

describe("assertPathInsideRepository", () => {
  it("allows relative paths that resolve inside the repository", () => {
    const { repository } = makeFixture();
    assert.doesNotThrow(() => assertPathInsideRepository(repository, "src/inside.txt"));
  });

  it("allows absolute paths only when they resolve inside the repository", () => {
    const { repository } = makeFixture();
    assert.doesNotThrow(() =>
      assertPathInsideRepository(repository, path.join(repository, "src", "inside.txt"))
    );
  });

  it("rejects an absolute path outside the repository", () => {
    const { repository, outside } = makeFixture();
    assert.throws(
      () => assertPathInsideRepository(repository, path.join(outside, "secret.txt")),
      /outside the repository/
    );
  });

  it("rejects parent traversal outside the repository", () => {
    const { repository } = makeFixture();
    assert.throws(
      () => assertPathInsideRepository(repository, "../outside/secret.txt"),
      /outside the repository/
    );
  });

  it("rejects a symlink whose target is outside the repository", (t) => {
    const { repository, outside } = makeFixture();
    const link = path.join(repository, "external-link");
    try {
      fs.symlinkSync(outside, link, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      if (process.platform === "win32" && (error.code === "EPERM" || error.code === "EACCES")) {
        t.skip("Creating symlinks requires additional privileges on this Windows host.");
        return;
      }
      throw error;
    }

    assert.throws(
      () => assertPathInsideRepository(repository, "external-link/secret.txt"),
      /outside the repository/
    );
  });
});

describe("repository read guard extension", () => {
  it("is explicitly loaded for read-only runs even when extension discovery is disabled", () => {
    const args = buildSpawnArgs({ sandbox: "read-only", disableExtensions: true });
    const extensionIndex = args.indexOf("--extension");
    assert.notEqual(extensionIndex, -1);
    assert.equal(args.includes("--no-extensions"), true);
    assert.match(args[extensionIndex + 1], /repository-read-guard\.mjs$/);
  });

  it("applies confinement to read, grep, find, and ls", async () => {
    const { repository } = makeFixture();
    let handler = null;
    repositoryReadGuard({
      on(eventName, candidate) {
        if (eventName === "tool_call") handler = candidate;
      }
    });
    assert.equal(typeof handler, "function");

    for (const toolName of ["read", "grep", "find", "ls"]) {
      const result = await handler(
        { toolName, input: { path: "../outside" } },
        { cwd: repository }
      );
      assert.equal(result?.block, true, `${toolName} should be blocked`);
      assert.match(result?.reason ?? "", /outside the repository/);
    }
  });

  it("permits a tool call whose path stays inside the repository", async () => {
    const { repository } = makeFixture();
    let handler = null;
    repositoryReadGuard({ on(_eventName, candidate) { handler = candidate; } });

    assert.equal(await handler({ toolName: "read", input: { path: "src/inside.txt" } }, { cwd: repository }), undefined);
  });
});
