import { useState } from "react";
import type { Restaurant } from "@wherever/shared";
import { saveDinnerImage } from "../lib/dinnerImage.js";
import { SharePlanImage } from "./SharePlanImage.js";

export function SavePlanImage({ restaurant }: { restaurant: Restaurant }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div>
      <button
        type="button"
        disabled={busy}
        className="w-full rounded-full border border-white/15 px-8 py-3 text-base font-semibold hover:bg-white/5 transition disabled:opacity-70"
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setMessage("");
          try {
            await saveDinnerImage(restaurant);
            setMessage("Image downloaded. The plan travels well.");
          } catch {
            setMessage("Couldn’t save the image. Try again, or send the plan above.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Preparing image…" : "Save plan image"}
      </button>
      <p role="status" className="mt-2 text-center text-xs text-muted">
        {message}
      </p>
      <SharePlanImage restaurant={restaurant} />
    </div>
  );
}
