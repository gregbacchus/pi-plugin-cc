import { assertPathInsideRepository } from "../lib/repository-paths.mjs";

const CONFINED_TOOLS = new Set(["read", "grep", "find", "ls"]);

export default function repositoryReadGuard(pi) {
  pi.on("tool_call", (event, ctx) => {
    if (!CONFINED_TOOLS.has(event.toolName)) {
      return undefined;
    }

    try {
      assertPathInsideRepository(ctx.cwd, event.input?.path ?? ".");
      return undefined;
    } catch (error) {
      return {
        block: true,
        reason: error instanceof Error ? error.message : "Access denied: path is outside the repository.",
        terminate: true
      };
    }
  });
}
