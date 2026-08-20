export const RPC_RECORD_MAX_BYTES = 1024 * 1024;
export const STOP_GATE_STDOUT_MAX_BYTES = 8 * 1024 * 1024;
export const STOP_GATE_STDERR_MAX_BYTES = 1024 * 1024;

export class BoundedOutput {
  constructor(label, maxBytes) {
    this.label = label;
    this.maxBytes = maxBytes;
    this.value = "";
    this.bytes = 0;
  }

  append(chunk) {
    const text = String(chunk);
    const bytes = Buffer.byteLength(text, "utf8");
    if (this.bytes + bytes > this.maxBytes) {
      throw new Error(`${this.label} exceeded ${this.maxBytes} bytes.`);
    }
    this.value += text;
    this.bytes += bytes;
  }
}
