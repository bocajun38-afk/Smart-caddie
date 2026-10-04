import { useSyncExternalStore } from "react";

/** Petit store réactif persisté dans le navigateur. */
export function createLocalStore<T>(key: string, initial: T) {
  let value: T = initial;
  let loaded = false;
  const listeners = new Set<() => void>();

  function load() {
    if (loaded || typeof window === "undefined") return;
    loaded = true;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw) value = { ...(initial as object), ...JSON.parse(raw) } as T;
    } catch {
      /* stockage indisponible */
    }
  }

  function get(): T {
    load();
    return value;
  }

  function set(next: T | ((prev: T) => T)) {
    load();
    value = typeof next === "function" ? (next as (p: T) => T)(value) : next;
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* stockage indisponible */
    }
    listeners.forEach((l) => l());
  }

  function subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }

  function useStore(): T {
    return useSyncExternalStore(subscribe, get, () => initial);
  }

  return { get, set, subscribe, useStore };
}
