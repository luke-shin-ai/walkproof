# Measured runs

The current run was made on 2026-11-25 with the published build at
https://luke-shin-ai.github.io/walkproof/bench/ . The run before it was made on
2026-11-23 with the same page.

| file | host | what it covers |
|---|---|---|
| `results-kaggle-2026-11-25.json` | Kaggle Notebooks free CPU session (4 cores, 32 GB, Chrome 158.0.8127.88 on Linux) | the D6 run: forty observations on the device and through the hybrid, both arms twice in one session, ten held-out notes on the device, and the ten cloud path notes through both arms |
| `raw-d6-2026-11-25.txt` | the same session | the lines the session printed (variation, arm metrics, the sets) and the per item table from the result file it wrote, plus four layout readings from a second session at 1440 and a 390 by 844 viewport |
| `raw-d5-2026-11-23.txt` | Kaggle Notebooks free CPU session (4 cores, 32 GiB, Chrome 158 on Linux) | the lines the D5 session printed: arm metrics, the per item table, the gate refusals, the layout checks |
| `results-kaggle-2026-11-23.json` | assembled from the file above by `scripts/assemble-d5.mjs` | the D5 run: forty observations on the device and through the hybrid, plus ten held-out notes on the device |
| `results-kaggle-d4-2026-11-23.json` | the earlier session of the same day, kept as it was recorded | D4: the same forty observations before the answer was checked against the line, with a six item cloud only baseline |

The D6 run used `gemini-4-hydrogen`; the D4 and D5 sessions used
`gemini-3.5-flash-lite`, the app's one fallback, because the `gemini-4-hydrogen`
daily free quota had been spent earlier that day. The D4 session ended 71 minutes
before the D5 one, so any sentence that compares them means an hour apart on the
same day, not days.

The D5 numbers predate two code changes: an item the device already left to a
person because the line was uncertain is no longer sent to the cloud, and an
accepted cloud answer can now become the finding the rule pack judges. The D5
hybrid numbers therefore include 17 calls on hedged lines that the shipped code
would now keep with a person, and they show no verdict changed by a cloud answer.
The D6 run measures both changes, adds the ten cloud path notes, and runs the
forty item arms twice so the spread of one arm against itself is a number.

`scripts/assemble-d5.mjs` recomputes every count from the per item table and
refuses to write the JSON when one disagrees with what the session printed. The
D5 session was stopped before its output file could be exported, so that JSON is
assembled rather than copied; every number in it comes from the run. The D6 JSON
is the file the session itself wrote, and the raw table beside it is rebuilt from
that file because the session log could not be exported in full.

## The D6 run of 2026-11-25

| metric | on-device | hybrid | ten held-out notes | cloud path notes, device | cloud path notes, hybrid |
|---|---|---|---|---|---|
| items | 40 | 40 | 10 | 10 | 10 |
| agreement with the human key | 34 (85%) | 40 (100%) | 8 (80%) | 7 (70%) | 10 (100%) |
| agreement of the model answer alone | 27 (68%) | 28 (70%) | 7 (70%) | 7 (70%) | 6 (60%) |
| held by the line | 22 | 20 | 6 | 0 | 0 |
| amended from the line | 3 | 4 | 0 | 1 | 3 |
| review items settled anyway | 0 of 20 | 0 of 20 | 1 of 7 | 0 of 2 | 0 of 2 |
| total | 613.5 s | 615.7 s | 154.7 s | 156.8 s | 198.8 s |
| median | 15,321 ms | 15,277 ms | 15,418 ms | 15,613 ms | 20,559 ms |
| p90 | 15,862 ms | 15,886 ms | 15,982 ms | 16,230 ms | 24,335 ms |
| cloud calls | 0 | 2 | 0 | 0 | 6 |
| cloud errors | 0 | 0 | 0 | 0 | 0 |
| gate refusals | n/a | 1 | n/a | n/a | 0 |
| items settled by the cloud, and how many matched the key | n/a | 1 of 1 | n/a | n/a | 4 of 4 |
| photo bytes to cloud | 0 | 0 | 0 | 0 | 0 |
| request bytes to cloud | 0 | 943 | 0 | 0 | 2,904 |

The second pass agreed on 37 of 40 on the device and 38 of 40 through the hybrid.
Between its two passes the device recorded a different verdict on 7 of 40 items
(S01, S06, S10, S21, S22, S25, S34) and the hybrid on 2 of 40 (S22, S38). The
same arm moves wider than the gap between the two arms, so one run cannot rank the
paths; the two passes show the hybrid no further from the key than the device in
the same session.

What the cloud did on the forty: S22 accepted and settled to fail in the first
pass (the device left it at review, the key says fail), S27 refused for
contradicting the on-device finding. In the second pass S09 and S29 were accepted
and settled to pass, S22 and S27 were refused, and S38 lost its call to the 30 s
limit (one cloud error) and was recorded at review. The gain on S22 did not repeat.

On the cloud path notes the device alone missed three (O01 and O07 at review, O03
at pass, all keyed fail). The hybrid answered 10 of 10 with six calls and four
settled items, all four right; the two control notes O09 and O10 were accepted as
findings and still recorded at review, so neither was settled.

Across the session: 13 cloud calls, 4 refusals, 6,282 request bytes, 0 photo
bytes. The session was a free CPU session, accelerator none, and it ended when
the run ended.

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

The run before this one (D4, an hour earlier on the same day, same session shape,
no check against the inspector's line) agreed on 24 of 40 on the device, settled
12 of the 20 open items, and had no gate refusal at all.
`tests/d5-regression.test.ts` replays those answers through the shipped decision:
24 of 40 as they came back, 40 of 40 after the check. That is a ceiling for the
set the rules were written from.

On the forty items the two arms disagreed on four: S18 (device fail, hybrid pass),
S33 (device review, hybrid fail), S37 and S38 (device pass and fail, hybrid review
for both). S18 and S33 carry `source: on_device` in both arms, so the difference
is the on-device model reading the same line differently in two runs, not the
cloud. Until the same arm is run twice in one session there is no number for that
variation, which is what the next run adds.

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

The ten cloud path notes (`OPEN_SCENARIOS`, same file, 2026-11-24) are decisive
lines that name a defect and then score it down from one quiet word. The rule
parser leaves all ten open, which is the item the cloud is asked about, so the
same notes measure the device alone against the hybrid that may adopt a cloud
finding. Eight have a key of fail and two have a key of review; the two are the
control for oversettling. The D6 run of 2026-11-25 measured this set: 7 of 10 on
the device, 10 of 10 through the hybrid, with the two controls recorded at review.

| path | code | what it does |
|---|---|---|
| on-device | `src/ai/hybrid.ts` (`ONLY_ON_DEVICE`, or the browser `LanguageModel` in the published build), `src/rules/evidence.ts`, `src/rules/judge.ts` | Gemini Nano structures the line, the answer is checked against the line, the rule pack decides, the photo never leaves the device |
| hybrid | `src/pipeline.ts` | the shipped flow: on-device first, cloud only for an item with a decisive line that the device could not settle, inside the daily budget, every answer checked by `src/rules/verify.ts`, and an accepted answer becomes the finding the rule pack judges. The D5 run of 2026-11-23 was made before these rules, so it shows more cloud calls than the shipped code makes and no settled verdict; the D6 run of 2026-11-25 measures the shipped rules with 2 and 5 calls on the forty and 6 on the cloud path notes |
| cloud only | baseline in `src/bench/harness.ts` | every item goes to the cloud with its photo and its line; measured on six items in D4 because of the free tier |

## How to reproduce

1. Open the bench page with the web app config in the URL fragment:
   `https://luke-shin-ai.github.io/walkproof/bench/#config=<base64url json>`.
2. Press **Run the measurement**. The on-device arm needs a browser that meets
   the Gemini Nano requirements (4 or more cores, 16 GiB or more memory, 22 GB
   free on the profile volume) and a gesture to start the download.
3. `bench/kaggle_runner.py` does the same thing from a free Kaggle CPU session,
   including the layout checks at 1440 px and at a 390 by 844 viewport, and prints
   the result as a table. Add `set=heldout` to the page URL for the ten held-out
   notes, `set=open` for the ten cloud path notes, or run
   `bench/kaggle_layout_check.py` for the layout checks alone. `MODE = "layout"` in
   the runner reads the two pages at both widths and nothing else, in under two
   minutes.
4. The config fragment for step 3 has to use the camel case keys (`apiKey`,
   `authDomain`, `projectId`, `storageBucket`, `messagingSenderId`, `appId`). The
   snippet in `recheck-2026-11-24.md` builds that shape, and the runner stops with
   the page's own words when the page does not accept the fragment.

A run needs a key. The public build carries none: the config comes from the URL
fragment at runtime and is never written down.
