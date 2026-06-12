import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import test from "node:test";
import sharp from "sharp";
import { createFaviconPack } from "../dist/index.js";

test("createFaviconPack writes a website favicon bundle", async () => {
  const dir = await mkdtemp(join(tmpdir(), "favipack-test-"));

  try {
    const input = await sampleImage();
    const result = await createFaviconPack(input, dir, {
      appName: "Demo App",
      shortName: "Demo",
      themeColor: "#111111",
      backgroundColor: "#eeeeee"
    });

    assert.deepEqual(
      result.files.map((file) => basename(file.path)).sort(),
      [
        "android-chrome-192x192.png",
        "android-chrome-512x512.png",
        "apple-touch-icon.png",
        "favicon-16x16.png",
        "favicon-32x32.png",
        "favicon.ico",
        "site.webmanifest"
      ]
    );

    const apple = await sharp(join(dir, "apple-touch-icon.png")).metadata();
    assert.equal(apple.width, 180);
    assert.equal(apple.height, 180);

    const android = await sharp(join(dir, "android-chrome-512x512.png")).metadata();
    assert.equal(android.width, 512);
    assert.equal(android.height, 512);

    const manifest = JSON.parse(await readFile(join(dir, "site.webmanifest"), "utf8"));
    assert.equal(manifest.name, "Demo App");
    assert.equal(manifest.short_name, "Demo");
    assert.equal(manifest.theme_color, "#111111");
    assert.equal(manifest.background_color, "#eeeeee");
    assert.equal(manifest.icons.length, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

async function sampleImage() {
  return sharp({
    create: {
      width: 96,
      height: 64,
      channels: 4,
      background: { r: 30, g: 120, b: 230, alpha: 1 }
    }
  })
    .png()
    .toBuffer();
}
