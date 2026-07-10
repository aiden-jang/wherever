// Rasterize public/icon.svg into the PNG sizes installable apps expect, and public/og.svg into
// the PNG that link-unfurl previews need (most platforms won't render an SVG og:image).
// Run with: pnpm --filter @wherever/web gen:icons
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pub = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const svg = await readFile(join(pub, "icon.svg"));

const sizes = [
  { name: "icon-192.png", size: 192 },
  { name: "icon-512.png", size: 512 },
  { name: "apple-touch-icon.png", size: 180 },
];

for (const { name, size } of sizes) {
  await sharp(svg).resize(size, size).png().toFile(join(pub, name));
  console.log(`wrote ${name} (${size}x${size})`);
}

// Open Graph card (1200x630) rasterized from og.svg.
const og = await readFile(join(pub, "og.svg"));
await sharp(og).resize(1200, 630).png().toFile(join(pub, "og.png"));
console.log("wrote og.png (1200x630)");
