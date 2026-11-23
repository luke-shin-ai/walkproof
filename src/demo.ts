import extinguisher from "../fixtures/extinguisher.jpg";
import exitSign from "../fixtures/exit-sign.jpg";
import panel from "../fixtures/panel.jpg";
import crack from "../fixtures/crack.jpg";
import blockedExit from "../fixtures/blocked-exit.jpg";
import hoseReel from "../fixtures/hose-reel.jpg";
import smokeDetector from "../fixtures/smoke-detector.jpg";
import fireDoor from "../fixtures/fire-door.jpg";
import sprinkler from "../fixtures/sprinkler.jpg";
import extinguisherCart from "../fixtures/extinguisher-cart.jpg";

export interface DemoStep {
  itemId: string;
  photoUrl: string;
  photoName: string;
  note: string;
}

/**
 * One click fills a realistic walkthrough so a reviewer sees the whole product
 * without hunting for photos. The notes are what an inspector would write; the
 * verdicts are still decided by the rule pack, not by this list.
 */
export const DEMO_STEPS: DemoStep[] = [
  {
    itemId: "fe-01",
    photoUrl: extinguisher,
    photoName: "extinguisher.jpg",
    note: "Cabinet glass intact, gauge in the green, tag dated this month.",
  },
  {
    itemId: "ex-02",
    photoUrl: exitSign,
    photoName: "exit-sign.jpg",
    note: "Sign lit and readable from the corridor.",
  },
  {
    itemId: "el-03",
    photoUrl: panel,
    photoName: "panel.jpg",
    note: "Front cover removed and live busbars exposed while the cleaner worked.",
  },
  {
    itemId: "st-04",
    photoUrl: crack,
    photoName: "crack.jpg",
    note: "Crack wider than my thumb with the face spalling and reinforcement showing.",
  },
  {
    itemId: "eg-05",
    photoUrl: blockedExit,
    photoName: "blocked-exit.jpg",
    note: "Two pallets of stock left in front of the exit door after the delivery.",
  },
  {
    itemId: "fh-07",
    photoUrl: hoseReel,
    photoName: "hose-reel.jpg",
    note: "Reel in place and signed, valve turns by hand.",
  },
  {
    itemId: "sd-08",
    photoUrl: smokeDetector,
    photoName: "smoke-detector.jpg",
    note: "Paint on the casing of the detector, a thin coat, looks minor.",
  },
  {
    itemId: "fd-09",
    photoUrl: fireDoor,
    photoName: "fire-door.jpg",
    note: "Ladder and spare extinguisher blocking the shutter track.",
  },
  {
    itemId: "sp-10",
    photoUrl: sprinkler,
    photoName: "sprinkler.jpg",
    note: "Head looks painted, not sure whether that is allowed.",
  },
  {
    itemId: "fe-11",
    photoUrl: extinguisherCart,
    photoName: "extinguisher-cart.jpg",
    note: "Spare extinguisher left on the outdoor cart, housing weathered and the tag is gone.",
  },
];

export function demoStep(itemId: string): DemoStep | undefined {
  return DEMO_STEPS.find((step) => step.itemId === itemId);
}

export async function loadDemoPhoto(step: DemoStep): Promise<File> {
  const response = await fetch(step.photoUrl, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`could not load ${step.photoName}`);
  const blob = await response.blob();
  return new File([blob], step.photoName, { type: blob.type || "image/jpeg" });
}
