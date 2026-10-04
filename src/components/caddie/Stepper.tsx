export function Stepper({
  value,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  label,
  size = "md",
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: string;
  size?: "md" | "lg";
}) {
  const btn =
    size === "lg"
      ? "grid size-14 place-items-center rounded-2xl font-display text-3xl active:scale-95 transition-transform disabled:opacity-30"
      : "grid size-10 place-items-center rounded-xl font-display text-xl active:scale-95 transition-transform disabled:opacity-30";
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={`Diminuer ${label ?? ""}`}
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - step))}
        className={`${btn} bg-card text-ink ring-1 ring-ink/15`}
      >
        −
      </button>
      <span
        className={
          size === "lg"
            ? "min-w-[3ch] text-center font-display text-5xl leading-none"
            : "min-w-[3.5ch] text-center font-display text-2xl leading-none"
        }
      >
        {value}
      </span>
      <button
        type="button"
        aria-label={`Augmenter ${label ?? ""}`}
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + step))}
        className={`${btn} bg-ink text-paper`}
      >
        +
      </button>
    </div>
  );
}
