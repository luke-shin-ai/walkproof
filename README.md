# WalkProof

Monthly building safety walkthrough for the person who has no safety officer.
A manager walks the building with a phone, photographs each checklist item and
writes one line. The device structures that line and the rule pack decides.
Only an item the device could not settle, on a line that says what the inspector
saw, goes to the cloud, as a typed summary, inside a daily budget. There the
cloud may name the defect the device could not place. That answer is checked on
the device against the line and the pack, and the rule pack, not the model, turns
it into pass, fail or review.

Built for the Firebase AI Logic hybrid hackathon (Web/Chrome). In a build with
Firebase values the on-device path uses Gemini Nano through `firebase/ai`, and
the published build reaches the same model through the browser's own
`LanguageModel` API, so a reviewer with no key still gets the device path. The
cloud path is `gemini-4-hydrogen` through the same SDK, with the same finding
schema plus a clause id and a remedy.

- Live app: https://luke-shin-ai.github.io/walkproof/
- Forty observation measurement: https://luke-shin-ai.github.io/walkproof/bench/

## What each judged criterion can be checked against

The four judging criteria are Technological Implementation, Design, Potential
Impact and Quality of the Idea. Each one maps to something in this repository
that can be read or run, not believed.

- Technological Implementation: one finding schema is produced on the device and
  requested from the cloud (`src/ai/schema.ts`), both paths go through Firebase AI
  Logic (`ONLY_ON_DEVICE` and `ONLY_IN_CLOUD`, `src/ai/hybrid.ts`), and every
  cloud answer passes seven checks on the device before the rule pack turns it
  into a verdict (`src/rules/verify.ts`). `npm test` runs those checks.
- Design: a checklist, a ledger with a source badge per record, CSV export and a
  printable record with clauses and deadlines. The header and the footer say what
  this build is actually running, including the published build with no cloud.
- Potential Impact: small commercial buildings rarely have a safety officer. The
  walk happens on the manager's phone, interior photos stay in the building, and a
  person signs off what the app could not settle.
- Quality of the Idea: the device decides and the cloud only proposes. A model
  may supply a finding the device could not place; the rule pack still turns that
  finding into a verdict, and a refused cloud answer is shown as refused.

## The strong hybrid, 2026-11-24

Until this change the cloud could add a clause and a remedy to an open item, and
the gate made sure it could not turn a hedge into a verdict. The recorded run of
2026-11-23 showed the limit of that design: none of twenty cloud answers changed
a verdict, because an accepted answer was only ever added to an item the device
had already left open.

Now the cloud may supply the missing piece. Two kinds of item are sent, and both
carry a decisive line:

- the rule pack read the line and left the item open (`hold: none`), or
- the device's own reading did not survive the check against the line
  (`hold: misread`), so the device has no finding to decide with.

An answer that passes all seven checks becomes the finding the record carries,
and the rule pack on the device turns that finding into pass, fail or review
(`src/pipeline.ts`). The record shows `source: in_cloud` and the cloud row says
whether the pack settled the item. A line that says the observer could not tell
is still never sent, and the cloud still never receives a photo.

Where the line supports a change, the device narrows the answer before the pack
judges it, using the same cross check it applies to its own reading. A cloud that
names a defect without a severity gets the severity the line's own words carry. A
cloud that claims an absence the line does not state is refused.

The ten cloud path notes (`?set=open` on the bench page, `src/bench/scenarios.ts`)
were written for this path: each is decisive, each names the defect and scores it
down from one quiet word (`small`, `slight`), and the rule parser leaves all ten
open. The human key says fail on eight and review on two. That set is what the
next run measures, and until it runs the README makes no claim about how often
the cloud gets it right.

## Measured on 2026-11-23

Forty observations (ten checklist items, four each: pass, fail, borderline,
trap) were pushed through the on-device path and the shipped hybrid on a free 4
core CPU session in Chrome 158, with Gemini Nano running on the CPU. Then ten
more notes, written separately and in other words, went through the device path.
Raw result: `benchmarks/results-kaggle-2026-11-23.json`; the session's own table
is kept in `benchmarks/raw-d5-2026-11-23.txt`.

The hybrid column below was measured with `gemini-3.5-flash-lite`, the app's one
fallback, because the `gemini-4-hydrogen` daily free quota had already been spent
earlier that day. The bench page prints the model that answered beside the run.
Both arms ran in one session on the same forty notes.

| | on-device | hybrid | ten held-out notes |
|---|---|---|---|
| items | 40 | 40 | 10 |
| agreement with the human key | 38 (95%) | 36 (90%) | 8 (80%) |
| agreement of the model answer alone | 29 (73%) | 28 (70%) | 7 (70%) |
| items the line left open and the device held | 19 | 19 | 5 |
| items the device amended from the line | 2 | 4 | 0 |
| review items that were settled anyway | 0 of 20 | 0 of 20 | 1 of 7 |
| total time | 550.2 s | 575.6 s | 138.7 s |
| median latency | 13,694 ms | 14,433 ms | 13,649 ms |
| cloud calls | 0 | 20 | 0 |
| photo bytes to the cloud | 0 | 0 | 0 |
| request bytes to the cloud | 0 | 7,595 | 0 |
| cloud answers the gate refused | n/a | 7 | n/a |

The same answers scored 24 of 40 an hour earlier that day, before the device read
the inspector's line: `tests/d5-regression.test.ts` replays those answers through
the shipped decision and gets 40 of 40, which is a ceiling for that set and not
a claim about the product. That earlier run is kept as
`benchmarks/results-kaggle-d4-2026-11-23.json`.

In the recorded run the device arm missed two expected passes (S33, S37), both
recorded as review, on the cautious side. The hybrid arm differed on four items:
S18 recorded pass where the key says fail, S33 recorded fail where the key says
pass, and S37 and S38 were left to a person. S18 and S33 carry `source: on_device`
in both arms, so the two runs read the same line differently; the cloud was not
the cause, and the bench page shows both rows side by side. That run to run
variation is why a single hybrid number is not enough to compare the two paths.

None of the twenty cloud answers changed a verdict. Thirteen were accepted: ten
on items whose line the device had already left to a person, three on items the
rule pack left open. Each accepted answer added a clause id and a remedy and the
item stayed open. Seven were refused, every one of them for turning a hedge into
a verdict. On this set the measured value of the cloud is the clause and the
remedy, not accuracy: it did not make a record more right, and the gate is what
kept it from making a record wrong.

Since that run the cloud rule has been narrowed twice. An item the device already
left to a person because the line was uncertain is no longer sent at all, so the
day's twenty calls go to items with a decisive line. And an accepted answer can
now become the finding the pack judges, as described above. The recorded numbers
stay as they were measured; the next run measures both changes
(`benchmarks/recheck-2026-11-24.md`).

The ten held-out notes show where the word list stops: a hedge phrased without
one of its words still gets settled, and H03, a failure written as "cover is off
the board", came back as unknown and was left to a person rather than recorded as
nothing wrong.

The earlier run of the same day also measured a cloud only baseline of six items
(6 of 6, 535,758 photo bytes). It is not repeated here: the free tier allows 20
requests per model per day and this run spent them on the hybrid.

## Status

D1 to D5 of the build plan are in place (2026-11-23).

- Field capture with photo, one line note and an IndexedDB queue.
- Note structuring on the device, through `firebase/ai` in a configured build
  or the browser's own `LanguageModel` in the published one, with the built-in
  rule parser as the fallback when the device has neither.
- Deterministic verdicts (`pass`, `fail`, `unknown`) and fix deadlines from the
  rule pack.
- Cloud escalation for items the device could not settle on a decisive line, behind
  a daily budget meter: the pack left the item open, or the device's reading did
  not survive the check against the line. An item whose line says the observer
  could not tell is recorded without a cloud call.
- An accepted cloud answer becomes the finding the rule pack judges, so the cloud
  can settle an item at pass or fail and the record shows `in_cloud`.
- The device reads the inspector's line itself and checks every answer against
  it: an absence claim the line does not make, a defect with no severity, or a
  verdict on a line that says the observer could not tell is amended or left
  open (`src/rules/evidence.ts`).
- On-device verification of every cloud answer, with `rejected_unsupported`
  for anything that fails a check, including an answer that turns a hedge into
  a verdict.
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
| a defect type the device could not place, and the remedy | cloud, typed text only | the device does not carry the whole code book; the answer is only evidence until the pack judges it |
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
| check the answer | `src/rules/evidence.ts` | reads the line and narrows what an answer may claim: the line's own hedge, absence the line does not state, a defect with no severity |
| judge | `src/rules/judge.ts` | the only code that produces a verdict, with the deadline from the item |
| G2 budget | `src/budget.ts` | a call is made only while today has room; a full meter leaves the item queued |
| cloud | `src/ai/hybrid.ts` | `ONLY_IN_CLOUD` with `gemini-4-hydrogen` and `responseSchema`; a missing model falls back once to `gemini-3.5-flash-lite`, the ledger shows the model that answered, and a call that has not answered in 30 s is recorded as a failed check so the walk can continue. Only an item with a decisive line reaches this step, and the payload says whether the pack left the item open or the device's own reading failed |
| G3 gate | `src/rules/verify.ts` | seven checks: schema, clause exists, clause applies, no contradiction with a trusted device finding, the pack agrees with the suggested verdict, no hedge turned into a verdict, and the line carries the finding |
| settle | `src/pipeline.ts` | an accepted answer becomes the recorded finding; `judge()` on the device turns it into pass, fail or review, and the record says `in_cloud` |
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
npm test                  # 108 tests
npm run build             # type check, then the Vite build
npm run check:ai-tells    # fails on machine looking punctuation and on secrets

npm run build:pages       # public build with no env file, so no key can be baked in
npm run check:pages       # fails if the public build carries a key or an identifier
```

With no Firebase values the app still runs: the built-in pack is used, cloud
checks are off, and notes are structured by the browser's own on-device model
where Chrome has one or by the rule parser where it does not. The footer says
which of those the page is doing. That is also the state of the public sample
build, which takes the Firebase web config at runtime from the URL fragment
(`#config=<base64url json>`) so this repository never carries the values.

## Sample walkthrough

Press "Load the sample walkthrough". Ten steps load a licensed photo and a line
of inspector text each, then run the real pipeline. On a browser with the
on-device model the note is structured there; without it the rule parser does
the work and the record says so. A browser that has the model but has not
downloaded it yet shows `device model: press prepare` in the header, and one
press of "Prepare on-device model" fetches it once for every later visit. One line is deliberately unclear (`sp-10`, "not
sure whether that is allowed"), so it goes to a person without a cloud call and
without spending budget. One line is decisive but leaves the rule pack below its
fail threshold (`sd-08`, a thin coat of paint on a detector), so a configured
build makes a real cloud call for it. If the answer holds up, the clause and the
remedy are added; if it names a severity the pack can fail, the record settles at
fail and shows `in_cloud` beside the source.

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
4. it contradicts a device finding the device still trusts about whether the item
   was present,
5. the rule pack, run on the cloud's own finding, reaches a different verdict
   than the one the cloud suggested,
6. it settles an item at pass or fail while the line says the observation was
   not conclusive,
7. the line does not carry the finding. The same cross check the device applies
   to its own reading is applied to the answer: an absence claim the line does
   not make, or a defect with no severity that the line does not name, is
   refused.

All seven run in the product path and every one is exercised by
`tests/verify.test.ts`. A guard sits beside them: an answer may not replace a
settled on-device verdict. The app never sends a settled item to the cloud, so
only a caller or a test that asks about one reaches that guard.

When all seven pass, the device narrows the answer from the line where the line
supports it and the rule pack judges the result. The finding that is recorded is
the one the verdict came from, so a record cannot carry an answer the pack did
not use.

Rejections are counted and shown. In the measured run of 2026-11-23 the gate
refused 7 of the 20 cloud answers, every one of them for turning a hedge into a
verdict; an hour earlier, with the same model and no check against the line, it
refused none. The sample walkthrough reports the number per walk rather than
asserting it.

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
- The on-device model needs a desktop Chrome with the hardware for it. The
  published build reaches it through the browser's own `LanguageModel` API and a
  configured build through `firebase/ai`. On a tablet without it, the same
  records are produced by the rule parser and the record says which layer did
  the work.
- The cross check reads words, not meaning. It catches the hedges an inspector
  actually writes (not sure, cannot tell, unclear, maybe, no idea) and misses a
  guess phrased another way: in the ten held-out notes it held 5 of the 7 open
  cases. A model side hedge flag is the next step, not more words in the list.
- A missed defect is a different failure from an over-claimed one. In the hybrid
  run the model read "two pallets of stock left in front of the exit door" as
  nothing wrong and the record said pass; in the device run of the same forty
  notes the same line was read as fail. Both answers came from the on-device
  model, so the difference is run to run variation, not the cloud. A single
  measured run is not enough to rank the two paths.
- A cloud answer can be wrong. That is why the gate exists, why rejections are
  shown, and why an unresolved item is signed off by a person. The gate can tell
  that an answer is inconsistent with the pack and the line; it cannot tell that
  a painted rim is harmless while the bulb is clear. Oversettling is the failure
to watch in the cloud path set.
- A decisive failure the word list misses is still recorded as pass and never
  reaches the cloud, because the device's settled verdict is not overridden. H03
  is that case: "cover is off the board" is not in the parser's vocabulary, so the
  parser reads no defect. The cloud path starts where the device stops, not
  where it goes wrong.
- The daily budget is per device, not per building, because there is no server
  in this build.

## Repository layout

```
src/ai/          AI Logic models, shared schema, prompt text
src/config/      Firebase web config, Remote Config pack loader
src/rules/       rule pack, deterministic judge, note parser, answer check, cloud gate
src/storage/     IndexedDB capture queue and record store
src/budget.ts    daily cloud budget meter
src/ledger.ts    ledger rows, CSV, summary, printable report model
src/pipeline.ts  one item through the boundary, with injected model calls
src/demo.ts      the ten step sample walkthrough
src/main.ts      the screen
benchmarks/      the measured runs and the session table they came from
fixtures/        ten photos with licences and a human answer key
scripts/         repository checks, the Remote Config template, the result assembler
probe/           the AI Logic and vision gate probes
docs/            the vision gate measurement
```

## Licence

Apache-2.0 for the code. The photos in `fixtures/` keep their own licences,
listed in `fixtures/README.md`.
