import { describe, expect, it } from "vitest";
import { buildCloudPayload, redactForCloud, structureNote } from "../src/rules/structure";
import { DEFAULT_PACK, findItem } from "../src/rules/pack";

describe("local note parser", () => {
  const item = findItem(DEFAULT_PACK, "el-03")!;

  it("reads an exposed live part as a high defect", () => {
    const result = structureNote(item, "Front cover removed and live busbars exposed.");
    expect(result?.defectType).toBe("exposed_parts");
    expect(result?.severity).toBe("high");
    expect(result?.targetPresent).toBe(true);
  });

  it("reads an absent target", () => {
    const result = structureNote(findItem(DEFAULT_PACK, "fe-01")!, "Cabinet is empty, the extinguisher is missing.");
    expect(result?.targetPresent).toBe(false);
  });

  it("marks an uncertain note as obscured and low severity", () => {
    const result = structureNote(findItem(DEFAULT_PACK, "sp-10")!, "Head looks painted, not sure whether that is allowed.");
    expect(result?.defectType).toBe("painted_over");
    expect(result?.obscured).toBe(true);
    expect(result?.severity).toBe("low");
  });

  it("reads a hairline crack as low severity", () => {
    const result = structureNote(findItem(DEFAULT_PACK, "st-04")!, "Hairline crack above the door frame.");
    expect(result?.defectType).toBe("crack");
    expect(result?.severity).toBe("low");
  });

  it("returns nothing for an empty note", () => {
    expect(structureNote(item, "   ")).toBeNull();
  });

  it("does not read live inside another word as a high severity signal", () => {
    const result = structureNote(
      findItem(DEFAULT_PACK, "eg-05")!,
      "Two pallets of stock left in front of the exit door after the delivery.",
    );
    expect(result?.defectType).toBe("blockage");
    expect(result?.severity).toBe("medium");
  });
});

describe("what leaves the device", () => {
  it("masks numbers, phone numbers and email addresses", () => {
    const redacted = redactForCloud("Unit 1203, ring 010-2345-6789 or mail care@example.com");
    expect(redacted).not.toMatch(/\d{2,}/);
    expect(redacted).not.toContain("care@example.com");
    expect(redacted).toContain("[email]");
    expect(redacted).toContain("[number]");
  });

  it("builds a typed payload with clause ids and no image", () => {
    const item = findItem(DEFAULT_PACK, "sd-08")!;
    const finding = structureNote(item, "Painted over during the refit, no idea whether it still works.")!;
    const payload = buildCloudPayload(item, DEFAULT_PACK, { draft: finding, draftTrusted: true, reason: "pack_open" });
    const parsed = JSON.parse(payload.json) as Record<string, unknown>;
    expect(parsed.allowedClauseIds).toEqual(["SD-08"]);
    expect(parsed.photo).toBe("kept on the device");
    expect(payload.json).not.toContain("data:image");
    expect(payload.json).not.toContain("base64");
    expect(payload.bytes).toBeGreaterThan(50);
    expect((parsed.deviceDraft as Record<string, unknown>).note).toBeUndefined();
    expect((parsed.deviceDraft as Record<string, unknown>).trusted).toBe(true);
    expect(String(parsed.note).length).toBeGreaterThan(10);
  });

  it("marks a draft the line did not support and says why the item is going out", () => {
    const item = findItem(DEFAULT_PACK, "sd-08")!;
    const finding = structureNote(item, "Detector clear, grille open, nothing on it.")!;
    const payload = buildCloudPayload(item, DEFAULT_PACK, {
      draft: finding,
      draftTrusted: false,
      reason: "untrusted_reading",
    });
    const parsed = JSON.parse(payload.json) as Record<string, unknown>;
    expect((parsed.deviceDraft as Record<string, unknown>).trusted).toBe(false);
    expect(String(parsed.openBecause)).toContain("did not survive");
  });
});
