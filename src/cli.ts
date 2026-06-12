#!/usr/bin/env node
import { basename } from "node:path";
import { compressFile, createFavicon, type CompressOptions, type CreateIcoOptions } from "./index.js";

interface ParsedArgs {
  command: string | undefined;
  positionals: string[];
  flags: Map<string, string | boolean>;
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));

  if (!parsed.command || parsed.flags.has("help") || parsed.flags.has("h")) {
    printHelp();
    return;
  }

  if (parsed.command === "compress") {
    await runCompress(parsed);
    return;
  }

  if (parsed.command === "favicon") {
    await runFavicon(parsed);
    return;
  }

  throw new Error(`Unknown command: ${parsed.command}`);
}

async function runCompress(parsed: ParsedArgs): Promise<void> {
  const [input, output] = parsed.positionals;
  if (!input || !output) {
    throw new Error("compress requires an input path and output path.");
  }

  const width = optionalInteger(parsed, "max-width");
  const height = optionalInteger(parsed, "max-height");
  const quality = optionalInteger(parsed, "quality");
  const format = optionalEnum(parsed, "format", ["auto", "jpeg", "jpg", "png"]);
  const options: CompressOptions = {};

  if (format) {
    options.format = format;
  }

  if (quality !== undefined) {
    options.quality = quality;
  }

  if (parsed.flags.has("keep-metadata")) {
    options.keepMetadata = true;
  }

  if (width !== undefined || height !== undefined) {
    const resize: NonNullable<CompressOptions["resize"]> = {
      fit: "inside",
      withoutEnlargement: true
    };

    if (width !== undefined) {
      resize.width = width;
    }

    if (height !== undefined) {
      resize.height = height;
    }

    options.resize = resize;
  }

  if (parsed.flags.has("png-palette")) {
    options.png = { palette: true };
  }

  if (parsed.flags.has("no-progressive")) {
    options.jpeg = { progressive: false };
  }

  await compressFile(input, output, options);
  console.log(`${basename(input)} -> ${output}`);
}

async function runFavicon(parsed: ParsedArgs): Promise<void> {
  const [input, output] = parsed.positionals;
  if (!input || !output) {
    throw new Error("favicon requires an input path and output path.");
  }

  const sizes = optionalSizes(parsed, "sizes");
  const format = optionalEnum(parsed, "ico-format", ["auto", "png", "bmp"]);
  const fit = optionalEnum(parsed, "fit", ["contain", "cover", "fill"]);
  const options: CreateIcoOptions = {};

  if (sizes) {
    options.sizes = sizes;
  }

  if (format) {
    options.format = format;
  }

  if (fit) {
    options.fit = fit;
  }

  await createFavicon(input, output, options);
  console.log(`${basename(input)} -> ${output}`);
}

function parseArgs(args: string[]): ParsedArgs {
  const [command, ...rest] = args;
  const flags = new Map<string, string | boolean>();
  const positionals: string[] = [];

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index]!;

    if (!arg.startsWith("--")) {
      positionals.push(arg);
      continue;
    }

    const raw = arg.slice(2);
    const equalsIndex = raw.indexOf("=");

    if (equalsIndex !== -1) {
      flags.set(raw.slice(0, equalsIndex), raw.slice(equalsIndex + 1));
      continue;
    }

    const next = rest[index + 1];
    if (next && !next.startsWith("--")) {
      flags.set(raw, next);
      index += 1;
    } else {
      flags.set(raw, true);
    }
  }

  return { command, positionals, flags };
}

function optionalString(parsed: ParsedArgs, name: string): string | undefined {
  const value = parsed.flags.get(name);
  if (typeof value !== "string") {
    return undefined;
  }

  return value;
}

function optionalEnum<const Value extends string>(
  parsed: ParsedArgs,
  name: string,
  values: readonly Value[]
): Value | undefined {
  const value = optionalString(parsed, name);
  if (value === undefined) {
    return undefined;
  }

  if (!values.includes(value as Value)) {
    throw new Error(`--${name} must be one of: ${values.join(", ")}.`);
  }

  return value as Value;
}

function optionalInteger(parsed: ParsedArgs, name: string): number | undefined {
  const value = optionalString(parsed, name);
  if (value === undefined) {
    return undefined;
  }

  const integer = Number(value);
  if (!Number.isInteger(integer)) {
    throw new Error(`--${name} must be an integer.`);
  }

  return integer;
}

function optionalSizes(parsed: ParsedArgs, name: string): number[] | undefined {
  const value = optionalString(parsed, name);
  if (value === undefined) {
    return undefined;
  }

  return value.split(",").map((part) => {
    const integer = Number(part.trim());
    if (!Number.isInteger(integer)) {
      throw new Error(`--${name} must be a comma-separated list of integers.`);
    }

    return integer;
  });
}

function printHelp(): void {
  console.log(`Compressico

Usage:
  compressico compress <input> <output> [--quality 82] [--format jpeg|png] [--max-width 1200] [--max-height 1200]
  compressico favicon <input> <output.ico> [--sizes 16,32,48,256] [--ico-format auto|png|bmp] [--fit contain|cover|fill]

Commands:
  compress   Compress a PNG/JPEG with Sharp.
  favicon    Create an ICO favicon with Compressico's own ICO encoder.
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
