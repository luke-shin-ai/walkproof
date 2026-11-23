import type { CloudCheck, Finding, Observation } from "../src/types";

export function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    targetPresent: true,
    targetName: "item",
    defectType: "none",
    severity: "none",
    obscured: false,
    note: "",
    ...overrides,
  };
}

export function cloudCheck(overrides: Partial<CloudCheck> = {}): CloudCheck {
  return {
    model: "gemini-4-hydrogen",
    modelFallback: false,
    payload: "{}",
    payloadBytes: 80,
    accepted: true,
    reasons: [],
    answer: null,
    latencyMs: 900,
    error: null,
    budgetUsed: 1,
    budgetLimit: 20,
    askedBecause: "pack_open",
    deviceVerdict: "unknown",
    settled: false,
    ...overrides,
  };
}

export function observation(overrides: Partial<Observation> = {}): Observation {
  return {
    id: `id-${Math.random().toString(16).slice(2)}`,
    itemId: "fe-01",
    label: "Fire extinguisher in its marked cabinet",
    zone: "Lobby",
    photoName: "photo.jpg",
    photoBytes: 90000,
    photoDataUrl: "data:image/jpeg;base64,AAAA",
    note: "looks fine",
    finding: finding(),
    verdict: "pass",
    reasons: ["present and in place"],
    source: "on_device",
    deviceSource: "local_rules",
    latencyMs: 120,
    deviceLatencyMs: 120,
    cloud: null,
    clauseIds: ["FE-01"],
    fixBy: null,
    reviewRequired: false,
    createdAt: "2026-11-23T08:00:00.000Z",
    packVersion: "2026.11.23-1",
    ...overrides,
  };
}
