import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { compressImage } from "../dist/index.js";

test("compressImage emits JPEG and PNG outputs", async () => {
  const input = await sharp({
    create: {
      width: 48,
      height: 48,
      channels: 4,
      background: { r: 20, g: 120, b: 220, alpha: 1 }
    }
  })
    .png()
    .toBuffer();

  const jpeg = await compressImage(input, { format: "jpeg", quality: 70 });
  const jpegMetadata = await sharp(jpeg).metadata();
  assert.equal(jpegMetadata.format, "jpeg");

  const png = await compressImage(input, { format: "png", png: { palette: true } });
  const pngMetadata = await sharp(png).metadata();
  assert.equal(pngMetadata.format, "png");
});

test("compressImage emits WebP and AVIF outputs", async () => {
  const input = await sharp({
    create: {
      width: 64,
      height: 48,
      channels: 4,
      background: { r: 240, g: 140, b: 40, alpha: 1 }
    }
  })
    .png()
    .toBuffer();

  const webp = await compressImage(input, { format: "webp", quality: 76 });
  const webpMetadata = await sharp(webp).metadata();
  assert.equal(webpMetadata.format, "webp");

  const avif = await compressImage(input, { format: "avif", quality: 50 });
  const avifMetadata = await sharp(avif).metadata();
  assert.equal(avifMetadata.format, "heif");
  assert.equal(avifMetadata.compression, "av1");
});
