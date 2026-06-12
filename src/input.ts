import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, extname } from "node:path";

export type ImageInput = string | Buffer | Uint8Array | ArrayBuffer;

export async function readImageInput(input: ImageInput): Promise<Buffer> {
  if (typeof input === "string") {
    return readFile(input);
  }

  if (Buffer.isBuffer(input)) {
    return input;
  }

  if (input instanceof ArrayBuffer) {
    return Buffer.from(input);
  }

  if (input instanceof Uint8Array) {
    return Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  }

  throw new TypeError("Expected an image path, Buffer, Uint8Array, or ArrayBuffer.");
}

export async function writeOutputFile(path: string, data: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

export type SupportedFormat = "jpeg" | "png";
export type RequestedFormat = SupportedFormat | "jpg" | "auto";

export function normalizeRequestedFormat(format: RequestedFormat | undefined): SupportedFormat | "auto" {
  if (format === undefined || format === "auto") {
    return "auto";
  }

  if (format === "jpg" || format === "jpeg") {
    return "jpeg";
  }

  if (format === "png") {
    return "png";
  }

  throw new TypeError(`Unsupported image format: ${String(format)}`);
}

export function formatFromPath(path: string): SupportedFormat | undefined {
  const ext = extname(path).toLowerCase();

  if (ext === ".jpg" || ext === ".jpeg") {
    return "jpeg";
  }

  if (ext === ".png") {
    return "png";
  }

  return undefined;
}

export function assertIntegerInRange(value: number, name: string, min: number, max: number): void {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${name} must be an integer from ${min} to ${max}.`);
  }
}
