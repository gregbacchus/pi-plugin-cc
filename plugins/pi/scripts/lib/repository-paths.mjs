import fs from "node:fs";
import path from "node:path";

function isInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === "" || (!relative.startsWith(`..${path.sep}`) && relative !== ".." && !path.isAbsolute(relative));
}

function canonicalizeNearestExisting(candidate) {
  let current = candidate;
  const suffix = [];

  while (true) {
    try {
      return path.join(fs.realpathSync.native(current), ...suffix.reverse());
    } catch (error) {
      if (error?.code !== "ENOENT" && error?.code !== "ENOTDIR") {
        throw error;
      }
      const parent = path.dirname(current);
      if (parent === current) {
        throw error;
      }
      suffix.push(path.basename(current));
      current = parent;
    }
  }
}

export function assertPathInsideRepository(repositoryRoot, requestedPath = ".") {
  const canonicalRoot = fs.realpathSync.native(repositoryRoot);
  const normalizedRequest = String(requestedPath ?? ".").replace(/^@/, "") || ".";
  if (normalizedRequest.includes("\0")) {
    throw new Error("Path contains a null byte.");
  }

  const candidate = path.resolve(canonicalRoot, normalizedRequest);
  if (!isInside(canonicalRoot, candidate)) {
    throw new Error(`Access denied: path "${requestedPath}" is outside the repository.`);
  }

  const canonicalCandidate = canonicalizeNearestExisting(candidate);
  if (!isInside(canonicalRoot, canonicalCandidate)) {
    throw new Error(`Access denied: path "${requestedPath}" resolves outside the repository.`);
  }

  return canonicalCandidate;
}
