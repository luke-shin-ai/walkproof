import { describe, expect, it } from "vitest";
import { BUDGET_KEY, budgetLeft, readBudget, trySpend, type KeyValueStore } from "../src/budget";

function store(seed?: string): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  if (seed !== undefined) map.set(BUDGET_KEY, seed);
  return {
    map,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

describe("daily cloud budget meter", () => {
  it("counts calls up to the limit and then refuses", () => {
    const kv = store();
    for (let index = 0; index < 3; index += 1) {
      expect(trySpend(kv, "2026-11-23", 3).ok).toBe(true);
    }
    const blocked = trySpend(kv, "2026-11-23", 3);
    expect(blocked.ok).toBe(false);
    expect(blocked.state.spent).toBe(3);
    expect(budgetLeft(blocked.state)).toBe(0);
  });

  it("resets on a new day", () => {
    const kv = store(JSON.stringify({ day: "2026-11-22", spent: 19, limit: 20 }));
    const state = readBudget(kv, "2026-11-23", 20);
    expect(state.spent).toBe(0);
    expect(state.day).toBe("2026-11-23");
    expect(trySpend(kv, "2026-11-23", 20).ok).toBe(true);
  });

  it("keeps the pack limit when the stored limit differs", () => {
    const kv = store(JSON.stringify({ day: "2026-11-23", spent: 5, limit: 20 }));
    const state = readBudget(kv, "2026-11-23", 6);
    expect(state.spent).toBe(5);
    expect(state.limit).toBe(20);
  });

  it("survives a corrupt value", () => {
    const kv = store("not json");
    const state = readBudget(kv, "2026-11-23", 20);
    expect(state.spent).toBe(0);
    expect(state.limit).toBe(20);
  });

  it("works without a store, without spending anything real", () => {
    expect(trySpend(null, "2026-11-23", 20).ok).toBe(true);
    expect(readBudget(null, "2026-11-23", 20).spent).toBe(0);
  });
});
