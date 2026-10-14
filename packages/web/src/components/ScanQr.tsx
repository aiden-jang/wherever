import { useEffect, useRef, useState } from "react";

/* Scan a shared invite into a code; camera access is scoped to the open scanner. */
interface ScanQrProps {
  onCode: (raw: string) => void;
  onClose: () => void;
}

export function ScanQr({ onCode, onClose }: ScanQrProps) {
  const video = useRef<HTMLVideoElement>(null);
  const [fault, setFault] = useState<string | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;
    let stop = false;
    let timer = 0;

    async function run() {
      try {
        /* The back camera by default. `exact` would throw on a laptop, which is where this gets
           developed; a plain preference falls back to whatever camera exists. */
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
      } catch {
        setFault("No camera, or permission was refused. Type the code instead.");
        return;
      }
      /* Either bail-out has to stop the tracks. Returning without doing so leaves the camera on, with
         the indicator light lit, until the tab is closed. */
      const el = video.current;
      if (stop || !el) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      el.srcObject = stream;
      await el.play().catch(() => {});

      const Detector = (
        window as unknown as {
          BarcodeDetector: new (o: { formats: string[] }) => {
            detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]>;
          };
        }
      ).BarcodeDetector;
      const detector = new Detector({ formats: ["qr_code"] });

      /* Polled on a timer rather than every animation frame. A QR does not move, and detection at
         60fps is battery spent on the same answer sixty times a second. */
      const tick = async () => {
        if (stop || !video.current) return;
        try {
          const found = await detector.detect(video.current);
          const hit = found[0]?.rawValue;
          if (hit) {
            onCode(hit);
            return;
          }
        } catch {
          /* A frame that cannot be decoded is the normal case, not a failure. */
        }
        timer = window.setTimeout(() => void tick(), 250);
      };
      void tick();
    }

    void run();
    return () => {
      stop = true;
      window.clearTimeout(timer);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onCode]);

  return (
    <div className="flex flex-col gap-3">
      {fault ? (
        <p className="text-muted text-sm">{fault}</p>
      ) : (
        <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-black">
          {/* Muted and inline, or iOS refuses to play it without a gesture and shows a black box. */}
          <video ref={video} muted playsInline className="aspect-square w-full object-cover" />
          <div className="pointer-events-none absolute inset-6 rounded-xl border-2 border-acid/70" />
        </div>
      )}
      <button
        type="button"
        onClick={onClose}
        className="rounded-2xl border border-white/15 px-6 py-3 font-semibold transition hover:bg-white/5"
      >
        Type it instead
      </button>
    </div>
  );
}
