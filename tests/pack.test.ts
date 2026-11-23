import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { DEFAULT_PACK, parsePack, resolvePack, validatePack } from "../src/rules/pack";

describe("rule pack", () => {
  it("ships a pack that validates", () => {
    expect(validatePack(DEFAULT_PACK)).toEqual([]);
  });

  it("has a clause for every item clause id", () => {
    const clauseIds = new Set(DEFAULT_PACK.clauses.map((clause) => clause.id));
    for (const item of DEFAULT_PACK.items) {
      for (const clauseId of item.clauses) expect(clauseIds.has(clauseId)).toBe(true);
    }
  });

  it("refuses a pack whose item cites a clause that is not in the pack", () => {
    const broken = JSON.parse(JSON.stringify(DEFAULT_PACK));
    broken.items[0].clauses = ["FE-99"];
    const errors = validatePack(broken);
    expect(errors.join(" ")).toContain("FE-99");
    expect(errors.join(" ")).toContain("not in the pack");
  });

  it("refuses duplicate item ids and a budget out of range", () => {
    const broken = JSON.parse(JSON.stringify(DEFAULT_PACK));
    broken.items[1].id = broken.items[0].id;
    broken.cloudDailyBudget = 0;
    const errors = validatePack(broken);
    expect(errors.some((error) => error.includes("appears twice"))).toBe(true);
    expect(errors.some((error) => error.includes("cloudDailyBudget"))).toBe(true);
  });

  it("reports bad JSON instead of throwing", () => {
    const parsed = parsePack("{ not json");
    expect(parsed.pack).toBeNull();
    expect(parsed.errors[0]).toContain("not valid JSON");
  });

  it("prefers a valid remote pack", () => {
    const remote = { ...DEFAULT_PACK, version: "2026.12.01-1" };
    const resolved = resolvePack({ remoteText: JSON.stringify(remote), cachedText: null });
    expect(resolved.origin).toBe("remote");
    expect(resolved.pack.version).toBe("2026.12.01-1");
  });

  it("falls back to the cached pack when the remote pack is broken", () => {
    const cached = { ...DEFAULT_PACK, version: "2026.11.01-2" };
    const resolved = resolvePack({ remoteText: '{"version":"x"}', cachedText: JSON.stringify(cached) });
    expect(resolved.origin).toBe("cache");
    expect(resolved.pack.version).toBe("2026.11.01-2");
  });

  it("falls back to the built-in pack when nothing valid is available", () => {
    const resolved = resolvePack({ remoteText: "", cachedText: "nonsense" });
    expect(resolved.origin).toBe("builtin");
    expect(resolved.pack.version).toBe(DEFAULT_PACK.version);
    expect(resolved.detail).toContain("built-in");
  });

  it("keeps the deploy template in step with the built-in pack", () => {
    const raw = readFileSync(new URL("../firebase/remoteconfig.template.json", import.meta.url), "utf8");
    const template = JSON.parse(raw) as { parameters: { rule_pack: { defaultValue: { value: string } } } };
    const embedded = JSON.parse(template.parameters.rule_pack.defaultValue.value) as unknown;
    expect(validatePack(embedded)).toEqual([]);
    expect(embedded).toEqual(DEFAULT_PACK);
  });
});
