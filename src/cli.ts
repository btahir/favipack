#!/usr/bin/env node
import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  compressFile,
  createFavicon,
  createFaviconPack,
  type CompressOptions,
  type CreateIcoOptions,
  type FaviconPackOptions,
  type RequestedFormat
} from "./index.js";

interface ParsedArgs {
  command: string | undefined;
  positionals: string[];
  flags: Map<string, string | boolean>;
}

interface BatchInput {
  path: string;
  root: string;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === "--help" || args[0] === "-h") {
    printHelp();
    return;
  }

  if (args[0] === "--version" || args[0] === "-v") {
    console.log(await readPackageVersion());
    return;
  }

  if (args.includes("--help") || args.includes("-h")) {
    printCommandHelp(args[0]);
    return;
  }

  const parsed = parseArgs(args);

  if (parsed.command === "compress") {
    await runCompress(parsed);
    return;
  }

  if (parsed.command === "favicon") {
    await runFavicon(parsed);
    return;
  }

  if (parsed.command === "pack") {
    await runPack(parsed);
    return;
  }

  throw new Error(`Unknown command: ${parsed.command ?? ""}`);
}

async function runCompress(parsed: ParsedArgs): Promise<void> {
  const outDir = optionalString(parsed, "out-dir");
  if (parsed.flags.has("out-dir") && outDir === undefined) {
    throw new Error("--out-dir requires a path.");
  }

  if (outDir !== undefined) {
    await runBatchCompress(parsed, outDir);
    return;
  }

  const [input, output] = parsed.positionals;
  if (!input || !output) {
    throw new Error("compress requires an input path and output path.");
  }

  const options = parseCompressOptions(parsed);
  const inputBytes = await fileSize(input);
  const compressed = await compressFile(input, output, options);

  console.log(formatCompressionResult(input, output, inputBytes, compressed.length));
}

async function runBatchCompress(parsed: ParsedArgs, outDir: string): Promise<void> {
  const inputs = parsed.positionals;
  if (inputs.length === 0) {
    throw new Error("batch compression requires at least one input path or glob.");
  }

  const options = parseCompressOptions(parsed);
  const batchInputs = await expandBatchInputs(inputs);
  if (batchInputs.length === 0) {
    throw new Error("No matching image inputs found.");
  }

  let totalInputBytes = 0;
  let totalOutputBytes = 0;

  for (const input of batchInputs) {
    const output = batchOutputPath(input, outDir, options.format);
    const inputBytes = await fileSize(input.path);
    const compressed = await compressFile(input.path, output, options);

    totalInputBytes += inputBytes;
    totalOutputBytes += compressed.length;
    console.log(formatCompressionResult(input.path, output, inputBytes, compressed.length));
  }

  console.log(
    `Compressed ${batchInputs.length} files (${formatBytes(totalInputBytes)} -> ${formatBytes(
      totalOutputBytes
    )}, ${formatSavings(totalInputBytes, totalOutputBytes)})`
  );
}

async function runFavicon(parsed: ParsedArgs): Promise<void> {
  const [input, output] = parsed.positionals;
  if (!input || !output) {
    throw new Error("favicon requires an input path and output path.");
  }

  const options = parseIcoOptions(parsed);

  await createFavicon(input, output, options);
  console.log(`${basename(input)} -> ${output}`);
}

async function runPack(parsed: ParsedArgs): Promise<void> {
  const [input, outputDir] = parsed.positionals;
  if (!input || !outputDir) {
    throw new Error("pack requires an input path and output directory.");
  }

  const options = parsePackOptions(parsed);
  const result = await createFaviconPack(input, outputDir, options);

  console.log(`Created ${result.files.length} files in ${outputDir}`);
  for (const file of result.files) {
    console.log(`  ${displayPath(file.path)}`);
  }
}

function parseCompressOptions(parsed: ParsedArgs): CompressOptions {
  const width = optionalInteger(parsed, "max-width");
  const height = optionalInteger(parsed, "max-height");
  const quality = optionalInteger(parsed, "quality");
  const format = optionalEnum(parsed, "format", ["auto", "jpeg", "jpg", "png", "webp", "avif"]);
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

  if (parsed.flags.has("webp-lossless")) {
    options.webp = { ...options.webp, lossless: true };
  }

  if (parsed.flags.has("avif-lossless")) {
    options.avif = { ...options.avif, lossless: true };
  }

  return options;
}

function parseIcoOptions(parsed: ParsedArgs): CreateIcoOptions {
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

  return options;
}

function parsePackOptions(parsed: ParsedArgs): FaviconPackOptions {
  const appName = optionalString(parsed, "app-name");
  const shortName = optionalString(parsed, "short-name");
  const themeColor = optionalString(parsed, "theme-color");
  const backgroundColor = optionalString(parsed, "background-color");
  const pathPrefix = optionalString(parsed, "path-prefix");
  const fit = optionalEnum(parsed, "fit", ["contain", "cover", "fill"]);
  const display = optionalEnum(parsed, "display", ["fullscreen", "standalone", "minimal-ui", "browser"]);
  const ico = parseIcoOptions(parsed);
  const options: FaviconPackOptions = {};

  if (appName !== undefined) {
    options.appName = appName;
  }

  if (shortName !== undefined) {
    options.shortName = shortName;
  }

  if (themeColor !== undefined) {
    options.themeColor = themeColor;
  }

  if (backgroundColor !== undefined) {
    options.backgroundColor = backgroundColor;
  }

  if (pathPrefix !== undefined) {
    options.pathPrefix = pathPrefix;
  }

  if (display !== undefined) {
    options.display = display;
  }

  if (fit !== undefined) {
    options.fit = fit;
    ico.fit = fit;
  }

  if (parsed.flags.has("no-manifest")) {
    options.includeManifest = false;
  }

  if (Object.keys(ico).length > 0) {
    options.ico = ico;
  }

  return options;
}

async function expandBatchInputs(inputs: string[]): Promise<BatchInput[]> {
  const seen = new Set<string>();
  const matches: BatchInput[] = [];

  for (const input of inputs) {
    const expanded = await expandBatchInput(input);
    for (const match of expanded) {
      if (seen.has(match.path)) {
        continue;
      }

      seen.add(match.path);
      matches.push(match);
    }
  }

  return matches.sort((a, b) => a.path.localeCompare(b.path));
}

async function expandBatchInput(input: string): Promise<BatchInput[]> {
  if (hasGlob(input)) {
    const root = resolve(globRoot(input));
    const matcher = globToRegExp(resolve(input).replace(/\\/g, "/"));
    const files = await walkFiles(root);

    return files
      .filter((file) => matcher.test(file.replace(/\\/g, "/")))
      .map((file) => ({ path: file, root }));
  }

  const absolute = resolve(input);
  const inputStat = await stat(absolute);

  if (inputStat.isDirectory()) {
    const files = await walkFiles(absolute);
    return files.filter(isSupportedImagePath).map((file) => ({ path: file, root: absolute }));
  }

  return [{ path: absolute, root: dirname(absolute) }];
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const path = join(root, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await walkFiles(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }

  return files;
}

function batchOutputPath(input: BatchInput, outDir: string, format: RequestedFormat | undefined): string {
  const relativeInput = relative(input.root, input.path);
  const outputExtension = (extensionForFormat(format) ?? extname(input.path)) || ".jpg";
  const outputRelative = replaceExtension(relativeInput || basename(input.path), outputExtension);

  return join(outDir, outputRelative);
}

function extensionForFormat(format: RequestedFormat | undefined): string | undefined {
  if (format === undefined || format === "auto") {
    return undefined;
  }

  if (format === "jpeg" || format === "jpg") {
    return ".jpg";
  }

  return `.${format}`;
}

function replaceExtension(path: string, extension: string): string {
  const currentExtension = extname(path);

  if (!currentExtension) {
    return `${path}${extension}`;
  }

  return `${path.slice(0, -currentExtension.length)}${extension}`;
}

function isSupportedImagePath(path: string): boolean {
  const extension = extname(path).toLowerCase();
  return [".jpg", ".jpeg", ".png", ".webp", ".avif"].includes(extension);
}

function hasGlob(path: string): boolean {
  return /[*?{}]/.test(path);
}

function globRoot(pattern: string): string {
  const normalized = pattern.replace(/\\/g, "/");
  const parts = normalized.split("/");
  const rootParts: string[] = [];

  for (const part of parts) {
    if (hasGlob(part)) {
      break;
    }

    rootParts.push(part);
  }

  const root = rootParts.join("/");
  return root || ".";
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";

  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index]!;

    if (char === "*") {
      if (pattern[index + 1] === "*") {
        index += 1;
        if (pattern[index + 1] === "/") {
          index += 1;
          source += "(?:.*/)?";
        } else {
          source += ".*";
        }
      } else {
        source += "[^/]*";
      }
      continue;
    }

    if (char === "?") {
      source += "[^/]";
      continue;
    }

    if (char === "{") {
      const closeIndex = pattern.indexOf("}", index + 1);
      if (closeIndex !== -1) {
        const alternatives = pattern
          .slice(index + 1, closeIndex)
          .split(",")
          .map(escapeRegExp)
          .join("|");
        source += `(?:${alternatives})`;
        index = closeIndex;
        continue;
      }
    }

    source += escapeRegExp(char);
  }

  return new RegExp(`${source}$`, "i");
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

async function fileSize(path: string): Promise<number> {
  return (await stat(path)).size;
}

function formatCompressionResult(input: string, output: string, inputBytes: number, outputBytes: number): string {
  return `${displayPath(input)} -> ${displayPath(output)} (${formatBytes(inputBytes)} -> ${formatBytes(
    outputBytes
  )}, ${formatSavings(inputBytes, outputBytes)})`;
}

function displayPath(path: string): string {
  const relativePath = relative(process.cwd(), path);

  if (relativePath === "" || relativePath.startsWith("..")) {
    return path;
  }

  return relativePath;
}

function formatSavings(inputBytes: number, outputBytes: number): string {
  if (inputBytes === 0) {
    return "0% saved";
  }

  const ratio = ((inputBytes - outputBytes) / inputBytes) * 100;
  if (ratio >= 0) {
    return `${ratio.toFixed(1)}% saved`;
  }

  return `${Math.abs(ratio).toFixed(1)}% larger`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
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

async function readPackageVersion(): Promise<string> {
  const packagePath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
  const packageJson = JSON.parse(await readFile(packagePath, "utf8")) as { version?: string };

  return packageJson.version ?? "unknown";
}

function printHelp(): void {
  console.log(`Favipack

Usage:
  favipack compress <input> <output> [options]
  favipack compress <input-or-glob...> --out-dir <dir> [options]
  favipack favicon <input> <output.ico> [options]
  favipack pack <input> <output-dir> [options]

Commands:
  compress   Compress or convert images with Sharp.
  favicon    Create an ICO favicon with Favipack's own ICO encoder.
  pack       Create a website favicon bundle.

Run "favipack <command> --help" for command-specific options.
`);
}

function printCommandHelp(command: string | undefined): void {
  if (command === "compress") {
    printCompressHelp();
    return;
  }

  if (command === "favicon") {
    printFaviconHelp();
    return;
  }

  if (command === "pack") {
    printPackHelp();
    return;
  }

  printHelp();
}

function printCompressHelp(): void {
  console.log(`Favipack compress

Usage:
  favipack compress <input> <output> [--quality 82] [--format jpeg|png|webp|avif]
  favipack compress "<glob>" --out-dir <dir> [--format webp] [--quality 80]

Options:
  --quality <int>       Encoder quality for JPEG, PNG palette, WebP, or AVIF.
  --format <format>     Output format: auto, jpeg, jpg, png, webp, avif.
  --max-width <int>     Resize to fit within this width.
  --max-height <int>    Resize to fit within this height.
  --out-dir <dir>       Batch output directory.
  --png-palette         Use a PNG palette.
  --no-progressive      Disable progressive JPEG output.
  --webp-lossless       Write lossless WebP.
  --avif-lossless       Write lossless AVIF.
  --keep-metadata       Preserve source metadata.
`);
}

function printFaviconHelp(): void {
  console.log(`Favipack favicon

Usage:
  favipack favicon <input> <output.ico> [--sizes 16,32,48,256]

Options:
  --sizes <list>        Comma-separated ICO sizes.
  --ico-format <format> ICO entry format: auto, png, bmp.
  --fit <fit>           Resize fit: contain, cover, fill.
`);
}

function printPackHelp(): void {
  console.log(`Favipack pack

Usage:
  favipack pack <input> <output-dir> [--app-name "My App"]

Outputs:
  favicon.ico
  favicon-16x16.png
  favicon-32x32.png
  apple-touch-icon.png
  android-chrome-192x192.png
  android-chrome-512x512.png
  site.webmanifest

Options:
  --app-name <name>          Manifest name.
  --short-name <name>        Manifest short_name.
  --theme-color <color>      Manifest theme_color.
  --background-color <color> Manifest background_color.
  --display <mode>           fullscreen, standalone, minimal-ui, browser.
  --path-prefix <path>       Manifest icon path prefix. Defaults to /.
  --no-manifest              Skip site.webmanifest.
  --sizes <list>             ICO sizes.
  --ico-format <format>      ICO entry format: auto, png, bmp.
  --fit <fit>                Resize fit: contain, cover, fill.
`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
