import { useEffect, useRef, useState } from "react";
import type { Restaurant } from "@wherever/shared";
import { createDinnerImage } from "../lib/dinnerImage.js";

export function SharePlanImage({ restaurant }: { restaurant: Restaurant }) {
  const [ready, setReady] = useState<{ restaurant: Restaurant; file: File } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const sharing = useRef(false);
  useEffect(() => {
    let active = true;
    setMessage("");
    if (!navigator.share || !navigator.canShare) return;
    // File rendering must finish before the gesture that opens the native share sheet.
    void createDinnerImage(restaurant)
      .then((file) => {
        if (active && navigator.canShare({ files: [file] })) setReady({ restaurant, file });
      })
      .catch(() => {
        // The separate download action remains available.
      });
    return () => {
      active = false;
    };
  }, [restaurant]);
  if (!ready || ready.restaurant !== restaurant) return null;
  return (
    <div className="mt-3">
      <button
        type="button"
        disabled={busy}
        className="w-full rounded-full border border-white/15 px-8 py-3 text-base font-semibold hover:bg-white/5 transition disabled:opacity-70"
        onClick={async () => {
          if (sharing.current) return;
          sharing.current = true;
          setBusy(true);
          setMessage("");
          try {
            await navigator.share({ files: [ready.file] });
            setMessage("Image handed to the share sheet.");
          } catch (error) {
            if (!(error instanceof DOMException && error.name === "AbortError"))
              setMessage("Couldn’t share the image. Try again, or save it instead.");
          } finally {
            sharing.current = false;
            setBusy(false);
          }
        }}
      >
        {busy ? "Opening share sheet…" : "Share plan image"}
      </button>
      <p role="status" className="mt-2 text-center text-xs text-muted">
        {message}
      </p>
    </div>
  );
}
