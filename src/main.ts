import "./style.css";
import { DEFAULT_PACK, judge } from "./rules/pack";
import { buildModel, deviceAvailability, hasFirebaseConfig, inspectPhoto, warmDeviceModel, type WalkMode } from "./ai/hybrid";
import { budgetLeft, ledgerCsv } from "./ledger";
import { loadResults, saveResult } from "./storage/queue";
import type { Observation } from "./types";

const state = {
  mode: "on_device_only" as WalkMode,
  results: loadResults(),
  busy: false,
};

const root = document.querySelector<HTMLDivElement>("#app");
if (!root) throw new Error("app root missing");
const app: HTMLDivElement = root;

function el<T extends HTMLElement>(tag: string, attrs: Record<string, string> = {}, text?: string): T {
  const node = document.createElement(tag) as T;
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  if (text) node.textContent = text;
  return node;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error("file read failed"));
    reader.readAsDataURL(file);
  });
}

function sourceLabel(source: string): string {
  if (source === "on_device") return "On this device";
  if (source === "in_cloud") return "Cloud";
  return "Unknown";
}

async function runItem(itemId: string, file: File, note: string): Promise<void> {
  const item = DEFAULT_PACK.items.find((entry) => entry.id === itemId);
  if (!item) return;
  if (!hasFirebaseConfig()) {
    renderStatus("Firebase config missing. Copy .env.example to .env and fill the web app values.");
    return;
  }
  state.busy = true;
  render();
  const base64 = await readAsBase64(file);
  const model = buildModel(state.mode);
  const outcome = await inspectPhoto(model, { base64, mimeType: file.type || "image/jpeg" }, item.label, item.expects, note);
  const judgement = judge(item, outcome.finding);
  const observation: Observation = {
    itemId: item.id,
    label: item.label,
    photoName: file.name,
    photoBytes: file.size,
    note,
    finding: outcome.finding,
    verdict: judgement.verdict,
    reasons: outcome.error ? [outcome.error, ...judgement.reasons] : judgement.reasons,
    source: outcome.source,
    latencyMs: outcome.latencyMs,
    clauseIds: judgement.clauseIds,
    fixBy: judgement.fixBy,
    createdAt: new Date().toISOString(),
  };
  saveResult(observation);
  state.results = loadResults();
  state.busy = false;
  render();
}

function renderStatus(message: string): void {
  const box = document.querySelector<HTMLParagraphElement>("#status");
  if (box) box.textContent = message;
}

function render(): void {
  app.innerHTML = "";

  const header = el("header", { class: "bar" });
  header.append(el("h1", {}, "WalkProof"));
  header.append(el("p", { class: "sub" }, "Monthly building walkthrough. Photos and verdicts stay on this device."));
  const badges = el("div", { class: "badges" });
  badges.append(el("span", { id: "device-badge", class: "badge" }, "device: checking"));
  badges.append(el("span", { class: "badge" }, `rule pack ${DEFAULT_PACK.version}`));
  badges.append(el("span", { id: "budget-badge", class: "badge" }, `cloud calls left today: ${budgetLeft()}`));
  header.append(badges);

  const controls = el("div", { class: "controls" });
  const prepare = el("button", {}, "Prepare on-device model");
  prepare.addEventListener("click", async () => {
    renderStatus("Preparing on-device model. First run downloads the model.");
    try {
      const model = buildModel("on_device_only");
      await warmDeviceModel(model, (value) => renderStatus(`download ${(value * 100).toFixed(0)}%`));
      renderStatus("On-device model ready.");
    } catch (error) {
      renderStatus(`On-device model unavailable: ${(error as Error).message}`);
    }
  });
  controls.append(prepare);

  const modeSelect = el("select", { id: "mode" }) as HTMLSelectElement;
  for (const [value, label] of [
    ["on_device_only", "On device only"],
    ["prefer_on_device", "Prefer on device"],
    ["in_cloud_only", "Cloud only"],
  ] as const) {
    const option = el("option", { value }, label);
    if (value === state.mode) option.setAttribute("selected", "selected");
    modeSelect.append(option);
  }
  modeSelect.addEventListener("change", () => {
    state.mode = modeSelect.value as WalkMode;
  });
  const modeWrap = el("label", { class: "field" }, "inference mode ");
  modeWrap.append(modeSelect);
  controls.append(modeWrap);

  header.append(controls);
  const status = el("p", { id: "status", class: "status" }, "");
  header.append(status);
  app.append(header);

  const list = el("section", { class: "items" });
  list.append(el("h2", {}, "Checklist"));
  for (const item of DEFAULT_PACK.items) {
    const row = el("article", { class: "item" });
    const head = el("div", { class: "item-head" });
    head.append(el("strong", {}, item.label));
    head.append(el("span", { class: "zone" }, `${item.zone} / clause ${item.clauses.join(", ")}`));
    row.append(head);

    const noteInput = el("input", { type: "text", placeholder: "one line note (optional)" }) as HTMLInputElement;
    const fileInput = el("input", { type: "file", accept: "image/jpeg,image/png", capture: "environment" }) as HTMLInputElement;
    fileInput.addEventListener("change", () => {
      const file = fileInput.files?.[0];
      if (file) void runItem(item.id, file, noteInput.value);
    });
    const form = el("div", { class: "item-form" });
    form.append(noteInput, fileInput);
    row.append(form);

    const existing = state.results.filter((result) => result.itemId === item.id).at(-1);
    if (existing) {
      const verdict = el("div", { class: `verdict ${existing.verdict}` });
      verdict.append(el("span", { class: "pill" }, existing.verdict.toUpperCase()));
      verdict.append(el("span", { class: "src" }, sourceLabel(existing.source)));
      verdict.append(el("span", { class: "meta" }, `${existing.latencyMs} ms / ${Math.round(existing.photoBytes / 1024)} KB`));
      if (existing.fixBy) verdict.append(el("span", { class: "meta" }, `fix by ${existing.fixBy}`));
      verdict.append(el("span", { class: "meta" }, existing.reasons.join("; ")));
      row.append(verdict);
    }
    list.append(row);
  }
  app.append(list);

  const ledgerSection = el("section", { class: "ledger" });
  ledgerSection.append(el("h2", {}, "Ledger"));
  const table = el("table");
  const headRow = el("tr");
  for (const column of ["item", "source", "latency", "photo", "verdict", "time"]) headRow.append(el("th", {}, column));
  table.append(headRow);
  for (const result of state.results) {
    const tr = el("tr");
    tr.append(
      el("td", {}, result.label),
      el("td", {}, sourceLabel(result.source)),
      el("td", {}, `${result.latencyMs} ms`),
      el("td", {}, `${Math.round(result.photoBytes / 1024)} KB`),
      el("td", {}, result.verdict),
      el("td", {}, result.createdAt.slice(11, 19)),
    );
    table.append(tr);
  }
  ledgerSection.append(table);

  const actions = el("div", { class: "controls" });
  const csv = el("button", {}, "Export ledger CSV");
  csv.addEventListener("click", () => {
    const blob = new Blob([ledgerCsv(state.results)], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = el("a", { href: url, download: "walkproof-ledger.csv" });
    link.click();
    URL.revokeObjectURL(url);
  });
  const print = el("button", {}, "Print inspection record");
  print.addEventListener("click", () => window.print());
  actions.append(csv, print);
  ledgerSection.append(actions);
  app.append(ledgerSection);

  void deviceAvailability().then((value) => {
    const badge = document.querySelector("#device-badge");
    if (badge) badge.textContent = `device: ${value}`;
  });
}

render();
