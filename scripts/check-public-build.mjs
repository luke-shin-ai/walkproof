#!/usr/bin/env node
/**
 * Fails when the public build carries something that must never be published:
 * a Google API key, an App Check debug token, a private key block, or any
 * leftover VITE_FIREBASE_* value.
 *
 * Run: npm run build:pages && npm run check:pages
 */
import { readdir, readFile, stat } from "node:fs/promises";
import { join, extname } from "node:path";

const ROOT = new URL("../dist/", import.meta.url).pathname;

const RULES = [
  { pattern: /AIza[0-9A-Za-z_-]{35}/, label: "Google API key" },
  { pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/, label: "private key block" },
  { pattern: /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, label: "uuid (possible App Check debug token)" },
  { pattern: /walkproof-ai\.firebaseapp\.com/, label: "the Firebase auth domain" },
  { pattern: /212902546017/, label: "the Firebase sender id" },
];

const TEXT = new Set([".html", ".js", ".mjs", ".css", ".json", ".map", ".txt", ".webmanifest"]);

async function walk(dir, out = []) {
  for (const entry of await readdir(dir)) {
    const full = join(dir, entry);
    const info = await stat(full);
    if (info.isDirectory()) await walk(full, out);
    else out.push(full);
  }
  return out;
}

/** Every value in .env.local, so a baked value is caught by name rather than by shape. */
async function envValues() {
  try {
    const body = await readFile(join(ROOT, "..", ".env.local"), "utf8");
    return body
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#") && line.includes("="))
      .map((line) => {
        const [name, ...rest] = line.split("=");
        return { name: name.trim(), value: rest.join("=").trim() };
      })
      .filter((entry) => entry.value.length >= 8);
  } catch {
    return [];
  }
}

let files;
try {
  files = await walk(ROOT);
} catch (error) {
  console.error(`no dist folder: ${error.message}`);
  process.exit(1);
}

const values = await envValues();
const hits = [];
for (const file of files) {
  if (!TEXT.has(extname(file))) continue;
  const body = await readFile(file, "utf8");
  for (const entry of values) {
    if (body.includes(entry.value)) hits.push(`${file.replace(ROOT, "")}: value of ${entry.name}`);
  }
  for (const rule of RULES) {
    const match = body.match(rule.pattern);
    if (match) hits.push(`${file.replace(ROOT, "")}: ${rule.label} (${match[0].slice(0, 12)}...)`);
  }
}

if (!files.length) {
  console.error("dist is empty: run npm run build:pages first");
  process.exit(1);
}

const pages = files.filter((file) => file.endsWith(".html")).map((file) => file.replace(ROOT, ""));

if (hits.length) {
  console.error(`public build carries ${hits.length} secret shaped value(s):`);
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}

console.log(`public build clean: ${files.length} files, pages ${pages.join(", ")}`);
