import { describe, expect, it } from "vitest";
import { processItem, type PipelineDeps } from "../src/pipeline";
import { DEFAULT_PACK, findItem } from "../src/rules/pack";
import { judgeNote } from "../src/rules/evidence";
import { structureNote } from "../src/rules/structure";
import type { DeviceStepResult, CloudStepResult } from "../src/pipeline";
import type { Finding, InspectionItem } from "../src/types";

const NOW = new Date("2026-11-23T09:00:00Z");
const TODAY = "2026-11-23";

/**
 * A decisive line the rule pack cannot settle: it names the defect and scores it
 * from one word ("small") that reads the condition down, while the rest of the
 * line says the paint is on the part that matters.
 */
const SMALL_PAINT = "Painted over on one side, a small patch, the bulb is under the paint.";
/** A line that names no defect, so a device answer claiming absence is unsupported. */
const CLEAN_DETECTOR = "Detector clean, grille open, test light blinks.";
/** The line itself is uncertain, so nobody downstream can settle it. */
const GUESSED = "Detector probably painted when the ceiling was done, not sure whether paint reached the sensor.";

function store() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => {
      map.set(key, value);
    },
  };
}

function deps(overrides: Partial<PipelineDeps> = {}): PipelineDeps {
  return {
    online: true,
    budgetStore: store(),
    today: TODAY,
    now: NOW,
    makeId: () => "record-1",
    ...overrides,
  };
}

function run(itemId: string, note: string, partial: Partial<PipelineDeps>) {
  return processItem(
    {
      item: findItem(DEFAULT_PACK, itemId)!,
      note,
      photoName: "photo.jpg",
      photoBytes: 90000,
      photoDataUrl: null,
      pack: DEFAULT_PACK,
    },
    { ...deps(), ...partial },
  );
}

function cloudReturning(answer: Record<string, unknown>): (item: InspectionItem, payload: object) => Promise<CloudStepResult> {
  return async () => ({
    raw: JSON.stringify(answer),
    latencyMs: 1200,
    error: null,
    model: "gemini-4-hydrogen",
    modelFallback: false,
    source: "in_cloud",
  });
}

const absentReading: DeviceStepResult = {
  finding: { targetPresent: false, targetName: "smoke detector", defectType: "none", severity: "none", obscured: false, note: CLEAN_DETECTOR },
  latencyMs: 900,
  error: null,
};

describe("the line the device leaves open", () => {
  it("is open without the line being the reason, so the cloud may be asked", () => {
    const item = findItem(DEFAULT_PACK, "sp-10")!;
    const decision = judgeNote(item, SMALL_PAINT, structureNote(item, SMALL_PAINT), NOW);
    expect(decision.verdict).toBe("unknown");
    expect(decision.evidence.hold).toBe("none");
  });

  it("is settled at fail when the accepted answer names a severity the pack fails", async () => {
    const observations: string[] = [];
    const observation = await run("sp-10", SMALL_PAINT, {
      classify: async (_item, payload) => {
        observations.push(JSON.stringify(payload));
        return {
          raw: JSON.stringify({
            targetPresent: true,
            targetName: "soffit",
            defectType: "crack",
            severity: "high",
            obscured: false,
            note: "a finger fits into the crack",
            clauseId: "SP-10",
            remedy: "Barricade the landing and have the soffit assessed today.",
            suggestedVerdict: "fail",
          }),
          latencyMs: 1200,
          error: null,
          model: "gemini-4-hydrogen",
          modelFallback: false,
          source: "in_cloud",
        };
      },
    });

    expect(observations).toHaveLength(1);
    const payload = JSON.parse(observations[0]) as Record<string, unknown>;
    expect(payload.photo).toBe("kept on the device");
    expect((payload.deviceDraft as Record<string, unknown>).severity).toBe("low");
    expect(observations[0]).not.toContain("data:image");

    expect(observation.source).toBe("in_cloud");
    expect(observation.verdict).toBe("fail");
    expect(observation.cloud?.accepted).toBe(true);
    expect(observation.cloud?.settled).toBe(true);
    expect(observation.cloud?.askedBecause).toBe("pack_open");
    expect(observation.cloud?.deviceVerdict).toBe("unknown");
    expect(observation.finding?.severity).toBe("high");
    expect(observation.clauseIds).toEqual(["SP-10"]);
    expect(observation.fixBy).toBe("2026-11-26");
    expect(observation.reviewRequired).toBe(false);
    expect(observation.reasons.join(" ")).toContain("the rule pack settled this item at fail");
  });

  it("stays open when the accepted answer keeps the severity the line supports", async () => {
    const observation = await run("sp-10", SMALL_PAINT, {
      classify: cloudReturning({
        targetPresent: true,
        targetName: "soffit",
        defectType: "crack",
        severity: "low",
        obscured: false,
        note: "a narrow crack",
        clauseId: "SP-10",
        remedy: "Watch the crack and record any growth at the next walk.",
        suggestedVerdict: "unknown",
      }),
    });
    expect(observation.cloud?.accepted).toBe(true);
    expect(observation.cloud?.settled).toBe(false);
    expect(observation.verdict).toBe("unknown");
    expect(observation.reviewRequired).toBe(true);
    expect(observation.reasons.join(" ")).toContain("still leaves this item open");
  });
});

describe("a device reading the line does not carry", () => {
  it("is sent with the draft marked untrusted and the rule pack settles it", async () => {
    const observation = await run("sd-08", CLEAN_DETECTOR, {
      structureOnDevice: async () => absentReading,
      classify: cloudReturning({
        targetPresent: true,
        targetName: "smoke detector",
        defectType: "none",
        severity: "none",
        obscured: false,
        note: "detector in place and clean",
        clauseId: "SD-08",
        remedy: "No action today, keep the monthly check going.",
        suggestedVerdict: "pass",
      }),
    });
    expect(observation.noteCheck?.hold).toBe("misread");
    expect(observation.cloud?.askedBecause).toBe("untrusted_reading");
    expect(JSON.parse(observation.cloud!.payload).deviceDraft.trusted).toBe(false);
    expect(observation.source).toBe("in_cloud");
    expect(observation.verdict).toBe("pass");
    expect(observation.cloud?.settled).toBe(true);
    expect(observation.finding?.targetPresent).toBe(true);
  });

  it("is left to a person when the cloud repeats the unsupported claim", async () => {
    const observation = await run("sd-08", CLEAN_DETECTOR, {
      structureOnDevice: async () => absentReading,
      classify: cloudReturning({
        targetPresent: false,
        targetName: "smoke detector",
        defectType: "none",
        severity: "none",
        obscured: false,
        note: "no detector on the ceiling",
        clauseId: "SD-08",
        remedy: "Have the ceiling checked for a detector.",
        suggestedVerdict: "unknown",
      }),
    });
    expect(observation.source).toBe("rejected_unsupported");
    expect(observation.verdict).toBe("unknown");
    expect(observation.reviewRequired).toBe(true);
    expect(observation.finding).toBeNull();
    expect(observation.reasons.join(" ")).toContain("the line does not carry the answer");
  });

  it("is never sent when the line itself is uncertain", async () => {
    let calls = 0;
    const observation = await run("sd-08", GUESSED, {
      structureOnDevice: async () => absentReading,
      classify: async () => {
        calls += 1;
        throw new Error("should not be called");
      },
    });
    expect(calls).toBe(0);
    expect(observation.cloud).toBeNull();
    expect(observation.noteCheck?.hold).toBe("inconclusive");
    expect(observation.verdict).toBe("unknown");
  });
});

describe("what the record keeps", () => {
  it("does not keep a finding the line did not support", async () => {
    const observation = await run("sd-08", CLEAN_DETECTOR, {
      structureOnDevice: async () => absentReading,
      online: false,
    });
    expect(observation.finding).toBeNull();
    expect(observation.reviewRequired).toBe(true);
    expect(observation.reasons.join(" ")).toContain("did not hold");
  });

  it("keeps a device finding the line does support", async () => {
    const finding: Finding = {
      targetPresent: true,
      targetName: "sprinkler head",
      defectType: "painted_over",
      severity: "low",
      obscured: false,
      note: SMALL_PAINT,
    };
    const observation = await run("sp-10", SMALL_PAINT, {
      structureOnDevice: async () => ({ finding, latencyMs: 800, error: null }),
      online: false,
    });
    expect(observation.finding).toEqual(finding);
  });
});
