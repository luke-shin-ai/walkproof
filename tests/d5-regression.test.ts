import { describe, expect, it } from "vitest";
import { BENCH_SCENARIOS, scenarioById } from "../src/bench/scenarios";
import { recordedOf } from "../src/bench/harness";
import { judgeNote } from "../src/rules/evidence";
import { DEFAULT_PACK, findItem } from "../src/rules/pack";
import type { DefectType, Finding, Severity } from "../src/types";

/**
 * D5 regression: the answers the on-device model actually returned in the D4
 * measurement of 2026-11-23, replayed through the shipped decision.
 *
 * `benchmarks/results-kaggle-2026-11-23.json` holds them item by item. D4 scored
 * 24 of 40 against the human key. The cross check in `src/rules/evidence.ts` was
 * written from those failures, so this test pins the behaviour rather than
 * proving the product generalises: it says the same answers may not produce the
 * same twelve over-claims again.
 */
const D4_ANSWERS: Record<string, string> = {
  S01: "present / none / none",
  S02: "absent / missing_label / medium / obscured",
  S03: "absent / other / none / obscured",
  S04: "present / missing_label / none",
  S05: "present / none / none",
  S06: "absent / not_lit / medium / obscured",
  S07: "absent / missing_label / medium / obscured",
  S08: "present / none / none",
  S09: "present / none / none",
  S10: "absent / exposed_parts / medium / obscured",
  S11: "absent / other / none / obscured",
  S12: "present / none / none",
  S13: "present / none / none",
  S14: "present / crack / high",
  S15: "absent / none / none / obscured",
  S16: "absent / none / none / obscured",
  S17: "present / none / none",
  S18: "present / blockage / medium",
  S19: "present / none / none",
  S20: "present / none / none",
  S21: "present / none / none",
  S22: "absent / missing_label / none / obscured",
  S23: "present / none / none",
  S24: "present / missing_label / medium",
  S25: "present / none / none",
  S26: "absent / painted_over / medium / obscured",
  S27: "absent / none / none / obscured",
  S28: "present / painted_over / none",
  S29: "present / none / none",
  S30: "absent / blockage / none / obscured",
  S31: "absent / none / none / obscured",
  S32: "present / none / none",
  S33: "present / none / none",
  S34: "absent / painted_over / medium / obscured",
  S35: "absent / other / none / obscured",
  S36: "present / painted_over / medium",
  S37: "present / none / none",
  S38: "absent / damaged_housing / medium / obscured",
  S39: "absent / other / medium / obscured",
  S40: "absent / none / none / obscured",
};

function findingOf(answer: string): Finding {
  const parts = answer.split(" / ");
  return {
    targetPresent: parts[0] === "present",
    targetName: "target",
    defectType: parts[1] as DefectType,
    severity: parts[2] as Severity,
    obscured: parts.includes("obscured"),
    note: "",
  };
}

const NOW = new Date("2026-11-23T09:00:00.000Z");

describe("the D4 answers through the shipped decision", () => {
  it("has an answer for every scenario", () => {
    expect(Object.keys(D4_ANSWERS)).toHaveLength(BENCH_SCENARIOS.length);
    for (const scenario of BENCH_SCENARIOS) expect(D4_ANSWERS[scenario.id]).toBeTypeOf("string");
  });

  it("scores 24 of 40 when the answer is recorded as it came back", () => {
    let agreed = 0;
    for (const scenario of BENCH_SCENARIOS) {
      const item = findItem(DEFAULT_PACK, scenario.itemId)!;
      const decision = judgeNote(item, scenario.note, findingOf(D4_ANSWERS[scenario.id]), NOW);
      if (recordedOf(decision.answerVerdict) === scenario.expected) agreed += 1;
    }
    expect(agreed).toBe(24);
  });

  it("matches the human key on all forty once the line has a say", () => {
    const wrong: string[] = [];
    const rows: string[] = [];
    for (const scenario of BENCH_SCENARIOS) {
      const item = findItem(DEFAULT_PACK, scenario.itemId)!;
      const decision = judgeNote(item, scenario.note, findingOf(D4_ANSWERS[scenario.id]), NOW);
      const recorded = recordedOf(decision.verdict);
      rows.push(
        `${scenario.id} ${scenario.kind} expected ${scenario.expected} answer ${recordedOf(decision.answerVerdict)} recorded ${recorded} ${decision.evidence.action}/${decision.evidence.hold}`,
      );
      if (recorded !== scenario.expected) wrong.push(rows[rows.length - 1]);
    }
    console.log(rows.join("\n"));
    expect(wrong).toEqual([]);
  });

  it("leaves the twelve over-claims of D4 open instead of settled", () => {
    const settledThatShouldNotBe = ["S03", "S07", "S08", "S12", "S19", "S20", "S23", "S24", "S32", "S36", "S39", "S40"];
    for (const id of settledThatShouldNotBe) {
      const scenario = scenarioById(id)!;
      const item = findItem(DEFAULT_PACK, scenario.itemId)!;
      const decision = judgeNote(item, scenario.note, findingOf(D4_ANSWERS[id]), NOW);
      expect(decision.evidence.hold, id).toBe("inconclusive");
      expect(decision.verdict, id).toBe("unknown");
      expect(decision.judgement.fixBy, id).toBeNull();
    }
  });

  it("recovers the four clear failures the model called absent", () => {
    for (const id of ["S10", "S26", "S30", "S34"]) {
      const scenario = scenarioById(id)!;
      const item = findItem(DEFAULT_PACK, scenario.itemId)!;
      const decision = judgeNote(item, scenario.note, findingOf(D4_ANSWERS[id]), NOW);
      expect(decision.evidence.action, id).toBe("amended");
      expect(decision.verdict, id).toBe("fail");
      expect(decision.judgement.fixBy, id).not.toBeNull();
    }
  });

  it("keeps the ten clean passes and the ten clear failures as they were", () => {
    for (const scenario of BENCH_SCENARIOS.filter((entry) => entry.kind === "pass" || entry.kind === "fail")) {
      const item = findItem(DEFAULT_PACK, scenario.itemId)!;
      const decision = judgeNote(item, scenario.note, findingOf(D4_ANSWERS[scenario.id]), NOW);
      expect(decision.evidence.hold, scenario.id).toBe("none");
      expect(recordedOf(decision.verdict), scenario.id).toBe(scenario.expected);
    }
  });
});
