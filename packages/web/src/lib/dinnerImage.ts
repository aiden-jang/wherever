import QRCode from "qrcode";
import type { Restaurant } from "@wherever/shared";
import { mapsUrl } from "../components/DirectionsDialog.js";

export async function createDinnerImage(restaurant: Pick<Restaurant, "name" | "address" | "googleMapsUri">) {
  await document.fonts.ready;
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image creation is unavailable.");
  ctx.fillStyle = "#181b17";
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = "#ff9876";
  ctx.font = '600 32px "Bricolage Grotesque", sans-serif';
  ctx.fillText("wherever", 76, 106);
  ctx.fillStyle = "#f4f1e7";
  ctx.font = '700 82px "Bricolage Grotesque", sans-serif';
  ctx.fillText("Dinner is handled.", 76, 236);
  ctx.fillStyle = "#f4f1e7";
  ctx.beginPath();
  ctx.roundRect(56, 318, 968, 828, 32);
  ctx.fill();
  ctx.fillStyle = "#59604f";
  ctx.font = "600 24px Inter, sans-serif";
  ctx.fillText("PLAN A", 104, 392);
  ctx.fillStyle = "#181b17";
  ctx.font = '700 58px "Bricolage Grotesque", sans-serif';
  lines(ctx, restaurant.name, 104, 488, 872, 70, 3);
  ctx.font = "400 29px Inter, sans-serif";
  ctx.fillStyle = "#59604f";
  lines(ctx, restaurant.address || "Scan for the location", 104, 724, 872, 40, 3);
  const code = await QRCode.toDataURL(mapsUrl(restaurant), {
    width: 240,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#181b17", light: "#f4f1e7" },
  });
  const image = new Image();
  image.src = code;
  await image.decode();
  ctx.drawImage(image, 96, 866, 220, 220);
  ctx.fillStyle = "#181b17";
  ctx.font = "600 30px Inter, sans-serif";
  ctx.fillText("Directions, sorted.", 362, 954);
  ctx.font = "400 24px Inter, sans-serif";
  ctx.fillStyle = "#59604f";
  ctx.fillText("Scan to open the map.", 362, 1000);
  ctx.fillStyle = "#f4f1e7";
  ctx.font = "400 28px Inter, sans-serif";
  ctx.fillText("The group has made a decision. Allegedly.", 76, 1246);
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error("Couldn’t create the image."))),
      "image/png",
    ),
  );
  const name =
    restaurant.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60) || "dinner";
  return new File([blob], `wherever-${name}-${new Date().toISOString().slice(0, 10)}.png`, {
    type: "image/png",
  });
}

export async function saveDinnerImage(restaurant: Pick<Restaurant, "name" | "address" | "googleMapsUri">) {
  const file = await createDinnerImage(restaurant);
  const url = URL.createObjectURL(file);
  const anchor = document.createElement("a");
  anchor.download = file.name;
  anchor.href = url;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function lines(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  width: number,
  height: number,
  max: number,
) {
  let line = "",
    row = 0;
  for (const character of Array.from(text)) {
    if (ctx.measureText(line + character).width > width) {
      if (row === max - 1) {
        while (ctx.measureText(line + "…").width > width) line = Array.from(line).slice(0, -1).join("");
        ctx.fillText(line + "…", x, y + row * height);
        return;
      }
      ctx.fillText(line, x, y + row * height);
      row++;
      line = "";
    }
    line += character;
  }
  ctx.fillText(line, x, y + row * height);
}
