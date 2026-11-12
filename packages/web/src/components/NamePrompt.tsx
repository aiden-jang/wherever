import { useState } from "react";

/** The join screen for anyone arriving on a session link without a name yet. */

export function NamePrompt({ onSubmit }: { onSubmit: (name: string) => void }) {
  const [name, setName] = useState("");
  return (
    <main id="main-content" tabIndex={-1} className="table-room grid place-items-center">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onSubmit(name.trim());
        }}
        className="table-panel w-full max-w-sm"
      >
        <h1 className="font-display text-3xl font-bold">And you are?</h1>
        <p className="mt-2 text-muted">Just a name. Opinions can follow.</p>
        <label className="mt-6 grid gap-2 text-sm font-semibold">
          Your name
          <input
            className="w-full rounded-xl bg-black/40 border border-white/10 px-4 py-3 text-lg outline-none focus:border-ember transition-colors"
            aria-label="Your name"
            name="displayName"
            placeholder="Your name"
            autoComplete="name"
            value={name}
            maxLength={24}
            autoFocus={window.matchMedia("(pointer: fine)").matches}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={!name.trim()}
          className="mt-3 w-full rounded-2xl bg-ember px-6 py-3 text-lg font-semibold text-ink disabled:opacity-50 hover:brightness-110 transition"
        >
          Join room
        </button>
      </form>
    </main>
  );
}
