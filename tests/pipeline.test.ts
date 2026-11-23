import { describe, expect, it } from "vitest";
import { processItem, shortError, type PipelineDeps } from "../src/pipeline";
import { DEFAULT_PACK, findItem } from "../src/rules/pack";
import { BUDGET_KEY, type KeyValueStore } from "../src/budget";
import { finding } from "./factory";
import type { Observation } from "../src/types";

const NOW = new Date("2026-11-23T09:00:00Z");
const TODAY = "2026-11-23";

/** A line that says what the inspector saw, so the cloud may be asked. */
const OPEN_NOTE = "Paint on the casing of the detector, a thin coat, looks minor.";
/** A line that says the observation was limited, so nobody else can settle it. */
const HEDGED_NOTE = "Painted over during the last refurbishment, no idea whether it still works.";

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

const openAnswer = {
  targetPresent: true,
  targetName: "smoke detector",
  defectType: "painted_over",
  severity: "low",
  obscured: false,
  note: "thin paint on the casing",
  clauseId: "SD-08",
  remedy: "Wipe the casing and record the detector as open until someone checks it.",
  suggestedVerdict: "unknown",
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

  it("keeps a line that says the observation was limited away from the cloud", async () => {
    let cloudCalls = 0;
    const observation = await processItem(input("sd-08", HEDGED_NOTE), {
      ...deps(),
      classify: async () => {
        cloudCalls += 1;
        return { raw: JSON.stringify(openAnswer), latencyMs: 1400, error: null, model: "gemini-4-hydrogen", modelFallback: false, source: "in_cloud" };
      },
    });
    expect(cloudCalls).toBe(0);
    expect(observation.cloud).toBeNull();
    expect(observation.noteCheck?.hold).toBe("inconclusive");
    expect(observation.verdict).toBe("unknown");
    expect(observation.reviewRequired).toBe(true);
    expect(observation.reasons.join(" ")).toContain("not sent to the cloud");
  });

  it("sends an item the rule pack leaves open and accepts an answer the gate can verify", async () => {
    const sent: string[] = [];
    const observation = await processItem(input("sd-08", OPEN_NOTE), {
      ...deps(),
      classify: async (_item, payload) => {
        sent.push(JSON.stringify(payload));
        return { raw: JSON.stringify(openAnswer), latencyMs: 1400, error: null, model: "gemini-4-hydrogen", modelFallback: false, source: "in_cloud" };
      },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain("data:image");
    expect(observation.cloud?.payloadBytes).toBeGreaterThan(50);
    expect(observation.cloud?.accepted).toBe(true);
    expect(observation.source).toBe("in_cloud");
    expect(observation.verdict).toBe("unknown");
    expect(observation.clauseIds).toEqual(["SD-08"]);
    expect(observation.reasons.join(" ")).toContain("cloud answer accepted");
  });

  it("marks a rejected cloud answer for a person", async () => {
    const observation = await processItem(input("sd-08", OPEN_NOTE), {
      ...deps(),
      classify: async () => ({
        raw: JSON.stringify({ ...openAnswer, clauseId: "FE-01" }),
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

  it("keeps an open item queued when the device is offline", async () => {
    let cloudCalls = 0;
    const observation = await processItem(input("sd-08", OPEN_NOTE), {
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
    const observation = await processItem(input("sd-08", OPEN_NOTE), {
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
    const observation = await processItem(input("sd-08", OPEN_NOTE), {
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
