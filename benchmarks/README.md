# Measured runs

The run recorded here was made on 2026-11-23 with the published build at
https://luke-shin-ai.github.io/walkproof/bench/ .

| file | host | what it covers |
|---|---|---|
| `results-kaggle-2026-11-23.json` | Kaggle Notebooks free CPU session (4 cores, 30 GiB, Chrome on Linux) | the forty observations, all three paths |

## The run of 2026-11-23

| metric | on-device | hybrid | cloud only |
|---|---|---|---|
| items | 40 | 40 | 6 |
| total | 592.9 s | 605.6 s | 17.9 s |
| median | 14,950 ms | 15,182 ms | 3,072 ms |
| p90 | 15,395 ms | 16,729 ms | 3,637 ms |
| cloud calls | 0 | 11 | 6 |
| photo bytes to cloud | 0 | 0 | 535,758 |
| request bytes to cloud | 0 | 4,167 | 718,749 |
| settled without cloud | 100% | 73% | 0% |
| agreement with the human key | 60% | 63% | 6 of 6 |
| gate refusals | n/a | 0 | 0 |

The cloud arm is six items because the free tier allows 20 requests per model
per day, and `gemini-4-hydrogen` had already spent its day. The hybrid and the
on-device arm ran with `gemini-3.5-flash-lite`, the model the app falls back to.

## What is measured

Forty observations are built from the ten checklist items in the shipped rule
pack, four per item: a clean pass, a clear failure, a borderline case that a
person has to settle, and a trap that reads two ways at once. The typed line
carries the state and the photo is one of the ten licensed fixtures, because
that is the product: the photo is evidence kept on the device and the line is
what a model reads (`../docs/vision-gate.md`).

Three paths see the same forty observations:

| path | code | what it does |
|---|---|---|
| on-device | `src/ai/hybrid.ts` (`ONLY_ON_DEVICE`), `src/rules/judge.ts` | Gemini Nano structures the line, the rule pack decides, the photo never leaves the device |
| hybrid | `src/pipeline.ts` | the shipped flow: on-device first, cloud only for an `unknown` item, inside the daily budget, every answer checked by `src/rules/verify.ts` |
| cloud only | baseline in `src/bench/harness.ts` | every item goes to the cloud with its photo and its line, and the same verification gate runs on the answer |

## How to reproduce

1. Open the bench page with the web app config in the URL fragment:
   `https://luke-shin-ai.github.io/walkproof/bench/#config=<base64url json>`.
2. Press **Run the measurement**. The on-device arm needs a browser that meets
   the Gemini Nano requirements (4 or more cores, 16 GiB or more memory, 22 GB
   free on the profile volume) and a gesture to start the download.
3. `bench/kaggle_runner.py` does the same thing from a free Kaggle CPU session,
   including the 1440 px and 390 px layout checks, and prints the result as a
   gzipped base64 dump.

A run needs a key. The public build carries none: the config comes from the URL
fragment at runtime and is never written down.
