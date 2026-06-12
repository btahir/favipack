import sharp, { type FitEnum, type Sharp } from "sharp";
import {
  formatFromPath,
  normalizeRequestedFormat,
  readImageInput,
  type ImageInput,
  type RequestedFormat,
  type SupportedFormat,
  writeOutputFile
} from "./input.js";

export type ResizeFit = keyof FitEnum;

export interface ResizeOptions {
  width?: number;
  height?: number;
  fit?: ResizeFit;
  withoutEnlargement?: boolean;
  background?: sharp.Color;
}

export interface JpegOptions {
  quality?: number;
  progressive?: boolean;
  mozjpeg?: boolean;
  chromaSubsampling?: "4:4:4" | "4:2:0";
  optimizeCoding?: boolean;
  trellisQuantisation?: boolean;
  overshootDeringing?: boolean;
  optimizeScans?: boolean;
}

export interface PngOptions {
  compressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  adaptiveFiltering?: boolean;
  palette?: boolean;
  quality?: number;
  colors?: number;
  effort?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  dither?: number;
  progressive?: boolean;
}

export interface WebpOptions {
  quality?: number;
  alphaQuality?: number;
  lossless?: boolean;
  nearLossless?: boolean;
  smartSubsample?: boolean;
  effort?: 0 | 1 | 2 | 3 | 4 | 5 | 6;
}

export interface AvifOptions {
  quality?: number;
  lossless?: boolean;
  effort?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  chromaSubsampling?: "4:4:4" | "4:2:0";
}

export interface CompressOptions {
  format?: RequestedFormat;
  quality?: number;
  resize?: ResizeOptions;
  autoOrient?: boolean;
  keepMetadata?: boolean;
  jpeg?: JpegOptions;
  png?: PngOptions;
  webp?: WebpOptions;
  avif?: AvifOptions;
}

export interface CompressFileOptions extends CompressOptions {
  inferFormatFromOutputPath?: boolean;
}

export async function compressImage(input: ImageInput, options: CompressOptions = {}): Promise<Buffer> {
  const source = await readImageInput(input);
  const metadata = await sharp(source, { animated: false }).metadata();
  const format = resolveOutputFormat(options.format, metadata.format);
  let image = sharp(source, { animated: false });

  if (options.autoOrient !== false) {
    image = image.rotate();
  }

  if (options.resize) {
    image = image.resize({
      width: options.resize.width,
      height: options.resize.height,
      fit: options.resize.fit,
      withoutEnlargement: options.resize.withoutEnlargement ?? true,
      background: options.resize.background
    });
  }

  if (options.keepMetadata) {
    image = image.keepMetadata();
  }

  return encodeCompressed(image, format, options);
}

export async function compressFile(
  inputPath: string,
  outputPath: string,
  options: CompressFileOptions = {}
): Promise<Buffer> {
  const format =
    options.inferFormatFromOutputPath === false
      ? options.format
      : options.format ?? formatFromPath(outputPath);
  const compressOptions: CompressOptions = { ...options };

  if (format !== undefined) {
    compressOptions.format = format;
  }

  const output = await compressImage(inputPath, compressOptions);

  await writeOutputFile(outputPath, output);
  return output;
}

function resolveOutputFormat(format: RequestedFormat | undefined, metadataFormat: string | undefined): SupportedFormat {
  const requested = normalizeRequestedFormat(format);

  if (requested !== "auto") {
    return requested;
  }

  if (metadataFormat === "jpeg" || metadataFormat === "png" || metadataFormat === "webp" || metadataFormat === "avif") {
    return metadataFormat;
  }

  throw new TypeError(
    `Only PNG, JPEG, WebP, and AVIF output are supported. Pass format explicitly for unsupported input format: ${metadataFormat ?? "unknown"}.`
  );
}

function encodeCompressed(image: Sharp, format: SupportedFormat, options: CompressOptions): Promise<Buffer> {
  if (format === "jpeg") {
    const jpeg = options.jpeg ?? {};
    return image
      .jpeg({
        quality: jpeg.quality ?? options.quality ?? 82,
        progressive: jpeg.progressive ?? true,
        mozjpeg: jpeg.mozjpeg ?? true,
        chromaSubsampling: jpeg.chromaSubsampling ?? "4:2:0",
        optimizeCoding: jpeg.optimizeCoding ?? true,
        trellisQuantisation: jpeg.trellisQuantisation,
        overshootDeringing: jpeg.overshootDeringing,
        optimizeScans: jpeg.optimizeScans
      })
      .toBuffer();
  }

  if (format === "png") {
    const png = options.png ?? {};
    return image
      .png({
        compressionLevel: png.compressionLevel ?? 9,
        adaptiveFiltering: png.adaptiveFiltering ?? true,
        palette: png.palette ?? false,
        quality: png.quality ?? options.quality,
        colors: png.colors,
        effort: png.effort ?? 10,
        dither: png.dither,
        progressive: png.progressive
      })
      .toBuffer();
  }

  if (format === "webp") {
    const webp = options.webp ?? {};
    return image
      .webp({
        quality: webp.quality ?? options.quality ?? 80,
        alphaQuality: webp.alphaQuality,
        lossless: webp.lossless,
        nearLossless: webp.nearLossless,
        smartSubsample: webp.smartSubsample ?? true,
        effort: webp.effort ?? 4
      })
      .toBuffer();
  }

  const avif = options.avif ?? {};
  return image
    .avif({
      quality: avif.quality ?? options.quality ?? 55,
      lossless: avif.lossless,
      effort: avif.effort ?? 4,
      chromaSubsampling: avif.chromaSubsampling ?? "4:2:0"
    })
    .toBuffer();
}
