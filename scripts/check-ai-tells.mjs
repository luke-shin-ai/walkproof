#!/usr/bin/env node
/**
 * Fails when a text file carries punctuation or phrasing that reads as machine
 * written, or when a credential pattern shows up where it should not.
 *
 * Run: npm run check:ai-tells
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const SKIP_DIRS = new Set(["node_modules", "dist", ".git", ".github"]);

const FORBIDDEN = new Map([
  ["\u2014", "em dash"],
  ["\u2013", "en dash"],
  ["\u00b7", "middle dot"],
  ["\u2192", "unicode arrow"],
  ["\u2018", "left single quote"],
  ["\u2019", "right single quote"],
  ["\u201c", "left double quote"],
  ["\u201d", "right double quote"],
  ["\u2026", "unicode ellipsis"],
]);

const PHRASES = ["not just", "it is worth noting", "delve", "seamless", "game changer", "unlock the power"];

const SECRETS = [
  { pattern: /AIza[0-9A-Za-z_-]{35}/, label: "Google API key" },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: "private key block" },
  { pattern: /appcheck[-_]?debug[-_]?token["']?\s*[:=]\s*(["'][A-Za-z0-9_-]{6,}["']|[A-Za-z0-9_-]{20,})/i, label: "App Check debug token" },
];

const TEXT_EXT = new Set([".ts", ".js", ".mjs", ".json", ".md", ".html", ".css", ".txt", ".yml", ".yaml", ".example"]);

async function walk(dir, out = []) {
  for (const entry of await readdir(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) {
      await walk(full, out);
    } else if (TEXT_EXT.has(extname(full)) || entry === ".env.example") {
      out.push(full);
    }
  }
  return out;
}

const problems = [];
for (const file of await walk(ROOT)) {
  if (file.endsWith("check-ai-tells.mjs")) continue;
  const text = await readFile(file, "utf8");
  const name = relative(ROOT, file);
  text.split("\n").forEach((line, index) => {
    for (const [char, label] of FORBIDDEN) {
      if (line.includes(char)) problems.push(`${name}:${index + 1} ${label}`);
    }
    const lower = line.toLowerCase();
    for (const phrase of PHRASES) {
      if (lower.includes(phrase)) problems.push(`${name}:${index + 1} phrase "${phrase}"`);
    }
    for (const secret of SECRETS) {
      if (secret.pattern.test(line)) problems.push(`${name}:${index + 1} ${secret.label}`);
    }
  });
}

if (problems.length) {
  console.error(`${problems.length} issue(s):`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log("clean");
