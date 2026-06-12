import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { createIco } from "../dist/index.js";

test("createIco writes a valid PNG-backed ICO directory", async () => {
  const input = await sampleImage();
  const ico = await createIco(input, { sizes: [32, 16, 256], format: "png" });

  assert.equal(ico.readUInt16LE(0), 0);
  assert.equal(ico.readUInt16LE(2), 1);
  assert.equal(ico.readUInt16LE(4), 3);

  assert.equal(ico[6], 16);
  assert.equal(ico[6 + 16], 32);
  assert.equal(ico[6 + 32], 0);

  for (let index = 0; index < 3; index += 1) {
    const entry = 6 + index * 16;
    const bytes = ico.readUInt32LE(entry + 8);
    const offset = ico.readUInt32LE(entry + 12);

    assert.ok(bytes > 0);
    assert.equal(ico.subarray(offset, offset + 8).toString("hex"), "89504e470d0a1a0a");
  }
});

test("createIco can write first-party BMP/DIB ICO entries", async () => {
  const input = await sampleImage();
  const ico = await createIco(input, { sizes: [16], format: "bmp" });
  const bytes = ico.readUInt32LE(14);
  const offset = ico.readUInt32LE(18);
  const dib = ico.subarray(offset, offset + bytes);

  assert.equal(ico.readUInt16LE(4), 1);
  assert.equal(ico[6], 16);
  assert.equal(ico.readUInt16LE(12), 32);
  assert.equal(dib.readUInt32LE(0), 40);
  assert.equal(dib.readInt32LE(4), 16);
  assert.equal(dib.readInt32LE(8), 32);
  assert.equal(dib.readUInt16LE(12), 1);
  assert.equal(dib.readUInt16LE(14), 32);
  assert.equal(dib.readUInt32LE(16), 0);
});

test("createIco defaults to BMP small entries and PNG 256 entry", async () => {
  const input = await sampleImage();
  const ico = await createIco(input);

  assert.equal(ico.readUInt16LE(4), 4);

  const firstOffset = ico.readUInt32LE(18);
  assert.equal(ico.subarray(firstOffset, firstOffset + 8).toString("hex"), "2800000010000000");

  const lastEntry = 6 + 3 * 16;
  const lastOffset = ico.readUInt32LE(lastEntry + 12);
  assert.equal(ico[lastEntry], 0);
  assert.equal(ico.subarray(lastOffset, lastOffset + 8).toString("hex"), "89504e470d0a1a0a");
});

async function sampleImage() {
  return sharp({
    create: {
      width: 40,
      height: 28,
      channels: 4,
      background: { r: 230, g: 40, b: 70, alpha: 1 }
    }
  })
    .png()
    .toBuffer();
}
