import { describe, expect, it } from "vitest";
import { recordedOf } from "../src/bench/harness";
import { HELDOUT_SCENARIOS } from "../src/bench/scenarios";
import { crossCheckNote, judgeNote, noteEvidence } from "../src/rules/evidence";
import { DEFAULT_PACK, findItem } from "../src/rules/pack";
import { structureNote } from "../src/rules/structure";
import type { DefectType, Finding, Severity } from "../src/types";

const NOW = new Date("2026-11-23T09:00:00.000Z");

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    targetPresent: true,
    targetName: "target",
    defectType: "none",
    severity: "none",
    obscured: false,
    note: "",
    ...overrides,
  };
}

function itemOf(id: string) {
  return findItem(DEFAULT_PACK, id)!;
}

describe("what the line says on its own", () => {
  it("finds the phrases with which the writer says the view was limited", () => {
    expect(noteEvidence(itemOf("st-04"), "Soffit too dark to see above the landing.").marks).toContain("too dark to see");
    expect(noteEvidence(itemOf("sp-10"), "Cannot tell whether the bulb is intact.").marks).toContain("cannot tell");
    expect(noteEvidence(itemOf("fe-01"), "Gauge in the green, tag dated this month.").marks).toEqual([]);
  });

  it("does not read a decisive limit as a hedge", () => {
    /* \"cannot close\" and \"no light\" describe the defect, not a doubt. */
    expect(noteEvidence(itemOf("fd-09"), "Pallets stacked against the track so it cannot close.").marks).toEqual([]);
    expect(noteEvidence(itemOf("ex-02"), "Sign is dead, no light at all above the door.").marks).toEqual([]);
    expect(noteEvidence(itemOf("eg-05"), "Route clear, nothing stored on the floor.").marks).toEqual([]);
  });

  it("reads absence only when the line says the item is not there", () => {
    expect(noteEvidence(itemOf("fh-07"), "Reel is missing from the hose point.").absence).toBe(true);
    expect(noteEvidence(itemOf("fh-07"), "Reel in place, valve turns by hand.").absence).toBe(false);
    expect(noteEvidence(itemOf("fh-07"), "Reel in place but the valve is stiff.").absence).toBe(false);
  });
});

describe("the cross check between the line and the answer", () => {
  it("holds an item where the line says the observer could not determine it", () => {
    const decision = crossCheckNote(
      itemOf("sp-10"),
      "Head looks painted on one side only, not sure whether the paint reached the bulb.",
      finding({ defectType: "painted_over", severity: "medium" }),
    );
    expect(decision.hold).toBe("inconclusive");
    expect(decision.action).toBe("held");
    expect(decision.reasons.join(" ")).toContain("not conclusive");
  });

  it("drops an absence claim the line does not make and keeps the defect it names", () => {
    const decision = crossCheckNote(
      itemOf("el-03"),
      "Front cover removed and live busbars exposed while the cleaner worked.",
      finding({ targetPresent: false, defectType: "exposed_parts", severity: "medium", obscured: true }),
    );
    expect(decision.action).toBe("amended");
    expect(decision.hold).toBe("none");
    expect(decision.finding?.targetPresent).toBe(true);
    const judged = judgeNote(itemOf("el-03"), "Front cover removed and live busbars exposed while the cleaner worked.", finding({ targetPresent: false, defectType: "exposed_parts", severity: "medium" }));
    expect(judged.verdict).toBe("fail");
    expect(judged.answerVerdict).toBe("unknown");
  });

  it("holds an item when the answer claims absence and the line says nothing about it", () => {
    const decision = crossCheckNote(itemOf("fh-07"), "Reel in place, valve turns by hand.", finding({ targetPresent: false }));
    expect(decision.hold).toBe("misread");
    expect(judgeNote(itemOf("fh-07"), "Reel in place, valve turns by hand.", finding({ targetPresent: false }), NOW).verdict).toBe("unknown");
  });

  it("takes the severity the line supports when the answer names a defect without one", () => {
    const decision = crossCheckNote(
      itemOf("fd-09"),
      "Pallets stacked against the shutter track so it cannot close.",
      finding({ defectType: "blockage", severity: "none" }),
    );
    expect(decision.finding?.severity).toBe("medium");
    expect(decision.action).toBe("amended");
    expect(judgeNote(itemOf("fd-09"), "Pallets stacked against the shutter track so it cannot close.", finding({ defectType: "blockage", severity: "none" }), NOW).verdict).toBe("fail");
  });

  it("leaves a decisive pass and a decisive failure alone", () => {
    const pass = judgeNote(itemOf("fe-01"), "Cabinet glass intact, gauge in the green.", finding(), NOW);
    expect(pass.verdict).toBe("pass");
    expect(pass.evidence.action).toBe("kept");

    const fail = judgeNote(itemOf("st-04"), "Crack wider than my thumb with the face spalling.", finding({ defectType: "crack", severity: "high" }), NOW);
    expect(fail.verdict).toBe("fail");
    expect(fail.evidence.action).toBe("kept");
  });

  it("does nothing when there is no finding to check", () => {
    const decision = crossCheckNote(itemOf("fe-01"), "not sure", null);
    expect(decision.finding).toBeNull();
    expect(decision.reasons).toEqual([]);
  });
});

describe("the held out notes", () => {
  /* These ten were written after the rules, with the same judgements asked for in
     other words. The number below is the limit of a word list, kept as a test so
     it is not forgotten: four open cases use a paraphrase no rule knows. */
  const throughTheParser = () => {
    const rows: { id: string; expected: string; recorded: string; held: string }[] = [];
    for (const scenario of HELDOUT_SCENARIOS) {
      const item = itemOf(scenario.itemId);
      const draft = structureNote(item, scenario.note);
      const decision = judgeNote(item, scenario.note, draft, NOW);
      rows.push({ id: scenario.id, expected: scenario.expected, recorded: recordedOf(decision.verdict), held: decision.evidence.hold });
    }
    return rows;
  };

  it("scores five of ten through the rule parser and the cross check", () => {
    const rows = throughTheParser();
    const agreed = rows.filter((row) => row.recorded === row.expected).length;
    console.log(rows.map((row) => `${row.id} expected ${row.expected} recorded ${row.recorded} ${row.held}`).join("\n"));
    expect(agreed).toBe(5);
  });

  it("misses four open cases that say it another way and one failure the word list does not read", () => {
    /* H03 is not a gate miss: the parser does not know "the cover is off the
       board", so the fallback reading sees nothing wrong. It is kept in the list
       because the on-device model is the primary reading and the parser is what
       stands in when the model is absent. */
    const missed = throughTheParser()
      .filter((row) => row.recorded !== row.expected)
      .map((row) => row.id);
    expect(missed).toEqual(["H01", "H02", "H03", "H04", "H09"]);
  });

  it("catches the open cases phrased with a phrase the rules know", () => {
    const held = throughTheParser()
      .filter((row) => row.held === "inconclusive")
      .map((row) => row.id);
    expect(held).toEqual(["H06", "H07", "H10"]);
  });
});

describe("typed noise", () => {
  it("keeps a defect type and a severity that the pack knows", () => {
    const draft = structureNote(itemOf("sd-08"), "Painted over during the refurbishment.")!;
    expect(["painted_over", "other"]).toContain<DefectType>(draft.defectType);
    expect(["low", "medium", "high"]).toContain<Severity>(draft.severity);
  });
});
