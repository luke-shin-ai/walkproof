import { describe, expect, it } from "vitest";
import { median, percentile, runCloudOnlyArm, runDeviceArm, runHybridArm, type BenchDeps } from "../src/bench/harness";
import { BENCH_SCENARIOS } from "../src/bench/scenarios";
import { DEFAULT_PACK } from "../src/rules/pack";

const photo = { name: "extinguisher.jpg", bytes: 1000, mime: "image/jpeg", dataUrl: "AAAA" };

function deps(overrides: Partial<BenchDeps> = {}): BenchDeps {
  return {
    pack: DEFAULT_PACK,
    now: new Date("2026-11-23T09:00:00.000Z"),
    loadPhoto: async () => photo,
    gapMs: 0,
    cloudOnlyCount: 10,
    ...overrides,
  };
}

describe("the forty scenario set", () => {
  it("covers every checklist item four times", () => {
    expect(BENCH_SCENARIOS).toHaveLength(40);
    for (const item of DEFAULT_PACK.items) {
      const scenarios = BENCH_SCENARIOS.filter((entry) => entry.itemId === item.id);
      expect(scenarios.map((entry) => entry.kind).sort()).toEqual(["borderline", "fail", "pass", "trap"]);
    }
  });

  it("keeps the expected verdicts balanced and named", () => {
    const counts = { pass: 0, fail: 0, review: 0 };
    for (const scenario of BENCH_SCENARIOS) counts[scenario.expected] += 1;
    expect(counts).toEqual({ pass: 10, fail: 10, review: 20 });
  });

  it("only refers to fixture photos that exist", () => {
    for (const scenario of BENCH_SCENARIOS) expect(scenario.photo).toMatch(/^[a-z-]+\.jpg$/);
    expect(new Set(BENCH_SCENARIOS.map((entry) => entry.photo)).size).toBe(10);
  });
});

describe("median and percentile", () => {
  it("handles even and odd counts", () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3);
    expect(median([])).toBe(0);
    expect(percentile([10, 20, 30, 40, 50], 0.9)).toBe(50);
  });
});

describe("the device arm", () => {
  it("runs the whole set with no cloud at all", async () => {
    const result = await runDeviceArm(deps());
    expect(result.items).toHaveLength(40);
    expect(result.metrics.cloudCalls).toBe(0);
    expect(result.metrics.cloudPhotoBytes).toBe(0);
    expect(result.metrics.offlineShare).toBe(100);
    expect(result.metrics.totalMs).toBeGreaterThan(0);
  });
});

describe("the hybrid arm", () => {
  it("sends nothing to the cloud when the model answers every item", async () => {
    const result = await runHybridArm(
      deps({
        structureOnDevice: async (item) => ({
          finding: {
            targetPresent: true,
            targetName: item.label,
            defectType: "none",
            severity: "none",
            obscured: false,
            note: "clear",
          },
          raw: "{}",
          latencyMs: 12,
          error: null,
        }),
      }),
    );
    expect(result.metrics.cloudCalls).toBe(0);
    expect(result.metrics.cloudPhotoBytes).toBe(0);
  });

  it("records a quota stop instead of calling forty times", async () => {
    let calls = 0;
    const result = await runHybridArm(
      deps({
        classify: async () => {
          calls += 1;
          return {
            raw: "",
            latencyMs: 5,
            error: "FirebaseError: 429 quota exceeded for metric generate_content_free_tier_requests",
            model: "gemini-3.5-flash-lite",
            modelFallback: true,
            source: "unknown",
          };
        },
      }),
    );
    expect(calls).toBeLessThanOrEqual(4);
    expect(result.metrics.cloudSkipped).toBeGreaterThan(0);
    expect(result.metrics.notes.join(" ")).toMatch(/quota/);
  });
});

describe("the cloud only baseline", () => {
  it("refuses a clause that does not apply to the item", async () => {
    const result = await runCloudOnlyArm(
      deps({
        classifyWithPhoto: async () => ({
          raw: JSON.stringify({
            targetPresent: true,
            targetName: "extinguisher",
            defectType: "none",
            severity: "none",
            obscured: false,
            note: "fine",
            clauseId: "ST-04",
            remedy: "Nothing to do.",
            suggestedVerdict: "pass",
          }),
          latencyMs: 900,
          error: null,
          model: "gemini-4-hydrogen",
          photoBytes: 98000,
          requestBytes: 131000,
        }),
      }),
      BENCH_SCENARIOS.slice(0, 2),
    );
    expect(result.metrics.cloudCalls).toBe(2);
    expect(result.metrics.refused).toBe(2);
    expect(result.metrics.cloudPhotoBytes).toBe(196000);
    expect(result.items[0].gateReasons.join(" ")).toMatch(/does not apply/);
  });

  it("accepts an answer the pack can support", async () => {
    const result = await runCloudOnlyArm(
      deps({
        classifyWithPhoto: async () => ({
          raw: JSON.stringify({
            targetPresent: true,
            targetName: "extinguisher",
            defectType: "none",
            severity: "none",
            obscured: false,
            note: "fine",
            clauseId: "FE-01",
            remedy: "Keep the tag current.",
            suggestedVerdict: "pass",
          }),
          latencyMs: 900,
          error: null,
          model: "gemini-4-hydrogen",
          photoBytes: 98000,
          requestBytes: 131000,
        }),
      }),
      BENCH_SCENARIOS.slice(0, 1),
    );
    expect(result.metrics.refused).toBe(0);
    expect(result.items[0].gate).toBe("accepted");
    expect(result.items[0].recorded).toBe("pass");
  });
});
