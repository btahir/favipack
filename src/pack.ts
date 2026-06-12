import { join } from "node:path";
import sharp from "sharp";
import { readImageInput, type ImageInput, writeOutputFile } from "./input.js";
import { createIco, type CreateIcoOptions, type FaviconFit, type IcoPngOptions } from "./ico.js";

const DEFAULT_THEME_COLOR = "#ffffff";
const DEFAULT_BACKGROUND_COLOR = "#ffffff";

export interface FaviconPackOptions {
  appName?: string;
  shortName?: string;
  themeColor?: string;
  backgroundColor?: string;
  display?: "fullscreen" | "standalone" | "minimal-ui" | "browser";
  fit?: FaviconFit;
  background?: sharp.Color;
  pathPrefix?: string;
  includeManifest?: boolean;
  ico?: CreateIcoOptions;
  png?: IcoPngOptions;
}

export interface FaviconPackFile {
  path: string;
  type: "ico" | "png" | "manifest";
  size?: number;
}

export interface FaviconPackResult {
  files: FaviconPackFile[];
}

interface PngAsset {
  filename: string;
  size: number;
}

const PNG_ASSETS: readonly PngAsset[] = [
  { filename: "favicon-16x16.png", size: 16 },
  { filename: "favicon-32x32.png", size: 32 },
  { filename: "apple-touch-icon.png", size: 180 },
  { filename: "android-chrome-192x192.png", size: 192 },
  { filename: "android-chrome-512x512.png", size: 512 }
];

export async function createFaviconPack(
  input: ImageInput,
  outputDir: string,
  options: FaviconPackOptions = {}
): Promise<FaviconPackResult> {
  const source = await readImageInput(input);
  const files: FaviconPackFile[] = [];
  const icoPath = join(outputDir, "favicon.ico");
  const ico = await createIco(source, createIcoOptions(options));

  await writeOutputFile(icoPath, ico);
  files.push({ path: icoPath, type: "ico" });

  await Promise.all(
    PNG_ASSETS.map(async (asset) => {
      const outputPath = join(outputDir, asset.filename);
      const png = await renderPng(source, asset.size, options);

      await writeOutputFile(outputPath, png);
      files.push({ path: outputPath, type: "png", size: asset.size });
    })
  );

  if (options.includeManifest !== false) {
    const manifestPath = join(outputDir, "site.webmanifest");
    const manifest = createWebManifest(options);

    await writeOutputFile(manifestPath, Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`));
    files.push({ path: manifestPath, type: "manifest" });
  }

  files.sort((a, b) => a.path.localeCompare(b.path));
  return { files };
}

function createIcoOptions(options: FaviconPackOptions): CreateIcoOptions {
  const ico: CreateIcoOptions = { ...options.ico };

  if (options.fit !== undefined && ico.fit === undefined) {
    ico.fit = options.fit;
  }

  if (options.background !== undefined && ico.background === undefined) {
    ico.background = options.background;
  }

  if (options.png !== undefined && ico.png === undefined) {
    ico.png = options.png;
  }

  return ico;
}

async function renderPng(source: Buffer, size: number, options: FaviconPackOptions): Promise<Buffer> {
  const png = options.png ?? {};

  return sharp(source, { animated: false })
    .rotate()
    .resize(size, size, {
      fit: options.fit ?? "contain",
      background: options.background ?? { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({
      compressionLevel: png.compressionLevel ?? 9,
      adaptiveFiltering: png.adaptiveFiltering ?? true,
      effort: png.effort ?? 10,
      palette: png.palette ?? false
    })
    .toBuffer();
}

function createWebManifest(options: FaviconPackOptions): Record<string, unknown> {
  const appName = options.appName ?? "Favipack App";
  const prefix = normalizePathPrefix(options.pathPrefix ?? "/");

  return {
    name: appName,
    short_name: options.shortName ?? appName,
    icons: [
      {
        src: `${prefix}android-chrome-192x192.png`,
        sizes: "192x192",
        type: "image/png"
      },
      {
        src: `${prefix}android-chrome-512x512.png`,
        sizes: "512x512",
        type: "image/png"
      }
    ],
    theme_color: options.themeColor ?? DEFAULT_THEME_COLOR,
    background_color: options.backgroundColor ?? DEFAULT_BACKGROUND_COLOR,
    display: options.display ?? "standalone"
  };
}

function normalizePathPrefix(prefix: string): string {
  if (prefix === "") {
    return "";
  }

  return prefix.endsWith("/") ? prefix : `${prefix}/`;
}
