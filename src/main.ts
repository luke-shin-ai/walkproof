import "./style.css";
import {
  classifyWithCloud,
  CLOUD_MODEL,
  deviceAvailability,
  hasBrowserDeviceModel,
  structureWithBrowserDevice,
  structureWithDevice,
  warmBrowserDeviceModel,
  warmDeviceModel,
} from "./ai/hybrid";
import { browserStore, readBudget } from "./budget";
import { appCheckStatus, firebaseConfigSource, hasFirebaseConfig, initFirebase } from "./config/firebase";
import { loadRulePack } from "./config/remoteConfig";
import { DEMO_STEPS, loadDemoPhoto } from "./demo";
import { ledgerCsv, reportModel, summarize, type WalkSummary } from "./ledger";
import { preparePhoto } from "./photo";
import { processItem, type PipelineDeps, type Stage } from "./pipeline";
import { verifyCloudAnswer } from "./rules/verify";
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
  /** Answers the gate was asked to check in the sample panel, by sample id. */
  gate: Record<string, { accepted: boolean; reasons: string[] }>;
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
  gate: {},
};

interface GateSample {
  id: string;
  itemId: string;
  label: string;
  answer: Record<string, unknown>;
  /** The inspector's line, when the sample is about what the line allows. */
  note?: string;
}

/**
 * Four answers a cloud model could plausibly return, kept in the page so the
 * gate can be tried without a key and without a network.
 */
const GATE_SAMPLES: GateSample[] = [
  {
    id: "good",
    itemId: "fe-01",
    label: "A supported answer: extinguisher present, clause FE-01, pass",
    answer: {
      targetPresent: true,
      targetName: "fire extinguisher",
      defectType: "none",
      severity: "none",
      obscured: false,
      note: "cabinet intact, gauge in the green",
      clauseId: "FE-01",
      remedy: "No action today, keep the monthly tag filled in.",
      suggestedVerdict: "pass",
    },
  },
  {
    id: "wrong-clause",
    itemId: "fe-01",
    label: "A clause that exists but does not apply to this item (ST-04)",
    answer: {
      targetPresent: true,
      targetName: "fire extinguisher",
      defectType: "none",
      severity: "none",
      obscured: false,
      note: "cabinet intact",
      clauseId: "ST-04",
      remedy: "No action today.",
      suggestedVerdict: "pass",
    },
  },
  {
    id: "overrule",
    itemId: "el-03",
    label: "Exposed live parts but the model suggests pass",
    answer: {
      targetPresent: true,
      targetName: "distribution board",
      defectType: "exposed_parts",
      severity: "high",
      obscured: false,
      note: "cover off, busbars exposed",
      clauseId: "EL-03",
      remedy: "Refit the cover before the board is left unattended.",
      suggestedVerdict: "pass",
    },
  },
  {
    id: "thin",
    itemId: "sd-08",
    label: "An answer with no remedy and no clause",
    answer: {
      targetPresent: true,
      targetName: "smoke detector",
      defectType: "painted_over",
      severity: "medium",
      obscured: false,
      note: "paint on the casing",
      clauseId: "",
      remedy: "",
      suggestedVerdict: "fail",
    },
  },
  {
    id: "open-line",
    itemId: "sp-10",
    label: "A verdict on a line the inspector left open",
    note: "Head looks painted, not sure whether that is allowed.",
    answer: {
      targetPresent: true,
      targetName: "sprinkler head",
      defectType: "painted_over",
      severity: "medium",
      obscured: false,
      note: "paint on the head",
      clauseId: "SP-10",
      remedy: "Have the head replaced and tested.",
      suggestedVerdict: "fail",
    },
  },
  {
    id: "no-severity",
    itemId: "sp-10",
    label: "A defect with no severity that the line does not name",
    note: "Head clear, cage intact, clearance below open.",
    answer: {
      targetPresent: true,
      targetName: "sprinkler head",
      defectType: "damaged_housing",
      severity: "none",
      obscured: false,
      note: "cage looks damaged",
      clauseId: "SP-10",
      remedy: "Have someone check the cage.",
      suggestedVerdict: "unknown",
    },
  },
];

function checkGateSample(sample: GateSample): void {
  const item = state.pack.items.find((entry) => entry.id === sample.itemId);
  if (!item) return;
  const verification = verifyCloudAnswer(sample.answer, item, state.pack, "unknown", null, new Date(), sample.note ?? "");
  state.gate[sample.id] = { accepted: verification.accepted, reasons: verification.reasons };
  render();
}

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

/**
 * The layer that structured the note, named apart from the layer that judged it:
 * `on_device` is the Gemini Nano model (through firebase/ai in a configured
 * build, through the browser's own LanguageModel in the published one) and
 * `local_rules` is the built-in rule parser.
 */
function sourceText(observation: Observation): string {
  if (observation.source === "on_device") {
    if (observation.deviceSource === "on_device") return "On-device model";
    if (observation.deviceSource === "local_rules") return "Rule parser";
    return "Device";
  }
  if (observation.source === "in_cloud") return "Cloud";
  if (observation.source === "rejected_unsupported") return "Rejected";
  return "Unresolved";
}

function plainSource(source: string, deviceSource = ""): string {
  if (source === "in_cloud") return "Cloud";
  if (source === "rejected_unsupported") return "Rejected";
  if (source === "on_device") {
    if (deviceSource === "on_device") return "On-device model";
    if (deviceSource === "local_rules") return "Rule parser";
    return "Device";
  }
  return "Unresolved";
}

function plainDetail(text: string): string {
  return text.replace(/https?:\/\/\S+/g, "").replace(/\s+/g, " ").trim();
}

/** Says which layer structured a note, and by which route in this build. */
function structuringDetail(source: Observation["deviceSource"]): string {
  if (source === "on_device") {
    return state.firebaseReady
      ? "Note structured on this device through firebase/ai (ONLY_ON_DEVICE) from Firebase AI Logic."
      : "Note structured by this browser's own LanguageModel, because this published build carries no Firebase project.";
  }
  if (source === "local_rules") return "Note structured by the built-in rule parser on this device, because no on-device model answered.";
  return "No structured finding for this item.";
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

/**
 * The cloud is asked only about an item the device could not settle: either the
 * rule pack left it open on a decisive line, or the device's own reading did
 * not survive the check against that line. When the line itself is why the item
 * is open, a bigger model reading the same line cannot settle it either, so the
 * item stays with a person and the day's cloud budget is not spent on it.
 */
function canRetryInCloud(observation: Observation): boolean {
  return Boolean(
    observation.reviewRequired && observation.note.trim() && observation.noteCheck?.hold !== "inconclusive",
  );
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
  /* The device model is the browser's own when this build has no Firebase
     project, so the published page still runs the on-device path. */
  const ready = state.device === "ready";
  const structure = state.firebaseReady ? structureWithDevice : structureWithBrowserDevice;
  return {
    structureOnDevice: ready ? (item, note) => structure(item, note) : undefined,
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

/**
 * What this build actually runs. The line under the page said which models a
 * configured build uses even when this build had no Firebase values, so it
 * described something the page could not do.
 */
function footText(): string {
  if (!state.firebaseReady) {
    return "Published demo build: no Firebase project, so no AI Logic call is made here; notes are structured by this browser's own model or the rule parser and cloud checks are off";
  }
  const check = appCheckStatus();
  const checkText =
    check.state === "on" ? "App Check on" : check.state === "failed" ? "App Check failed" : "App Check off";
  return `Firebase AI Logic hybrid (config: ${firebaseConfigSource()}) / Gemini Nano 4 on device through firebase/ai / ${esc(state.cloudModel)} for items the device leaves open / ${checkText}`;
}

/** The App Check state, shown rather than logged, because AI Logic needs it. */
function appCheckBadge(): string {
  const check = appCheckStatus();
  if (check.state === "not started") return "";
  const label =
    check.state === "on" ? "app check: on" : check.state === "failed" ? "app check: failed" : "app check: off";
  return `<span class="badge" title="${esc(check.detail)}">${esc(label)}</span>`;
}

function badgeRow(): string {
  const pack = state.pack;
  const originLabel = state.packOrigin === "remote" ? "remote" : state.packOrigin === "cache" ? "cached" : "built-in";
  const deviceLabel =
    state.device === "ready"
      ? state.firebaseReady
        ? "on-device model ready (firebase/ai)"
        : "on-device model ready (browser)"
      : state.device === "checking"
        ? "device: checking"
        : state.device === "downloadable"
          ? "device model: press prepare"
          : "device: unavailable";
  const cloud = !state.firebaseReady
    ? `cloud: ${state.cloudModel} (not configured)`
    : state.cloudFallback
      ? `cloud: ${state.cloudModel} (fallback)`
      : `cloud: ${state.cloudModel}`;
  const net = state.online ? "online" : "offline";
  return [
    `<span class="badge strong" title="${esc(state.packDetail)}">pack ${esc(pack.version)} <span class="badge-sub">${originLabel}</span></span>`,
    `<span class="badge" title="${esc(state.deviceDetail || "The on-device model structures the note when the device has it.")}">${esc(deviceLabel)}</span>`,
    `<span class="badge">${esc(cloud)}</span>`,
    state.firebaseReady ? appCheckBadge() : "",
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

/** Why an item is still open when no cloud call was made for it. */
function unsettledReason(observation: Observation): string {
  const hold = observation.noteCheck?.hold ?? "none";
  if (hold === "inconclusive") {
    return "The line is why this item is open, so it was not sent to the cloud and no budget was spent.";
  }
  if (hold === "misread") {
    return !state.firebaseReady
      ? "The device's reading did not hold and cloud checks are off in this build, so a person has to look at this item."
      : !state.online
        ? "The device's reading did not hold and there is no network. The item waits in the queue for a cloud check."
        : "The device's reading did not hold and no cloud call was made for this item, so a person has to look at it.";
  }
  return !state.firebaseReady
    ? "Cloud checks are off in this build, so the item is marked for a person."
    : !state.online
      ? "No network. The item waits in the queue for a cloud check."
      : "No cloud call was made for this item.";
}

function resultBlock(item: RulePack["items"][number], observation: Observation | undefined, busy: boolean): string {
  if (busy) {
    return `<div class="result working"><span class="dot-pulse"></span>Reading the note, judging, and writing the record.</div>`;
  }
  if (!observation) {
    return `<p class="hint">The photo stays on this device. The note is structured here, and the rule pack decides the verdict.</p>`;
  }

  const details: string[] = [];
  details.push(structuringDetail(observation.deviceSource));
  if (observation.photoDataUrl) details.push("Photo re-encoded on the device, so EXIF and GPS are gone.");
  if (observation.cloud) {
    details.push(
      `Cloud call ${observation.cloud.model}: ${formatBytes(observation.cloud.payloadBytes)} of typed summary, no photo.` +
        (observation.cloud.inferenceSource
          ? ` The AI Logic SDK reported inference source ${observation.cloud.inferenceSource}.`
          : ""),
    );
    if (observation.cloud.accepted) {
      details.push("Answer passed seven checks on the device: schema, clause in the pack, clause applies, no contradiction, the rule pack agrees with the suggested verdict, no hedge turned into a verdict, and the line carries the finding.");
      details.push(
        observation.cloud.settled
          ? `The rule pack settled this item at ${observation.verdict.toUpperCase()} from the answer's finding.`
          : "The rule pack still leaves this item open, so a person decides it.",
      );
    } else {
      details.push("Answer rejected on the device. A person has to decide this item.");
    }
  } else if (observation.verdict === "unknown") {
    details.push(unsettledReason(observation));
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
  const queued = state.observations.filter((entry) => canRetryInCloud(entry)).length;
  return `
    <div class="card actions">
      <button class="primary" id="run-demo" ${state.busyAll ? "disabled" : ""}>${state.busyAll ? "Running the sample walkthrough..." : "Load the sample walkthrough"}</button>
      <button id="prepare-device" ${state.device === "ready" ? "disabled" : ""}>${state.device === "ready" ? "On-device model ready" : "Prepare on-device model"}</button>
      ${
        state.firebaseReady && queued
          ? `<button id="retry-cloud" ${state.busyAll ? "disabled" : ""}>Retry ${queued} waiting ${queued === 1 ? "item" : "items"} in the cloud</button>`
          : ""
      }
      <button id="export-csv" ${stats.checked ? "" : "disabled"}>Export ledger CSV</button>
      <button id="print-record" ${stats.checked ? "" : "disabled"}>Print inspection record</button>
      <button class="quiet" id="clear-walk" ${stats.checked ? "" : "disabled"}>Clear this walkthrough</button>
      ${
        state.device === "downloadable"
          ? `<p class="small">This browser has the on-device model but has not downloaded it yet. Prepare it once and every note after that is structured here.</p>`
          : ""
      }
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

function gateSection(): string {
  const rows = GATE_SAMPLES.map((sample) => {
    const outcome = state.gate[sample.id];
    const verdict = outcome
      ? outcome.accepted
        ? `<span class="gate-ok">accepted</span>`
        : `<span class="gate-no">refused</span><ul class="rejections">${outcome.reasons.map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul>`
      : "";
    return `<tr>
      <td>${esc(sample.label)}</td>
      <td><button class="quiet gate-try" data-gate="${esc(sample.id)}">Check this answer</button></td>
      <td>${verdict}</td>
    </tr>`;
  }).join("");
  return `
    <section class="card gate">
      <div class="section-head">
        <h2>Try the verification gate</h2>
        <p>Six answers a cloud model could send back. The device checks each one before it can change a record, with no network and no key: one that settles a line the inspector left open, and one whose defect the line does not name.</p>
      </div>
      <div class="scroll">
        <table class="gate-table">
          <thead><tr><th>Answer</th><th></th><th>Gate</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="small">The same forty observations are measured on the <a href="./bench/">forty item page</a>: the on-device path and the shipped hybrid, with the answers each one produced and an earlier six item cloud only baseline beside them.</p>
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
        <td>${esc(plainSource(entry.source, entry.deviceSource))}</td>
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

    <div class="reviewer-wrap">
      <p class="reviewer">
        <span class="reviewer-label">Reviewing without #config</span>
        This published build carries no Firebase project, because the rules keep production keys out of the repository, the submission form and the testing instructions, so notes here are structured by this browser's own Gemini Nano or by the rule parser. A build made with Firebase values calls <code>firebase/ai</code> with <code>ONLY_ON_DEVICE</code> for the note and <code>ONLY_IN_CLOUD</code> for the cloud answer, and starts App Check through reCAPTCHA Enterprise; the configured build run on 2026-11-25 read <code>app check: on</code>, and its cloud record came back as <code>gemini-4-hydrogen</code> with <code>inference source in_cloud</code>, 472 bytes of typed summary and 0 photo bytes. The README section <a href="https://github.com/luke-shin-ai/walkproof#firebase-ai-logic-at-runtime-and-app-check">Firebase AI Logic at runtime and App Check</a> and <code>scripts/read-configured-build.py</code> reproduce it.
      </p>
    </div>

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
            <li>The note is structured on the device into one schema: Gemini Nano through firebase/ai in a build with Firebase values, or this browser's own model in the published build. Without either, the built-in rule parser does it.</li>
            <li>The rule pack decides pass, fail or unknown. A model never sets the verdict on its own.</li>
            <li>Only an item the rule pack leaves open, on a line that was decisive, goes to the cloud, inside the day's budget, as a typed summary. So does an item whose device reading did not survive the check against the line. A line that says the observer could not tell goes straight to a person.</li>
            <li>The answer is checked on the device, seven checks including whether the line can carry the finding. A wrong clause, a missing field, a hedge turned into a verdict or a contradiction is rejected and handed to a person. An answer that passes becomes the finding, and the rule pack turns it into the verdict.</li>
          </ol>
        </div>
      </aside>
    </div>

    ${ledgerSection()}
    ${gateSection()}
    ${reportSection()}

    <footer class="foot">
      <span>WalkProof / ${stats.checked} of ${stats.total} recorded</span>
      <span>${footText()}</span>
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
  document.querySelectorAll<HTMLButtonElement>("[data-gate]").forEach((button) => {
    button.addEventListener("click", () => {
      const sample = GATE_SAMPLES.find((entry) => entry.id === button.dataset.gate);
      if (sample) checkGateSample(sample);
    });
  });
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
  const waiting = state.observations.filter((entry) => canRetryInCloud(entry));
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
  const viaFirebase = state.firebaseReady;
  setStatus(
    viaFirebase
      ? "Preparing the on-device model. The first run downloads it."
      : "Preparing this browser's built-in model. The first run downloads it.",
  );
  render();
  const reportProgress = (value: number) => setStatus(`On-device model download ${(value * 100).toFixed(0)}%`);
  try {
    if (viaFirebase) {
      await warmDeviceModel(reportProgress);
    } else {
      await warmBrowserDeviceModel(reportProgress);
    }
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
    state.deviceDetail = hasBrowserDeviceModel()
      ? `LanguageModel.availability(): ${value}. This browser can structure notes without a Firebase project.`
      : `LanguageModel.availability(): ${value}`;
    render();
  });

  if (!state.firebaseReady) {
    state.packDetail =
      "Firebase values are not loaded in this build, so the built-in pack is used and cloud checks are off. The on-device model still runs here when this browser has one.";
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
