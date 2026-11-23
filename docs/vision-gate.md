# Vision gate, measured 2026-11-23

Before any product code depended on photo judgement, five fixture photos were run
through the on-device model on Chrome 158.0.8127.36 inside a Kaggle free CPU
session (4 cores, 31.35 GiB RAM, no GPU, headed under Xvfb, Selenium 4.53.0).
Answers were written by a person first and live in `fixtures/ground-truth.json`.

## What the API does

| check | stock Chrome | with `--enable-features=PromptApiForGeminiNanoMultimodalInput` |
|---|---|---|
| `availability({expectedInputs:[text, image]})` | `downloadable` (3,481 ms) | `downloadable` (1,709 ms) |
| model download to 100% | t+122.8 s | t+136.0 s |
| `create()` with `responseConstraint` | 116.6 s | 129.9 s |
| profile size after download | 4.3 GB | 4.3 GB |
| replies that parsed as JSON | 5 of 5 | 4 of 5 |

The image input path is open without the flag, and the flag does not change the
availability answer on this build. A message has to be shaped as
`{role: 'user', content: [{type: 'text', value}, {type: 'image', value: bitmap}]}`.
Passing the bare part array throws
`TypeError: Failed to read the 'content' property from 'LanguageModelMessage'`.

## What the answers are worth

| photo | human answer | stock, ms and answer |
|---|---|---|
| extinguisher in cabinet | present, no defect | 24,580, present, `someTarget`, blockage/medium |
| exit sign above door | present, no defect | 12,929, absent, `sensor_1`, missing_label/low |
| board cover removed | present, exposed_parts/high | 17,482, present, `connector_A`, crack/medium |
| cracked blockwork | present, crack/medium | 15,888, present, `display_panel`, exposed_parts/high |
| extinguisher left on a cart | present, other/medium | 14,141, absent, `controller_board`, other/low |

Median 15,888 ms per photo on four CPU cores, range 4.3 to 24.6 s. Against the
answer key: target present 2 of 5, defect type 1 of 5, severity 0 of 5. The
names the model returns (`someTarget`, `sensor_1`, `connector_A`) have no
relation to the photo, so the image is accepted but not read.

## Decision

Photo judgement is not part of the on-device job. The device does three things:
it structures the one line note (text path, measured at 3.7 to 5.5 s in the same
environment earlier that day), it keeps the photo, and it asks the inspector to
confirm what the photo shows. The verdict comes from the rule pack in
`src/rules/pack.ts`.

Consequences for the demo: no scene claims a machine verdict from a photo, the
three minute video shows the inspector confirming a photo, and the README states
the boundary. That is the device variance story told honestly instead of a
capability the model does not have.

## Reproduce

Import `probe/vision-gate.ipynb` into
a Kaggle CPU session with internet on and run all cells. Keep the Chrome profile
under `/tmp`; `/kaggle/working` is 20 GiB and misses the 22 GB requirement. The
fixtures are fetched from this repository's raw URLs.
