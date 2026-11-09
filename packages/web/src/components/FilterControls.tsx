import { useId, type ReactNode } from "react";
export const segBase = "flex-1 rounded-xl px-2 py-2 text-sm font-semibold transition-colors border min-h-11";
export const segOn = "bg-ember text-ink border-ember";
export const segOff = "bg-black/40 text-cream border-white/10 hover:border-white/30";

export function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-xs font-semibold text-muted">{children}</span>;
}

export function FilterChoices<T extends string | number>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const name = useId();
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2">
        <FieldLabel>{label}</FieldLabel>
      </legend>
      <div className="filter-options gap-2">
        {options.map((option) => (
          <label key={option.value} className="relative min-w-0 cursor-pointer">
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="peer sr-only"
            />
            <span
              className={`grid place-items-center text-center ${segBase} ${value === option.value ? segOn : segOff} peer-focus-visible:ring-2 peer-focus-visible:ring-acid`}
            >
              {option.label}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M5 8l5 5 5-5" />
    </svg>
  );
}
