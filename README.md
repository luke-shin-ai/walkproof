# WalkProof

Monthly building safety walkthrough for the person who has no safety officer.
A manager walks the building with a phone, photographs each checklist item and
writes one line. The device structures that line and the rule pack decides.
Only an item the device cannot decide goes to the cloud, as a typed summary,
inside a daily budget, and the answer is checked on the device before it can
enter the record.

Built for the Firebase AI Logic hybrid hackathon (Web/Chrome). The on-device
path uses Gemini Nano through `firebase/ai`; the cloud path uses
`gemini-4-hydrogen` through the same SDK, with the same finding schema plus a
clause id and a remedy.

## Status

D1 to D3 of the build plan are in place (2026-11-23).

- Field capture with photo, one line note and an IndexedDB queue.
- Note structuring on the device, with the built-in rule parser as the fallback
  when the device has no Nano model.
- Deterministic verdicts (`pass`, `fail`, `unknown`) and fix deadlines from the
  rule pack.
- Cloud escalation for `unknown` items only, behind a daily budget meter.
- On-device verification of every cloud answer, with `rejected_unsupported`
  for anything that fails a check.
- Ledger with a source badge per record and CSV export.
- Printable inspection record with photos, clauses, deadlines and signature
  lines.
- Rule pack fetched from Remote Config, cached locally, built-in fallback.
- Ten licensed fixture photos and a one click sample walkthrough.

## What runs where

| data | where it runs | why |
|---|---|---|
| photo, note, location | device only | basement, stair core and car park have no signal; interior photos stay in the building |
| verdict pass / fail / unknown | local rule pack | the same photo, note and pack must give the same answer every time |
| checklist, clause texts, fix days, cloud budget | Remote Config, cached on the device | a clause change reaches every device without a release |
| defect type and remedy for an unclear item | cloud, typed text only | the device does not carry the whole code book |
| per building repeat defects | later, anonymous counts | one device cannot see across buildings |

The photo is never sent to a model or a server. `src/photo.ts` re-encodes it
through a canvas before it is stored, which drops EXIF and GPS, and the cloud
request is JSON that names the item and the allowed clause ids. The note is
reduced to the structured finding plus a redacted line (`src/rules/structure.ts`).

## The boundary, step by step

| step | code | what it does |
|---|---|---|
| G6 capture | `src/storage/queue.ts` | the photo and note are written to IndexedDB before any model work, so a closed tab does not lose the record |
| G4 structure | `src/rules/structure.ts`, `src/ai/hybrid.ts` | the on-device model or the built-in parser turns the note into one shared finding schema |
| judge | `src/rules/judge.ts` | the only code that produces a verdict, with the deadline from the item |
| G2 budget | `src/budget.ts` | a call is made only while today has room; a full meter leaves the item queued |
| cloud | `src/ai/hybrid.ts` | `ONLY_IN_CLOUD` with `gemini-4-hydrogen` and `responseSchema`; a missing model falls back once to `gemini-3.5-flash-lite`, the ledger shows the model that answered, and a call that has not answered in 30 s is recorded as a failed check so the walk can continue |
| G3 gate | `src/rules/verify.ts` | schema, clause exists in the pack, clause applies to this item, no contradiction with the device finding, and the rule pack must reach the verdict the cloud suggested |
| G1 record | `src/ledger.ts`, `src/main.ts` | ledger with source badges and CSV, printable record with clause and deadline |
| G5 pack | `src/config/remoteConfig.ts` | Remote Config `rule_pack`, cached for 30 days, built-in pack when nothing valid is available |

The model supplies evidence. `judge()` is the only function that turns evidence
into a verdict, and a cloud answer is re-judged by it before it can change a
record. A rejected answer is not hidden: the record is marked
`rejected_unsupported` and the inspection record lists it under "Left to a
person".

## Run it

```bash
npm install
cp .env.example .env      # Firebase web app values, or leave empty for local only
npm run dev
npm test                  # 54 tests
npm run build             # type check, then the Vite build
npm run check:ai-tells    # fails on machine looking punctuation and on secrets
```

With no Firebase values the app still runs: the built-in pack is used, notes are
structured by the rule parser, and cloud checks are off. That is also the state
of the public sample build, which takes the Firebase web config at runtime from
the URL fragment (`#config=<base64url json>`) so this repository never carries
the values.

## Sample walkthrough

Press "Load the sample walkthrough". Ten steps load a licensed photo and a line
of inspector text each, then run the real pipeline. On a device with Nano the
note is structured on the device; on a device without it the rule parser does
the work and the record says so. Two items are deliberately unclear (`sd-08`,
`sp-10`), so a configured build makes real cloud calls and shows the answer
being checked, and an unconfigured build shows them waiting for a person.

`fixtures/README.md` lists the licence and source of each photo.
`fixtures/ground-truth.json` is the human answer key written before the model
ran.

## Rule pack and Remote Config

The pack carries the checklist, the clause texts, the fix deadlines and the
daily cloud budget. The app reads the `rule_pack` string parameter, activates
it, keeps the last valid copy for 30 days and validates anything it receives
(`validatePack`). A pack that cites a clause it does not define, repeats an id
or sets an impossible deadline is refused, and the previous pack stays.

`firebase/remoteconfig.template.json` is generated from the built-in pack by
`npm run config:template`, and a test fails if the two drift apart.

```bash
npx firebase login
npx firebase deploy --only remoteconfig --project walkproof-ai
```

Until a value is published, the badge in the header reads `built-in` and the
app behaves exactly as it does with the remote pack.

## Verifying a cloud answer

`src/rules/verify.ts` rejects an answer when:

1. a required field is missing or has the wrong type,
2. the cited clause is not in the pack,
3. the cited clause is not one this item may cite,
4. it contradicts the on-device finding about whether the item was present,
5. the rule pack, run on the cloud's own finding, reaches a different verdict
   than the one the cloud suggested,
6. it would overturn a verdict the device had already settled.

Rejections are counted and shown. On the sample walkthrough the expected number
of rejected answers is 0 out of 2 calls; the number is reported per walk rather
than asserted in advance.

## What is measured

The photo judgement gate was run before any product code depended on it, on
Chrome 158 in a Kaggle CPU session with five photos. Against the human answer
key: target present 2 of 5, defect type 1 of 5, severity 0 of 5, median 15,888 ms
per photo. The names returned (`someTarget`, `sensor_1`) had no relation to the
photo.

Two cloud calls in one session were measured on the free tier on 2026-11-23.
The first answered in 6,723 ms with a 370 byte request. The second, sent about a
minute later, ended in a 503 deadline after 179,710 ms with no answer. That is
why the app stops waiting after 30 s, records the failed check, and leaves the
item for a person or a retry. Photo judgement is therefore not part of the
on-device job: the device
structures the note, keeps the photo as evidence, and asks the inspector to
confirm what it shows. Numbers and the reproduction notebook are in
`docs/vision-gate.md`.

## Limits we state up front

- Clause texts paraphrase common public fire-safety expectations for small
  commercial buildings. They are reading aids, not legal advice, and the app
  does not present itself as an authority.
- The on-device model needs a desktop Chrome with the hardware for it. On a
  tablet without it, the same records are produced by the rule parser and the
  record says which layer did the work.
- A cloud answer can be wrong. That is why the gate exists, why rejections are
  shown, and why an unresolved item is signed off by a person.
- The daily budget is per device, not per building, because there is no server
  in this build.

## Repository layout

```
src/ai/          AI Logic models, shared schema, prompt text
src/config/      Firebase web config, Remote Config pack loader
src/rules/       rule pack, deterministic judge, note parser, cloud gate
src/storage/     IndexedDB capture queue and record store
src/budget.ts    daily cloud budget meter
src/ledger.ts    ledger rows, CSV, summary, printable report model
src/pipeline.ts  one item through the boundary, with injected model calls
src/demo.ts      the ten step sample walkthrough
src/main.ts      the screen
fixtures/        ten photos with licences and a human answer key
scripts/         repository checks and the Remote Config template
probe/           the AI Logic and vision gate probes
docs/            the vision gate measurement
```

## Licence

Apache-2.0 for the code. The photos in `fixtures/` keep their own licences,
listed in `fixtures/README.md`.
