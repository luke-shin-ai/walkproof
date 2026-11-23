import "./style.css";
import { classifyWithCloud, CLOUD_MODEL, deviceAvailability, structureWithDevice, warmDeviceModel } from "./ai/hybrid";
import { browserStore, readBudget } from "./budget";
import { hasFirebaseConfig, initFirebase } from "./config/firebase";
import { loadRulePack } from "./config/remoteConfig";
import { DEMO_STEPS, loadDemoPhoto } from "./demo";
import { ledgerCsv, reportModel, summarize, type WalkSummary } from "./ledger";
import { preparePhoto } from "./photo";
import { processItem, type PipelineDeps, type Stage } from "./pipeline";
import { DEFAULT_PACK, clauseText, findItem, type PackOrigin, type RulePack } from "./rules/pack";
import { clearWalk, deleteCapture, loadObservations, putCapture, saveObservation, type QueuedCapture } from "./storage/queue";
import type { Observation, WalkInfo } from "./types";

type DeviceState = "checking" | "unavailable" | "downloadable" | "ready";

interface AppState {
  pack: RulePack;
  packOrigin: PackOrigin;
  packDetail: string;
  walk: WalkInfo;
  observations: Observation[];
  notes: Record<string, string>;
  busyItem: string | null;
  busyAll: boolean;
  status: string;
  online: boolean;
  firebaseReady: boolean;
  device: DeviceState;
  deviceDetail: string;
  cloudModel: string;
  cloudFallback: boolean;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const state: AppState = {
  pack: DEFAULT_PACK,
  packOrigin: "builtin",
  packDetail: "Using the built-in pack.",
  walk: {
    buildingName: "Riverside Retail 2",
    buildingType: DEFAULT_PACK.buildingTypes[0] ?? "retail",
    inspector: "",
    startedAt: new Date().toISOString(),
  },
  observations: [],
  notes: {},
  busyItem: null,
  busyAll: false,
  status: "",
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  firebaseReady: hasFirebaseConfig(),
  device: "checking",
  deviceDetail: "",
  cloudModel: CLOUD_MODEL,
  cloudFallback: false,
};

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("app root missing");

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

function stamp(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function sourceText(observation: Observation): string {
  if (observation.source === "on_device") return observation.deviceSource === "on_device" ? "On device" : "Device rules";
  if (observation.source === "in_cloud") return "Cloud";
  if (observation.source === "rejected_unsupported") return "Rejected";
  return "Unresolved";
}

function plainSource(source: string): string {
  if (source === "in_cloud") return "Cloud";
  if (source === "rejected_unsupported") return "Rejected";
  if (source === "on_device") return "Device rules";
  return "Unresolved";
}

function plainDetail(text: string): string {
  return text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
}

function sourceClass(observation: Observation): string {
  if (observation.source === "on_device") return "src-device";
  if (observation.source === "in_cloud") return "src-cloud";
  if (observation.source === "rejected_unsupported") return "src-rejected";
  return "src-open";
}

function verdictClass(verdict: string): string {
  return verdict === "pass" ? "pass" : verdict === "fail" ? "fail" : "unknown";
}

function latestFor(itemId: string): Observation | undefined {
  return state.observations.filter((entry) => entry.itemId === itemId).at(-1);
}

function summary(): WalkSummary {
  return summarize(state.observations, state.pack.items.length);
}

function budget() {
  return readBudget(browserStore(), todayIso(), state.pack.cloudDailyBudget);
}

const STAGE_TEXT: Record<Stage, string> = {
  structure: "reading the note on this device",
  judge: "applying the rule pack",
  cloud: "asking the cloud inside today's budget",
  verify: "checking the answer on this device",
  done: "writing the record",
};

function stageReporter(item: { label: string }): (stage: Stage) => void {
  return (stage) => setStatus(`${item.label}: ${STAGE_TEXT[stage]}.`);
}

function deps(onStage?: (stage: Stage) => void): PipelineDeps {
  const canDevice = state.firebaseReady && state.device === "ready";
  return {
    structureOnDevice: canDevice ? (item, note) => structureWithDevice(item, note) : undefined,
    classify: state.firebaseReady && state.online ? (item, payload) => classifyWithCloud(item, payload) : undefined,
    online: state.online,
    budgetStore: browserStore(),
    today: todayIso(),
    onStage,
  };
}

function setStatus(message: string): void {
  state.status = message;
  const box = document.querySelector<HTMLParagraphElement>("#status");
  if (box) box.textContent = message;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* ------------------------------------------------------------------ render */

function badgeRow(): string {
  const pack = state.pack;
  const originLabel = state.packOrigin === "remote" ? "remote" : state.packOrigin === "cache" ? "cached" : "built-in";
  const deviceLabel =
    state.device === "ready"
      ? "on-device model ready"
      : state.device === "checking"
        ? "device: checking"
        : `device: ${state.device}`;
  const cloud = state.cloudFallback ? `cloud: ${state.cloudModel} (fallback)` : `cloud: ${state.cloudModel}`;
  const net = state.online ? "online" : "offline";
  return [
    `<span class="badge strong" title="${esc(state.packDetail)}">pack ${esc(pack.version)} <span class="badge-sub">${originLabel}</span></span>`,
    `<span class="badge" title="${esc(state.deviceDetail || "The on-device model structures the note when the device has it.")}">${esc(deviceLabel)}</span>`,
    `<span class="badge">${esc(cloud)}</span>`,
    `<span class="badge">${net}</span>`,
  ].join("");
}

function itemCard(item: RulePack["items"][number], index: number): string {
  const observation = latestFor(item.id);
  const note = state.notes[item.id] ?? observation?.note ?? "";
  const busy = state.busyItem === item.id;
  const clauseTexts = item.clauses.map((id) => `<span class="chip" title="${esc(clauseText(state.pack, id))}">${esc(id)}</span>`).join("");
  return `
    <article class="item ${observation ? `is-${verdictClass(observation.verdict)}` : ""}" id="item-${esc(item.id)}">
      <div class="item-top">
        <span class="num">${String(index + 1).padStart(2, "0")}</span>
        <div class="item-copy">
          <h3>${esc(item.label)}</h3>
          <p class="meta">
            <span>${esc(item.zone)}</span><span class="sep"></span>${clauseTexts}
            <span class="sep"></span><span>fix within ${item.fixDays} ${item.fixDays === 1 ? "day" : "days"}</span>
          </p>
        </div>
        ${observation ? `<span class="pill ${verdictClass(observation.verdict)}">${observation.verdict.toUpperCase()}</span>` : `<span class="pill quiet">Not checked</span>`}
      </div>
      <div class="item-inputs">
        <label class="note-field">
          <span>One line note</span>
          <input type="text" data-note="${esc(item.id)}" value="${esc(note)}" placeholder="What do you see? e.g. cabinet glass broken, gauge at zero" autocomplete="off" />
        </label>
        <label class="file-button ${busy ? "is-busy" : ""}">
          <input type="file" accept="image/jpeg,image/png" capture="environment" data-photo="${esc(item.id)}" ${busy ? "disabled" : ""} />
          <span>${busy ? "Working" : "Add photo"}</span>
        </label>
      </div>
      ${resultBlock(item, observation, busy)}
    </article>`;
}

function resultBlock(item: RulePack["items"][number], observation: Observation | undefined, busy: boolean): string {
  if (busy) {
    return `<div class="result working"><span class="dot-pulse"></span>Reading the note, judging, and writing the record.</div>`;
  }
  if (!observation) {
    return `<p class="hint">The photo stays on this device. The note is structured here, and the rule pack decides the verdict.</p>`;
  }

  const details: string[] = [];
  details.push(
    observation.deviceSource === "on_device"
      ? "Note structured by the on-device model."
      : observation.deviceSource === "local_rules"
        ? "Note structured by the built-in rule parser."
        : "No structured finding for this item.",
  );
  if (observation.photoDataUrl) details.push("Photo re-encoded on the device, so EXIF and GPS are gone.");
  if (observation.cloud) {
    details.push(
      `Cloud call ${observation.cloud.model}: ${formatBytes(observation.cloud.payloadBytes)} of typed summary, no photo.`,
    );
    if (observation.cloud.accepted) {
      details.push("Answer checked on the device: clause in the pack, schema complete, verdict agrees with the rule pack.");
    } else {
      details.push("Answer rejected on the device. A person has to decide this item.");
    }
  } else if (observation.verdict === "unknown") {
    details.push(
      !state.firebaseReady
        ? "Cloud checks are off in this build, so the item is marked for a person."
        : !state.online
          ? "No network. The item waits in the queue for a cloud check."
          : "No cloud call was made for this item.",
    );
  }

  const rejectionList =
    observation.cloud && observation.cloud.reasons.length && !observation.cloud.accepted
      ? `<ul class="rejections">${observation.cloud.reasons.map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul>`
      : "";

  return `
    <div class="result">
      <div class="result-top">
        <span class="pill ${verdictClass(observation.verdict)}">${observation.verdict.toUpperCase()}</span>
        <span class="src ${sourceClass(observation)}">${sourceText(observation)}</span>
        <span class="meta">${observation.latencyMs} ms</span>
        <span class="meta">${formatBytes(observation.photoBytes)}</span>
        ${observation.clauseIds.length ? `<span class="meta">clause ${esc(observation.clauseIds.join(", "))}</span>` : ""}
        ${observation.fixBy ? `<span class="meta fix">fix by ${esc(observation.fixBy)}</span>` : ""}
      </div>
      <p class="reason">${observation.reasons.map((reason) => esc(reason)).join("; ")}</p>
      ${rejectionList}
      <div class="result-foot">
        ${observation.photoDataUrl ? `<img class="thumb" src="${observation.photoDataUrl}" alt="Photo recorded for ${esc(item.label)}" />` : ""}
        <ul class="details">${details.map((detail) => `<li>${esc(detail)}</li>`).join("")}</ul>
      </div>
    </div>`;
}

function summaryCard(): string {
  const stats = summary();
  const percent = stats.total ? Math.round((stats.checked / stats.total) * 100) : 0;
  const calls = budget();
  return `
    <div class="card summary">
      <div class="summary-head">
        <div><strong>${stats.checked}</strong> of ${stats.total} checked</div>
        <span class="meta">${percent}%</span>
      </div>
      <div class="bar"><span style="width:${percent}%"></span></div>
      <dl class="counts">
        <div class="count pass"><dt>Pass</dt><dd>${stats.pass}</dd></div>
        <div class="count fail"><dt>Fail</dt><dd>${stats.fail}</dd></div>
        <div class="count unknown"><dt>Review</dt><dd>${stats.unknown}</dd></div>
        <div class="count"><dt>Rejected</dt><dd>${stats.rejected}</dd></div>
      </dl>
      <ul class="facts">
        <li><span>Photos on this device</span><strong>${stats.photosOnDevice}</strong></li>
        <li><span>Bytes sent to the cloud</span><strong>0</strong></li>
        <li><span>Cloud calls today</span><strong>${calls.spent} of ${calls.limit}</strong></li>
        <li><span>Median record time</span><strong>${stats.medianLatencyMs ? `${stats.medianLatencyMs} ms` : "n/a"}</strong></li>
      </ul>
      <p class="small">${esc(state.packDetail)}</p>
    </div>`;
}

function actionsCard(): string {
  const stats = summary();
  const queued = state.observations.filter((entry) => entry.reviewRequired && entry.finding).length;
  return `
    <div class="card actions">
      <button class="primary" id="run-demo" ${state.busyAll ? "disabled" : ""}>${state.busyAll ? "Running the sample walkthrough..." : "Load the sample walkthrough"}</button>
      <button id="prepare-device" ${state.device === "ready" ? "disabled" : ""}>${state.device === "ready" ? "On-device model ready" : "Prepare on-device model"}</button>
      ${
        queued
          ? `<button id="retry-cloud" ${state.busyAll ? "disabled" : ""}>Retry ${queued} waiting ${queued === 1 ? "item" : "items"} in the cloud</button>`
          : ""
      }
      <button id="export-csv" ${stats.checked ? "" : "disabled"}>Export ledger CSV</button>
      <button id="print-record" ${stats.checked ? "" : "disabled"}>Print inspection record</button>
      <button class="quiet" id="clear-walk" ${stats.checked ? "" : "disabled"}>Clear this walkthrough</button>
    </div>`;
}

function ledgerSection(): string {
  const rows = state.pack.items
    .map((item) => latestFor(item.id))
    .filter((entry): entry is Observation => entry !== undefined);

  if (!rows.length) {
    return `
      <section class="card ledger">
        <div class="section-head"><h2>Ledger</h2><p>Every record keeps the source of its evidence.</p></div>
        <p class="empty">No records yet. Load the sample walkthrough, or add a photo to any item above.</p>
      </section>`;
  }

  const body = rows
    .map(
      (entry) => `
      <tr>
        <td class="cell-item"><strong>${esc(entry.label)}</strong><span class="meta">${esc(entry.zone)} / ${esc(entry.itemId)}</span></td>
        <td><span class="pill ${verdictClass(entry.verdict)}">${entry.verdict.toUpperCase()}</span></td>
        <td><span class="src ${sourceClass(entry)}">${sourceText(entry)}</span></td>
        <td class="num-cell">${entry.latencyMs} ms</td>
        <td class="num-cell">${formatBytes(entry.photoBytes)}</td>
        <td>${entry.fixBy ? esc(entry.fixBy) : `<span class="muted">none</span>`}</td>
        <td class="time-cell">${esc(stamp(entry.createdAt))}</td>
      </tr>`,
    )
    .join("");

  return `
    <section class="card ledger">
      <div class="section-head">
        <h2>Ledger</h2>
        <p>Every record keeps the source of its evidence, so a reviewer can see what ran where.</p>
      </div>
      <div class="table-wrap">
        <table>
          <thead>
            <tr><th>Item</th><th>Verdict</th><th>Source</th><th>Latency</th><th>Photo</th><th>Fix by</th><th>Recorded</th></tr>
          </thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </section>`;
}

function reportSection(): string {
  const model = reportModel(state.walk, state.observations, state.pack);
  const hasRecords = model.summary.checked > 0;
  const violationRows = model.violations
    .map(
      (entry) => `
      <tr>
        <td class="doc-photo">${entry.photoDataUrl ? `<img src="${entry.photoDataUrl}" alt="Photo for ${esc(entry.label)}" />` : `<span class="muted">no photo</span>`}</td>
        <td>
          <strong>${esc(entry.label)}</strong>
          <p class="doc-detail">${esc(entry.zone)} / ${esc(plainDetail(entry.detail))}</p>
          ${entry.note ? `<p class="doc-note">${esc(entry.note)}</p>` : ""}
        </td>
        <td><strong>${esc(entry.clauseId)}</strong><p class="doc-detail">${esc(entry.clauseText)}</p></td>
        <td class="doc-date">${entry.fixBy ? esc(entry.fixBy) : `<span class="muted">none</span>`}</td>
      </tr>`,
    )
    .join("");

  const reviewRows = model.reviews
    .map(
      (entry) => `
      <tr>
        <td><strong>${esc(entry.label)}</strong><p class="doc-detail">${esc(entry.zone)} / ${esc(plainDetail(entry.detail))}</p></td>
        <td>${esc(plainSource(entry.source))}</td>
        <td class="doc-date">${entry.fixBy ? esc(entry.fixBy) : `<span class="muted">after review</span>`}</td>
      </tr>`,
    )
    .join("");

  return `
    <section class="report" id="report">
      <div class="report-toolbar">
        <div><h2>Inspection record</h2><p>What the building manager signs, including what was left to a person.</p></div>
        <button id="print-record-2" ${hasRecords ? "" : "disabled"}>Print or save as PDF</button>
      </div>
      <div class="paper">
        <header class="paper-head">
          <div>
            <p class="eyebrow">Building safety walkthrough record</p>
            <h2>${esc(model.buildingName || "Unnamed building")}</h2>
            <p class="meta">${esc(model.buildingType)} / inspected ${esc(stamp(model.inspectedAt))} / rule pack ${esc(model.packVersion)}</p>
          </div>
          <table class="doc-meta">
            <tr><th>Inspector</th><td>${esc(model.inspector || "not named")}</td></tr>
            <tr><th>Items</th><td>${model.summary.checked} of ${model.summary.total} checked</td></tr>
            <tr><th>Result</th><td>${model.summary.pass} pass / ${model.summary.fail} fail / ${model.summary.unknown} to review</td></tr>
          </table>
        </header>

        <h3>Failures with a deadline</h3>
        ${
          model.violations.length
            ? `<table class="doc-table"><thead><tr><th>Photo</th><th>Finding</th><th>Clause</th><th>Fix by</th></tr></thead><tbody>${violationRows}</tbody></table>`
            : `<p class="empty">No failures recorded.</p>`
        }

        <h3>Left to a person</h3>
        ${
          model.reviews.length
            ? `<table class="doc-table"><thead><tr><th>Item</th><th>Source</th><th>Then</th></tr></thead><tbody>${reviewRows}</tbody></table>`
            : `<p class="empty">Nothing was left unresolved.</p>`
        }

        <div class="signatures">
          ${model.signatureLines.map((line) => `<div class="sign"><span>${esc(line)}</span><i></i><small>date</small></div>`).join("")}
        </div>
        <p class="footnote">
          Clause texts paraphrase common public fire-safety expectations for small commercial buildings. This record is not legal
          advice. Photos and notes in this record were kept on the device that produced it.
        </p>
      </div>
    </section>`;
}

let reportTimer: number | undefined;

function refreshReport(): void {
  const current = document.getElementById("report");
  if (!current) return;
  current.outerHTML = reportSection();
  document.querySelector("#print-record-2")?.addEventListener("click", () => window.print());
}

function scheduleReport(): void {
  if (reportTimer) window.clearTimeout(reportTimer);
  reportTimer = window.setTimeout(refreshReport, 180);
}

function render(): void {
  const scrollY = window.scrollY;
  const active = document.activeElement as HTMLInputElement | null;
  const focusKey = active?.dataset?.note ? `note:${active.dataset.note}` : null;
  const caret = active?.selectionStart ?? null;
  const stats = summary();

  app!.innerHTML = `
    <header class="topbar">
      <div class="brand">
        <span class="mark" aria-hidden="true">W</span>
        <div>
          <h1>WalkProof</h1>
          <p class="tagline">Monthly building walkthrough / photos and records stay on the device</p>
        </div>
      </div>
      <div class="badges">${badgeRow()}</div>
    </header>

    <div class="shell">
      <main class="walk">
        <section class="card walk-head">
          <div class="walk-fields">
            <label><span>Building</span><input type="text" id="building-name" value="${esc(state.walk.buildingName)}" placeholder="Building name" /></label>
            <label><span>Type</span>
              <select id="building-type">
                ${state.pack.buildingTypes
                  .map((type) => `<option value="${esc(type)}" ${type === state.walk.buildingType ? "selected" : ""}>${esc(type)}</option>`)
                  .join("")}
              </select>
            </label>
            <label><span>Inspector</span><input type="text" id="inspector" value="${esc(state.walk.inspector)}" placeholder="Name for the record" /></label>
          </div>
          <p class="trust">
            <span>Photo and note stay on this device</span>
            <span>Verdicts come from the rule pack</span>
            <span>The cloud sees a typed summary, never the photo</span>
          </p>
          <p class="status" id="status" role="status" aria-live="polite">${esc(state.status)}</p>
        </section>

        <section class="checklist" aria-label="Checklist">
          ${state.pack.items.map((item, index) => itemCard(item, index)).join("")}
        </section>
      </main>

      <aside class="side">
        ${summaryCard()}
        ${actionsCard()}
        <div class="card mini">
          <h2>How the boundary works</h2>
          <ol>
            <li>The note is structured on the device into one schema. Without the on-device model, the built-in rule parser does it.</li>
            <li>The rule pack decides pass, fail or unknown. A model never sets the verdict on its own.</li>
            <li>Only an unknown item goes to the cloud, inside the day's budget, as a typed summary.</li>
            <li>The answer is checked on the device. A wrong clause, a missing field or a contradiction is rejected and handed to a person.</li>
          </ol>
        </div>
      </aside>
    </div>

    ${ledgerSection()}
    ${reportSection()}

    <footer class="foot">
      <span>WalkProof / ${stats.checked} of ${stats.total} recorded</span>
      <span>Firebase AI Logic hybrid / Gemini Nano on device / ${esc(state.cloudModel)} for unknowns</span>
    </footer>`;

  bind();
  window.scrollTo(0, scrollY);

  if (focusKey) {
    const selector = `[data-note="${CSS.escape(focusKey.slice(5))}"]`;
    const field = document.querySelector<HTMLInputElement>(selector);
    if (field) {
      field.focus();
      if (caret !== null) field.setSelectionRange(caret, caret);
    }
  }
}

/* ------------------------------------------------------------------- events */

function bind(): void {
  document.querySelectorAll<HTMLInputElement>("[data-note]").forEach((input) => {
    input.addEventListener("input", () => {
      const itemId = input.dataset.note;
      if (itemId) state.notes[itemId] = input.value;
    });
  });

  document.querySelectorAll<HTMLInputElement>("[data-photo]").forEach((input) => {
    input.addEventListener("change", () => {
      const itemId = input.dataset.photo;
      const file = input.files?.[0];
      if (!itemId || !file) return;
      void handlePhoto(itemId, file);
      input.value = "";
    });
  });

  document.querySelector<HTMLInputElement>("#building-name")?.addEventListener("input", (event) => {
    state.walk.buildingName = (event.target as HTMLInputElement).value;
    scheduleReport();
  });
  document.querySelector<HTMLSelectElement>("#building-type")?.addEventListener("change", (event) => {
    state.walk.buildingType = (event.target as HTMLSelectElement).value;
    refreshReport();
  });
  document.querySelector<HTMLInputElement>("#inspector")?.addEventListener("input", (event) => {
    state.walk.inspector = (event.target as HTMLInputElement).value;
    scheduleReport();
  });

  document.querySelector("#run-demo")?.addEventListener("click", () => void runDemo());
  document.querySelector("#prepare-device")?.addEventListener("click", () => void prepareDevice());
  document.querySelector("#retry-cloud")?.addEventListener("click", () => void retryQueued());
  document.querySelector("#export-csv")?.addEventListener("click", exportCsv);
  document.querySelector("#print-record")?.addEventListener("click", () => window.print());
  document.querySelector("#print-record-2")?.addEventListener("click", () => window.print());
  document.querySelector("#clear-walk")?.addEventListener("click", () => void clearThisWalk());
}

/* ------------------------------------------------------------------ actions */

async function processAndSave(item: RulePack["items"][number], note: string, file: File): Promise<Observation> {
  const photo = await preparePhoto(file);
  const capture: QueuedCapture = {
    id: `${item.id}-${Date.now()}`,
    itemId: item.id,
    note,
    photoName: file.name,
    photoBytes: photo.bytes,
    photoDataUrl: photo.dataUrl,
    createdAt: new Date().toISOString(),
  };
  await putCapture(capture);

  const observation = await processItem(
    {
      item,
      note,
      photoName: file.name,
      photoBytes: photo.bytes,
      photoDataUrl: photo.dataUrl,
      pack: state.pack,
    },
    deps(stageReporter(item)),
  );

  await saveObservation(observation);
  await deleteCapture(capture.id);
  state.observations = state.observations.filter((entry) => entry.itemId !== item.id).concat(observation);
  if (observation.cloud) {
    state.cloudModel = observation.cloud.model;
    state.cloudFallback = observation.cloud.modelFallback;
  }
  return observation;
}

async function handlePhoto(itemId: string, file: File): Promise<void> {
  if (state.busyItem) return;
  const item = findItem(state.pack, itemId);
  if (!item) return;
  state.busyItem = itemId;
  setStatus(`${item.label}: reading the note and writing the record.`);
  render();
  try {
    const observation = await processAndSave(item, state.notes[itemId] ?? "", file);
    setStatus(`${item.label}: ${observation.verdict.toUpperCase()} recorded.`);
  } catch (error) {
    setStatus(`Could not record ${item.label}: ${(error as Error).message}`);
  } finally {
    state.busyItem = null;
    render();
  }
}

async function runDemo(): Promise<void> {
  if (state.busyAll) return;
  state.busyAll = true;
  for (const step of DEMO_STEPS) {
    const item = findItem(state.pack, step.itemId);
    if (!item) continue;
    state.notes[step.itemId] = step.note;
    state.busyItem = step.itemId;
    setStatus(`${item.label}: loading the sample photo.`);
    render();
    try {
      const file = await loadDemoPhoto(step);
      const observation = await processAndSave(item, step.note, file);
      setStatus(`${item.label}: ${observation.verdict.toUpperCase()}.`);
    } catch (error) {
      setStatus(`Sample photo for ${item.label} failed: ${(error as Error).message}`);
    }
    await sleep(120);
  }
  state.busyItem = null;
  state.busyAll = false;
  setStatus("Sample walkthrough complete. Every record shows where its evidence came from.");
  render();
}

async function retryQueued(): Promise<void> {
  if (state.busyAll) return;
  state.busyAll = true;
  const waiting = state.observations.filter((entry) => entry.reviewRequired && entry.finding);
  for (const previous of waiting) {
    const item = findItem(state.pack, previous.itemId);
    if (!item) continue;
    state.busyItem = item.id;
    setStatus(`${item.label}: trying the cloud again.`);
    render();
    const observation = await processItem(
      {
        item,
        note: previous.note,
        photoName: previous.photoName,
        photoBytes: previous.photoBytes,
        photoDataUrl: previous.photoDataUrl,
        pack: state.pack,
        createdAt: new Date().toISOString(),
      },
      deps(stageReporter(item)),
    );
    await saveObservation(observation);
    state.observations = state.observations.filter((entry) => entry.itemId !== item.id).concat(observation);
    if (observation.cloud) {
      state.cloudModel = observation.cloud.model;
      state.cloudFallback = observation.cloud.modelFallback;
    }
    await sleep(120);
  }
  state.busyItem = null;
  state.busyAll = false;
  setStatus("Queued items were sent again within the day's cloud budget.");
  render();
}

async function prepareDevice(): Promise<void> {
  setStatus("Preparing the on-device model. The first run downloads it.");
  render();
  try {
    await warmDeviceModel((value) => {
      setStatus(`On-device model download ${(value * 100).toFixed(0)}%`);
    });
    state.device = "ready";
    state.deviceDetail = "The on-device model is ready and structures notes on this device.";
    setStatus("On-device model ready. Notes are now structured on this device.");
  } catch (error) {
    state.device = "unavailable";
    state.deviceDetail = (error as Error).message;
    setStatus(`On-device model unavailable: ${(error as Error).message}. The built-in rule parser reads notes instead.`);
  }
  render();
}

function exportCsv(): void {
  const blob = new Blob([ledgerCsv(state.observations)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `walkproof-ledger-${todayIso()}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function clearThisWalk(): Promise<void> {
  if (!window.confirm("Delete this walkthrough from this device? Photos and records are removed.")) return;
  await clearWalk();
  state.observations = [];
  state.notes = {};
  state.walk.startedAt = new Date().toISOString();
  setStatus("This walkthrough was cleared from the device.");
  render();
}

/* --------------------------------------------------------------------- boot */

async function boot(): Promise<void> {
  render();
  try {
    state.observations = await loadObservations();
  } catch {
    state.observations = [];
  }
  render();

  void deviceAvailability().then((value) => {
    state.device = value === "available" ? "ready" : value === "downloadable" || value === "downloading" ? "downloadable" : "unavailable";
    state.deviceDetail = `LanguageModel.availability(): ${value}`;
    render();
  });

  if (!state.firebaseReady) {
    state.packDetail = "Firebase values are not loaded in this build, so the built-in pack is used and cloud checks are off.";
    render();
    return;
  }

  try {
    const result = await loadRulePack(initFirebase());
    state.pack = result.pack;
    state.packOrigin = result.origin;
    state.packDetail = `${result.detail}. ${result.remoteNote}.`;
    render();
  } catch (error) {
    state.packDetail = `Remote Config failed (${(error as Error).message}); the built-in pack is used.`;
    render();
  }
}

window.addEventListener("online", () => {
  state.online = true;
  setStatus("Back online. Waiting items can be sent to the cloud within the budget.");
  render();
});
window.addEventListener("offline", () => {
  state.online = false;
  setStatus("Offline. Judgements continue on this device and cloud checks wait in the queue.");
  render();
});

void boot();
