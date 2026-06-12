import sharp from "sharp";
import { assertIntegerInRange, readImageInput, type ImageInput, writeOutputFile } from "./input.js";

const DEFAULT_FAVICON_SIZES = [16, 32, 48, 256] as const;
const ICO_HEADER_SIZE = 6;
const ICO_DIRECTORY_ENTRY_SIZE = 16;
const BITMAP_INFO_HEADER_SIZE = 40;

export type IcoEntryFormat = "png" | "bmp";
export type IcoFormat = IcoEntryFormat | "auto";
export type FaviconFit = "contain" | "cover" | "fill";

export interface IcoPngOptions {
  compressionLevel?: 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
  adaptiveFiltering?: boolean;
  effort?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;
  palette?: boolean;
}

export interface CreateIcoOptions {
  sizes?: readonly number[];
  format?: IcoFormat;
  fit?: FaviconFit;
  background?: sharp.Color;
  png?: IcoPngOptions;
}

export async function createIco(input: ImageInput, options: CreateIcoOptions = {}): Promise<Buffer> {
  const source = await readImageInput(input);
  const sizes = normalizeSizes(options.sizes);
  const format = options.format ?? "auto";
  const images = await Promise.all(
    sizes.map((size) => renderEntry(source, size, entryFormatForSize(format, size), options))
  );

  return encodeIco(
    images.map((data, index) => ({
      width: sizes[index]!,
      height: sizes[index]!,
      bitDepth: 32,
      data
    }))
  );
}

export async function createFavicon(
  inputPath: string,
  outputPath: string,
  options: CreateIcoOptions = {}
): Promise<Buffer> {
  const output = await createIco(inputPath, options);

  await writeOutputFile(outputPath, output);
  return output;
}

interface IcoImage {
  width: number;
  height: number;
  bitDepth: number;
  data: Buffer;
}

function normalizeSizes(sizes: readonly number[] | undefined): number[] {
  const uniqueSizes = [...new Set(sizes ?? DEFAULT_FAVICON_SIZES)];

  if (uniqueSizes.length === 0) {
    throw new RangeError("At least one favicon size is required.");
  }

  for (const size of uniqueSizes) {
    assertIntegerInRange(size, "favicon size", 1, 256);
  }

  return uniqueSizes.sort((a, b) => a - b);
}

function entryFormatForSize(format: IcoFormat, size: number): IcoEntryFormat {
  if (format !== "auto") {
    return format;
  }

  return size === 256 ? "png" : "bmp";
}

async function renderEntry(
  source: Buffer,
  size: number,
  format: IcoEntryFormat,
  options: CreateIcoOptions
): Promise<Buffer> {
  const base = sharp(source, { animated: false })
    .rotate()
    .resize(size, size, {
      fit: options.fit ?? "contain",
      background: options.background ?? { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .ensureAlpha();

  if (format === "png") {
    const png = options.png ?? {};
    return base
      .png({
        compressionLevel: png.compressionLevel ?? 9,
        adaptiveFiltering: png.adaptiveFiltering ?? true,
        effort: png.effort ?? 10,
        palette: png.palette ?? false
      })
      .toBuffer();
  }

  const { data, info } = await base.raw().toBuffer({ resolveWithObject: true });
  return encodeBitmapIcoImage(data, info.width, info.height);
}

function encodeIco(images: IcoImage[]): Buffer {
  if (images.length > 0xffff) {
    throw new RangeError("ICO files cannot contain more than 65535 images.");
  }

  const directorySize = ICO_HEADER_SIZE + images.length * ICO_DIRECTORY_ENTRY_SIZE;
  const directory = Buffer.alloc(directorySize);
  let imageOffset = directorySize;

  directory.writeUInt16LE(0, 0);
  directory.writeUInt16LE(1, 2);
  directory.writeUInt16LE(images.length, 4);

  for (const [index, image] of images.entries()) {
    assertIntegerInRange(image.width, "ICO image width", 1, 256);
    assertIntegerInRange(image.height, "ICO image height", 1, 256);

    const entryOffset = ICO_HEADER_SIZE + index * ICO_DIRECTORY_ENTRY_SIZE;

    directory[entryOffset] = image.width === 256 ? 0 : image.width;
    directory[entryOffset + 1] = image.height === 256 ? 0 : image.height;
    directory[entryOffset + 2] = 0;
    directory[entryOffset + 3] = 0;
    directory.writeUInt16LE(1, entryOffset + 4);
    directory.writeUInt16LE(image.bitDepth, entryOffset + 6);
    directory.writeUInt32LE(image.data.length, entryOffset + 8);
    directory.writeUInt32LE(imageOffset, entryOffset + 12);

    imageOffset += image.data.length;
  }

  return Buffer.concat([directory, ...images.map((image) => image.data)], imageOffset);
}

function encodeBitmapIcoImage(rgba: Uint8Array, width: number, height: number): Buffer {
  assertIntegerInRange(width, "DIB image width", 1, 256);
  assertIntegerInRange(height, "DIB image height", 1, 256);

  const xorStride = width * 4;
  const xorBytes = xorStride * height;
  const maskStride = Math.ceil(width / 32) * 4;
  const maskBytes = maskStride * height;
  const dib = Buffer.alloc(BITMAP_INFO_HEADER_SIZE + xorBytes + maskBytes);

  dib.writeUInt32LE(BITMAP_INFO_HEADER_SIZE, 0);
  dib.writeInt32LE(width, 4);
  dib.writeInt32LE(height * 2, 8);
  dib.writeUInt16LE(1, 12);
  dib.writeUInt16LE(32, 14);
  dib.writeUInt32LE(0, 16);
  dib.writeUInt32LE(xorBytes + maskBytes, 20);
  dib.writeInt32LE(0, 24);
  dib.writeInt32LE(0, 28);
  dib.writeUInt32LE(0, 32);
  dib.writeUInt32LE(0, 36);

  for (let outputY = 0; outputY < height; outputY += 1) {
    const sourceY = height - 1 - outputY;
    const outputRow = BITMAP_INFO_HEADER_SIZE + outputY * xorStride;
    const maskRow = BITMAP_INFO_HEADER_SIZE + xorBytes + outputY * maskStride;

    for (let x = 0; x < width; x += 1) {
      const sourceOffset = (sourceY * width + x) * 4;
      const outputOffset = outputRow + x * 4;
      const alpha = rgba[sourceOffset + 3] ?? 255;

      dib[outputOffset] = rgba[sourceOffset + 2] ?? 0;
      dib[outputOffset + 1] = rgba[sourceOffset + 1] ?? 0;
      dib[outputOffset + 2] = rgba[sourceOffset] ?? 0;
      dib[outputOffset + 3] = alpha;

      if (alpha === 0) {
        const maskOffset = maskRow + (x >> 3);
        dib[maskOffset] = (dib[maskOffset] ?? 0) | (0x80 >> (x & 7));
      }
    }
  }

  return dib;
}
