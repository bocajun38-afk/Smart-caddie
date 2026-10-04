import type { Course } from "@/lib/golf-data";

export function HoleSwitcher({
  course,
  current,
  onSelect,
}: {
  course: Course;
  current: number;
  onSelect: (n: number) => void;
}) {
  return (
    <div className="-mx-5 flex gap-1.5 overflow-x-auto px-5 pb-1">
      {course.holes.map((h) => (
        <button
          key={h.number}
          onClick={() => onSelect(h.number)}
          className={
            h.number === current
              ? "size-9 shrink-0 rounded-xl bg-ink font-display text-base text-paper"
              : "size-9 shrink-0 rounded-xl bg-card font-display text-base text-ink2 ring-1 ring-ink/10"
          }
        >
          {h.number}
        </button>
      ))}
    </div>
  );
}
