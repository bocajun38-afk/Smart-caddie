import { Link, createFileRoute } from "@tanstack/react-router";

import { PhoneShell, StatusBar } from "@/components/caddie/PhoneShell";
import { profileStore, roundsStore } from "@/lib/player-store";

export const Route = createFileRoute("/menu")({
  head: () => ({
    meta: [
      { title: "Smart Caddie — Menu" },
      { name: "description", content: "Navigation de l'application : accueil, trou, coup, score, parcours et réglages." },
      { property: "og:title", content: "Smart Caddie — Menu" },
      { property: "og:description", content: "Tous les écrans du caddie en un endroit." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: MenuPage,
});

const LINKS = [
  { to: "/", n: "00", label: "Accueil", sub: "Parcours du jour, météo, lancer la partie" },
  { to: "/bienvenue", n: "01", label: "Mes clubs", sub: "Distances de vol de chaque club" },
  { to: "/parcours", n: "02", label: "Golf", sub: "Choisir, créer ou régler un parcours" },
  { to: "/trou", n: "03", label: "Trou", sub: "Carte du trou, stratégie au départ" },
  { to: "/coup", n: "04", label: "Coup", sub: "Distance restante, club conseillé, chat" },
  { to: "/score", n: "05", label: "Score", sub: "Carte de score et parties enregistrées" },
] as const;

function MenuPage() {
  const { rounds } = roundsStore.useStore();

  return (
    <PhoneShell>
      <StatusBar />
      <div className="px-5 pt-2">
        <h1 className="font-display text-4xl leading-none">Menu</h1>
      </div>

      <div className="mx-5 mt-4 flex flex-col gap-2">
        {LINKS.map((l) => (
          <Link key={l.to} to={l.to}
            className="flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-ink/10 active:scale-[0.99]">
            <span className="font-mono text-[11px] text-ink2">{l.n}</span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-xl leading-tight">{l.label}</span>
              <span className="block truncate text-[12px] text-ink2">{l.sub}</span>
            </span>
            <span className="font-display text-xl text-ink2">→</span>
          </Link>
        ))}
      </div>

      <div className="mx-5 mt-4 rounded-2xl bg-card p-4 ring-1 ring-ink/10">
        <div className="font-mono text-[10px] tracking-[0.15em] text-ink2 uppercase">Données</div>
        <p className="mt-1 text-[13px] text-ink2">
          {rounds.length} partie{rounds.length > 1 ? "s" : ""} enregistrée{rounds.length > 1 ? "s" : ""} sur ce téléphone.
        </p>
        <button
          onClick={() => {
            if (window.confirm("Tout effacer : clubs, parcours, scores et parties enregistrées ?")) {
              try {
                for (const k of Object.keys(window.localStorage)) {
                  if (k.startsWith("caddie-")) window.localStorage.removeItem(k);
                }
              } catch {
                /* stockage indisponible */
              }
              profileStore.set({ onboarded: false, clubs: profileStore.get().clubs });
              window.location.href = "/bienvenue";
            }
          }}
          className="mt-2 font-mono text-[10px] tracking-[0.15em] text-destructive uppercase underline">
          Tout effacer et recommencer
        </button>
      </div>
    </PhoneShell>
  );
}
