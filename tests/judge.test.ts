import { describe, expect, it } from "vitest";
import { addDays, judge } from "../src/rules/judge";
import { DEFAULT_PACK, findItem } from "../src/rules/pack";
import type { Finding } from "../src/types";

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    targetPresent: true,
    targetName: "extinguisher",
    defectType: "none",
    severity: "none",
    obscured: false,
    note: "",
    ...overrides,
  };
}

const now = new Date("2026-11-23T09:00:00Z");

describe("deterministic judge", () => {
  it("passes a visible target with no defect", () => {
    const item = findItem(DEFAULT_PACK, "fe-01")!;
    expect(judge(item, finding(), now).verdict).toBe("pass");
  });

  it("fails a visible target item when the target is absent and sets the deadline", () => {
    const item = findItem(DEFAULT_PACK, "fe-01")!;
    const result = judge(item, finding({ targetPresent: false }), now);
    expect(result.verdict).toBe("fail");
    expect(result.fixBy).toBe("2026-11-26");
    expect(result.reasons[0]).toContain("not visible");
  });

  it("fails a target_visible item on a high defect", () => {
    const item = findItem(DEFAULT_PACK, "fe-11")!;
    const result = judge(item, finding({ defectType: "damaged_housing", severity: "medium" }), now);
    expect(result.verdict).toBe("fail");
    expect(result.fixBy).toBe("2026-11-26");
  });

  it("keeps a low defect as unknown instead of pass", () => {
    const item = findItem(DEFAULT_PACK, "fe-01")!;
    expect(judge(item, finding({ defectType: "damaged_housing", severity: "low" }), now).verdict).toBe("unknown");
  });

  it("asks for unknown when the target is visible but obscured", () => {
    const item = findItem(DEFAULT_PACK, "fe-01")!;
    const result = judge(item, finding({ obscured: true }), now);
    expect(result.verdict).toBe("unknown");
    expect(result.fixBy).toBeNull();
  });

  it("returns unknown for target_clear when the equipment was not identified", () => {
    const item = findItem(DEFAULT_PACK, "el-03")!;
    expect(judge(item, finding({ targetPresent: false }), now).verdict).toBe("unknown");
  });

  it("fails a target_clear item on exposed parts", () => {
    const item = findItem(DEFAULT_PACK, "el-03")!;
    const result = judge(item, finding({ defectType: "exposed_parts", severity: "high" }), now);
    expect(result.verdict).toBe("fail");
    expect(result.fixBy).toBe("2026-11-26");
  });

  it("fails a no_defect item on a recorded defect and uses its own deadline", () => {
    const item = findItem(DEFAULT_PACK, "st-04")!;
    const result = judge(item, finding({ defectType: "crack", severity: "medium" }), now);
    expect(result.verdict).toBe("fail");
    expect(result.fixBy).toBe("2026-12-23");
  });

  it("returns unknown when there is no structured finding", () => {
    const item = findItem(DEFAULT_PACK, "st-04")!;
    const result = judge(item, null, now);
    expect(result.verdict).toBe("unknown");
    expect(result.reasons[0]).toContain("no structured finding");
  });

  it("counts days across a month boundary", () => {
    expect(addDays(new Date("2026-11-30T23:00:00Z"), 3)).toBe("2026-12-03");
  });
});
