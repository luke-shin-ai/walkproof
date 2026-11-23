import { describe, expect, it } from "vitest";
import { verifyCloudAnswer } from "../src/rules/verify";
import { DEFAULT_PACK, findItem } from "../src/rules/pack";
import type { Finding } from "../src/types";

const now = new Date("2026-11-23T09:00:00Z");

function answer(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    targetPresent: true,
    targetName: "smoke detector",
    defectType: "painted_over",
    severity: "medium",
    obscured: false,
    note: "detector painted during the refit",
    clauseId: "SD-08",
    remedy: "Replace the painted detector and test it.",
    suggestedVerdict: "fail",
    ...overrides,
  };
}

const item = findItem(DEFAULT_PACK, "sd-08")!;
const deviceFinding: Finding = {
  targetPresent: true,
  targetName: "smoke detector",
  defectType: "painted_over",
  severity: "low",
  obscured: true,
  note: "painted over, not sure",
};

describe("cloud answer gate", () => {
  it("accepts a complete answer whose clause and verdict fit the pack", () => {
    const result = verifyCloudAnswer(answer(), item, DEFAULT_PACK, "unknown", deviceFinding, now);
    expect(result.accepted).toBe(true);
    expect(result.verdictFromRules).toBe("fail");
    expect(result.answer?.clauseId).toBe("SD-08");
  });

  it("rejects a clause that is not in the rule pack", () => {
    const result = verifyCloudAnswer(answer({ clauseId: "ZZ-99" }), item, DEFAULT_PACK, "unknown", deviceFinding, now);
    expect(result.accepted).toBe(false);
    expect(result.reasons.join(" ")).toContain("not in the rule pack");
  });

  it("rejects a clause that does not apply to this item", () => {
    const result = verifyCloudAnswer(answer({ clauseId: "FE-01" }), item, DEFAULT_PACK, "unknown", deviceFinding, now);
    expect(result.accepted).toBe(false);
    expect(result.reasons.join(" ")).toContain("does not apply");
  });

  it("rejects an answer with a missing required field", () => {
    const result = verifyCloudAnswer(answer({ remedy: "" }), item, DEFAULT_PACK, "unknown", deviceFinding, now);
    expect(result.accepted).toBe(false);
    expect(result.reasons.join(" ")).toContain("remedy");
  });

  it("rejects an unknown defect type", () => {
    const result = verifyCloudAnswer(answer({ defectType: "mould" }), item, DEFAULT_PACK, "unknown", deviceFinding, now);
    expect(result.accepted).toBe(false);
    expect(result.reasons.join(" ")).toContain("defectType");
  });

  it("rejects an answer that contradicts its own suggested verdict", () => {
    const result = verifyCloudAnswer(
      answer({ defectType: "painted_over", severity: "high", suggestedVerdict: "pass" }),
      item,
      DEFAULT_PACK,
      "unknown",
      deviceFinding,
      now,
    );
    expect(result.accepted).toBe(false);
    expect(result.reasons.join(" ")).toContain("rule pack reaches fail");
  });

  it("rejects an answer that would overturn a settled on-device verdict", () => {
    const result = verifyCloudAnswer(answer({ defectType: "none", severity: "none", suggestedVerdict: "pass" }), item, DEFAULT_PACK, "fail", deviceFinding, now);
    expect(result.accepted).toBe(false);
    expect(result.reasons.join(" ")).toContain("settled on-device verdict");
  });

  it("rejects an answer that contradicts the on-device presence finding", () => {
    const result = verifyCloudAnswer(answer({ targetPresent: false }), item, DEFAULT_PACK, "unknown", deviceFinding, now);
    expect(result.accepted).toBe(false);
    expect(result.reasons.join(" ")).toContain("contradicts the on-device finding");
  });

  it("rejects a non-object answer", () => {
    const result = verifyCloudAnswer("sorry, I cannot help with that", item, DEFAULT_PACK, "unknown", deviceFinding, now);
    expect(result.accepted).toBe(false);
    expect(result.reasons[0]).toContain("not an object");
  });
});
