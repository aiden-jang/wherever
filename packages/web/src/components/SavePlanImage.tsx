import { useState } from "react";
import type { Restaurant } from "@wherever/shared";
import { saveDinnerImage } from "../lib/dinnerImage.js";
import { SharePlanImage } from "./SharePlanImage.js";

export function SavePlanImage({ restaurant, hostPicked }: { restaurant: Restaurant; hostPicked: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <div className="plan-image-actions">
      <div className="plan-image-option">
        <button
          type="button"
          disabled={busy}
          className="min-h-11 rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5 transition disabled:opacity-70"
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            setMessage("");
            try {
              await saveDinnerImage(restaurant, hostPicked);
              setMessage("Download started.");
            } catch {
              setMessage("Couldn’t save the image. Try again, or send the plan above.");
            } finally {
              setBusy(false);
            }
          }}
        >
          {busy ? "Preparing image…" : "Save plan image"}
        </button>
        {message && (
          <p role="status" className="mt-2 text-xs text-muted">
            {message}
          </p>
        )}
      </div>
      <SharePlanImage restaurant={restaurant} hostPicked={hostPicked} />
    </div>
  );
}
