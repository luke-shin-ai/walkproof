import type { DefectType, Finding, InspectionItem, RulePack, Severity } from "../types";

interface LexiconEntry {
  type: DefectType;
  words: string[];
}

/**
 * Words an inspector actually writes in the field. They only produce a draft
 * finding; the rule layer still decides pass, fail or unknown, and a person or
 * the cloud sees the item when the draft is not enough.
 */
const DEFECT_LEXICON: LexiconEntry[] = [
  { type: "exposed_parts", words: ["exposed", "cover removed", "cover missing", "cover off", "open front", "live parts", "loose conductor", "unscrewed"] },
  { type: "painted_over", words: ["painted", "paint on", "sprayed"] },
  { type: "blockage", words: ["blocked", "blocking", "obstruct", "stored goods", "pallet", "boxes", "stacked", "furniture in front", "stock in", "trolley in front", "cart in front", "bike"] },
  { type: "crack", words: ["crack", "spall", "fracture", "split", "shattered", "fallen away"] },
  { type: "not_lit", words: ["not lit", "unlit", "no light", "not working", "does not light", "doesn't light", "dead", "dim", "dark"] },
  { type: "missing_label", words: ["no sign", "sign missing", "unlabelled", "unlabeled", "no marking", "label missing", "not signed"] },
  { type: "damaged_housing", words: ["damaged", "dented", "broken", "smashed", "corroded", "rusted", "rusty", "weathered", "housing split"] },
  { type: "other", words: ["leak", "water", "damp", "loose", "sharp edge", "trip hazard", "noise"] },
];

export const ABSENT_WORDS = [
  "not visible",
  "cannot see",
  "can't see",
  "could not see",
  "couldn't see",
  "missing",
  "absent",
  "not present",
  "no longer there",
  "nothing there",
  "not mounted",
  "taken away",
];

/**
 * What an inspector writes when the observation itself was limited: glare, a
 * cover in the way, or a line that says the writer could not tell. The same list
 * marks a draft as obscured and stops the device from settling the item
 * (`evidence.ts`), because a line that says "not sure" is not a determination.
 */
export const OBSCURED_WORDS = [
  "glare",
  "blur",
  "too dark to see",
  "cannot tell",
  "can't tell",
  "not sure",
  "unsure",
  "no idea",
  "unclear",
  "whether",
  "maybe",
  "possibly",
  "covered by",
];

const HIGH_WORDS = ["exposed", "severe", "major", "large", "wide", "deep", "spall", "structural", "through", "showing", "live"];
const LOW_WORDS = ["slight", "minor", "small", "hairline", "surface only", "below threshold", "mark", "scuff"];

/** True when the word appears at the start of a word, so "live" does not match "delivery". */
export function includesWord(text: string, word: string): boolean {
  let index = text.indexOf(word);
  while (index >= 0) {
    if (index === 0 || !/[a-z]/.test(text[index - 1])) return true;
    index = text.indexOf(word, index + 1);
  }
  return false;
}

export function includesAny(text: string, words: string[]): boolean {
  return words.some((word) => includesWord(text, word));
}

/** The phrases from a list that the line actually contains. */
export function matchedWords(text: string, words: string[]): string[] {
  const lowered = text.toLowerCase();
  return words.filter((word) => includesWord(lowered, word));
}

export function severityFor(text: string, defect: DefectType): Severity {
  if (defect === "none") return "none";
  if (includesAny(text, HIGH_WORDS)) return "high";
  if (includesAny(text, LOW_WORDS)) return "low";
  if (includesAny(text, OBSCURED_WORDS)) return "low";
  return "medium";
}

/**
 * The offline structure step: one line of inspector text becomes the same
 * finding shape the models return. Deterministic, so the same note on a tablet
 * and on a laptop gives the same draft.
 */
export function structureNote(item: InspectionItem, note: string, targetName?: string): Finding | null {
  const text = note.trim().toLowerCase();
  if (!text) return null;

  let defect: DefectType = "none";
  for (const entry of DEFECT_LEXICON) {
    if (includesAny(text, entry.words)) {
      defect = entry.type;
      break;
    }
  }

  const obscured = includesAny(text, OBSCURED_WORDS);
  const absent = includesAny(text, ABSENT_WORDS) && defect === "none";

  return {
    targetPresent: !absent,
    targetName: targetName ?? item.label,
    defectType: defect,
    severity: severityFor(text, defect),
    obscured,
    note: note.trim(),
  };
}

/**
 * Words that may stay in a line sent to the cloud: the safety vocabulary the
 * rule pack already uses plus ordinary building words. A capitalised word that
 * is not here and is not the first word of its sentence is treated as a name,
 * a street, a shop or a company and replaced.
 */
const SAFETY_VOCABULARY = [
  "fire", "extinguisher", "extinguishers", "exit", "exits", "emergency", "sign", "signs", "door", "doors",
  "shutter", "shutters", "smoke", "detector", "detectors", "sprinkler", "sprinklers", "head", "heads",
  "hose", "reel", "reels", "panel", "panels", "board", "boards", "distribution", "electrical", "cabinet",
  "cabinets", "corridor", "corridors", "stair", "stairs", "staircase", "core", "car", "park", "parking",
  "yard", "store", "storeroom", "storage", "lobby", "reception", "ceiling", "wall", "walls", "roof", "floor",
  "floors", "room", "rooms", "utility", "plant", "pump", "pumps", "alarm", "alarms", "call", "point", "points",
  "assembly", "first", "aid", "kit", "kits", "light", "lights", "lighting", "lamp", "lamps", "battery",
  "batteries", "gauge", "tag", "tags", "paint", "painted", "cover", "covers", "glass", "bracket", "brackets",
  "pipe", "pipes", "valve", "valves", "riser", "track", "tracks", "frame", "frames", "route", "routes",
  "escape", "load", "loads", "goods", "stock", "pallet", "pallets", "box", "boxes", "ladder", "ladders",
  "trolley", "cart", "carts", "furniture", "block", "blocked", "blocking", "crack", "cracks", "spall",
  "spalling", "exposed", "damage", "damaged", "rust", "rusty", "corroded", "leak", "leaks", "water", "damp",
  "loose", "wire", "wires", "wiring", "busbar", "busbars", "breaker", "breakers", "switch", "switches", "fuse",
  "fuses", "meter", "meters", "gas", "shut", "closed", "open", "missing", "absent", "present", "clear",
  "unclear", "unsure", "maybe", "possibly", "slight", "small", "minor", "major", "severe", "large", "wide",
  "deep", "hairline", "surface", "structural", "through", "showing", "live", "level", "ground", "basement",
  "rooftop", "entrance", "kitchen", "toilet", "toilets", "washroom", "garage", "driveway", "gate", "gates",
  "fence", "path", "walkway", "ramp", "step", "steps", "handle", "hinge", "hinges", "lock", "locks", "key",
  "wedge", "month", "year", "week", "day", "days", "today", "yesterday", "monday", "tuesday", "wednesday",
  "thursday", "friday", "saturday", "sunday", "january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december", "the", "a", "an", "this", "that", "its", "his",
  "her", "their", "our", "my", "and", "or", "but", "not", "no", "yes", "with", "without", "from", "into",
  "i", "im", "dont", "cant", "isnt",
];

/** The item in hand supplies its own words, so a label at the start of a line stays readable. */
function keepWords(item?: InspectionItem): Set<string> {
  const words = new Set(SAFETY_VOCABULARY);
  const source = item ? `${item.label} ${item.zone} ${item.expects.replace(/_/g, " ")}` : "";
  for (const word of source.toLowerCase().split(/[^a-z]+/)) {
    if (word) words.add(word);
  }
  return words;
}

/**
 * Replaces a capitalised word that is not safety vocabulary with `[name]`. The
 * first word of a sentence is left alone, because a sentence starts with a
 * capital whatever it says.
 */
function maskProperNouns(text: string, keep: Set<string>): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) =>
      sentence
        .split(" ")
        .map((token, index) => {
          if (index === 0) return token;
          const core = token.replace(/^[^\p{L}]+|[^\p{L}'\u2019.-]+$/gu, "");
          if (!/^\p{Lu}[\p{L}'\u2019.-]*$/u.test(core)) return token;
          const bare = core.toLowerCase().replace(/['\u2019]s$/, "");
          if (keep.has(bare)) return token;
          return token.slice(0, token.indexOf(core)) + "[name]" + token.slice(token.indexOf(core) + core.length);
        })
        .join(" "),
    )
    .join(" ");
}

/**
 * The cloud never receives a photo. This keeps a typed summary to the fields the
 * model needs and masks what identifies a person or a place before it leaves the
 * device: an email address, a phone-like or long number, and a capitalised word
 * that is not part of the safety vocabulary (`Mr Kim's storeroom` becomes
 * `[name] [name] storeroom`).
 *
 * It is a filter, not anonymisation. A name written in lower case, or a place
 * named without a capital, goes through, and the first word of a sentence is left
 * as written. That is why the sample lines carry no names at all.
 */
export function redactForCloud(text: string, item?: InspectionItem): string {
  const masked = text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\+?\d[\d\s-]{6,}\d/g, "[number]")
    .replace(/\d{2,}/g, "[n]");
  return maskProperNouns(masked, keepWords(item))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export interface CloudPayload {
  json: string;
  bytes: number;
}

/**
 * Why this item is being put to the cloud. Both are decisive lines; the
 * difference is only which side failed to settle it.
 *
 * - `pack_open`: the device read the line and the rule pack left the item open.
 * - `untrusted_reading`: the device's own reading did not survive the check
 *   against the line, so the device has no finding to decide with.
 */
export type CloudReason = "pack_open" | "untrusted_reading";

export interface CloudPayloadInput {
  /** The device's draft, shown so the answer can be compared with it. */
  draft: Finding | null;
  /** False when the draft is the reading the line did not support. */
  draftTrusted: boolean;
  reason: CloudReason;
}

const REASON_TEXT: Record<CloudReason, string> = {
  pack_open: "the rule pack leaves this item open on a line that says what the inspector saw",
  untrusted_reading: "the device's own reading did not survive the check against the line, so it is not used",
};

/**
 * What leaves the building: a typed summary with no image and no identifiers.
 * The line is redacted, the photo is named but not attached, and the device's
 * draft is marked as either the reason the item is open or a reading to ignore.
 */
export function buildCloudPayload(item: InspectionItem, pack: RulePack, input: CloudPayloadInput): CloudPayload {
  const summary = {
    pack: pack.version,
    itemId: item.id,
    item: item.label,
    zone: item.zone,
    expects: item.expects,
    allowedClauseIds: item.clauses,
    openBecause: REASON_TEXT[input.reason],
    deviceDraft: input.draft
      ? {
          targetPresent: input.draft.targetPresent,
          defectType: input.draft.defectType,
          severity: input.draft.severity,
          obscured: input.draft.obscured,
          trusted: input.draftTrusted,
        }
      : null,
    note: input.draft ? redactForCloud(input.draft.note, item) : "",
    photo: "kept on the device",
  };
  const json = JSON.stringify(summary);
  return { json, bytes: new TextEncoder().encode(json).length };
}
