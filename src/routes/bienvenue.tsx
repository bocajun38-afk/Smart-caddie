import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { PhoneShell, StatusBar } from "@/components/caddie/PhoneShell";
import { Stepper } from "@/components/caddie/Stepper";
import { DEFAULT_CLUBS, type Club } from "@/lib/golf-data";
import { profileStore } from "@/lib/player-store";

export const Route = createFileRoute("/bienvenue")({
  head: () => ({
    meta: [
      { title: "Smart Caddie — Mes distances de clubs" },
      { name: "description", content: "Renseignez vos distances moyennes avec chaque club pour des conseils sur mesure." },
      { property: "og:title", content: "Smart Caddie — Mes distances de clubs" },
      { property: "og:description", content: "Étalonnage rapide de vos clubs, du Driver au Lob." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const navigate = useNavigate();
  const profile = profileStore.useStore();
  const [clubs, setClubs] = useState<Club[]>(DEFAULT_CLUBS);
  useEffect(() => setClubs(profileStore.get().clubs), []);

  const update = (i: number, patch: Partial<Club>) =>
    setClubs((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  function save() {
    profileStore.set({ onboarded: true, clubs });
    void navigate({ to: "/" });
  }

  return (
    <PhoneShell>
      <StatusBar />
      <div className="px-5 pt-2">
        <div className="font-mono text-[11px] tracking-[0.2em] text-ink2 uppercase">
          {profile.onboarded ? "Mes clubs" : "Bienvenue · Étape 1/1"}
        </div>
        <h1 className="mt-1 font-display text-4xl leading-none">Vos distances</h1>
        <p className="mt-2 text-[14px] leading-snug text-ink2">
          Distance moyenne en vol (carry), en mètres. Les valeurs sont pré-remplies : ajustez-les à votre puissance et décochez les clubs absents de votre sac.
        </p>
      </div>

      <div className="mt-4 flex flex-col gap-2 px-5">
        {clubs.map((c, i) => (
          <div
            key={c.name}
            className={`flex items-center justify-between rounded-2xl bg-card px-3 py-2 ring-1 ring-ink/10 ${c.enabled ? "" : "opacity-50"}`}
          >
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={c.enabled}
                onChange={(e) => update(i, { enabled: e.target.checked })}
                className="size-5 accent-[var(--color-accent)]"
              />
              <span className="font-display text-lg">{c.name}</span>
            </label>
            <Stepper value={c.carry} min={20} max={320} step={5} label={c.name} onChange={(v) => update(i, { carry: v })} />
          </div>
        ))}
        <div className="rounded-2xl bg-card px-3 py-3 font-display text-lg text-ink2 ring-1 ring-ink/10">
          Putter · sur le green
        </div>
      </div>

      <div className="sticky bottom-0 mt-4 bg-paper px-5 pt-2 pb-6">
        <button
          onClick={save}
          className="h-14 w-full rounded-2xl bg-accent font-display text-xl text-accent-ink"
        >
          {profile.onboarded ? "Enregistrer" : "C'est parti"}
        </button>
      </div>
    </PhoneShell>
  );
}
