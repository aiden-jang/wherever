import { useEffect, useRef, useState } from "react";
import type { Restaurant } from "@wherever/shared";
import { createDinnerImage } from "../lib/dinnerImage.js";

export function SharePlanImage({
  restaurant,
  hostPicked = false,
}: {
  restaurant: Restaurant;
  hostPicked?: boolean;
}) {
  const [ready, setReady] = useState<{ restaurant: Restaurant; file: File } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const sharing = useRef(false);
  useEffect(() => {
    let active = true;
    setMessage("");
    if (!navigator.share || !navigator.canShare) return;
    const samplePng = atob(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jQioAAAAASUVORK5CYII=",
    );
    const probe = new File([Uint8Array.from(samplePng, (byte) => byte.charCodeAt(0))], "dinner.png", {
      type: "image/png",
    });
    if (!navigator.canShare({ files: [probe] })) return;
    // File rendering must finish before the gesture that opens the native share sheet.
    void createDinnerImage(restaurant, hostPicked)
      .then((file) => {
        if (active && navigator.canShare({ files: [file] })) setReady({ restaurant, file });
      })
      .catch(() => {
        // The separate download action remains available.
      });
    return () => {
      active = false;
    };
  }, [restaurant, hostPicked]);
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
