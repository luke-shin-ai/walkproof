#!/usr/bin/env node
/**
 * Writes firebase/remoteconfig.template.json from the built-in rule pack, so the
 * pack a deploy publishes and the pack the app falls back to cannot drift apart.
 *
 * Run: npm run config:template
 * Deploy: firebase deploy --only remoteconfig
 */
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_PACK } from "../src/rules/pack.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = resolve(root, "firebase/remoteconfig.template.json");

const template = {
  parameters: {
    rule_pack: {
      defaultValue: { value: JSON.stringify(DEFAULT_PACK) },
      description:
        "WalkProof checklist, clause texts, fix deadlines and the daily cloud budget. Publishing a new value changes judgements on every device without a release.",
      valueType: "STRING",
    },
  },
};

await mkdir(dirname(target), { recursive: true });
await writeFile(target, `${JSON.stringify(template, null, 2)}\n`, "utf8");
console.log(`wrote ${target} from pack ${DEFAULT_PACK.version}`);
