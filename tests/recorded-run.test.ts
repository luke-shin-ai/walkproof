import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { RECORDED_LINE, RECORDED_NUMBERS, RECORDED_RUN } from "../src/recorded";

/**
 * The first screen and the bench page quote one session: the 2026-11-25 run
 * served at `public/bench/results-latest.json`. The numbers there are the sums
 * of the three hybrid arms, so this test sums the arms again and fails when a
 * page that says 13 calls stops matching the file behind it.
 */
const RESULT = new URL("../public/bench/results-latest.json", import.meta.url);

interface ArmMetrics {
  arm: string;
  cloudCalls: number;
  refused: number;
  cloudRequestBytes: number;
  cloudPhotoBytes: number;
}

interface CloudRow {
  cloudCalled: boolean;
  cloudModel: string | null;
}

const result = JSON.parse(await readFile(RESULT, "utf8")) as {
  generatedAt: string;
  cloudModel: string;
  arms: ArmMetrics[];
  items: Record<string, CloudRow[]>;
  open: { metrics: Record<string, ArmMetrics>; items: Record<string, CloudRow[]> };
};

const arm = (name: string): ArmMetrics => {
  const found = result.arms.find((entry) => entry.arm === name);
  if (!found) throw new Error(`arm ${name} missing from the result file`);
  return found;
};

const hybridArms = [arm("hybrid"), arm("hybrid_rerun"), result.open.metrics.hybrid];
const calls = hybridArms.reduce((sum, entry) => sum + entry.cloudCalls, 0);
const refused = hybridArms.reduce((sum, entry) => sum + entry.refused, 0);
const bytes = hybridArms.reduce((sum, entry) => sum + entry.cloudRequestBytes, 0);
const photoBytes = hybridArms.reduce((sum, entry) => sum + entry.cloudPhotoBytes, 0);

describe("the recorded run the pages quote", () => {
  it("adds up to the hybrid arms of the result file", () => {
    expect(calls).toBe(RECORDED_RUN.calls);
    expect(refused).toBe(RECORDED_RUN.refused);
    expect(bytes).toBe(RECORDED_RUN.summaryBytes);
    expect(photoBytes).toBe(RECORDED_RUN.photoBytes);
  });

  it("names the model every cloud row in that session reported", () => {
    const rows = [
      ...result.items.hybrid,
      ...result.items.hybrid_rerun,
      ...result.open.items.hybrid,
    ].filter((row) => row.cloudCalled);
    expect(rows.length).toBe(RECORDED_RUN.calls);
    expect(rows.every((row) => row.cloudModel === RECORDED_RUN.model)).toBe(true);
    expect(result.cloudModel).toBe(RECORDED_RUN.model);
  });

  it("takes its date from the session clock, not from the run count", () => {
    const kst = new Date(new Date(result.generatedAt).getTime() + 9 * 60 * 60 * 1000);
    expect(kst.toISOString().slice(0, 10)).toBe(RECORDED_RUN.date);
  });

  it("reads as one line with the four numbers in it", () => {
    expect(RECORDED_NUMBERS).toBe("13 cloud calls / 4 refused / 6,282 summary bytes / 0 photo bytes");
    expect(RECORDED_LINE).toBe(`Recorded run, 2026-11-25: ${RECORDED_NUMBERS}`);
  });
});
