/**
 * The 40 item set used for the D4 measurement.
 *
 * Ten checklist items from the shipped rule pack, four observations each: a
 * clean pass, a clear failure, a borderline case that a person has to settle,
 * and a trap where the line reads as two different things at once. The photo is
 * always one of the ten licensed fixtures and the typed line carries the state,
 * because that is what the product does: the photo is evidence kept on the
 * device and the line is what the model reads (docs/vision-gate.md).
 *
 * `expected` is what a careful human wrote down before any model ran. It is the
 * scoring baseline for this set only, not a claim about the product in general.
 */

export type BenchKind = "pass" | "fail" | "borderline" | "trap";
export type BenchExpected = "pass" | "fail" | "review";

export interface BenchScenario {
  id: string;
  itemId: string;
  kind: BenchKind;
  expected: BenchExpected;
  note: string;
  photo: string;
}

export const BENCH_SCENARIOS: BenchScenario[] = [
  // fe-01  Fire extinguisher in its marked cabinet
  {
    id: "S01",
    itemId: "fe-01",
    kind: "pass",
    expected: "pass",
    note: "Cabinet glass intact, gauge in the green, tag dated this month.",
    photo: "extinguisher.jpg",
  },
  {
    id: "S02",
    itemId: "fe-01",
    kind: "fail",
    expected: "fail",
    note: "Cabinet empty, the extinguisher was taken away last month and never replaced.",
    photo: "extinguisher.jpg",
  },
  {
    id: "S03",
    itemId: "fe-01",
    kind: "borderline",
    expected: "review",
    note: "Gauge is hard to read behind the scratched plastic, maybe just under the green.",
    photo: "extinguisher.jpg",
  },
  {
    id: "S04",
    itemId: "fe-01",
    kind: "trap",
    expected: "review",
    note: "Extinguisher is there but the service tag is torn, cannot tell the last service date.",
    photo: "extinguisher.jpg",
  },

  // ex-02  Illuminated exit sign above the door
  {
    id: "S05",
    itemId: "ex-02",
    kind: "pass",
    expected: "pass",
    note: "Sign lit and readable from the corridor.",
    photo: "exit-sign.jpg",
  },
  {
    id: "S06",
    itemId: "ex-02",
    kind: "fail",
    expected: "fail",
    note: "Sign is dead, no light at all above the door.",
    photo: "exit-sign.jpg",
  },
  {
    id: "S07",
    itemId: "ex-02",
    kind: "borderline",
    expected: "review",
    note: "The sign lights up but the legend is unclear from where I stood.",
    photo: "exit-sign.jpg",
  },
  {
    id: "S08",
    itemId: "ex-02",
    kind: "trap",
    expected: "review",
    note: "Sign flickers when the corridor lights come on, not sure whether the battery is failing.",
    photo: "exit-sign.jpg",
  },

  // el-03  Distribution board closed and covered
  {
    id: "S09",
    itemId: "el-03",
    kind: "pass",
    expected: "pass",
    note: "Board closed, cover screwed on, space in front clear.",
    photo: "panel.jpg",
  },
  {
    id: "S10",
    itemId: "el-03",
    kind: "fail",
    expected: "fail",
    note: "Front cover removed and live busbars exposed while the cleaner worked.",
    photo: "panel.jpg",
  },
  {
    id: "S11",
    itemId: "el-03",
    kind: "borderline",
    expected: "review",
    note: "Cover sits slightly proud of the frame, cannot tell whether the latch is engaged.",
    photo: "panel.jpg",
  },
  {
    id: "S12",
    itemId: "el-03",
    kind: "trap",
    expected: "review",
    note: "Board hums loudly and the cover feels warm, no marks on the casing, not sure if that is normal.",
    photo: "panel.jpg",
  },

  // st-04  Wall and soffit surfaces free of cracks
  {
    id: "S13",
    itemId: "st-04",
    kind: "pass",
    expected: "pass",
    note: "Wall and soffit plastered and painted last month, surface sound.",
    photo: "crack.jpg",
  },
  {
    id: "S14",
    itemId: "st-04",
    kind: "fail",
    expected: "fail",
    note: "Crack wider than my thumb with the face spalling and reinforcement showing.",
    photo: "crack.jpg",
  },
  {
    id: "S15",
    itemId: "st-04",
    kind: "borderline",
    expected: "review",
    note: "Soffit too dark to see above the stair landing, the step sits in shadow.",
    photo: "crack.jpg",
  },
  {
    id: "S16",
    itemId: "st-04",
    kind: "trap",
    expected: "review",
    note: "Line on the soffit is either settlement or a shadow from the beam, cannot tell from the stair.",
    photo: "crack.jpg",
  },

  // eg-05  Escape route clear of stored goods
  {
    id: "S17",
    itemId: "eg-05",
    kind: "pass",
    expected: "pass",
    note: "Route to the rear exit clear, nothing stored on the floor.",
    photo: "blocked-exit.jpg",
  },
  {
    id: "S18",
    itemId: "eg-05",
    kind: "fail",
    expected: "fail",
    note: "Two pallets of stock left in front of the exit door after the delivery.",
    photo: "blocked-exit.jpg",
  },
  {
    id: "S19",
    itemId: "eg-05",
    kind: "borderline",
    expected: "review",
    note: "A trolley stands beside the door but not across it, no idea whether it counts.",
    photo: "blocked-exit.jpg",
  },
  {
    id: "S20",
    itemId: "eg-05",
    kind: "trap",
    expected: "review",
    note: "Door opens with a wedge under it, staff say the closer is tired, not sure whether that is a failure.",
    photo: "blocked-exit.jpg",
  },

  // fh-07  Hose reel in place, signed and free to turn
  {
    id: "S21",
    itemId: "fh-07",
    kind: "pass",
    expected: "pass",
    note: "Reel in place and signed, valve turns by hand.",
    photo: "hose-reel.jpg",
  },
  {
    id: "S22",
    itemId: "fh-07",
    kind: "fail",
    expected: "fail",
    note: "Reel is missing from the hose point, bracket empty since Friday.",
    photo: "hose-reel.jpg",
  },
  {
    id: "S23",
    itemId: "fh-07",
    kind: "borderline",
    expected: "review",
    note: "Reel in place but the valve is stiff, cannot tell whether it would turn in a hurry.",
    photo: "hose-reel.jpg",
  },
  {
    id: "S24",
    itemId: "fh-07",
    kind: "trap",
    expected: "review",
    note: "Reel there, the sign has faded to plain white, not sure if it still counts as signed.",
    photo: "hose-reel.jpg",
  },

  // sd-08  Smoke detector unobstructed and unpainted
  {
    id: "S25",
    itemId: "sd-08",
    kind: "pass",
    expected: "pass",
    note: "Detector clean, grille open, test light blinks.",
    photo: "smoke-detector.jpg",
  },
  {
    id: "S26",
    itemId: "sd-08",
    kind: "fail",
    expected: "fail",
    note: "Detector painted over during the refurbishment, the grille is sealed with paint.",
    photo: "smoke-detector.jpg",
  },
  {
    id: "S27",
    itemId: "sd-08",
    kind: "borderline",
    expected: "review",
    note: "Detector is high up and the angle hides the grille, cannot see the sensor face.",
    photo: "smoke-detector.jpg",
  },
  {
    id: "S28",
    itemId: "sd-08",
    kind: "trap",
    expected: "review",
    note: "Detector probably painted when the ceiling was done, not sure whether paint reached the sensor.",
    photo: "smoke-detector.jpg",
  },

  // fd-09  Fire shutter closes fully with its track clear
  {
    id: "S29",
    itemId: "fd-09",
    kind: "pass",
    expected: "pass",
    note: "Shutter closes fully, track clear, no load against the frame.",
    photo: "fire-door.jpg",
  },
  {
    id: "S30",
    itemId: "fd-09",
    kind: "fail",
    expected: "fail",
    note: "Pallets stacked against the shutter track so it cannot close.",
    photo: "fire-door.jpg",
  },
  {
    id: "S31",
    itemId: "fd-09",
    kind: "borderline",
    expected: "review",
    note: "Shutter drops but stops a hand's width above the floor, cannot tell whether that is by design.",
    photo: "fire-door.jpg",
  },
  {
    id: "S32",
    itemId: "fd-09",
    kind: "trap",
    expected: "review",
    note: "Shutter closes, someone taped a paper notice to the frame, not sure if that matters.",
    photo: "fire-door.jpg",
  },

  // sp-10  Sprinkler head free of paint and storage
  {
    id: "S33",
    itemId: "sp-10",
    kind: "pass",
    expected: "pass",
    note: "Head clear, cage intact, clearance below open.",
    photo: "sprinkler.jpg",
  },
  {
    id: "S34",
    itemId: "sp-10",
    kind: "fail",
    expected: "fail",
    note: "Sprinkler head and deflector have been painted over.",
    photo: "sprinkler.jpg",
  },
  {
    id: "S35",
    itemId: "sp-10",
    kind: "borderline",
    expected: "review",
    note: "Head is in a cage so the bulb is hard to see, cannot tell whether the bulb is intact.",
    photo: "sprinkler.jpg",
  },
  {
    id: "S36",
    itemId: "sp-10",
    kind: "trap",
    expected: "review",
    note: "Head looks painted on one side only, not sure whether the paint reached the bulb.",
    photo: "sprinkler.jpg",
  },

  // fe-11  Spare extinguisher kept indoors in its marked place
  {
    id: "S37",
    itemId: "fe-11",
    kind: "pass",
    expected: "pass",
    note: "Spare extinguisher in its marked indoor bracket, tag current.",
    photo: "extinguisher-cart.jpg",
  },
  {
    id: "S38",
    itemId: "fe-11",
    kind: "fail",
    expected: "fail",
    note: "Spare extinguisher left on the outdoor cart, housing weathered and the tag gone.",
    photo: "extinguisher-cart.jpg",
  },
  {
    id: "S39",
    itemId: "fe-11",
    kind: "borderline",
    expected: "review",
    note: "Spare extinguisher indoors but the bracket is loose, cannot tell whether it would hold.",
    photo: "extinguisher-cart.jpg",
  },
  {
    id: "S40",
    itemId: "fe-11",
    kind: "trap",
    expected: "review",
    note: "Spare cylinder sits in the yard store but not in a bracket, not sure whether the marked place counts.",
    photo: "extinguisher-cart.jpg",
  },
];

export function scenarioById(id: string): BenchScenario | undefined {
  return BENCH_SCENARIOS.find((scenario) => scenario.id === id);
}

/**
 * Ten more observations, one per checklist item, written on 2026-11-23 after the
 * forty and kept apart from them.
 *
 * They exist because the cross check in `src/rules/evidence.ts` was written from
 * the forty item failures, which makes 40 of 40 there a ceiling rather than a
 * claim. These notes ask for the same judgements in different words: four of the
 * six open cases use a phrase the rule layer does not know, so the set measures
 * how far a word list travels and whether the on-device model flags a guess it
 * was not told the word for. The expected verdicts were written before any model
 * ran and are not changed afterwards.
 */
export const HELDOUT_SCENARIOS: BenchScenario[] = [
  {
    id: "H01",
    itemId: "fe-01",
    kind: "borderline",
    expected: "review",
    note: "Gauge sits behind the scratched plastic, I think it is still in the green.",
    photo: "extinguisher.jpg",
  },
  {
    id: "H02",
    itemId: "ex-02",
    kind: "trap",
    expected: "review",
    note: "Sign seems to flicker when the corridor lights come on, I could not get a proper look from the stair.",
    photo: "exit-sign.jpg",
  },
  {
    id: "H03",
    itemId: "el-03",
    kind: "fail",
    expected: "fail",
    note: "Cover is off the board and the busbars are within reach.",
    photo: "panel.jpg",
  },
  {
    id: "H04",
    itemId: "st-04",
    kind: "borderline",
    expected: "review",
    note: "Hard to judge from the landing, the line on the soffit may be a shadow.",
    photo: "crack.jpg",
  },
  {
    id: "H05",
    itemId: "eg-05",
    kind: "pass",
    expected: "pass",
    note: "Exit route is clear, nothing stored on the floor.",
    photo: "blocked-exit.jpg",
  },
  {
    id: "H06",
    itemId: "sd-08",
    kind: "borderline",
    expected: "review",
    note: "Detector sits high behind a beam, so I could not tell whether paint reached it.",
    photo: "smoke-detector.jpg",
  },
  {
    id: "H07",
    itemId: "fh-07",
    kind: "trap",
    expected: "review",
    note: "Reel is there, but I am not sure the valve would turn in a hurry.",
    photo: "hose-reel.jpg",
  },
  {
    id: "H08",
    itemId: "fd-09",
    kind: "fail",
    expected: "fail",
    note: "Pallets are stacked in the shutter track again.",
    photo: "fire-door.jpg",
  },
  {
    id: "H09",
    itemId: "sp-10",
    kind: "borderline",
    expected: "review",
    note: "Head is inside a cage and the bulb is hard to judge from below.",
    photo: "sprinkler.jpg",
  },
  {
    id: "H10",
    itemId: "fe-11",
    kind: "trap",
    expected: "review",
    note: "Spare extinguisher is in the yard store, unclear whether that counts as the marked place.",
    photo: "extinguisher-cart.jpg",
  },
];

export function heldoutById(id: string): BenchScenario | undefined {
  return HELDOUT_SCENARIOS.find((scenario) => scenario.id === id);
}

/**
 * Ten notes written for the path the cloud is asked about, 2026-11-24.
 *
 * Every note here is decisive: nothing in it says the writer could not see or
 * could not tell, so the device may put it to the cloud. Each names the defect
 * and then scores it from one quiet word (`small`, `slight`, `hairline`) while
 * the rest of the line says the condition is on the part that matters. The rule
 * parser reads the quiet word and leaves the item open, which is exactly the
 * item the narrowed cloud rule was built for. A person writing the key said fail
 * on eight of them and review on two, and those two are the control: a cloud that
 * settles them has over-claimed, and the gate or the pack has to catch it.
 *
 * The key was written before any model ran on these notes.
 */
export const OPEN_SCENARIOS: BenchScenario[] = [
  {
    id: "O01",
    itemId: "sp-10",
    kind: "fail",
    expected: "fail",
    note: "Small patch of paint on the deflector, the bulb itself is under the paint.",
    photo: "sprinkler.jpg",
  },
  {
    id: "O02",
    itemId: "sd-08",
    kind: "fail",
    expected: "fail",
    note: "Small patch of paint on the casing, the grille is sealed with paint.",
    photo: "smoke-detector.jpg",
  },
  {
    id: "O03",
    itemId: "el-03",
    kind: "fail",
    expected: "fail",
    note: "Slightly corroded casing, the cover is held by one screw and lifts away.",
    photo: "panel.jpg",
  },
  {
    id: "O04",
    itemId: "fe-01",
    kind: "fail",
    expected: "fail",
    note: "Small dent in the cabinet door, the glass is cracked and the gauge sits at zero.",
    photo: "extinguisher.jpg",
  },
  {
    id: "O05",
    itemId: "ex-02",
    kind: "fail",
    expected: "fail",
    note: "Slight flicker on the sign, half of the legend goes dark when the corridor lights come on.",
    photo: "exit-sign.jpg",
  },
  {
    id: "O06",
    itemId: "fh-07",
    kind: "fail",
    expected: "fail",
    note: "Small crack in the reel housing, the sign has fallen off and the valve is stiff.",
    photo: "hose-reel.jpg",
  },
  {
    id: "O07",
    itemId: "fe-11",
    kind: "fail",
    expected: "fail",
    note: "Slightly corroded spare cylinder, the tag is gone and it sits outside the door.",
    photo: "extinguisher-cart.jpg",
  },
  {
    id: "O08",
    itemId: "fe-01",
    kind: "fail",
    expected: "fail",
    note: "Small dent in the cabinet, the door will not close and the extinguisher sits loose.",
    photo: "extinguisher.jpg",
  },
  {
    id: "O09",
    itemId: "sp-10",
    kind: "borderline",
    expected: "review",
    note: "Slight paint on the rim of the deflector, a smudge, the bulb itself is clear.",
    photo: "sprinkler.jpg",
  },
  {
    id: "O10",
    itemId: "sd-08",
    kind: "borderline",
    expected: "review",
    note: "Slight paint on the rim of the detector, the grille is fully open.",
    photo: "smoke-detector.jpg",
  },
];

export function openById(id: string): BenchScenario | undefined {
  return OPEN_SCENARIOS.find((scenario) => scenario.id === id);
}
