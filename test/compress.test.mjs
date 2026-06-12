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
