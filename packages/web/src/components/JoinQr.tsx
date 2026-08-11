import { useEffect, useId, useState } from "react";

interface JoinQrProps {
  code: string;
  url: string;
}

/** A lazy, locally generated room invite for people already standing together. */
export function JoinQr({ code, url }: JoinQrProps) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open || image || failed) return;

    let cancelled = false;
    void import("qrcode")
      .then(({ toDataURL }) =>
        toDataURL(url, {
          width: 480,
          margin: 2,
          errorCorrectionLevel: "M",
          color: { dark: "#18151f", light: "#fff8e8" },
        }),
      )
      .then((dataUrl) => {
        if (!cancelled) setImage(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [failed, image, open, url]);

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-controls={panelId}
        className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium text-muted hover:bg-white/5 hover:text-cream active:scale-95 transition"
      >
        <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM15 14h2v2h-2zM19 14h1v3h-3v3h-3v-2M19 19h1v1h-1z" />
        </svg>
        {open ? "Hide join QR" : "Show join QR"}
      </button>

      <div
        id={panelId}
        role="region"
        aria-label="Join room QR code"
        hidden={!open}
        className="mt-2 overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-2xl shadow-black/20"
      >
        <div className="flex flex-col items-center rounded-3xl bg-[#fff8e8] px-5 py-5 text-[#18151f]">
          {failed ? (
            <div className="grid aspect-square w-full max-w-[14rem] place-items-center rounded-2xl border border-black/10 px-6 text-sm">
              QR had a wobble. Share the link instead.
            </div>
          ) : image ? (
            <img
              src={image}
              alt={`QR code to join room ${code}`}
              className="aspect-square w-full max-w-[14rem] rounded-xl"
            />
          ) : (
            <div
              aria-label="Making QR code"
              className="grid aspect-square w-full max-w-[14rem] place-items-center rounded-2xl bg-black/5"
            >
              <span className="h-7 w-7 animate-spin rounded-full border-2 border-black/15 border-t-[#18151f]" />
            </div>
          )}
          <p className="mt-3 font-display text-2xl font-extrabold tracking-[0.22em]">{code}</p>
          <p className="mt-1 text-xs text-black/55">Point a camera here to join</p>
        </div>
      </div>
    </div>
  );
}
