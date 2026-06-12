import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import test from "node:test";
import sharp from "sharp";

const execFileAsync = promisify(execFile);
const cliPath = new URL("../dist/cli.js", import.meta.url);

test("CLI prints version and command help", async () => {
  const version = await execFileAsync(process.execPath, [cliPath.pathname, "--version"]);
  assert.match(version.stdout.trim(), /^\d+\.\d+\.\d+$/);

  const help = await execFileAsync(process.execPath, [cliPath.pathname, "compress", "--help"]);
  assert.match(help.stdout, /Favipack compress/);
  assert.match(help.stdout, /webp/);
  assert.match(help.stdout, /avif/);
});

test("CLI batch compresses a glob into an output directory", async () => {
  const dir = await mkdtemp(join(tmpdir(), "favipack-cli-test-"));

  try {
    const inputDir = join(dir, "input");
    const nestedDir = join(inputDir, "nested");
    const outDir = join(dir, "out");

    await mkdir(nestedDir, { recursive: true });

    await sharp({
      create: {
        width: 80,
        height: 60,
        channels: 4,
        background: { r: 20, g: 110, b: 210, alpha: 1 }
      }
    })
      .png()
      .toFile(join(inputDir, "one.png"));

    await sharp({
      create: {
        width: 90,
        height: 70,
        channels: 3,
        background: { r: 210, g: 90, b: 40 }
      }
    })
      .jpeg()
      .toFile(join(nestedDir, "two.jpg"));

    const pattern = join(inputDir, "**", "*.{png,jpg}");
    const result = await execFileAsync(process.execPath, [
      cliPath.pathname,
      "compress",
      pattern,
      "--out-dir",
      outDir,
      "--format",
      "webp",
      "--quality",
      "70"
    ]);

    assert.match(result.stdout, /Compressed 2 files/);

    const one = await sharp(join(outDir, "one.webp")).metadata();
    assert.equal(one.format, "webp");

    const two = await sharp(join(outDir, "nested", "two.webp")).metadata();
    assert.equal(two.format, "webp");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
