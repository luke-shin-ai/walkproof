import { afterEach, describe, expect, it, vi } from "vitest";
import { hasBrowserDeviceModel, structureWithBrowserDevice, warmBrowserDeviceModel } from "../src/ai/hybrid";
import { DEFAULT_PACK, findItem } from "../src/rules/pack";

const finding = {
  targetPresent: true,
  targetName: "fire extinguisher",
  defectType: "none",
  severity: "none",
  obscured: false,
  note: "gauge in the green",
};

function stubLanguageModel(prompt: (input: string, options?: { responseConstraint?: unknown }) => Promise<string>) {
  const destroy = vi.fn();
  const create = vi.fn(async () => ({ prompt, destroy }));
  vi.stubGlobal("LanguageModel", { availability: async () => "available", create });
  return { create, destroy };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("the browser's own on-device model", () => {
  it("is reported absent when the browser does not expose it", () => {
    expect(hasBrowserDeviceModel()).toBe(false);
  });

  it("structures a note through the browser model with no Firebase project", async () => {
    const { create } = stubLanguageModel(async () => JSON.stringify(finding));
    expect(hasBrowserDeviceModel()).toBe(true);
    const result = await structureWithBrowserDevice(findItem(DEFAULT_PACK, "fe-01")!, "Cabinet intact, gauge in the green.");
    expect(create).toHaveBeenCalledTimes(1);
    expect(result.error).toBeNull();
    expect(result.finding?.defectType).toBe("none");
  });

  it("passes the shared finding schema as the response constraint", async () => {
    const seen: Array<{ responseConstraint?: unknown } | undefined> = [];
    stubLanguageModel(async (_input, options) => {
      seen.push(options);
      return JSON.stringify(finding);
    });
    await structureWithBrowserDevice(findItem(DEFAULT_PACK, "fe-01")!, "Cabinet intact.");
    expect(seen[0]?.responseConstraint).toMatchObject({ type: "object" });
  });

  it("asks again without the constraint when the API does not take one", async () => {
    let calls = 0;
    stubLanguageModel(async (_input, options) => {
      calls += 1;
      if (options?.responseConstraint) throw new TypeError("responseConstraint is not supported");
      return JSON.stringify(finding);
    });
    const result = await structureWithBrowserDevice(findItem(DEFAULT_PACK, "fe-01")!, "Cabinet intact.");
    expect(calls).toBe(2);
    expect(result.finding).not.toBeNull();
  });

  it("returns an error instead of throwing when the model answers with no JSON", async () => {
    stubLanguageModel(async () => "I could not read that note.");
    const result = await structureWithBrowserDevice(findItem(DEFAULT_PACK, "fe-01")!, "Cabinet intact.");
    expect(result.finding).toBeNull();
    expect(result.error).toContain("root");
  });

  it("prepares and releases a session without keeping it open", async () => {
    const { destroy } = stubLanguageModel(async () => JSON.stringify(finding));
    await warmBrowserDeviceModel();
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
