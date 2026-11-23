# Measured runs

The run recorded here was made on 2026-11-23 with the published build at
https://luke-shin-ai.github.io/walkproof/bench/ .

| file | host | what it covers |
|---|---|---|
| `raw-d5-2026-11-23.txt` | Kaggle Notebooks free CPU session (4 cores, 32 GiB, Chrome 158 on Linux) | the lines the D5 session printed: arm metrics, the per item table, the gate refusals, the layout checks |
| `results-kaggle-2026-11-23.json` | assembled from the file above by `scripts/assemble-d5.mjs` | the D5 run: forty observations on the device and through the hybrid, plus ten held-out notes on the device |
| `results-kaggle-d4-2026-11-23.json` | the earlier session of the same day, kept as it was recorded | D4: the same forty observations before the answer was checked against the line, with a six item cloud only baseline |

`scripts/assemble-d5.mjs` recomputes every count from the per item table and
refuses to write the JSON when one disagrees with what the session printed. The
session was stopped before its output file could be exported, so the JSON is
assembled rather than copied; every number in it comes from the run.

## The D5 run of 2026-11-23

| metric | on-device | hybrid | ten held-out notes |
|---|---|---|---|
| items | 40 | 40 | 10 |
| agreement with the human key | 38 (95%) | 36 (90%) | 8 (80%) |
| agreement of the model answer alone | 29 (73%) | 28 (70%) | 7 (70%) |
| held by the line | 19 | 19 | 5 |
| amended from the line | 2 | 4 | 0 |
| review items settled anyway | 0 of 20 | 0 of 20 | 1 of 7 |
| total | 550.2 s | 575.6 s | 138.7 s |
| median | 13,694 ms | 14,433 ms | 13,649 ms |
| p90 | 14,487 ms | 15,606 ms | 15,229 ms |
| cloud calls | 0 | 20 | 0 |
| photo bytes to cloud | 0 | 0 | 0 |
| request bytes to cloud | 0 | 7,595 | 0 |
| gate refusals | n/a | 7 | n/a |

The run before this one (D4, same day, same session shape, no check against the
inspector's line) agreed on 24 of 40 on the device, settled 12 of the 20 open
items, and had no gate refusal at all. `tests/d5-regression.test.ts` replays
those answers through the shipped decision: 24 of 40 as they came back, 40 of 40
after the check. That is a ceiling for the set the rules were written from.

## What is measured

Forty observations are built from the ten checklist items in the shipped rule
pack, four per item: a clean pass, a clear failure, a borderline case that a
person has to settle, and a trap that reads two ways at once. The typed line
carries the state and the photo is one of the ten licensed fixtures, because
that is the product: the photo is evidence kept on the device and the line is
what a model reads (`../docs/vision-gate.md`).

The ten held-out notes (`HELDOUT_SCENARIOS` in `../src/bench/scenarios.ts`) ask
for the same judgements in other words. They were written after the rules and
are never counted with the forty.

| path | code | what it does |
|---|---|---|
| on-device | `src/ai/hybrid.ts` (`ONLY_ON_DEVICE`), `src/rules/evidence.ts`, `src/rules/judge.ts` | Gemini Nano structures the line, the answer is checked against the line, the rule pack decides, the photo never leaves the device |
| hybrid | `src/pipeline.ts` | the shipped flow: on-device first, cloud only for an `unknown` item, inside the daily budget, every answer checked by `src/rules/verify.ts` |
| cloud only | baseline in `src/bench/harness.ts` | every item goes to the cloud with its photo and its line; measured on six items in D4 because of the free tier |

## How to reproduce

1. Open the bench page with the web app config in the URL fragment:
   `https://luke-shin-ai.github.io/walkproof/bench/#config=<base64url json>`.
2. Press **Run the measurement**. The on-device arm needs a browser that meets
   the Gemini Nano requirements (4 or more cores, 16 GiB or more memory, 22 GB
   free on the profile volume) and a gesture to start the download.
3. `bench/kaggle_runner.py` does the same thing from a free Kaggle CPU session,
   including the 1440 px and 390 px layout checks, and prints the result as a
   table. Add `set=heldout` to the page URL for the ten held-out notes, or run
   `bench/kaggle_layout_check.py` for the layout checks alone.

A run needs a key. The public build carries none: the config comes from the URL
fragment at runtime and is never written down.
