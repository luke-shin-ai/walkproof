# WalkProof

Monthly building safety walkthrough for the person who has no safety officer.
A manager walks the building with a phone, photographs each checklist item, and
writes one line. The judgement happens on the device. The cloud is asked only
about the items the device cannot answer, and only after the photo has been
reduced to a typed summary.

This repository is at day zero: the skeleton, the rule layer, the shared schema
and the measurement fixtures. The screen flow is real but thin. Everything that
claims a number is measured; see `docs/vision-gate.md`.

## Why hybrid

| data | where it runs | why |
|---|---|---|
| photo, note, location | device only | basement and stair core have no signal; interior photos stay in the building |
| verdict pass / fail / unknown | local rules | the same photo and rule pack must give the same answer every time |
| checklist and clause pack | fetched, cached locally | a clause change reaches every device without a release |
| defect wording for an unclear item | cloud, typed text only | the device does not carry the whole code book |
| per building repeat defects | later, anonymous counts | one device cannot see across buildings |

The model supplies evidence. `src/rules/pack.ts` is the only code that turns
evidence into a verdict, so a cloud answer cannot overrule the rule pack.

## Run it

```bash
npm install
cp .env.example .env      # fill the Firebase web app values
npm run dev
npm run check:ai-tells    # fails on machine looking punctuation and on secrets
```

`npm run build` runs the type check first, then the Vite build.

## On-device path

The web build uses `firebase/ai` with `InferenceMode.ONLY_ON_DEVICE` for photo
items, so a device without the on-device model fails closed instead of sending
the photo to the cloud. `initializeDeviceModel` is called from a button press, as
Chrome requires. The one schema object in `src/ai/schema.ts` is passed to both
paths: `onDeviceParams.promptOptions.responseConstraint` and
`inCloudParams.generationConfig.responseSchema`.

Image input is accepted by Chrome 158 without any flag, but the answers measured
on 2026-11-23 did not match the photos: five inspection shots produced generic
labels such as `someTarget` and `sensor_1`, with 2 of 5 target presence calls
correct. Photo judgement is therefore not part of the on-device job. The device
structures the inspector's line note, keeps the photo, and asks for a human
confirmation. Numbers and the reproduction notebook: `docs/vision-gate.md`.

## Repository layout

```
src/ai/          Firebase AI Logic setup, prompt, shared schema
src/rules/       rule pack and the deterministic judge
src/storage/     IndexedDB queue and local result store
src/ledger.ts    per item source ledger and CSV export
fixtures/        five photos with licences and a human written answer key
scripts/         repository checks
```

## Licence

Apache-2.0 for the code. The photos in `fixtures/` keep their own licences,
listed in `fixtures/README.md`.
