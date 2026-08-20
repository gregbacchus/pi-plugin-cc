import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

export function createCancellationIdentity(workspaceStateDir, jobId) {
  const slug = createHash("sha256").update(`${workspaceStateDir}\0${jobId}`).digest("hex").slice(0, 24);
  const endpoint = process.platform === "win32"
    ? `\\\\.\\pipe\\pi-companion-${slug}`
    : path.join(os.tmpdir(), `pi-companion-${slug}.sock`);
  return { endpoint, token: randomUUID() };
}

export function startCancellationServer(identity, onAuthenticated) {
  if (process.platform !== "win32" && fs.existsSync(identity.endpoint)) fs.unlinkSync(identity.endpoint);
  const server = net.createServer((socket) => {
    let input = "";
    let handled = false;
    socket.setEncoding("utf8");
    socket.on("data", (chunk) => {
      input += chunk;
      if (input.length > 4096) socket.destroy();
      const newline = input.indexOf("\n");
      if (newline === -1 || handled) return;
      handled = true;
      let authenticated = false;
      try { authenticated = JSON.parse(input.slice(0, newline)).token === identity.token; } catch {}
      socket.end(`${JSON.stringify({ authenticated })}\n`, () => {
        if (authenticated) setImmediate(onAuthenticated);
      });
    });
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(identity.endpoint, () => {
      server.off("error", reject);
      resolve({
        close: () => new Promise((done) => server.close(() => {
          if (process.platform !== "win32" && fs.existsSync(identity.endpoint)) fs.unlinkSync(identity.endpoint);
          done();
        }))
      });
    });
  });
}

export function requestWorkerCancellation(identity, options = {}) {
  const timeoutMs = options.timeoutMs ?? 2000;
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = net.createConnection(identity.endpoint);
      socket.setEncoding("utf8");
      socket.on("connect", () => socket.write(`${JSON.stringify({ token: identity.token })}\n`));
      let output = "";
      socket.on("data", (chunk) => { output += chunk; });
      socket.on("end", () => {
        try {
          const response = JSON.parse(output.trim());
          resolve({ delivered: Boolean(response.authenticated), authenticated: Boolean(response.authenticated) });
        } catch { resolve({ delivered: false, authenticated: false }); }
      });
      socket.on("error", () => {
        if (Date.now() < deadline) setTimeout(attempt, Math.min(20, deadline - Date.now()));
        else resolve({ delivered: false, authenticated: false });
      });
    };
    attempt();
  });
}
