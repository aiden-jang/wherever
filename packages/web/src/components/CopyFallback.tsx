export function CopyFallback({ label, text }: { label: string; text: string }) {
  return (
    <div
      role="alert"
      className="mt-3 w-full min-w-0 rounded-2xl border border-white/15 bg-black/20 p-3 text-left text-sm text-muted"
    >
      <p>Couldn’t copy or share. Select and copy the text below, or try again.</p>
      <textarea
        aria-label={label}
        readOnly
        value={text}
        rows={text.includes("\n") ? 4 : 2}
        onFocus={(event) => event.currentTarget.select()}
        className="mt-2 block w-full min-w-0 resize-y rounded-xl border border-white/15 bg-black/30 p-3 text-sm text-cream"
      />
    </div>
  );
}
