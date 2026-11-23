import { describe, expect, it } from "vitest";
import { ledgerCsv, ledgerRows, reportModel, summarize } from "../src/ledger";
import { DEFAULT_PACK } from "../src/rules/pack";
import { cloudCheck, observation } from "./factory";

describe("ledger", () => {
  it("writes a header and escapes cells with a comma or a quote", () => {
    const csv = ledgerCsv([
      observation({ label: 'Extinguisher, "spare" cabinet', reasons: ["present, no defect", "clause FE-01"] }),
    ]);
    const [header, row] = csv.split("\n");
    expect(header.startsWith("record_id,item_id,zone,item,verdict")).toBe(true);
    expect(row).toContain('"Extinguisher, ""spare"" cabinet"');
    expect(row).toContain('"present, no defect; clause FE-01"');
  });

  it("keeps one row per item even after a re-run", () => {
    const first = observation({ itemId: "fe-01", verdict: "unknown", createdAt: "2026-11-23T08:00:00.000Z" });
    const second = observation({ itemId: "fe-01", verdict: "fail", createdAt: "2026-11-23T09:00:00.000Z" });
    const rows = ledgerRows([first, second]);
    expect(rows).toHaveLength(2);
    const stats = summarize([first, second], DEFAULT_PACK.items.length);
    expect(stats.checked).toBe(1);
    expect(stats.fail).toBe(1);
    expect(stats.unknown).toBe(0);
  });

  it("counts sources and cloud calls", () => {
    const observations = [
      observation({ itemId: "fe-01", verdict: "pass", source: "on_device" }),
      observation({ itemId: "sd-08", verdict: "fail", source: "in_cloud", cloud: cloudCheck() }),
      observation({ itemId: "sp-10", verdict: "unknown", source: "rejected_unsupported", reviewRequired: true, cloud: cloudCheck({ accepted: false }) }),
    ];
    const stats = summarize(observations, DEFAULT_PACK.items.length);
    expect(stats.pass).toBe(1);
    expect(stats.fail).toBe(1);
    expect(stats.unknown).toBe(1);
    expect(stats.review).toBe(1);
    expect(stats.inCloud).toBe(1);
    expect(stats.rejected).toBe(1);
    expect(stats.cloudCalls).toBe(2);
  });

  it("puts only failures in the violation table and flags items left to a person", () => {
    const model = reportModel(
      { buildingName: "Riverside Retail 2", buildingType: "retail", inspector: "L. Shin", startedAt: "2026-11-23T08:00:00.000Z" },
      [
        observation({ itemId: "fe-01", verdict: "pass", source: "on_device" }),
        observation({ itemId: "el-03", label: "Distribution board closed and covered", verdict: "fail", fixBy: "2026-11-26", reasons: ["exposed parts"] }),
        observation({ itemId: "sd-08", label: "Smoke detector unobstructed and unpainted", verdict: "unknown", reviewRequired: true, source: "rejected_unsupported" }),
      ],
      DEFAULT_PACK,
    );
    expect(model.violations).toHaveLength(1);
    expect(model.violations[0].itemId).toBe("el-03");
    expect(model.violations[0].fixBy).toBe("2026-11-26");
    expect(model.reviews).toHaveLength(1);
    expect(model.reviews[0].itemId).toBe("sd-08");
    expect(model.signatureLines).toHaveLength(3);
    expect(model.summary.checked).toBe(3);
  });
});
