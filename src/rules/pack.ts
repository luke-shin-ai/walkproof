import type { Expects, InspectionItem, RulePack } from "../types";

export type { Clause, InspectionItem, RulePack } from "../types";

/**
 * The checklist the app ships with. Remote Config serves the same shape, so a
 * clause or deadline change reaches every device without a release, and this
 * copy is the safe fallback when the project has no published pack, the device
 * is offline, or the fetched pack does not validate.
 *
 * The clause texts paraphrase common public fire-safety expectations for a small
 * commercial building. They are reading aids, not legal advice, and the app never
 * presents itself as an authority.
 */
export const DEFAULT_PACK: RulePack = {
  version: "2026.11.23-1",
  buildingTypes: ["retail", "office", "childcare", "school"],
  cloudDailyBudget: 20,
  clauses: [
    { id: "FE-01", text: "Portable extinguishers are provided at the marked points on each floor and the point is signed." },
    { id: "FE-04", text: "Each extinguisher sits in its bracket or marked cabinet, not loose on the floor or moved elsewhere." },
    { id: "FE-11", text: "Spare extinguishers are kept indoors in a marked place, not left outdoors where they weather." },
    { id: "EX-02", text: "Each exit door carries an illuminated sign that is visible from the route it serves." },
    { id: "EL-03", text: "Distribution boards are kept closed, with no live parts or loose conductors exposed." },
    { id: "EL-07", text: "The space in front of a distribution board stays clear for the person who has to isolate it." },
    { id: "ST-04", text: "Walls, soffits and columns are free of cracking, spalling and exposed reinforcement." },
    { id: "EG-05", text: "Escape routes and the space in front of exit doors stay clear of stored goods and furniture." },
    { id: "EG-06", text: "Doors on an escape route open freely, without a key, a wedge, or a load against them." },
    { id: "FH-07", text: "Hose reels are in place and signed, and the valve turns by hand." },
    { id: "SD-08", text: "Smoke detectors are unobstructed, unpainted, and inside their service life." },
    { id: "FD-09", text: "Fire doors and shutters close fully, and nothing is stored against the frame or track." },
    { id: "SP-10", text: "Sprinkler heads are free of paint and covers, with the clearance below them kept open." },
  ],
  items: [
    {
      id: "fe-01",
      zone: "Lobby",
      label: "Fire extinguisher in its marked cabinet",
      expects: "target_visible",
      clauses: ["FE-01", "FE-04"],
      fixDays: 3,
    },
    {
      id: "ex-02",
      zone: "Exit A",
      label: "Illuminated exit sign above the door",
      expects: "target_visible",
      clauses: ["EX-02"],
      fixDays: 1,
    },
    {
      id: "el-03",
      zone: "Utility room",
      label: "Distribution board closed and covered",
      expects: "target_clear",
      clauses: ["EL-03", "EL-07"],
      fixDays: 3,
    },
    {
      id: "st-04",
      zone: "Stair core",
      label: "Wall and soffit surfaces free of cracks",
      expects: "no_defect",
      clauses: ["ST-04"],
      fixDays: 30,
    },
    {
      id: "eg-05",
      zone: "Rear corridor",
      label: "Escape route clear of stored goods",
      expects: "no_defect",
      clauses: ["EG-05", "EG-06"],
      fixDays: 1,
    },
    {
      id: "fh-07",
      zone: "Hose point",
      label: "Hose reel in place, signed and free to turn",
      expects: "target_visible",
      clauses: ["FH-07"],
      fixDays: 7,
    },
    {
      id: "sd-08",
      zone: "Ceiling",
      label: "Smoke detector unobstructed and unpainted",
      expects: "target_clear",
      clauses: ["SD-08"],
      fixDays: 7,
    },
    {
      id: "fd-09",
      zone: "Fire door",
      label: "Fire shutter closes fully with its track clear",
      expects: "no_defect",
      clauses: ["FD-09"],
      fixDays: 1,
    },
    {
      id: "sp-10",
      zone: "Car park",
      label: "Sprinkler head free of paint and storage",
      expects: "target_clear",
      clauses: ["SP-10"],
      fixDays: 3,
    },
    {
      id: "fe-11",
      zone: "Yard store",
      label: "Spare extinguisher kept indoors in its marked place",
      expects: "target_visible",
      clauses: ["FE-11", "FE-04"],
      fixDays: 3,
    },
  ],
};

const EXPECTS_VALUES: Expects[] = ["target_visible", "target_clear", "no_defect"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Everything a fetched pack has to satisfy before it may replace the built-in one. */
export function validatePack(value: unknown): string[] {
  const errors: string[] = [];
  if (!isRecord(value)) return ["pack is not an object"];

  if (typeof value.version !== "string" || value.version.trim() === "") {
    errors.push("version must be a non-empty string");
  }
  if (!Array.isArray(value.buildingTypes) || value.buildingTypes.length === 0) {
    errors.push("buildingTypes must be a non-empty array");
  } else if (value.buildingTypes.some((entry) => typeof entry !== "string")) {
    errors.push("buildingTypes must contain strings only");
  }
  if (typeof value.cloudDailyBudget !== "number" || !Number.isInteger(value.cloudDailyBudget)) {
    errors.push("cloudDailyBudget must be a whole number");
  } else if (value.cloudDailyBudget < 1 || value.cloudDailyBudget > 500) {
    errors.push("cloudDailyBudget must be between 1 and 500");
  }

  const clauseIds = new Set<string>();
  if (!Array.isArray(value.clauses) || value.clauses.length === 0) {
    errors.push("clauses must be a non-empty array");
  } else {
    value.clauses.forEach((entry, index) => {
      if (!isRecord(entry)) {
        errors.push(`clauses[${index}] is not an object`);
        return;
      }
      if (typeof entry.id !== "string" || entry.id.trim() === "") {
        errors.push(`clauses[${index}].id must be a non-empty string`);
        return;
      }
      if (clauseIds.has(entry.id)) errors.push(`clause id ${entry.id} appears twice`);
      clauseIds.add(entry.id);
      if (typeof entry.text !== "string" || entry.text.trim() === "") {
        errors.push(`clauses[${index}].text must be a non-empty string`);
      }
    });
  }

  const itemIds = new Set<string>();
  if (!Array.isArray(value.items) || value.items.length === 0) {
    errors.push("items must be a non-empty array");
  } else {
    value.items.forEach((entry, index) => {
      if (!isRecord(entry)) {
        errors.push(`items[${index}] is not an object`);
        return;
      }
      const where = `items[${index}]`;
      if (typeof entry.id !== "string" || entry.id.trim() === "") {
        errors.push(`${where}.id must be a non-empty string`);
      } else {
        if (itemIds.has(entry.id)) errors.push(`item id ${entry.id} appears twice`);
        itemIds.add(entry.id);
      }
      for (const field of ["zone", "label"] as const) {
        if (typeof entry[field] !== "string" || entry[field].trim() === "") {
          errors.push(`${where}.${field} must be a non-empty string`);
        }
      }
      if (typeof entry.expects !== "string" || !EXPECTS_VALUES.includes(entry.expects as Expects)) {
        errors.push(`${where}.expects is not a known expectation`);
      }
      if (typeof entry.fixDays !== "number" || !Number.isInteger(entry.fixDays) || entry.fixDays < 0 || entry.fixDays > 365) {
        errors.push(`${where}.fixDays must be a whole number between 0 and 365`);
      }
      if (!Array.isArray(entry.clauses) || entry.clauses.length === 0) {
        errors.push(`${where}.clauses must name at least one clause`);
      } else {
        entry.clauses.forEach((clauseId) => {
          if ( typeof clauseId !== "string" || !clauseIds.has(clauseId)) {
            errors.push(`${where} cites clause ${String(clauseId)} which is not in the pack`);
          }
        });
      }
    });
  }

  if (errors.length === 0) {
    // A pack that validates is safe to use, so narrow the type here once.
    const typed = value as unknown as RulePack;
    if (typed.items.some((item) => item.clauses.length === 0)) errors.push("an item has no clause");
  }
  return errors;
}

export interface ParsedPack {
  pack: RulePack | null;
  errors: string[];
}

export function parsePack(text: string): ParsedPack {
  if (!text || text.trim() === "") {
    return { pack: null, errors: ["no rule pack text"] };
  }
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch (error) {
    return { pack: null, errors: [`pack is not valid JSON: ${(error as Error).message}`] };
  }
  const errors = validatePack(value);
  if (errors.length) return { pack: null, errors };
  return { pack: value as RulePack, errors: [] };
}

export type PackOrigin = "remote" | "cache" | "builtin";

export interface PackResolution {
  pack: RulePack;
  origin: PackOrigin;
  detail: string;
}

export interface ResolveInput {
  remoteText: string | null;
  cachedText: string | null;
  fallback?: RulePack;
}

/**
 * Remote first, then the last valid pack kept on the device, then the built-in
 * pack. No branch leaves the app without a checklist, which is what lets a
 * basement walk finish with no signal.
 */
export function resolvePack(input: ResolveInput): PackResolution {
  const fallback = input.fallback ?? DEFAULT_PACK;
  const remote = input.remoteText ? parsePack(input.remoteText) : { pack: null, errors: ["no remote value"] };
  if (remote.pack) {
    return { pack: remote.pack, origin: "remote", detail: `remote pack ${remote.pack.version}` };
  }
  const cached = input.cachedText ? parsePack(input.cachedText) : { pack: null, errors: ["no cached value"] };
  if (cached.pack) {
    return {
      pack: cached.pack,
      origin: "cache",
      detail: `remote unavailable (${remote.errors[0]}), using the cached pack ${cached.pack.version}`,
    };
  }
  return {
    pack: fallback,
    origin: "builtin",
    detail: `using the built-in pack ${fallback.version}: ${remote.errors[0]}`,
  };
}

export function clauseText(pack: RulePack, clauseId: string): string {
  return pack.clauses.find((clause) => clause.id === clauseId)?.text ?? "";
}

export function findItem(pack: RulePack, itemId: string): InspectionItem | undefined {
  return pack.items.find((item) => item.id === itemId);
}
