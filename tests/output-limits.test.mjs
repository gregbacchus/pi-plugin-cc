import assert from "node:assert/strict";
import { it } from "node:test";

import { BoundedOutput, RPC_RECORD_MAX_BYTES } from "../plugins/pi/scripts/lib/output-limits.mjs";
import { PiRpcClient } from "../plugins/pi/scripts/lib/pi-rpc.mjs";

it("accepts output exactly at the configured byte limit", () => {
  const output = new BoundedOutput("stdout", 4);
  output.append("éé");
  assert.equal(output.value, "éé");
});

it("rejects output above the configured byte limit", () => {
  const output = new BoundedOutput("stderr", 3);
  assert.throws(() => output.append("four"), /stderr exceeded 3 bytes/);
  assert.equal(output.value, "");
});

it("rejects an oversized newline-free RPC record without retaining it", () => {
  const client = new PiRpcClient(process.cwd());
  client._handleChunk(Buffer.alloc(RPC_RECORD_MAX_BYTES + 1, 120));
  assert.match(client.exitError?.message ?? "", /RPC record exceeded/);
  assert.equal(client.stdoutBuffer, "");
});
