/**
 * The session of 2026-11-25 that the submission quotes, typed once so every
 * surface says the same thing.
 *
 * The numbers are the sums of the three hybrid arms in
 * `public/bench/results-latest.json`: the first pass (2 calls), the second
 * pass (5 calls) and the ten cloud path notes (6 calls). The published page
 * carries no Firebase project, so its own counters stay at 0; these are the
 * numbers a copy with Firebase values recorded, and
 * `tests/recorded-run.test.ts` fails when they stop matching the result file.
 */
export const RECORDED_RUN = {
  date: "2026-11-25",
  model: "gemini-4-hydrogen",
  calls: 13,
  refused: 4,
  summaryBytes: 6282,
  photoBytes: 0,
} as const;

const BYTES_TEXT = RECORDED_RUN.summaryBytes.toLocaleString("en-US");

/** The four numbers in one line, for a counter row or a badge. */
export const RECORDED_NUMBERS = `${RECORDED_RUN.calls} cloud calls / ${RECORDED_RUN.refused} refused / ${BYTES_TEXT} summary bytes / ${RECORDED_RUN.photoBytes} photo bytes`;

/** The same numbers with the date and model, for the first line of a page. */
export const RECORDED_LINE = `Recorded run, ${RECORDED_RUN.date}: ${RECORDED_NUMBERS}`;
