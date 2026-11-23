import { describe, expect, it } from "vitest";
import { processItem, shortError, type PipelineDeps } from "../src/pipeline";
import { DEFAULT_PACK, findItem } from "../src/rules/pack";
import { BUDGET_KEY, type KeyValueStore } from "../src/budget";
import { finding } from "./factory";
import type { Observation } from "../src/types";

const NOW = new Date("2026-11-23T09:00:00Z");
const TODAY = "2026-11-23";

function store(seed?: string): KeyValueStore {
  const map = new Map<string, string>();
  if (seed) map.set(BUDGET_KEY, seed);
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
  };
}

function input(itemId: string, note: string) {
  return {
    item: findItem(DEFAULT_PACK, itemId)!,
    note,
    photoName: "photo.jpg",
    photoBytes: 120000,
    photoDataUrl: "data:image/jpeg;base64,AAAA",
    pack: DEFAULT_PACK,
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

const cloudAnswer = {
  targetPresent: true,
  targetName: "smoke detector",
  defectType: "painted_over",
  severity: "medium",
  obscured: false,
  note: "detector painted during the refit",
  clauseId: "SD-08",
  remedy: "Replace the painted detector and test it.",
  suggestedVerdict: "fail",
};

describe("cloud error text", () => {
  it("turns a long transport error into a reason a manager can read", () => {
    const raw =
      "FirebaseError: AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/walkproof-ai/models/gemini-4-hydrogen:generateContent: [503 ] Deadline expired before operation could complete. (AI/fetch-error)";
    expect(shortError(raw)).toBe("the cloud did not answer in time");
    expect(shortError("AI/network-request-failed")).toBe("the network request failed");
  });
});

describe("item pipeline", () => {
  it("records a device verdict without calling the cloud", async () => {
    let cloudCalls = 0;
    const observation: Observation = await processItem(input("fe-01", "gauge in the green"), {
      ...deps(),
      structureOnDevice: async () => ({ finding: finding(), latencyMs: 640, error: null }),
      classify: async () => {
        cloudCalls += 1;
        throw new Error("should not be called");
      },
    });
    expect(observation.verdict).toBe("pass");
    expect(observation.source).toBe("on_device");
    expect(observation.deviceSource).toBe("on_device");
    expect(observation.cloud).toBeNull();
    expect(cloudCalls).toBe(0);
    expect(observation.id).toBe("record-1");
  });

  it("falls back to the local parser when the device model is absent", async () => {
    const observation = await processItem(input("el-03", "Front cover removed and live busbars exposed."), deps());
    expect(observation.verdict).toBe("fail");
    expect(observation.deviceSource).toBe("local_rules");
    expect(observation.fixBy).toBe("2026-11-26");
  });

  it("sends only an unknown item to the cloud and refuses an answer that settles a line the person left open", async () => {
    const sent: string[] = [];
    const observation = await processItem(input("sd-08", "Painted over during the refit, no idea whether it still works."), {
      ...deps(),
      classify: async (_item, payload) => {
        sent.push(JSON.stringify(payload));
        return { raw: JSON.stringify(cloudAnswer), latencyMs: 1400, error: null, model: "gemini-4-hydrogen", modelFallback: false, source: "in_cloud" };
      },
    });
    expect(observation.cloud).not.toBeNull();
    expect(observation.cloud?.accepted).toBe(false);
    expect(observation.source).toBe("rejected_unsupported");
    expect(observation.verdict).toBe("unknown");
    expect(observation.fixBy).toBeNull();
    expect(observation.cloud?.reasons.join(" ")).toContain("not conclusive");
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain("data:image");
    expect(observation.cloud?.payloadBytes).toBeGreaterThan(50);
  });

  it("accepts a cloud answer that keeps an open line open and adds a remedy", async () => {
    const observation = await processItem(input("sp-10", "Head looks painted, not sure whether that is allowed."), {
      ...deps(),
      classify: async () => ({
        raw: JSON.stringify({
          targetPresent: true,
          targetName: "sprinkler head",
          defectType: "none",
          severity: "none",
          obscured: true,
          note: "the line does not settle whether paint reached the bulb",
          clauseId: "SP-10",
          remedy: "Have someone look at the head from a ladder and record it.",
          suggestedVerdict: "unknown",
        }),
        latencyMs: 1200,
        error: null,
        model: "gemini-4-hydrogen",
        modelFallback: false,
        source: "in_cloud",
      }),
    });
    expect(observation.cloud?.accepted).toBe(true);
    expect(observation.source).toBe("in_cloud");
    expect(observation.verdict).toBe("unknown");
    expect(observation.reviewRequired).toBe(true);
    expect(observation.reasons.join(" ")).toContain("cloud answer accepted");
  });

  it("marks a rejected cloud answer for a person", async () => {
    const observation = await processItem(input("sp-10", "Head looks painted, not sure whether that is allowed."), {
      ...deps(),
      classify: async () => ({
        raw: JSON.stringify({ ...cloudAnswer, clauseId: "FE-01" }),
        latencyMs: 900,
        error: null,
        model: "gemini-4-hydrogen",
        modelFallback: false,
        source: "in_cloud",
      }),
    });
    expect(observation.verdict).toBe("unknown");
    expect(observation.source).toBe("rejected_unsupported");
    expect(observation.reviewRequired).toBe(true);
    expect(observation.reasons.join(" ")).toContain("rejected");
  });

  it("keeps an unknown item queued when the device is offline", async () => {
    let cloudCalls = 0;
    const observation = await processItem(input("sd-08", "Painted over during the refit, no idea whether it still works."), {
      ...deps({ online: false }),
      classify: async () => {
        cloudCalls += 1;
        throw new Error("offline");
      },
    });
    expect(cloudCalls).toBe(0);
    expect(observation.verdict).toBe("unknown");
    expect(observation.reviewRequired).toBe(true);
    expect(observation.reasons.join(" ")).toContain("offline");
  });

  it("does not spend past the daily budget", async () => {
    let cloudCalls = 0;
    const observation = await processItem(input("sd-08", "Painted over during the refit, no idea whether it still works."), {
      ...deps({ budgetStore: store(JSON.stringify({ day: TODAY, spent: 20, limit: 20 })) }),
      classify: async () => {
        cloudCalls += 1;
        throw new Error("should not be called");
      },
    });
    expect(cloudCalls).toBe(0);
    expect(observation.cloud).toBeNull();
    expect(observation.reasons.join(" ")).toContain("budget");
  });

  it("uses the rule parser when the on-device model errors", async () => {
    const observation = await processItem(input("fe-01", "Cabinet glass broken and the gauge is at zero."), {
      ...deps(),
      structureOnDevice: async () => ({ finding: null, latencyMs: 30, error: "AI/api-not-enabled" }),
    });
    expect(observation.deviceSource).toBe("local_rules");
    expect(observation.finding?.defectType).toBe("damaged_housing");
    expect(observation.reasons.join(" ")).toContain("on-device model did not answer");
  });

  it("records a cloud error without losing the device finding", async () => {
    const observation = await processItem(input("sd-08", "Painted over during the refit, no idea whether it still works."), {
      ...deps(),
      classify: async () => ({
        raw: "",
        latencyMs: 400,
        error: "AI/network-request-failed",
        model: "gemini-4-hydrogen",
        modelFallback: false,
        source: "unknown",
      }),
    });
    expect(observation.verdict).toBe("unknown");
    expect(observation.reviewRequired).toBe(true);
    expect(observation.cloud?.error).toContain("network");
    expect(observation.finding).not.toBeNull();
  });
});
