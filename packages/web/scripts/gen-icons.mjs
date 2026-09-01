// The install screenshots in the manifest are NOT made here: they are captures of the running app at
// 412x915 and 1280x800, taken with a headless browser against the dev server. Regenerate them by
// hand when the landing page changes, or the install card shows an app that no longer exists.
//
// Rasterize public/icon.svg into the PNG sizes installable apps expect, and public/og.svg into
// the PNG that link-unfurl previews need (most platforms won't render an SVG og:image).
// Run with: pnpm --filter @wherever/web gen:icons
import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const pub = join(dirname(fileURLToPath(import.meta.url)), "..", "public");
const svg = await readFile(join(pub, "icon.svg"));
// iOS (apple-touch-icon) and Android (maskable) apply their own rounded mask and turn any
// transparency black, so those must be full-bleed opaque squares — drop the corner radius. The
// plain favicon (icon-192) keeps the rounded look.
const fullBleed = Buffer.from(svg.toString().replace('rx="112"', 'rx="0"'));

const sizes = [
  { name: "icon-192.png", size: 192, src: svg },
  { name: "icon-512.png", size: 512, src: fullBleed },
  { name: "apple-touch-icon.png", size: 180, src: fullBleed },
];

for (const { name, size, src } of sizes) {
  await sharp(src).resize(size, size).png().toFile(join(pub, name));
  console.log(`wrote ${name} (${size}x${size})`);
}

// Open Graph card (1200x630) rasterized from og.svg.
const og = await readFile(join(pub, "og.svg"));
await sharp(og).resize(1200, 630).png().toFile(join(pub, "og.png"));
console.log("wrote og.png (1200x630)");
