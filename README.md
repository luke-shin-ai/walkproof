# WalkProof

Monthly building safety walkthrough for the person who has no safety officer.
A manager walks the building with a phone, photographs each checklist item and
writes one line. The device structures that line and the rule pack decides.
Only an item the device could not settle, on a line that says what the inspector
saw, goes to the cloud, as a typed summary, inside a daily budget. There the
cloud may name the defect the device could not place. That answer is checked on
the device against the line and the pack, and the rule pack, not the model, turns
it into pass, fail or review.

Built for the Firebase AI Logic hybrid hackathon, Web/Chrome category, which
asks for Gemini Nano 4 through Firebase AI Logic. A build made with Firebase
values calls `firebase/ai` with `ONLY_ON_DEVICE` for the note and
`ONLY_IN_CLOUD` for the cloud answer, with App Check started through reCAPTCHA
Enterprise. The published page carries no Firebase project on purpose, so the
same device job runs there through the browser's own `LanguageModel` API and no
answer leaves the browser. The section "Firebase AI Logic at runtime and App
Check" says where each call sits in the code and how to run that build.

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

## Firebase AI Logic at runtime and App Check

The rules ask for Firebase AI Logic to be imported and called at runtime, not
only named in a README, and Firebase AI Logic requires App Check. Both are in
the product code, not only in the prose:

- `src/ai/hybrid.ts` imports `getAI`, `getGenerativeModel`, `GoogleAIBackend`
  and `InferenceMode` from `firebase/ai`. `buildDeviceModel()` asks for
  `ONLY_ON_DEVICE` with the shared finding schema as its response constraint,
  `buildCloudModel()` asks for `ONLY_IN_CLOUD` with `gemini-4-hydrogen` and the
  cloud answer schema, and `classifyWithCloud()` awaits `generateContent()` and
  records the `inferenceSource` the SDK reports for the answer.
- `src/config/firebase.ts` starts App Check with `ReCaptchaEnterpriseProvider`
  before the first call, and the screen shows whether it started or why not.
- `src/config/remoteConfig.ts` reads the rule pack from Remote Config.

The published page does not call AI Logic because AI Logic needs a Firebase
project, and the rules forbid carrying production API keys or live project
secrets in the repository, the submission form or the testing instructions. The
published build therefore takes a web config only at runtime, from the URL
fragment, and runs the device job on the browser's own model. What a reviewer
reads in the code is what a configured build runs.

To run this page with AI Logic and App Check:

```bash
npm install
cp .env.example .env      # VITE_FIREBASE_* values for a Firebase project
# VITE_RECAPTCHA_SITE_KEY: the reCAPTCHA Enterprise site key for this domain
# VITE_APPCHECK_DEBUG_TOKEN: a debug token from App Check > Apps > Manage debug tokens
npm run dev
```

On that build the header reads `on-device model ready (firebase/ai)` and
`app check: on`, the detail on each badge says which route and provider are in
use, the footer names the config source, and every cloud record states the
inference source the SDK reported.

App Check starts in one of two ways. With a reCAPTCHA Enterprise site key it uses
`ReCaptchaEnterpriseProvider`. With only a debug token it runs on that token,
which is the route the rules accept in a submission, and the badge says so. With
neither it is not started and the badge reads `app check: off` with the reason.
There is no placeholder key, so a broken App Check setup cannot look healthy.

`scripts/read-configured-build.py` serves a build made this way, runs the sample
walkthrough and prints the badges, the layer that structured each record and the
console errors, which is how the check below was made.

Checked on 2026-11-25 with a local build from these values: the header read
`app check: on`, the sample walkthrough's one cloud record came back as
`gemini-4-hydrogen` with `inference source in_cloud`, 472 bytes of typed summary
and 0 photo bytes, and every record named the layer that structured it. The
on-device model was not available in that headless session, so the same run also
shows the fallback the records use when it is absent.

The on-device model needs a Chrome build and hardware that carry Gemini Nano.
Where it is missing, the record says `Rule parser` and the page still records
every item.

## Firebase project quota

The hackathon offers a free Google account quota for billing-required models
through a form, in three sprints, and the last request window closes on
2026-11-25 at 10:00 PT, which is 2026-11-26 03:00 KST. This project does not
depend on it: the on-device model
and the free tier carry every path measured here, and the published page makes
no cloud call at all. The measured runs did spend the free daily quota of
`gemini-4-hydrogen` (20 requests per model per day), which is why one earlier
run fell back to `gemini-3.5-flash-lite`.

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
judges it, using the same cross check it applies to its own reading. A defect
without a severity gets the severity the line's own words carry, and an absence
claim is dropped when the line names a defect the device can record. A claim the
line cannot carry at all is refused, and the item goes to a person.

The ten cloud path notes (`?set=open` on the bench page, `src/bench/scenarios.ts`)
were written for this path: each is decisive, each names the defect and scores it
down from one quiet word (`small`, `slight`), and the rule parser leaves all ten
open. The human key says fail on eight and review on two. That set was measured
on 2026-11-25, in the section below.

## Measured on 2026-11-25 (KST)

The forty observations, the ten held-out notes and the ten cloud path notes were
measured again on the shipped build, this time with `gemini-4-hydrogen`, and the
forty item arms ran twice in one session so the spread of an arm against itself
is a measured number. The session ran in the morning of 2026-11-25 KST; the
result file stamps it `2026-11-24T22:59:02Z`, which is the same moment in UTC.
Raw result: `benchmarks/results-kaggle-2026-11-25.json`, the session's own table
in `benchmarks/raw-d6-2026-11-25.txt`.

The answer key is the entrant's own reading, written down before the model ran
(`fixtures/ground-truth.json`). It is not an independent assessor's key, which
is why the two passes are reported side by side instead of one headline number.
Every count below is read from the result file, and `benchmarks/README.md` gives
the commands that reproduce the run.

| | on-device | hybrid | ten held-out notes | ten cloud path notes, device | ten cloud path notes, hybrid |
|---|---|---|---|---|---|
| items | 40 | 40 | 10 | 10 | 10 |
| agreement with the human key | 34 (85%) | 40 (100%) | 8 (80%) | 7 (70%) | 10 (100%) |
| agreement of the model answer alone | 27 (68%) | 28 (70%) | 7 (70%) | 7 (70%) | 6 (60%) |
| items the line left open and the device held | 22 | 20 | 6 | 0 | 0 |
| items the device amended from the line | 3 | 4 | 0 | 1 | 3 |
| review items that were settled anyway | 0 of 20 | 0 of 20 | 1 of 7 | 0 of 2 | 0 of 2 |
| total time | 613.5 s | 615.7 s | 154.7 s | 156.8 s | 198.8 s |
| median latency | 15,321 ms | 15,277 ms | 15,418 ms | 15,613 ms | 20,559 ms |
| cloud calls | 0 | 2 | 0 | 0 | 6 |
| cloud answers the gate refused | n/a | 1 | n/a | n/a | 0 |
| items the cloud settled, and how many of those matched the key | n/a | 1 of 1 | n/a | n/a | 4 of 4 |
| photo bytes to the cloud | 0 | 0 | 0 | 0 | 0 |
| request bytes to the cloud | 0 | 943 | 0 | 0 | 2,904 |

Both product arms recorded 0 photo bytes, and the table above is what they
measured. The only run in this repository that sent photos is the cloud only
baseline of 2026-11-23, kept as a comparison, described above and in the
"earlier run" section.

The second pass of the same forty notes, in the same session, agreed with the key
on 37 of 40 on the device and 38 of 40 through the hybrid. Between its two passes
the device arm recorded a different verdict on 7 of 40 items (S01, S06, S10, S21,
S22, S25, S34) and the hybrid on 2 of 40 (S22, S38). One arm moving seven items
is wider than the gap between the two arms, so a single run cannot rank the two
paths. What the two passes do show is that the hybrid was no further from the key
than the device in the same session, 40 against 34 and then 38 against 37.

The cloud was asked two times in the first pass and five times in the second, not
twenty: the narrowed rule sends only an item the rules left open on a decisive
line. In the first pass S22 was accepted and settled to fail, which is the key,
while the device alone left it at review; S27 was refused because the answer
contradicted the on-device finding. In the second pass S09 and S29 were accepted
and settled to pass, S22 and S27 were refused, and S38 lost its call to the 30 s
limit and was recorded at review. So the one item the cloud gained in the first
pass was not gained in the second, and the record never moved further than the
evidence: four refusals and one timeout in the session, no settled review item
that the key calls review, and no photo sent.

On the ten cloud path notes the device alone recorded 7 of 10 (O01 and O07 at
review, O03 at pass, where the key says fail). The hybrid recorded 10 of 10 with
six calls: four answers were accepted and settled the item, and all four matched
the key. The two control notes, O09 and O10, are the ones where a confident cloud
answer would over-claim: both answers were accepted as findings, and the pack
still recorded review on both, as the key says, so neither was settled.

Across the session the cloud made 13 calls and the gate refused 4 answers. The
typed summaries came to 6,282 bytes and no photo byte left the browser.

## Reproduce a measured run

```bash
npm run dev            # then open http://localhost:5173/bench/
npm run build:pages    # the published build, then npm run check:pages
```

The bench page runs the same code a configured build runs. Press "Run the
measurement" with a Firebase config in the URL fragment; the on-device arm needs
a Chrome that carries Gemini Nano and a click to start its download. In a Kaggle
CPU session, `bench/kaggle_runner.py` does the same steps with Xvfb, Chrome and
Selenium and prints the table: set `BASE`, `CFG`, `MODE` (`all`, `heldout` or
`layout`), `REPEAT=1` for a second pass of the same arms and `OPEN=1` for the
cloud path notes. `bench/kaggle_layout_check.py` reads the two pages at 1440 px
and at 390 by 844 alone.

`scripts/assemble-d5.mjs` rebuilds the 2026-11-23 result file from the table the
session printed and refuses to write it when a recomputed count disagrees with
that table, so the file is a copy of the run's numbers and not a retyping. The
2026-11-25 file is the one the session itself wrote, and the raw table beside it
was rebuilt from that file because the session log could not be exported in
full. `benchmarks/README.md` says which file is which.

## The earlier run, 2026-11-23 (KST)

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
stay as they were measured. The next run measured both changes, and it is the
section above.

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

In the product paths, device and hybrid, the photo is never sent to a model or
a server. `src/photo.ts` re-encodes it through a canvas before it is stored,
which drops EXIF and GPS, and it refuses two cases instead of storing them: a
file with no bytes, and a file this device cannot decode and re-encode, because
the original would still carry its EXIF location. The cloud request is JSON that
names the item and the allowed clause ids. The note is reduced to the structured
finding plus a redacted line (`src/rules/structure.ts`): an email address, a
phone-like or long number, and any capitalised word outside the safety
vocabulary become `[email]`, `[number]` and `[name]`. That is a filter, not
anonymisation, and the limits section says where it stops.

The one experiment that sent photos is the cloud only baseline of 2026-11-23
(six items, 535,758 photo bytes,
`benchmarks/results-kaggle-d4-2026-11-23.json`). It exists to compare the
product with a naive design, only the bench page's cloud only arm runs it, and
the page keeps it apart from the two measured product paths, which record 0
photo bytes.

## The boundary, step by step

| step | code | what it does |
|---|---|---|
| G6 capture | `src/storage/queue.ts` | the photo and note are written to IndexedDB before any model work, so a closed tab does not lose the record |
| G4 structure | `src/rules/structure.ts`, `src/ai/hybrid.ts` | Gemini Nano through `firebase/ai` in a configured build, or the browser's `LanguageModel` in the published one, turns the note into one shared finding schema; the built-in rule parser does it when no model answers |
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
npm test                  # 114 tests
npm run build             # type check, then the Vite build
npm run check:ai-tells    # fails on machine looking punctuation and on secrets

npm run build:pages       # public build with no env file, so no key can be baked in
npm run check:pages       # fails if the public build carries a key or an identifier
```

A build made with Firebase values takes `VITE_RECAPTCHA_SITE_KEY` for App Check
(the provider is reCAPTCHA Enterprise) and, for a reviewer's browser,
`VITE_APPCHECK_DEBUG_TOKEN`; with neither, App Check stays off and the header
says so. The footer names the config source.

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
only a caller or a test that asks about one reaches that guard. The record also
carries the inference source the SDK reported for the call, so a reader can see
that the answer came back through AI Logic in the cloud.

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
Chrome 158 in a Kaggle CPU session with five photos. Like the cloud only
baseline, that gate is a measurement and not a product path: it sent five photos
to a model to find out whether photo judgement was good enough, it was not, and
that result is why the product keeps the photo on the device. Against the human answer
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
  guess phrased another way: in the ten held-out notes of 2026-11-25 it held 6 of
  the 7 open cases. A model side hedge flag is the next step, not more words in
  the list.
- A missed defect is a different failure from an over-claimed one. In the
  2026-11-23 run the model read "two pallets of stock left in front of the exit
  door" as nothing wrong and the record said pass; in the device run of the same
  forty notes the same line was read as fail. Both answers came from the
  on-device model, so the difference is run to run variation, not the cloud. The
  2026-11-25 run put a number on that variation: the same arm recorded a different
  verdict on 7 of the 40 items between two passes, so a single measured run is not
  enough to rank the two paths.
- A cloud answer can be wrong. That is why the gate exists, why rejections are
  shown, and why an unresolved item is signed off by a person. The gate can tell
  that an answer is inconsistent with the pack and the line; it cannot tell that
  a painted rim is harmless while the bulb is clear. Oversettling is the failure
  to watch in the cloud path set, and the two control notes of that set (O09, O10)
  were both recorded at review in the 2026-11-25 run, which is the key.
- A decisive failure the word list misses is still recorded as pass and never
  reaches the cloud, because the device's settled verdict is not overridden. H03
  is that case: "cover is off the board" is not in the parser's vocabulary, so the
  parser reads no defect. The cloud path starts where the device stops, not
  where it goes wrong.
- The line sent to the cloud is filtered, not anonymised: an email address, a
  phone-like or long number and a capitalised word outside the safety vocabulary
  are replaced, but a name written in lower case, a place named without a
  capital, or a proper noun at the start of a sentence can go through. The sample
  lines carry no names. A deployment that needs more should replace the filter
  with a reviewed allow list rather than trust the words in this one.
- A photo this device cannot decode and re-encode is refused, not stored, so the
  item is recorded without a photo and the record says the photo has no bytes or
  could not be re-encoded. Keeping the original would keep its EXIF location.
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
