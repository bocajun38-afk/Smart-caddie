import { Link } from "@tanstack/react-router";

type Tab = "home" | "hole" | "shot" | "score" | "course";

const TABS: Array<{ id: Tab; to: "/" | "/trou" | "/coup" | "/score" | "/parcours"; label: string; n: string }> = [
  { id: "home", to: "/", label: "Accueil", n: "00" },
  { id: "hole", to: "/trou", label: "Trou", n: "01" },
  { id: "shot", to: "/coup", label: "Coup", n: "02" },
  { id: "score", to: "/score", label: "Score", n: "03" },
  { id: "course", to: "/parcours", label: "Golf", n: "04" },
];

export function BottomNav({ active }: { active: Tab }) {
  return (
    <nav aria-label="Navigation principale" className="sticky bottom-0 z-20 mt-auto border-t border-border bg-background px-3 pt-2 pb-[max(12px,env(safe-area-inset-bottom))]">
      <div className="grid grid-cols-5 gap-1.5">
        {TABS.map((t) => (
          <Link
            key={t.id}
            to={t.to}
            className={
              t.id === active
                ? t.id === "shot"
                  ? "flex h-14 flex-col items-center justify-center rounded-md bg-accent font-display text-[13px] text-accent-foreground"
                  : "flex h-14 flex-col items-center justify-center rounded-md bg-primary font-display text-[13px] text-primary-foreground"
                : "flex h-14 flex-col items-center justify-center rounded-md bg-muted font-display text-[13px] text-foreground"
            }
          >
            <span className="font-mono text-[9px] leading-none opacity-60">{t.n}</span>
            {t.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
