export const MAX_NATIVE_INPUT = 16 * 1024 * 1024;
export const MAX_NATIVE_OUTPUT = 900_000;

/** Firefox native messages are little-endian length-prefixed UTF-8 JSON, independent of stdin chunking. */
export class NativeFrames {
  private buffer = Buffer.alloc(0);
  /** Reject excessive frames before retaining their body. */
  push(chunk: Buffer): unknown[] {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    const messages: unknown[] = [];
    while (this.buffer.length >= 4) {
      const length = this.buffer.readUInt32LE(0);
      if (!length || length > MAX_NATIVE_INPUT) throw new Error('Invalid native message length');
      if (this.buffer.length < length + 4) break;
      messages.push(JSON.parse(this.buffer.subarray(4, length + 4).toString('utf8')));
      this.buffer = this.buffer.subarray(length + 4);
      if (messages.length > 128) throw new Error('Too many queued messages');
    }
    return messages;
  }
}

/** Keep output below Firefox's one-MiB native-message limit, including JSON escaping. */
export function nativeFrame(value: unknown): Buffer {
  const body = Buffer.from(JSON.stringify(value), 'utf8');
  if (body.length > MAX_NATIVE_OUTPUT) throw new Error('Result exceeds native message limit; reduce scope or import an XML result');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}
