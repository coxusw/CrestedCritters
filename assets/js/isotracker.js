(function () {
"use strict";

const CONFIG = window.ISO_TRACKER_CONFIG || {};
const DEFAULT_LOGO = CONFIG.defaultLogoUrl || "/assets/images/logo.png";

const DB_NAME = "IsoTrackerDB";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const STATE_KEY = "app_state";

const BUILTIN_TAGS = ["Breeding", "For Sale", "Experimental"];
const PRESET_KEYS = ["online", "expo", "wholesale"];

const DEFAULT_THRESHOLDS = {
misting: { green: 3, yellow: 10 },
feeding: { green: 3, yellow: 10 },
substrate: { green: 3, yellow: 10 },
botanicals: { green: 3, yellow: 10 }
};

function emptyPreset() {
return {
priceData: {},
botanicalPriceData: {},
priceSections: ["Isopods", "Springtails", "Botanicals", "Exotic", "Mid Tier", "Beginner"],
itemOrders: {
colonyTypes: [],
botanicals: []
}
};
}

const DEFAULT_STATE = {
colonies: [],
botanicals: [],
salePrep: {
supplies: [],
packagedItems: []
},
settings: {
appLogoUri: "",
priceSheetLogoUri: "",
businessName: "IsoTracker",
tagline: "Colony Tracker & Price Sheets",
theme: "botanical",
promoText: "",
footerNote: "",
customTags: [],
typeThresholds: {}
},
activePricePreset: "online",
pricePresets: {
online: emptyPreset(),
expo: emptyPreset(),
wholesale: emptyPreset()
},

// legacy compatibility
priceData: {},
botanicalPriceData: {},
priceSections: ["Isopods", "Springtails", "Botanicals", "Exotic", "Mid Tier", "Beginner"],
itemOrders: {
colonyTypes: [],
botanicals: []
}
};

let state = clone(DEFAULT_STATE);

const colonyFilters = {
search: "",
category: "all",
status: "all",
tag: "all"
};

// =========================
// basic utils
// =========================
function clone(obj) {
return JSON.parse(JSON.stringify(obj));
}

function esc(text) {
return String(text || "").replace(/[&<>"']/g, function (m) {
return {
"&": "&amp;",
"<": "&lt;",
">": "&gt;",
'"': "&quot;",
"'": "&#039;"
}[m];
});
}

function $(selector) {
return document.querySelector(selector);
}

// ===== INPUT STATE PRESERVER =====
function saveInputState(input) {
  return {
    value: input.value,
    selectionStart: input.selectionStart,
    selectionEnd: input.selectionEnd
  };
}

function restoreInputState(input, state) {
  if (!input || !state) return;
  input.value = state.value;
  input.setSelectionRange(state.selectionStart, state.selectionEnd);
}

// ===== DEBOUNCE =====
function debounce(fn, delay = 250) {
  let timer;
  return function (...args) {
    clearTimeout(timer);
    timer = setTimeout(() => fn.apply(this, args), delay);
  };
}

function $all(selector) {
return Array.from(document.querySelectorAll(selector));
}

function app(html) {
const root = $("#isoApp");
if (root) root.innerHTML = html;
}

function uid() {
if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function nowIso() {
return new Date().toISOString();
}

function formatDate(input) {
if (!input) return "";
const d = new Date(input);
if (Number.isNaN(d.getTime())) return "";
const m = String(d.getMonth() + 1).padStart(2, "0");
const day = String(d.getDate()).padStart(2, "0");
const y = d.getFullYear();
return `${m}/${day}/${y}`;
}

function formatDateTime(input) {
if (!input) return "";
const d = new Date(input);
if (Number.isNaN(d.getTime())) return "";
return `${formatDate(d)} ${d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`;
}

function todayString() {
return formatDate(new Date());
}

function parseDateString(str) {
if (!str) return null;
const parts = str.split("/");
if (parts.length !== 3) return null;
const [m, d, y] = parts.map(Number);
if (!m || !d || !y) return null;
return new Date(y, m - 1, d);
}

function daysSince(dateStr) {
if (!dateStr) return 999999;
const dt = parseDateString(dateStr);
if (!dt) return 999999;
const today = new Date();
today.setHours(0, 0, 0, 0);
dt.setHours(0, 0, 0, 0);
return Math.floor((today - dt) / 86400000);
}

function toInt(value, fallback = 0) {
const n = parseInt(value, 10);
return Number.isFinite(n) ? n : fallback;
}

function slug(str) {
return (str || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

// =========================
// indexeddb
// =========================
async function getDB() {
return new Promise((resolve, reject) => {
const req = indexedDB.open(DB_NAME, DB_VERSION);

req.onupgradeneeded = function () {
const db = req.result;
if (!db.objectStoreNames.contains(STORE_NAME)) {
db.createObjectStore(STORE_NAME);
}
};

req.onsuccess = function () {
resolve(req.result);
};

req.onerror = function () {
reject(req.error);
};
});
}

async function idbGet(key) {
const db = await getDB();
return new Promise((resolve, reject) => {
const tx = db.transaction(STORE_NAME, "readonly");
const store = tx.objectStore(STORE_NAME);
const req = store.get(key);
req.onsuccess = () => resolve(req.result);
req.onerror = () => reject(req.error);
});
}

async function idbSet(key, value) {
const db = await getDB();
return new Promise((resolve, reject) => {
const tx = db.transaction(STORE_NAME, "readwrite");
const store = tx.objectStore(STORE_NAME);
const req = store.put(value, key);
req.onsuccess = () => resolve();
req.onerror = () => reject(req.error);
});
}

async function saveState() {
await idbSet(STATE_KEY, state);
}

// =========================
// migration helpers
// =========================
function ensureSupplyShape(item) {
return {
id: item?.id || uid(),
name: item?.name || "",
quantity: Math.max(0, toInt(item?.quantity, 0)),
reorderThreshold: Math.max(0, toInt(item?.reorderThreshold, 0)),
note: item?.note || ""
};
}

function ensurePackagedItemShape(item) {
return {
id: item?.id || uid(),
sourceColonyName: item?.sourceColonyName || "",
typeName: item?.typeName || "",
quantity: Math.max(0, toInt(item?.quantity, 0)),
saleUnitLabel: item?.saleUnitLabel || "",
packedAt: item?.packedAt || nowIso(),
inventoryMode: item?.inventoryMode === "unit" ? "unit" : "count",
amountSubtracted: Math.max(0, toInt(item?.amountSubtracted, 0)),
containerSupplyId: item?.containerSupplyId || ""
};
}

function ensureColonyShape(colony) {
return {
colonyName: colony?.colonyName || "",
typeName: colony?.typeName || "",
category: colony?.category || "Isopods",
typeImageUri: colony?.typeImageUri || "",
dateAdded: colony?.dateAdded || todayString(),
population: Math.max(0, toInt(colony?.population, 0)),
lastMisting: colony?.lastMisting || "",
lastBotanicalsCheck: colony?.lastBotanicalsCheck || "",
lastSubstrateCheck: colony?.lastSubstrateCheck || "",
lastSupplementalFeeding: colony?.lastSupplementalFeeding || "",
lastHusbandry: colony?.lastHusbandry || "",
customNote: colony?.customNote || "",
tags: Array.isArray(colony?.tags) ? colony.tags : [],
history: Array.isArray(colony?.history) ? colony.history : [],
inventoryMode: colony?.inventoryMode === "unit" ? "unit" : "count",
saleUnitLabel: colony?.saleUnitLabel || "10 count",
saleUnitSize: Math.max(1, toInt(colony?.saleUnitSize, 10)),
prepEnabled: typeof colony?.prepEnabled === "boolean" ? colony.prepEnabled : false,
containerSupplyId: colony?.containerSupplyId || ""
};
}

function getPreset(name) {
if (!state.pricePresets[name]) state.pricePresets[name] = emptyPreset();
const preset = state.pricePresets[name];
preset.priceData = preset.priceData || {};
preset.botanicalPriceData = preset.botanicalPriceData || {};
preset.priceSections = Array.isArray(preset.priceSections) ? preset.priceSections : emptyPreset().priceSections;
preset.itemOrders = preset.itemOrders || { colonyTypes: [], botanicals: [] };
preset.itemOrders.colonyTypes = Array.isArray(preset.itemOrders.colonyTypes) ? preset.itemOrders.colonyTypes : [];
preset.itemOrders.botanicals = Array.isArray(preset.itemOrders.botanicals) ? preset.itemOrders.botanicals : [];
return preset;
}

function uniqueTypes() {
return [...new Set(state.colonies.map(c => (c.typeName || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function uniqueCategories() {
return [...new Set(state.colonies.map(c => (c.category || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function getAvailableTags() {
return [...new Set([...BUILTIN_TAGS, ...(state.settings.customTags || [])])].filter(Boolean).sort((a, b) => a.localeCompare(b));
}

function syncOrderedList(sourceList, savedOrder) {
const existing = sourceList.slice();
const seen = new Set();
const result = [];

(savedOrder || []).forEach(name => {
if (existing.includes(name) && !seen.has(name)) {
result.push(name);
seen.add(name);
}
});

existing.forEach(name => {
if (!seen.has(name)) {
result.push(name);
seen.add(name);
}
});

return result;
}

function syncAllPresetOrders() {
const types = uniqueTypes();
const botanicalNames = state.botanicals.map(b => b.itemName);

PRESET_KEYS.forEach(name => {
const preset = getPreset(name);
preset.itemOrders.colonyTypes = syncOrderedList(types, preset.itemOrders.colonyTypes);
preset.itemOrders.botanicals = syncOrderedList(botanicalNames, preset.itemOrders.botanicals);
});
}

function migrateState() {
state.settings = { ...DEFAULT_STATE.settings, ...(state.settings || {}) };
state.settings.customTags = Array.isArray(state.settings.customTags) ? state.settings.customTags : [];
state.settings.typeThresholds = state.settings.typeThresholds || {};

if (!state.pricePresets) {
state.pricePresets = {
online: {
priceData: state.priceData || {},
botanicalPriceData: state.botanicalPriceData || {},
priceSections: state.priceSections || emptyPreset().priceSections,
itemOrders: state.itemOrders || { colonyTypes: [], botanicals: [] }
},
expo: emptyPreset(),
wholesale: emptyPreset()
};
}

PRESET_KEYS.forEach(name => getPreset(name));

state.activePricePreset = PRESET_KEYS.includes(state.activePricePreset) ? state.activePricePreset : "online";
state.colonies = Array.isArray(state.colonies) ? state.colonies.map(ensureColonyShape) : [];
state.botanicals = Array.isArray(state.botanicals) ? state.botanicals : [];
state.salePrep = state.salePrep || { supplies: [], packagedItems: [] };
state.salePrep.supplies = Array.isArray(state.salePrep.supplies) ? state.salePrep.supplies.map(ensureSupplyShape) : [];
state.salePrep.packagedItems = Array.isArray(state.salePrep.packagedItems) ? state.salePrep.packagedItems.map(ensurePackagedItemShape) : [];
syncAllPresetOrders();
}

async function loadState() {
const saved = await idbGet(STATE_KEY);
if (saved && typeof saved === "object") {
state = {
...clone(DEFAULT_STATE),
...saved,
settings: {
...DEFAULT_STATE.settings,
...(saved.settings || {})
}
};
} else {
state = clone(DEFAULT_STATE);
}
migrateState();
await saveState();
}

// =========================
// branding + sw
// =========================
function getBrandLogo() {
return state.settings.appLogoUri || DEFAULT_LOGO;
}

function getPriceSheetLogo() {
return state.settings.priceSheetLogoUri || state.settings.appLogoUri || DEFAULT_LOGO;
}

function applyHeaderBranding() {
const logo = getBrandLogo();
const a = $("#heroBrandLogo");
const b = $("#heroCreditLogo");
if (a) a.src = logo;
if (b) b.src = logo;
}

function registerServiceWorker() {
if (!("serviceWorker" in navigator)) return;
window.addEventListener("load", () => {
navigator.serviceWorker.register("/assets/js/sw.js").catch(() => {});
});
}

// =========================
// image compression
// =========================
async function compressImageFile(file, options = {}) {
const {
maxWidth = 900,
maxHeight = 900,
quality = 0.78,
mimeType = "image/jpeg"
} = options;

const dataUrl = await readFileAsDataURL(file);
const img = await loadImage(dataUrl);

let width = img.width;
let height = img.height;

const ratio = Math.min(1, maxWidth / width || 1, maxHeight / height || 1);
width = Math.round(width * ratio);
height = Math.round(height * ratio);

const canvas = document.createElement("canvas");
canvas.width = width;
canvas.height = height;

const ctx = canvas.getContext("2d");
ctx.drawImage(img, 0, 0, width, height);

return canvas.toDataURL(mimeType, quality);
}

function readFileAsDataURL(file) {
return new Promise((resolve, reject) => {
const reader = new FileReader();
reader.onload = e => resolve(e.target.result);
reader.onerror = () => reject(reader.error);
reader.readAsDataURL(file);
});
}

function loadImage(src) {
return new Promise((resolve, reject) => {
const img = new Image();
img.onload = () => resolve(img);
img.onerror = reject;
img.src = src;
});
}

// =========================
// help bubbles
// =========================
function help(text) {
return `
<span class="iso-help-wrap">
<button type="button" class="iso-help-btn" aria-label="Help">?</button>
<span class="iso-help-pop">${esc(text)}</span>
</span>
`;
}

function closeHelpBubbles() {
$all("#isoAppShell .iso-help-wrap.open").forEach(el => el.classList.remove("open"));
}

function bindHelpDelegation() {
document.addEventListener("click", (e) => {
const btn = e.target.closest(".iso-help-btn");
if (btn) {
e.stopPropagation();
const wrap = btn.closest(".iso-help-wrap");
const isOpen = wrap.classList.contains("open");
closeHelpBubbles();
if (!isOpen) wrap.classList.add("open");
return;
}
if (!e.target.closest(".iso-help-wrap")) {
closeHelpBubbles();
}
});
}

// =========================
// modal
// =========================
function ensureModalRoot() {
if ($("#isoModalOverlay")) return;

const overlay = document.createElement("div");
overlay.id = "isoModalOverlay";
overlay.className = "iso-modal-overlay";
overlay.innerHTML = `
<div class="iso-modal" id="isoModal">
<div class="iso-modal-head">
<h3 class="iso-modal-title" id="isoModalTitle">Modal</h3>
<button class="iso-close-btn" id="isoModalCloseBtn" type="button">×</button>
</div>
<div id="isoModalBody"></div>
</div>
`;
document.body.appendChild(overlay);

overlay.addEventListener("click", (e) => {
if (e.target === overlay) closeModal();
});
$("#isoModalCloseBtn").addEventListener("click", closeModal);
}

function openModal(title, html, bindFn) {
ensureModalRoot();
$("#isoModalTitle").textContent = title;
$("#isoModalBody").innerHTML = html;
$("#isoModalOverlay").classList.add("open");
if (typeof bindFn === "function") bindFn();
}

function closeModal() {
const overlay = $("#isoModalOverlay");
if (overlay) overlay.classList.remove("open");
}

// =========================
// history + statuses
// =========================
function addHistory(colony, action, detail) {
colony.history.unshift({
ts: nowIso(),
action,
detail
});
}

function updateLastHusbandry(colony) {
const dates = [
colony.lastMisting,
colony.lastBotanicalsCheck,
colony.lastSubstrateCheck,
colony.lastSupplementalFeeding
].filter(Boolean);

if (!dates.length) {
colony.lastHusbandry = "";
return;
}

let latest = dates[0];
for (const d of dates) {
if (parseDateString(d) > parseDateString(latest)) latest = d;
}
colony.lastHusbandry = latest;
}

function getTypeThresholds(typeName) {
const saved = state.settings.typeThresholds[typeName] || {};
return {
misting: { ...DEFAULT_THRESHOLDS.misting, ...(saved.misting || {}) },
feeding: { ...DEFAULT_THRESHOLDS.feeding, ...(saved.feeding || {}) },
substrate: { ...DEFAULT_THRESHOLDS.substrate, ...(saved.substrate || {}) },
botanicals: { ...DEFAULT_THRESHOLDS.botanicals, ...(saved.botanicals || {}) }
};
}

function getTaskStatus(days, threshold) {
if (days <= threshold.green) return "green";
if (days <= threshold.yellow) return "yellow";
return "red";
}

function getColonyTaskStatus(colony) {
const thresholds = getTypeThresholds(colony.typeName);
const fallback = colony.lastHusbandry || colony.dateAdded || "";

const mistingDays = daysSince(colony.lastMisting || fallback);
const feedingDays = daysSince(colony.lastSupplementalFeeding || fallback);
const substrateDays = daysSince(colony.lastSubstrateCheck || fallback);
const botanicalsDays = daysSince(colony.lastBotanicalsCheck || fallback);

return {
misting: { days: mistingDays, status: getTaskStatus(mistingDays, thresholds.misting), threshold: thresholds.misting },
feeding: { days: feedingDays, status: getTaskStatus(feedingDays, thresholds.feeding), threshold: thresholds.feeding },
substrate: { days: substrateDays, status: getTaskStatus(substrateDays, thresholds.substrate), threshold: thresholds.substrate },
botanicals: { days: botanicalsDays, status: getTaskStatus(botanicalsDays, thresholds.botanicals), threshold: thresholds.botanicals }
};
}

function getOverallColonyStatus(colony) {
const taskStatus = getColonyTaskStatus(colony);
const statuses = Object.values(taskStatus).map(v => v.status);
if (statuses.includes("red")) return "red";
if (statuses.includes("yellow")) return "yellow";
return "green";
}

function statusLabel(status) {
if (status === "green") return "Checked Recently";
if (status === "yellow") return "Needs Attention Soon";
return "Needs Checked";
}

function statusRank(status) {
return { green: 1, yellow: 2, red: 3 }[status] || 3;
}

// =========================
// tabs
// =========================
function setTab(tab) {
$all(".iso-tab").forEach(btn => {
btn.classList.toggle("active", btn.dataset.tab === tab);
});

if (tab === "colonies") renderColonies();
if (tab === "population") renderPopulation();
if (tab === "botanicals") renderBotanicals();
if (tab === "prep") renderSalePrep();
if (tab === "price") renderPriceSheet();
if (tab === "settings") renderSettings();
}

function bindTabEvents() {
$all(".iso-tab").forEach(btn => {
btn.addEventListener("click", () => setTab(btn.dataset.tab));
});
}

// =========================
// colony rendering
// =========================
function renderTagCheckboxes(selectedTags) {
const tags = getAvailableTags();
return `
<div class="iso-chip-row">
${tags.map(tag => `
<label class="iso-chip">
<input type="checkbox" class="iso-tag-check" value="${esc(tag)}" ${(selectedTags || []).includes(tag) ? "checked" : ""}>
${esc(tag)}
</label>
`).join("")}
</div>
`;
}

function gatherSelectedTags() {
return $all(".iso-tag-check:checked").map(el => el.value);
}

function renderSupplyOptions(selectedId) {
const supplies = state.salePrep.supplies.slice().sort((a, b) => a.name.localeCompare(b.name));
return `
<option value="">None</option>
${supplies.map(s => `<option value="${esc(s.id)}" ${selectedId === s.id ? "selected" : ""}>${esc(s.name)}</option>`).join("")}
`;
}

function bindInventoryModeUi(prefix) {
const mode = document.getElementById(prefix + "inventoryMode");
const sizeWrap = document.getElementById(prefix + "saleUnitSizeWrap");
if (!mode || !sizeWrap) return;
const update = () => {
sizeWrap.style.display = mode.value === "count" ? "block" : "none";
};
mode.addEventListener("change", update);
update();
}

function getChosenCategory(prefix = "") {
const select = document.getElementById(prefix + "categorySelect");
if (!select) return "";
if (select.value === "__custom__") {
return (document.getElementById(prefix + "customCategory")?.value || "").trim();
}
return select.value.trim();
}

function filterColonies() {
const search = colonyFilters.search.trim().toLowerCase();
const category = colonyFilters.category;
const status = colonyFilters.status;
const tag = colonyFilters.tag;

return state.colonies
.slice()
.sort((a, b) => {
const aRank = statusRank(getOverallColonyStatus(a));
const bRank = statusRank(getOverallColonyStatus(b));
if (aRank !== bRank) return bRank - aRank;
return daysSince(b.lastHusbandry) - daysSince(a.lastHusbandry);
})
.filter(c => {
const hay = `${c.colonyName || ""} ${c.typeName || ""}`.toLowerCase();
if (search && !hay.includes(search)) return false;
if (category !== "all" && (c.category || "") !== category) return false;
if (status !== "all" && getOverallColonyStatus(c) !== status) return false;
if (tag !== "all" && !(c.tags || []).includes(tag)) return false;
return true;
});
}

function renderColonies() {
const sorted = filterColonies();
const categories = uniqueCategories();
const redCount = state.colonies.filter(c => getOverallColonyStatus(c) === "red").length;
const yellowCount = state.colonies.filter(c => getOverallColonyStatus(c) === "yellow").length;

let html = `
<div class="iso-section-head">
<h2 class="iso-section-title">Colonies</h2>
${help("This is your working list. The card status is based on the most overdue task using default or per-type thresholds.")}
</div>
<p class="iso-subtext">Oldest attention needs rise to the top so you can work your collection efficiently.</p>

<div class="iso-kv-grid" style="margin-bottom:14px;">
<div class="iso-stat"><div class="iso-stat-label">Total Colonies</div><div class="iso-stat-value">${state.colonies.length}</div></div>
<div class="iso-stat"><div class="iso-stat-label">Needs Checked</div><div class="iso-stat-value">${redCount}</div></div>
<div class="iso-stat"><div class="iso-stat-label">Attention Soon</div><div class="iso-stat-value">${yellowCount}</div></div>
</div>

<div class="iso-toolbar">
<button class="iso-btn iso-btn-primary" data-action="show-add-colony">+ Add Colony</button>
</div>

<div class="iso-form-grid" style="margin-bottom:14px;">
<div>
<label>Search ${help("Searches colony name and type name.")}</label>
<input id="colonySearch" placeholder="Search colony name or type" value="${esc(colonyFilters.search)}">
</div>
<div>
<label>Category ${help("Filter by category such as Isopods, Springtails, or your custom categories.")}</label>
<select id="colonyCategoryFilter">
<option value="all"${colonyFilters.category === "all" ? " selected" : ""}>All Categories</option>
${categories.map(cat => `<option value="${esc(cat)}"${colonyFilters.category === cat ? " selected" : ""}>${esc(cat)}</option>`).join("")}
</select>
</div>
<div>
<label>Status ${help("Green = checked recently, Yellow = attention soon, Red = needs checked.")}</label>
<select id="colonyStatusFilter">
<option value="all"${colonyFilters.status === "all" ? " selected" : ""}>All Statuses</option>
<option value="green"${colonyFilters.status === "green" ? " selected" : ""}>Checked Recently</option>
<option value="yellow"${colonyFilters.status === "yellow" ? " selected" : ""}>Needs Attention Soon</option>
<option value="red"${colonyFilters.status === "red" ? " selected" : ""}>Needs Checked</option>
</select>
</div>
<div>
<label>Tag ${help("Built-in tags are Breeding, For Sale, and Experimental. Custom tags can be added in Settings.")}</label>
<select id="colonyTagFilter">
<option value="all"${colonyFilters.tag === "all" ? " selected" : ""}>All Tags</option>
${getAvailableTags().map(tag => `<option value="${esc(tag)}"${colonyFilters.tag === tag ? " selected" : ""}>${esc(tag)}</option>`).join("")}
</select>
</div>
</div>
`;

if (!sorted.length) {
html += `<div class="iso-empty">No colonies match your current filters.</div>`;
app(html);
bindColonyListActions();
return;
}

html += `<div class="iso-grid">`;
sorted.forEach(c => {
const index = state.colonies.findIndex(x => x.colonyName === c.colonyName);
const status = getOverallColonyStatus(c);
html += `
<div class="iso-card iso-card-clickable iso-status-${status}" data-open-colony="${index}">
<div class="iso-card-head">
<div class="iso-card-title-wrap">
${c.typeImageUri ? `<img class="iso-colony-avatar" src="${c.typeImageUri}" alt="">` : ""}
<div>
<h3 class="iso-card-title">${esc(c.colonyName)}</h3>
<div class="iso-muted">${esc(c.typeName)}</div>
</div>
</div>
<span class="iso-badge iso-badge-${status}">${statusLabel(status)}</span>
</div>
<div class="iso-meta">
<div><strong>Category:</strong> ${esc(c.category || "-")}</div>
<div><strong>Population / Units:</strong> ${Number(c.population) || 0}</div>
<div><strong>Date Added:</strong> ${c.dateAdded || "-"}</div>
<div><strong>Last Updated:</strong> ${c.lastHusbandry || "Never"}</div>
</div>
${(c.tags || []).length ? `<div class="iso-chip-row">${c.tags.map(tag => `<span class="iso-tag">${esc(tag)}</span>`).join("")}</div>` : ``}
</div>
`;
});
html += `</div>`;

app(html);
bindColonyListActions();
$all("[data-open-colony]").forEach(el => {
el.addEventListener("click", () => openColony(Number(el.dataset.openColony)));
});
}

function bindColonyListActions() {
const addBtn = $("[data-action='show-add-colony']");
if (addBtn) addBtn.onclick = showAddColonyForm;

const search = $("#colonySearch");
const cat = $("#colonyCategoryFilter");
const status = $("#colonyStatusFilter");
const tag = $("#colonyTagFilter");

if (search) {
  const debouncedSearch = debounce(() => {
    const input = $("#colonySearch");

    const state = saveInputState(input);

    colonyFilters.search = state.value;

    renderColonies();

    // restore AFTER render
    setTimeout(() => {
      const newInput = $("#colonySearch");
      restoreInputState(newInput, state);
      newInput.focus();
    }, 0);

  }, 250);

  search.addEventListener("input", debouncedSearch);
}

if (cat) cat.addEventListener("change", () => {
colonyFilters.category = cat.value;
renderColonies();
});

if (status) status.addEventListener("change", () => {
colonyFilters.status = status.value;
renderColonies();
});

if (tag) tag.addEventListener("change", () => {
colonyFilters.tag = tag.value;
renderColonies();
});
}

function showAddColonyForm() {
const knownCats = ["Isopods", "Springtails", "Botanicals", ...uniqueCategories()].filter((v, i, a) => v && a.indexOf(v) === i);

app(`
<div class="iso-section-head">
<h2 class="iso-section-title">Add Colony</h2>
${help("Colony names must be unique. Type names can repeat if you keep multiple colonies of the same type.")}
</div>
<p class="iso-subtext">Set up care tracking, tags, and sale prep behavior now or update them later.</p>

<div class="iso-form-grid">
<div>
<label>Colony Name ${help("Each colony name must be unique. Example: Red Panda Bin 1.")}</label>
<input id="colonyName" placeholder="Red Panda Bin 1">
</div>
<div>
<label>Type Name ${help("Type name is used for combined population totals and per-type care thresholds.")}</label>
<input id="typeName" placeholder="Red Panda">
</div>
<div>
<label>Date Added</label>
<input id="dateAdded" value="${todayString()}" placeholder="mm/dd/yyyy">
</div>
<div>
<label>Population / Units ${help("This is the tracked inventory amount for this colony.")}</label>
<input id="population" type="number" min="0" step="1" placeholder="0">
</div>
</div>

<div class="iso-form-grid">
<div>
<label>Category</label>
<select id="categorySelect">
${knownCats.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join("")}
<option value="__custom__">Custom</option>
</select>
</div>
<div id="customCategoryWrap" style="display:none;">
<label>Custom Category</label>
<input id="customCategory" placeholder="Example: Millipedes">
</div>
</div>

<div class="iso-form-grid">
<div><label>Last Misting</label><input id="lastMisting" placeholder="mm/dd/yyyy"></div>
<div><label>Last Botanicals Check</label><input id="lastBotanicalsCheck" placeholder="mm/dd/yyyy"></div>
<div><label>Last Substrate Check</label><input id="lastSubstrateCheck" placeholder="mm/dd/yyyy"></div>
<div><label>Last Supplemental Feeding</label><input id="lastSupplementalFeeding" placeholder="mm/dd/yyyy"></div>
</div>

<label>Type Picture</label>
<input id="typeImage" type="file" accept="image/*">

<div class="iso-divider"></div>

<div class="iso-section-head">
<h3 class="iso-card-title" style="margin:0;">Tags</h3>
${help("Built-in tags are always available. Add custom tags in Settings and they will appear here too.")}
</div>
${renderTagCheckboxes([])}

<div class="iso-divider"></div>

<div class="iso-section-head">
<h3 class="iso-card-title" style="margin:0;">For Sale Prep Setup</h3>
${help("Count mode subtracts sale unit size from colony quantity. Unit mode subtracts one tracked unit per prepared package.")}
</div>

<div class="iso-form-grid">
<div>
<label><input id="prepEnabled" type="checkbox"> Show in For Sale Prep</label>
</div>
<div>
<label>Inventory Mode ${help("Count mode is for 10 count, 6 count, 50 count. Unit mode is for 8 oz cultures or other prepared units.")}</label>
<select id="inventoryMode">
<option value="count">Count-based</option>
<option value="unit">Unit-based</option>
</select>
</div>
<div>
<label>Sale Unit Label ${help("Examples: 10 count, 6 count, 50 count, 8 oz culture.")}</label>
<input id="saleUnitLabel" value="10 count" placeholder="10 count">
</div>
<div id="saleUnitSizeWrap">
<label>Sale Unit Size ${help("Used only for count mode. Example: 10 count = 10.")}</label>
<input id="saleUnitSize" type="number" min="1" step="1" value="10">
</div>
</div>

<div class="iso-form-grid">
<div>
<label>Packaging Supply Used ${help("Optional. If selected, prep subtracts one supply item per packaged unit.")}</label>
<select id="containerSupplyId">
${renderSupplyOptions("")}
</select>
</div>
</div>

<label>Custom Note</label>
<textarea id="customNote" placeholder="Any notes for this colony..."></textarea>

<div class="iso-actions">
<button class="iso-btn iso-btn-primary" id="saveNewColonyBtn">Save Colony</button>
<button class="iso-btn" id="cancelAddColonyBtn">Cancel</button>
</div>
`);

const categorySelect = $("#categorySelect");
const customWrap = $("#customCategoryWrap");
categorySelect.addEventListener("change", () => {
customWrap.style.display = categorySelect.value === "__custom__" ? "block" : "none";
});

bindInventoryModeUi("");
$("#saveNewColonyBtn").onclick = saveNewColony;
$("#cancelAddColonyBtn").onclick = renderColonies;
}

async function saveNewColony() {
const colonyName = $("#colonyName").value.trim();
const typeName = $("#typeName").value.trim();
const category = getChosenCategory("");

if (!colonyName) return alert("Colony name is required.");
if (!typeName) return alert("Type name is required.");
if (!category) return alert("Category is required.");

if (state.colonies.some(c => c.colonyName.toLowerCase() === colonyName.toLowerCase())) {
return alert("Colony name already in use. Please choose a different colony name.");
}

const colony = ensureColonyShape({
colonyName,
typeName,
category,
typeImageUri: "",
dateAdded: $("#dateAdded").value.trim() || todayString(),
population: Math.max(0, toInt($("#population").value, 0)),
lastMisting: $("#lastMisting").value.trim(),
lastBotanicalsCheck: $("#lastBotanicalsCheck").value.trim(),
lastSubstrateCheck: $("#lastSubstrateCheck").value.trim(),
lastSupplementalFeeding: $("#lastSupplementalFeeding").value.trim(),
lastHusbandry: "",
customNote: $("#customNote").value.trim(),
tags: gatherSelectedTags(),
history: [],
prepEnabled: $("#prepEnabled").checked,
inventoryMode: $("#inventoryMode").value,
saleUnitLabel: $("#saleUnitLabel").value.trim() || ($("#inventoryMode").value === "unit" ? "1 unit" : "10 count"),
saleUnitSize: Math.max(1, toInt($("#saleUnitSize").value, 10)),
containerSupplyId: $("#containerSupplyId").value.trim()
});

updateLastHusbandry(colony);
addHistory(colony, "Created colony", `Created ${colony.colonyName} with ${colony.population} tracked ${colony.inventoryMode === "unit" ? "units" : "count"}.`);

const file = $("#typeImage").files[0];
if (file) {
colony.typeImageUri = await compressImageFile(file, {
maxWidth: 800,
maxHeight: 800,
quality: 0.72
});
addHistory(colony, "Added image", "Added a type image.");
}

state.colonies.push(colony);
syncAllPresetOrders();
await saveState();
renderColonies();
}

function renderTaskCards(colony) {
const tasks = getColonyTaskStatus(colony);
const items = [
["Misting", colony.lastMisting || "Never", tasks.misting],
["Feeding", colony.lastSupplementalFeeding || "Never", tasks.feeding],
["Substrate", colony.lastSubstrateCheck || "Never", tasks.substrate],
["Botanicals", colony.lastBotanicalsCheck || "Never", tasks.botanicals]
];

return `
<div class="iso-kv-grid">
${items.map(([label, date, info]) => `
<div class="iso-stat iso-status-${info.status}">
<div class="iso-stat-label">${esc(label)}</div>
<div style="margin-top:4px;font-weight:800;">${esc(date)}</div>
<div class="iso-note">Recent ≤ ${info.threshold.green} days • Soon ≤ ${info.threshold.yellow} days</div>
</div>
`).join("")}
</div>
`;
}

function renderHistory(colony) {
if (!colony.history.length) {
return `<div class="iso-empty" style="padding:18px 12px;">No history yet.</div>`;
}

return `
<div class="iso-history-list">
${colony.history.slice(0, 40).map(item => `
<div class="iso-history-item">
<div class="iso-history-time">${esc(formatDateTime(item.ts))}</div>
<div class="iso-history-text"><strong>${esc(item.action)}</strong>${item.detail ? ` — ${esc(item.detail)}` : ""}</div>
</div>
`).join("")}
</div>
`;
}

function openColony(index) {
const c = state.colonies[index];
const knownCats = ["Isopods", "Springtails", "Botanicals", ...uniqueCategories()].filter((v, i, a) => v && a.indexOf(v) === i);

app(`
<div class="iso-section-head">
<h2 class="iso-section-title">${esc(c.colonyName)}</h2>
${help("Quick action buttons update the matching task date and write to history.")}
</div>
<p class="iso-subtext">${esc(c.typeName)}</p>

${c.typeImageUri ? `<img class="iso-thumb" src="${c.typeImageUri}" alt="">` : ""}

<div class="iso-meta" style="margin-bottom:14px;">
<div><strong>Category:</strong> ${esc(c.category || "-")}</div>
<div><strong>Date Added:</strong> ${c.dateAdded || "-"}</div>
<div><strong>Last Updated:</strong> ${c.lastHusbandry || "Never"}</div>
<div><strong>Inventory Mode:</strong> ${c.inventoryMode === "unit" ? "Unit-based" : "Count-based"}</div>
<div><strong>Sale Unit:</strong> ${esc(c.saleUnitLabel || "-")}${c.inventoryMode === "count" ? ` (size ${c.saleUnitSize})` : ""}</div>
</div>

${(c.tags || []).length ? `<div class="iso-chip-row">${c.tags.map(tag => `<span class="iso-tag">${esc(tag)}</span>`).join("")}</div>` : ""}

<div class="iso-divider"></div>

<div class="iso-section-head">
<h3 class="iso-card-title" style="margin:0;">Task Status</h3>
${help("Each task uses your default or per-type thresholds. The colony card uses the most overdue task.")}
</div>
${renderTaskCards(c)}

<div class="iso-actions" style="margin-bottom:12px;">
<button class="iso-btn iso-btn-primary" data-quick="misting">Mark Misted Now</button>
<button class="iso-btn iso-btn-primary" data-quick="feeding">Mark Fed Now</button>
<button class="iso-btn iso-btn-primary" data-quick="botanicals">Mark Botanicals Checked Now</button>
<button class="iso-btn iso-btn-primary" data-quick="substrate">Mark Substrate Checked Now</button>
</div>

<div class="iso-divider"></div>

<div class="iso-form-grid">
<div>
<label>Population / Units</label>
<input id="editPopulation" type="number" min="0" step="1" value="${Number(c.population) || 0}">
</div>
<div>
<label>Category</label>
<select id="editcategorySelect">
${knownCats.map(cat => `<option value="${esc(cat)}" ${c.category === cat ? "selected" : ""}>${esc(cat)}</option>`).join("")}
<option value="__custom__" ${!knownCats.includes(c.category) ? "selected" : ""}>Custom</option>
</select>
</div>
<div id="editcustomCategoryWrap" style="${!knownCats.includes(c.category) ? "" : "display:none;"}">
<label>Custom Category</label>
<input id="editcustomCategory" value="${!knownCats.includes(c.category) ? esc(c.category) : ""}" placeholder="Example: Beetles">
</div>
</div>

<div class="iso-form-grid">
<div><label>Last Misting</label><input id="editMisting" value="${c.lastMisting || ""}" placeholder="mm/dd/yyyy"></div>
<div><label>Last Botanicals Check</label><input id="editBotanicals" value="${c.lastBotanicalsCheck || ""}" placeholder="mm/dd/yyyy"></div>
<div><label>Last Substrate Check</label><input id="editSubstrate" value="${c.lastSubstrateCheck || ""}" placeholder="mm/dd/yyyy"></div>
<div><label>Last Supplemental Feeding</label><input id="editFeeding" value="${c.lastSupplementalFeeding || ""}" placeholder="mm/dd/yyyy"></div>
</div>

<div class="iso-divider"></div>

<div class="iso-section-head">
<h3 class="iso-card-title" style="margin:0;">Tags</h3>
${help("Tags help you filter and organize colonies quickly.")}
</div>
${renderTagCheckboxes(c.tags || [])}

<div class="iso-divider"></div>

<div class="iso-section-head">
<h3 class="iso-card-title" style="margin:0;">For Sale Prep Setup</h3>
${help("Enable sale prep if this colony should appear in the For Sale Prep tab.")}
</div>

<div class="iso-form-grid">
<div>
<label><input id="editPrepEnabled" type="checkbox" ${c.prepEnabled ? "checked" : ""}> Show in For Sale Prep</label>
</div>
<div>
<label>Inventory Mode</label>
<select id="editinventoryMode">
<option value="count" ${c.inventoryMode === "count" ? "selected" : ""}>Count-based</option>
<option value="unit" ${c.inventoryMode === "unit" ? "selected" : ""}>Unit-based</option>
</select>
</div>
<div>
<label>Sale Unit Label</label>
<input id="editSaleUnitLabel" value="${esc(c.saleUnitLabel || "")}" placeholder="10 count">
</div>
<div id="editsaleUnitSizeWrap">
<label>Sale Unit Size</label>
<input id="editSaleUnitSize" type="number" min="1" step="1" value="${Math.max(1, toInt(c.saleUnitSize, 10))}">
</div>
</div>

<div class="iso-form-grid">
<div>
<label>Packaging Supply Used</label>
<select id="editContainerSupplyId">
${renderSupplyOptions(c.containerSupplyId || "")}
</select>
</div>
</div>

<label>Replace Type Picture</label>
<input id="replaceTypeImage" type="file" accept="image/*">

<div class="iso-actions" style="margin-top:8px;">
<button class="iso-btn" id="replaceImageBtn">Save New Image</button>
<button class="iso-btn iso-btn-danger" id="removeImageBtn" ${c.typeImageUri ? "" : "disabled"}>Remove Image</button>
</div>

<label>Custom Note ${help("Any note changes and deletions are written into history with a timestamp.")}</label>
<textarea id="editNote">${esc(c.customNote || "")}</textarea>

<div class="iso-actions">
<button class="iso-btn iso-btn-primary" id="saveColonyEditsBtn">Save Changes</button>
<button class="iso-btn iso-btn-primary" id="splitColonyBtn">Split Colony</button>
<button class="iso-btn" id="backToColoniesBtn">Back</button>
<button class="iso-btn iso-btn-danger" id="deleteColonyBtn">Delete Colony</button>
</div>

<div class="iso-divider"></div>

<div class="iso-section-head">
<h3 class="iso-card-title" style="margin:0;">History</h3>
${help("History logs creation, quick care actions, note edits, inventory changes, sale prep, and splits.")}
</div>
${renderHistory(c)}
`);

const select = $("#editcategorySelect");
const wrap = $("#editcustomCategoryWrap");
select.addEventListener("change", () => {
wrap.style.display = select.value === "__custom__" ? "block" : "none";
});

bindInventoryModeUi("edit");

$all("[data-quick]").forEach(btn => {
btn.onclick = () => quickAction(index, btn.dataset.quick);
});

$("#replaceImageBtn").onclick = () => replaceColonyImage(index);
$("#removeImageBtn").onclick = () => removeColonyImage(index);
$("#saveColonyEditsBtn").onclick = () => saveColonyEdits(index);
$("#splitColonyBtn").onclick = () => openSplitModal(index);
$("#backToColoniesBtn").onclick = renderColonies;
$("#deleteColonyBtn").onclick = () => deleteColony(index);
}

async function replaceColonyImage(index) {
const file = $("#replaceTypeImage").files[0];
if (!file) return alert("Choose an image first.");

state.colonies[index].typeImageUri = await compressImageFile(file, {
maxWidth: 800,
maxHeight: 800,
quality: 0.72
});

addHistory(state.colonies[index], "Replaced image", "Updated the colony image.");
await saveState();
openColony(index);
alert("Image updated.");
}

async function removeColonyImage(index) {
if (!confirm("Remove this colony image?")) return;
state.colonies[index].typeImageUri = "";
addHistory(state.colonies[index], "Removed image", "Removed the colony image.");
await saveState();
openColony(index);
alert("Image removed.");
}

async function saveColonyEdits(index) {
const c = state.colonies[index];
const category = getChosenCategory("edit");
if (!category) return alert("Category is required.");

const oldPopulation = c.population;
const oldNote = c.customNote || "";
const oldCategory = c.category;
const oldTags = JSON.stringify(c.tags || []);
const oldMode = c.inventoryMode;
const oldUnitLabel = c.saleUnitLabel;
const oldUnitSize = c.saleUnitSize;
const oldPrepEnabled = c.prepEnabled;

c.population = Math.max(0, toInt($("#editPopulation").value, 0));
c.category = category;
c.lastMisting = $("#editMisting").value.trim();
c.lastBotanicalsCheck = $("#editBotanicals").value.trim();
c.lastSubstrateCheck = $("#editSubstrate").value.trim();
c.lastSupplementalFeeding = $("#editFeeding").value.trim();
c.customNote = $("#editNote").value.trim();
c.tags = gatherSelectedTags();
c.prepEnabled = $("#editPrepEnabled").checked;
c.inventoryMode = $("#editinventoryMode").value;
c.saleUnitLabel = $("#editSaleUnitLabel").value.trim() || (c.inventoryMode === "unit" ? "1 unit" : "10 count");
c.saleUnitSize = Math.max(1, toInt($("#editSaleUnitSize").value, 10));
c.containerSupplyId = $("#editContainerSupplyId").value.trim();

updateLastHusbandry(c);

if (oldPopulation !== c.population) {
addHistory(c, "Changed inventory", `Population / units changed from ${oldPopulation} to ${c.population}.`);
}
if (oldCategory !== c.category) {
addHistory(c, "Changed category", `Category changed from ${oldCategory || "-"} to ${c.category}.`);
}
if (oldNote !== c.customNote) {
if (!oldNote && c.customNote) addHistory(c, "Added note", c.customNote);
else if (oldNote && !c.customNote) addHistory(c, "Removed note", oldNote);
else addHistory(c, "Edited note", `From "${oldNote}" to "${c.customNote}".`);
}
if (oldTags !== JSON.stringify(c.tags || [])) {
addHistory(c, "Updated tags", `Tags are now: ${(c.tags || []).join(", ") || "none"}.`);
}
if (oldMode !== c.inventoryMode || oldUnitLabel !== c.saleUnitLabel || oldUnitSize !== c.saleUnitSize) {
addHistory(c, "Updated sale prep setup", `${c.inventoryMode === "unit" ? "Unit" : "Count"} mode • ${c.saleUnitLabel}${c.inventoryMode === "count" ? ` size ${c.saleUnitSize}` : ""}.`);
}
if (oldPrepEnabled !== c.prepEnabled) {
addHistory(c, "Changed prep visibility", c.prepEnabled ? "Enabled in For Sale Prep." : "Disabled in For Sale Prep.");
}

syncAllPresetOrders();
await saveState();
openColony(index);
alert("Colony updated.");
}

async function quickAction(index, action) {
const today = todayString();
const c = state.colonies[index];

if (action === "misting") {
c.lastMisting = today;
addHistory(c, "Care action", `Marked misting on ${today}.`);
}
if (action === "feeding") {
c.lastSupplementalFeeding = today;
addHistory(c, "Care action", `Marked feeding on ${today}.`);
}
if (action === "botanicals") {
c.lastBotanicalsCheck = today;
addHistory(c, "Care action", `Marked botanicals check on ${today}.`);
}
if (action === "substrate") {
c.lastSubstrateCheck = today;
addHistory(c, "Care action", `Marked substrate check on ${today}.`);
}

c.lastHusbandry = today;
await saveState();
openColony(index);
alert("Colony updated.");
}

function openSplitModal(index) {
const colony = state.colonies[index];
const currentPopulation = Number(colony.population) || 0;

if (currentPopulation <= 0) {
alert("This colony needs a population greater than 0 before it can be split.");
return;
}

openModal(
"Split Colony",
`
<p class="iso-subtext">Create a new colony from <strong>${esc(colony.colonyName)}</strong>.</p>

<div class="iso-kv-grid" style="margin-bottom:14px;">
<div class="iso-stat">
<div class="iso-stat-label">Original Colony</div>
<div style="margin-top:4px;font-weight:900;">${esc(colony.colonyName)}</div>
</div>
<div class="iso-stat">
<div class="iso-stat-label">Type</div>
<div style="margin-top:4px;font-weight:900;">${esc(colony.typeName)}</div>
</div>
<div class="iso-stat">
<div class="iso-stat-label">Current Population / Units</div>
<div style="margin-top:4px;font-weight:900;">${currentPopulation}</div>
</div>
</div>

<div class="iso-form-grid">
<div>
<label>New Colony Name</label>
<input id="splitNewColonyName" placeholder="Red Panda Bin 2">
</div>
<div>
<label>Population / Units To Move</label>
<input id="splitPopulation" type="number" min="1" step="1" placeholder="50">
</div>
</div>

<div class="iso-note" style="margin-top:8px;">The new colony copies type, category, tags, note, image, care dates, and sale prep settings. Date added becomes today.</div>

<div class="iso-actions">
<button class="iso-btn iso-btn-primary" id="confirmSplitColonyBtn">Create Split Colony</button>
<button class="iso-btn" id="cancelSplitColonyBtn">Cancel</button>
</div>
`,
() => {
$("#confirmSplitColonyBtn").onclick = () => splitColony(index);
$("#cancelSplitColonyBtn").onclick = closeModal;
}
);
}

async function splitColony(index) {
const original = state.colonies[index];
const newColonyName = ($("#splitNewColonyName")?.value || "").trim();
const moveAmount = Math.max(0, toInt($("#splitPopulation")?.value, 0));
const originalPopulation = Number(original.population) || 0;

if (!newColonyName) return alert("New colony name is required.");
if (state.colonies.some(c => c.colonyName.toLowerCase() === newColonyName.toLowerCase())) {
return alert("That colony name is already in use. Please choose a different name.");
}
if (!Number.isInteger(moveAmount) || moveAmount <= 0) {
return alert("Population / units to move must be greater than 0.");
}
if (moveAmount > originalPopulation) {
return alert("Population / units to move cannot be more than the current colony quantity.");
}

const newColony = ensureColonyShape({
colonyName: newColonyName,
typeName: original.typeName,
category: original.category,
typeImageUri: original.typeImageUri || "",
dateAdded: todayString(),
population: moveAmount,
lastMisting: original.lastMisting || "",
lastBotanicalsCheck: original.lastBotanicalsCheck || "",
lastSubstrateCheck: original.lastSubstrateCheck || "",
lastSupplementalFeeding: original.lastSupplementalFeeding || "",
lastHusbandry: original.lastHusbandry || "",
customNote: original.customNote || "",
tags: clone(original.tags || []),
history: [],
inventoryMode: original.inventoryMode,
saleUnitLabel: original.saleUnitLabel,
saleUnitSize: original.saleUnitSize,
prepEnabled: original.prepEnabled,
containerSupplyId: original.containerSupplyId
});

original.population = originalPopulation - moveAmount;
addHistory(original, "Split colony", `Moved ${moveAmount} into new colony "${newColonyName}".`);
addHistory(newColony, "Created by split", `Created from "${original.colonyName}" with ${moveAmount}.`);

state.colonies.push(newColony);
syncAllPresetOrders();
await saveState();
closeModal();
renderColonies();
alert("Colony split created.");
}

async function deleteColony(index) {
const typeName = state.colonies[index].typeName;
if (!confirm("Are you sure you want to delete this colony?")) return;

state.colonies.splice(index, 1);

const typeStillExists = state.colonies.some(c => c.typeName === typeName);
if (!typeStillExists) {
PRESET_KEYS.forEach(name => {
const preset = getPreset(name);
delete preset.priceData[typeName];
preset.itemOrders.colonyTypes = preset.itemOrders.colonyTypes.filter(x => x !== typeName);
});
}

syncAllPresetOrders();
await saveState();
renderColonies();
}

// =========================
// population
// =========================
function renderPopulation() {
const totals = {};
state.colonies.forEach(c => {
const t = (c.typeName || "").trim();
if (!t) return;
totals[t] = (totals[t] || 0) + (Number(c.population) || 0);
});

const types = Object.keys(totals).sort((a, b) => a.localeCompare(b));

let html = `
<div class="iso-section-head">
<h2 class="iso-section-title">Population</h2>
${help("This combines tracked totals from all colonies with the same type name.")}
</div>
<p class="iso-subtext">Tap a type for the colony breakdown.</p>
`;

if (!types.length) {
html += `<div class="iso-empty">No population records saved.</div>`;
app(html);
return;
}

html += `<div class="iso-grid">`;
types.forEach(type => {
html += `
<div class="iso-card iso-card-clickable" data-pop-type="${esc(type)}">
<div class="iso-card-head">
<div>
<h3 class="iso-card-title">${esc(type)}</h3>
<div class="iso-muted">Combined total</div>
</div>
<span class="iso-badge">${totals[type]}</span>
</div>
</div>
`;
});
html += `</div>`;

app(html);
$all("[data-pop-type]").forEach(el => {
el.onclick = () => openPopulationBreakdown(el.dataset.popType);
});
}

function openPopulationBreakdown(type) {
const matches = state.colonies
.filter(c => c.typeName === type)
.sort((a, b) => (Number(b.population) || 0) - (Number(a.population) || 0));

const total = matches.reduce((sum, c) => sum + (Number(c.population) || 0), 0);

let html = `
<h2 class="iso-section-title">${esc(type)} — Total ${total}</h2>
<p class="iso-subtext">Population / units breakdown by colony.</p>
<div class="iso-actions" style="margin-bottom:14px;">
<button class="iso-btn" id="popBackBtn">Back</button>
</div>
<div class="iso-grid">
`;

matches.forEach(c => {
html += `
<div class="iso-card">
<div class="iso-card-head">
<div>
<h3 class="iso-card-title">${esc(c.colonyName)}</h3>
<div class="iso-muted">${esc(c.category || "")}</div>
</div>
<span class="iso-badge">${Number(c.population) || 0}</span>
</div>
<div class="iso-meta">
<div><strong>Last Updated:</strong> ${c.lastHusbandry || "Never"}</div>
</div>
</div>
`;
});

html += `</div>`;
app(html);
$("#popBackBtn").onclick = renderPopulation;
}

// =========================
// botanicals
// =========================
function renderBotanicals() {
let html = `
<div class="iso-section-head">
<h2 class="iso-section-title">Botanicals</h2>
${help("This tracks stock and notes only. Pricing for botanicals is handled in Price Sheet presets.")}
</div>
<p class="iso-subtext">Track supply items like soil, moss, bark, sticks, pods, shell, and other inventory.</p>
<div class="iso-toolbar">
<button class="iso-btn iso-btn-primary" id="showAddBotanicalBtn">+ Add Botanical Item</button>
</div>
`;

if (!state.botanicals.length) {
html += `<div class="iso-empty">No botanical items saved.</div>`;
app(html);
$("#showAddBotanicalBtn").onclick = showAddBotanicalForm;
return;
}

html += `<div class="iso-grid">`;
state.botanicals
.slice()
.sort((a, b) => a.itemName.localeCompare(b.itemName))
.forEach(item => {
const idx = state.botanicals.findIndex(x => x.itemName === item.itemName);
html += `
<div class="iso-card iso-card-clickable" data-open-botanical="${idx}">
<div class="iso-card-head">
<div>
<h3 class="iso-card-title">${esc(item.itemName)}</h3>
<div class="iso-muted">Inventory item</div>
</div>
<span class="iso-badge">${esc(item.quantity || "—")}</span>
</div>
<div class="iso-meta">
<div><strong>Quantity:</strong> ${esc(item.quantity || "-")}</div>
<div><strong>Note:</strong> ${esc(item.note || "-")}</div>
</div>
</div>
`;
});
html += `</div>`;

app(html);

$("#showAddBotanicalBtn").onclick = showAddBotanicalForm;
$all("[data-open-botanical]").forEach(el => {
el.onclick = () => openBotanical(Number(el.dataset.openBotanical));
});
}

function showAddBotanicalForm() {
app(`
<h2 class="iso-section-title">Add Botanical Item</h2>
<p class="iso-subtext">Save supply items and keep notes with each one.</p>

<div class="iso-form-grid">
<div>
<label>Item Name</label>
<input id="botItemName" placeholder="Lotus Pods">
</div>
<div>
<label>Quantity</label>
<input id="botQuantity" placeholder="20 packs, 3 bins, 10 lb">
</div>
</div>

<label>Item Note</label>
<textarea id="botNote" placeholder="Any notes about this item..."></textarea>

<div class="iso-actions">
<button class="iso-btn iso-btn-primary" id="saveBotanicalBtn">Save Item</button>
<button class="iso-btn" id="cancelBotanicalBtn">Cancel</button>
</div>
`);

$("#saveBotanicalBtn").onclick = saveNewBotanical;
$("#cancelBotanicalBtn").onclick = renderBotanicals;
}

async function saveNewBotanical() {
const itemName = ($("#botItemName").value || "").trim();
if (!itemName) return alert("Item name is required.");
if (state.botanicals.some(b => b.itemName.toLowerCase() === itemName.toLowerCase())) {
return alert("Botanical item name already exists. Please use a different name.");
}

const item = {
itemName,
quantity: $("#botQuantity").value.trim(),
note: $("#botNote").value.trim()
};

state.botanicals.push(item);

PRESET_KEYS.forEach(name => {
const preset = getPreset(name);
if (!preset.botanicalPriceData[itemName]) {
preset.botanicalPriceData[itemName] = {
included: true,
section: "Botanicals",
price: "",
priceNote: ""
};
}
});

syncAllPresetOrders();
await saveState();
renderBotanicals();
}

function openBotanical(index) {
const item = state.botanicals[index];
app(`
<h2 class="iso-section-title">${esc(item.itemName)}</h2>
<p class="iso-subtext">Update quantity and notes any time.</p>

<div class="iso-form-grid">
<div>
<label>Quantity</label>
<input id="editBotQuantity" value="${esc(item.quantity || "")}" placeholder="20 packs">
</div>
</div>

<label>Item Note</label>
<textarea id="editBotNote">${esc(item.note || "")}</textarea>

<div class="iso-actions">
<button class="iso-btn iso-btn-primary" id="saveBotanicalEditBtn">Save Changes</button>
<button class="iso-btn" id="backBotanicalBtn">Back</button>
<button class="iso-btn iso-btn-danger" id="deleteBotanicalBtn">Delete Item</button>
</div>
`);

$("#saveBotanicalEditBtn").onclick = () => saveBotanicalEdits(index);
$("#backBotanicalBtn").onclick = renderBotanicals;
$("#deleteBotanicalBtn").onclick = () => deleteBotanical(index);
}

async function saveBotanicalEdits(index) {
const item = state.botanicals[index];
item.quantity = $("#editBotQuantity").value.trim();
item.note = $("#editBotNote").value.trim();
await saveState();
openBotanical(index);
alert("Botanical item updated.");
}

async function deleteBotanical(index) {
const itemName = state.botanicals[index].itemName;
if (!confirm("Delete this botanical item?")) return;

state.botanicals.splice(index, 1);

PRESET_KEYS.forEach(name => {
const preset = getPreset(name);
delete preset.botanicalPriceData[itemName];
preset.itemOrders.botanicals = preset.itemOrders.botanicals.filter(x => x !== itemName);
});

syncAllPresetOrders();
await saveState();
renderBotanicals();
}

// =========================
// sale prep
// =========================
function getSupplyStatus(supply) {
return supply.quantity <= supply.reorderThreshold ? "red" : "green";
}

function getPrepEligibleColonies() {
return state.colonies.filter(c => c.prepEnabled);
}

function renderSalePrep() {
const eligible = getPrepEligibleColonies().sort((a, b) => a.colonyName.localeCompare(b.colonyName));

const packagedByType = {};
state.salePrep.packagedItems.forEach(item => {
if (!packagedByType[item.typeName]) packagedByType[item.typeName] = [];
packagedByType[item.typeName].push(item);
});

let html = `
<div class="iso-section-head">
<h2 class="iso-section-title">For Sale Prep</h2>
${help("Prep moves quantity from a colony into packaged inventory. Packaging supplies can also be linked and subtracted automatically.")}
</div>
<p class="iso-subtext">Prep inventory for expos or online sales and keep packaging supplies tracked too.</p>

<div class="iso-divider"></div>

<div class="iso-section-head">
<h3 class="iso-card-title" style="margin:0;">Prep From Colonies</h3>
${help("Only colonies with prep enabled appear here. Count mode subtracts sale unit size × prep quantity. Unit mode subtracts prep quantity directly.")}
</div>
`;

if (!eligible.length) {
html += `<div class="iso-empty">No colonies are enabled for For Sale Prep yet.</div>`;
} else {
html += `<div class="iso-grid">`;
eligible.forEach(colony => {
const idx = state.colonies.findIndex(c => c.colonyName === colony.colonyName);
html += `
<div class="iso-card">
<div class="iso-card-head">
<div>
<h3 class="iso-card-title">${esc(colony.colonyName)}</h3>
<div class="iso-muted">${esc(colony.typeName)}</div>
</div>
<span class="iso-badge">${colony.inventoryMode === "unit" ? "Unit Mode" : "Count Mode"}</span>
</div>

<div class="iso-meta">
<div><strong>Available:</strong> ${Number(colony.population) || 0}</div>
<div><strong>Sale Unit:</strong> ${esc(colony.saleUnitLabel)}</div>
<div><strong>Unit Size:</strong> ${colony.inventoryMode === "count" ? colony.saleUnitSize : 1}</div>
</div>

<div class="iso-form-grid" style="margin-top:12px;">
<div>
<label>Prep Quantity</label>
<input id="prepQty_${idx}" type="number" min="1" step="1" value="1">
</div>
</div>

<div class="iso-actions">
<button class="iso-btn iso-btn-primary" data-prep-colony="${idx}">Prep</button>
</div>
</div>
`;
});
html += `</div>`;
}

html += `
<div class="iso-divider"></div>

<div class="iso-section-head">
<h3 class="iso-card-title" style="margin:0;">Packaged / Ready For Sale</h3>
${help("These are prepared packages. Returning one restores quantity to the original colony and returns any linked packaging supply.")}
</div>
`;

const packagedTypes = Object.keys(packagedByType).sort((a, b) => a.localeCompare(b));
if (!packagedTypes.length) {
html += `<div class="iso-empty">No packaged inventory yet.</div>`;
} else {
html += `<div class="iso-grid">`;
packagedTypes.forEach(type => {
const items = packagedByType[type];
const total = items.reduce((sum, x) => sum + (Number(x.quantity) || 0), 0);

html += `
<div class="iso-card">
<div class="iso-card-head">
<div>
<h3 class="iso-card-title">${esc(type)}</h3>
<div class="iso-muted">Packaged inventory</div>
</div>
<span class="iso-badge">${total}</span>
</div>

<div class="iso-history-list">
${items.map(item => `
<div class="iso-history-item">
<div class="iso-history-time">${esc(formatDateTime(item.packedAt))}</div>
<div class="iso-history-text"><strong>${esc(item.sourceColonyName)}</strong> — ${item.quantity} × ${esc(item.saleUnitLabel)}</div>
<div class="iso-actions" style="margin-top:8px;">
<button class="iso-btn" data-return-packaged="${esc(item.id)}">Return</button>
</div>
</div>
`).join("")}
</div>
</div>
`;
});
html += `</div>`;
}

html += `
<div class="iso-divider"></div>

<div class="iso-section-head">
<h3 class="iso-card-title" style="margin:0;">Packaging Supplies</h3>
${help("Supplies start empty and are fully custom. Set a reorder threshold so low stock is flagged when quantity drops to or below that level.")}
</div>
<div class="iso-toolbar">
<button class="iso-btn iso-btn-primary" id="addSupplyBtn">+ Add Supply</button>
</div>
`;

if (!state.salePrep.supplies.length) {
html += `<div class="iso-empty">No packaging supplies added yet.</div>`;
} else {
html += `<div class="iso-grid">`;
state.salePrep.supplies
.slice()
.sort((a, b) => a.name.localeCompare(b.name))
.forEach(supply => {
const status = getSupplyStatus(supply);
html += `
<div class="iso-card iso-status-${status}">
<div class="iso-card-head">
<div>
<h3 class="iso-card-title">${esc(supply.name)}</h3>
<div class="iso-muted">Packaging supply</div>
</div>
<span class="iso-badge iso-badge-${status}">${status === "red" ? "Low Stock" : "OK"}</span>
</div>
<div class="iso-meta">
<div><strong>Quantity Left:</strong> ${supply.quantity}</div>
<div><strong>Reorder Threshold:</strong> ${supply.reorderThreshold}</div>
<div><strong>Note:</strong> ${esc(supply.note || "-")}</div>
</div>
<div class="iso-actions">
<button class="iso-btn" data-edit-supply="${esc(supply.id)}">Edit</button>
<button class="iso-btn iso-btn-danger" data-delete-supply="${esc(supply.id)}">Delete</button>
</div>
</div>
`;
});
html += `</div>`;
}

app(html);

$all("[data-prep-colony]").forEach(btn => {
btn.onclick = () => prepFromColony(Number(btn.dataset.prepColony));
});

$all("[data-return-packaged]").forEach(btn => {
btn.onclick = () => returnPackagedItem(btn.dataset.returnPackaged);
});

$("#addSupplyBtn").onclick = () => openSupplyModal();
$all("[data-edit-supply]").forEach(btn => {
btn.onclick = () => openSupplyModal(btn.dataset.editSupply);
});
$all("[data-delete-supply]").forEach(btn => {
btn.onclick = () => deleteSupply(btn.dataset.deleteSupply);
});
}

async function prepFromColony(index) {
const colony = state.colonies[index];
const qty = Math.max(0, toInt(document.getElementById(`prepQty_${index}`)?.value, 0));
if (!qty) return alert("Enter a prep quantity greater than 0.");

let amountToSubtract = qty;
if (colony.inventoryMode === "count") {
amountToSubtract = qty * Math.max(1, colony.saleUnitSize);
}

if (amountToSubtract > colony.population) {
return alert("Not enough quantity in this colony for that prep amount.");
}

const supply = colony.containerSupplyId ? state.salePrep.supplies.find(s => s.id === colony.containerSupplyId) : null;
if (supply && qty > supply.quantity) {
return alert(`Not enough packaging supplies left in "${supply.name}".`);
}

colony.population -= amountToSubtract;
addHistory(colony, "Prepared for sale", `Prepared ${qty} × ${colony.saleUnitLabel}. Subtracted ${amountToSubtract} from colony.`);

if (supply) {
supply.quantity -= qty;
addHistory(colony, "Used packaging supply", `Used ${qty} × ${supply.name}.`);
}

state.salePrep.packagedItems.push(ensurePackagedItemShape({
id: uid(),
sourceColonyName: colony.colonyName,
typeName: colony.typeName,
quantity: qty,
saleUnitLabel: colony.saleUnitLabel,
packedAt: nowIso(),
inventoryMode: colony.inventoryMode,
amountSubtracted: amountToSubtract,
containerSupplyId: colony.containerSupplyId || ""
}));

await saveState();
renderSalePrep();
}

async function returnPackagedItem(id) {
const itemIndex = state.salePrep.packagedItems.findIndex(x => x.id === id);
if (itemIndex < 0) return;

const item = state.salePrep.packagedItems[itemIndex];
const colony = state.colonies.find(c => c.colonyName === item.sourceColonyName && c.typeName === item.typeName);

if (!colony) {
return alert("Original colony not found. Cannot return packaged inventory.");
}

colony.population += Number(item.amountSubtracted) || 0;
addHistory(colony, "Returned from sale prep", `Returned ${item.quantity} × ${item.saleUnitLabel} to colony.`);

if (item.containerSupplyId) {
const supply = state.salePrep.supplies.find(s => s.id === item.containerSupplyId);
if (supply) supply.quantity += Number(item.quantity) || 0;
}

state.salePrep.packagedItems.splice(itemIndex, 1);
await saveState();
renderSalePrep();
}

function openSupplyModal(supplyId) {
const existing = supplyId ? state.salePrep.supplies.find(s => s.id === supplyId) : null;

openModal(
existing ? "Edit Packaging Supply" : "Add Packaging Supply",
`
<div class="iso-form-grid">
<div>
<label>Supply Name</label>
<input id="supplyName" value="${esc(existing?.name || "")}" placeholder="8 oz deli cups">
</div>
<div>
<label>Quantity</label>
<input id="supplyQty" type="number" min="0" step="1" value="${existing ? existing.quantity : 0}">
</div>
<div>
<label>Reorder Threshold</label>
<input id="supplyThreshold" type="number" min="0" step="1" value="${existing ? existing.reorderThreshold : 10}">
</div>
</div>

<label>Note</label>
<textarea id="supplyNote" placeholder="Optional note">${esc(existing?.note || "")}</textarea>

<div class="iso-actions">
<button class="iso-btn iso-btn-primary" id="saveSupplyBtn">${existing ? "Save Changes" : "Add Supply"}</button>
<button class="iso-btn" id="cancelSupplyBtn">Cancel</button>
</div>
`,
() => {
$("#saveSupplyBtn").onclick = () => saveSupply(supplyId);
$("#cancelSupplyBtn").onclick = closeModal;
}
);
}

async function saveSupply(supplyId) {
const name = ($("#supplyName").value || "").trim();
const quantity = Math.max(0, toInt($("#supplyQty").value, 0));
const threshold = Math.max(0, toInt($("#supplyThreshold").value, 0));
const note = ($("#supplyNote").value || "").trim();

if (!name) return alert("Supply name is required.");

if (supplyId) {
const supply = state.salePrep.supplies.find(s => s.id === supplyId);
if (!supply) return;
supply.name = name;
supply.quantity = quantity;
supply.reorderThreshold = threshold;
supply.note = note;
} else {
state.salePrep.supplies.push(ensureSupplyShape({
id: uid(),
name,
quantity,
reorderThreshold: threshold,
note
}));
}

await saveState();
closeModal();
renderSalePrep();
}

async function deleteSupply(supplyId) {
if (!confirm("Delete this packaging supply?")) return;

state.salePrep.supplies = state.salePrep.supplies.filter(s => s.id !== supplyId);
state.colonies.forEach(c => {
if (c.containerSupplyId === supplyId) c.containerSupplyId = "";
});

await saveState();
renderSalePrep();
}

// =========================
// price sheet
// =========================
function addSection() {
const preset = getPreset(state.activePricePreset);
const input = $("#newSectionName");
const name = (input?.value || "").trim();
if (!name) return;
if (preset.priceSections.includes(name)) return alert("That section already exists.");
preset.priceSections.push(name);
saveState().then(renderPriceSheet);
}

function deleteSection(name) {
const preset = getPreset(state.activePricePreset);
if (name === "Botanicals") return alert("Botanicals section cannot be removed.");

preset.priceSections = preset.priceSections.filter(s => s !== name);

Object.keys(preset.priceData).forEach(k => {
if (preset.priceData[k]?.section === name) preset.priceData[k].section = "";
});

Object.keys(preset.botanicalPriceData).forEach(k => {
if (preset.botanicalPriceData[k]?.section === name) preset.botanicalPriceData[k].section = "Botanicals";
});

saveState().then(renderPriceSheet);
}

function renderPriceSheet() {
syncAllPresetOrders();

const preset = getPreset(state.activePricePreset);
const colonyTypes = preset.itemOrders.colonyTypes;
const botanicalNames = preset.itemOrders.botanicals;
const allSectionOptions = [...new Set([...preset.priceSections, ...uniqueCategories(), "Botanicals"])].filter(Boolean);

let html = `
<div class="iso-section-head">
<h2 class="iso-section-title">Price Sheet</h2>
${help("Use presets to keep separate pricing setups for online, expo, and wholesale. Blank prices automatically show as Not Available.")}
</div>
<p class="iso-subtext">Choose what appears, organize items into sections, and drag rows into the order you want.</p>
<p class="iso-info-note">Blank price automatically shows as Not Available.</p>

<div class="iso-inline" style="margin-bottom:14px;">
<button class="iso-pill-btn ${state.activePricePreset === "online" ? "active" : ""}" data-preset="online">Online Pricing</button>
<button class="iso-pill-btn ${state.activePricePreset === "expo" ? "active" : ""}" data-preset="expo">Expo Pricing</button>
<button class="iso-pill-btn ${state.activePricePreset === "wholesale" ? "active" : ""}" data-preset="wholesale">Wholesale Pricing</button>
</div>

<div class="iso-section-manager">
<h3 style="margin:0 0 10px;">Price Sheet Sections</h3>
<div style="margin-bottom:10px;">
${allSectionOptions.map(s => `
<span class="iso-section-chip">
${esc(s)}
${s !== "Botanicals" ? `<button class="iso-mini-btn" data-delete-section="${esc(s)}">✕</button>` : ""}
</span>
`).join("")}
</div>
<div class="iso-actions">
<input id="newSectionName" placeholder="Add new section like Exotic or Mid Tier" style="max-width:320px;">
<button class="iso-btn iso-btn-primary" id="addSectionBtn">Add Section</button>
</div>
</div>

<div class="iso-split">
<div>
<label>Sheet Title</label>
<input id="businessName" value="${esc(state.settings.businessName || "")}" placeholder="IsoTracker">

<label>Tagline</label>
<input id="tagline" value="${esc(state.settings.tagline || "")}" placeholder="Colony Tracker & Price Sheets">

<label>Theme</label>
<select id="themeSelect">
<option value="botanical" ${state.settings.theme === "botanical" ? "selected" : ""}>Botanical Premium</option>
<option value="parchment" ${state.settings.theme === "parchment" ? "selected" : ""}>Parchment Expo</option>
<option value="luxe" ${state.settings.theme === "luxe" ? "selected" : ""}>Dark Luxe</option>
</select>

<label>App / Header Logo</label>
<input id="appLogoUpload" type="file" accept="image/*">

<label>Price Sheet Logo</label>
<input id="sheetLogoUpload" type="file" accept="image/*">
</div>

<div>
<label>Banner Text</label>
<input id="promoText" value="${esc(state.settings.promoText || "")}" placeholder="Optional banner text">

<label>Footer Note</label>
<input id="footerNote" value="${esc(state.settings.footerNote || "")}" placeholder="Optional footer note">
</div>
</div>
`;

html += `<div style="margin-top:22px;"><h3 style="margin:0 0 10px;">Colony Types</h3>`;
if (!colonyTypes.length) {
html += `<div class="iso-empty">No colony types saved.</div>`;
} else {
html += `<div id="colonyTypeBuilder">`;
colonyTypes.forEach(type => {
const exampleColony = state.colonies.find(c => c.typeName === type);
const row = preset.priceData[type] || {
included: true,
section: exampleColony?.category || "",
price: "",
countLabel: exampleColony?.saleUnitLabel || "10ct"
};

html += `
<div class="iso-price-row" draggable="true" data-kind="colonyTypes" data-name="${esc(type)}">
<div class="iso-builder-topline">
<div class="iso-builder-left">
<span class="iso-drag-handle">☰</span>
<label style="margin:0;display:flex;align-items:center;">
<input type="checkbox" id="include_${slug(type)}" ${row.included !== false ? "checked" : ""}>
<strong>${esc(type)}</strong>
</label>
<span class="iso-muted">(${esc(exampleColony?.category || "Uncategorized")})</span>
</div>
</div>

<div class="iso-form-grid">
<div>
<label>Section</label>
<select id="section_${slug(type)}">
<option value="">-- Select Section --</option>
${allSectionOptions.map(s => `<option value="${esc(s)}" ${row.section === s ? "selected" : ""}>${esc(s)}</option>`).join("")}
</select>
</div>
<div>
<label>Count / Note</label>
<input id="count_${slug(type)}" value="${esc(row.countLabel || "")}" placeholder="10ct">
</div>
<div>
<label>Price</label>
<input id="price_${slug(type)}" value="${esc(row.price || "")}" placeholder="$25">
</div>
</div>
</div>
`;
});
html += `</div>`;
}
html += `</div>`;

html += `<div style="margin-top:22px;"><h3 style="margin:0 0 10px;">Botanicals</h3>`;
if (!botanicalNames.length) {
html += `<div class="iso-empty">No botanical items saved.</div>`;
} else {
html += `<div id="botanicalBuilder">`;
botanicalNames.forEach(name => {
const row = preset.botanicalPriceData[name] || {
included: true,
section: "Botanicals",
price: "",
priceNote: ""
};

html += `
<div class="iso-price-row" draggable="true" data-kind="botanicals" data-name="${esc(name)}">
<div class="iso-builder-topline">
<div class="iso-builder-left">
<span class="iso-drag-handle">☰</span>
<label style="margin:0;display:flex;align-items:center;">
<input type="checkbox" id="botinclude_${slug(name)}" ${row.included !== false ? "checked" : ""}>
<strong>${esc(name)}</strong>
</label>
</div>
</div>

<div class="iso-form-grid">
<div>
<label>Section</label>
<select id="botsection_${slug(name)}">
${allSectionOptions.map(s => `<option value="${esc(s)}" ${((row.section || "Botanicals") === s) ? "selected" : ""}>${esc(s)}</option>`).join("")}
</select>
</div>
<div>
<label>Note</label>
<input id="botnote_${slug(name)}" value="${esc(row.priceNote || "")}" placeholder="1 gallon, 5 pods, 2 lb">
</div>
<div>
<label>Price</label>
<input id="botprice_${slug(name)}" value="${esc(row.price || "")}" placeholder="$10">
</div>
</div>
</div>
`;
});
html += `</div>`;
}
html += `</div>`;

html += `
<div class="iso-actions">
<button class="iso-btn iso-btn-primary" id="savePriceSheetBtn">Save Price Sheet</button>
<button class="iso-btn iso-btn-primary" id="exportPriceSheetBtn">Export Price Sheet Image</button>
</div>

<div class="iso-sheet-wrap">
<div id="priceSheetPreviewMount"></div>
</div>
`;

app(html);

$all("[data-preset]").forEach(btn => {
btn.onclick = () => {
state.activePricePreset = btn.dataset.preset;
saveState().then(renderPriceSheet);
};
});

$("#addSectionBtn").onclick = addSection;
$all("[data-delete-section]").forEach(btn => {
btn.onclick = () => deleteSection(btn.dataset.deleteSection);
});

wireDragAndDrop();
renderPriceSheetPreview();

$("#savePriceSheetBtn").onclick = savePriceSheetSettings;
$("#exportPriceSheetBtn").onclick = exportPriceSheetImage;
}

function wireDragAndDrop() {
let dragged = null;

$all(".iso-price-row[draggable='true']").forEach(row => {
row.addEventListener("dragstart", () => {
dragged = row;
row.classList.add("dragging");
});

row.addEventListener("dragend", () => {
row.classList.remove("dragging");
dragged = null;
persistBuilderOrder();
});

row.addEventListener("dragover", e => {
e.preventDefault();
const target = row;
if (!dragged || dragged === target) return;
const container = target.parentNode;
const rect = target.getBoundingClientRect();
const after = (e.clientY - rect.top) > rect.height / 2;
if (after) container.insertBefore(dragged, target.nextSibling);
else container.insertBefore(dragged, target);
});
});
}

async function persistBuilderOrder() {
const preset = getPreset(state.activePricePreset);
const colonyRows = [...document.querySelectorAll("#colonyTypeBuilder .iso-price-row")];
const botanicalRows = [...document.querySelectorAll("#botanicalBuilder .iso-price-row")];

preset.itemOrders.colonyTypes = colonyRows.map(row => row.dataset.name);
preset.itemOrders.botanicals = botanicalRows.map(row => row.dataset.name);

await saveState();
renderPriceSheetPreview();
}

async function savePriceSheetSettings() {
const preset = getPreset(state.activePricePreset);

state.settings.businessName = ($("#businessName").value || "").trim() || "IsoTracker";
state.settings.tagline = ($("#tagline").value || "").trim() || "";
state.settings.theme = $("#themeSelect").value;
state.settings.promoText = ($("#promoText").value || "").trim();
state.settings.footerNote = ($("#footerNote").value || "").trim();

const appLogoFile = $("#appLogoUpload").files[0];
const sheetLogoFile = $("#sheetLogoUpload").files[0];

(preset.itemOrders.colonyTypes || []).forEach(type => {
const existing = preset.priceData[type] || {};
preset.priceData[type] = {
...existing,
included: document.getElementById(`include_${slug(type)}`)?.checked ?? true,
section: document.getElementById(`section_${slug(type)}`)?.value.trim() || "",
price: document.getElementById(`price_${slug(type)}`)?.value.trim() || "",
countLabel: document.getElementById(`count_${slug(type)}`)?.value.trim() || ""
};
});

(preset.itemOrders.botanicals || []).forEach(name => {
const existing = preset.botanicalPriceData[name] || {};
preset.botanicalPriceData[name] = {
...existing,
included: document.getElementById(`botinclude_${slug(name)}`)?.checked ?? true,
section: document.getElementById(`botsection_${slug(name)}`)?.value.trim() || "Botanicals",
price: document.getElementById(`botprice_${slug(name)}`)?.value.trim() || "",
priceNote: document.getElementById(`botnote_${slug(name)}`)?.value.trim() || ""
};
});

if (appLogoFile) {
state.settings.appLogoUri = await compressImageFile(appLogoFile, {
maxWidth: 420,
maxHeight: 420,
quality: 0.72
});
}

if (sheetLogoFile) {
state.settings.priceSheetLogoUri = await compressImageFile(sheetLogoFile, {
maxWidth: 600,
maxHeight: 600,
quality: 0.74
});
}

await saveState();
applyHeaderBranding();
renderPriceSheet();
alert("Price sheet saved.");
}

function buildSheetSections() {
const preset = getPreset(state.activePricePreset);
const sections = {};

(preset.itemOrders.colonyTypes || []).forEach(type => {
const row = preset.priceData[type];
if (!row || row.included === false) return;

const section = row.section || state.colonies.find(c => c.typeName === type)?.category || "Other";
if (!sections[section]) sections[section] = [];

sections[section].push({
name: type,
note: row.countLabel || "",
price: row.price || "Not Available"
});
});

(preset.itemOrders.botanicals || []).forEach(name => {
const row = preset.botanicalPriceData[name];
if (!row || row.included === false) return;

const section = row.section || "Botanicals";
if (!sections[section]) sections[section] = [];

sections[section].push({
name,
note: row.priceNote || "",
price: row.price || "Not Available"
});
});

return sections;
}

function renderPriceSheetPreview() {
const mount = $("#priceSheetPreviewMount");
if (!mount) return;

const preset = getPreset(state.activePricePreset);
const sections = buildSheetSections();
const orderedKeys = [...new Set([...preset.priceSections, ...Object.keys(sections)])].filter(k => sections[k] && sections[k].length);

const themeClass = {
botanical: "iso-theme-botanical",
parchment: "iso-theme-parchment",
luxe: "iso-theme-luxe"
}[state.settings.theme] || "iso-theme-botanical";

const logoHtml = `<img class="iso-sheet-logo" src="${getPriceSheetLogo()}" alt="Logo">`;

const renderItems = items => items.map(item => `
<div class="iso-sheet-item">
<div class="iso-sheet-item-top">
<div class="iso-sheet-item-name">${esc(item.name)}</div>
<div class="iso-sheet-item-price">${esc(item.price || "Not Available")}</div>
</div>
${item.note ? `<div class="iso-sheet-item-note">${esc(item.note)}</div>` : ``}
</div>
`).join("");

mount.innerHTML = `
<div class="iso-sheet ${themeClass}" id="exportSheet">
<div class="iso-sheet-header">
${logoHtml}
<h1 class="iso-sheet-title">${esc(state.settings.businessName || "IsoTracker")}</h1>
<div class="iso-sheet-sub">${esc(state.settings.tagline || "Colony Tracker & Price Sheets")}</div>
</div>

${state.settings.promoText ? `<div class="iso-sheet-banner">${esc(state.settings.promoText)}</div>` : ""}

<div class="iso-sheet-body">
${orderedKeys.map(section => `
<div class="iso-sheet-section">
<div class="iso-sheet-section-title">${esc(section)}</div>
<div class="iso-sheet-cards">
${renderItems(sections[section])}
</div>
</div>
`).join("") || `<div class="iso-empty" style="background:transparent;border-style:dashed">No items selected for this sheet.</div>`}
</div>

${state.settings.footerNote ? `<div class="iso-sheet-footer">${esc(state.settings.footerNote)}</div>` : ""}
</div>
`;
}

async function exportPriceSheetImage() {
const el = document.getElementById("exportSheet");
if (!el) return alert("No price sheet found to export.");

try {
const canvas = await window.html2canvas(el, {
backgroundColor: null,
scale: 2,
useCORS: true
});

const link = document.createElement("a");
link.download = `isotracker-${state.activePricePreset}-price-sheet.png`;
link.href = canvas.toDataURL("image/png");
link.click();
} catch (err) {
alert("Image export failed.");
}
}

// =========================
// settings
// =========================
function renderThresholdEditor(typeName, thresholds) {
const row = (key, label) => `
<div class="iso-card">
<h4 style="margin:0 0 10px;">${esc(label)}</h4>
<div class="iso-form-grid">
<div>
<label>Checked Recently ≤</label>
<input id="thr_${key}_green" type="number" min="0" step="1" value="${thresholds[key].green}">
</div>
<div>
<label>Attention Soon ≤</label>
<input id="thr_${key}_yellow" type="number" min="0" step="1" value="${thresholds[key].yellow}">
</div>
</div>
</div>
`;

return `
<p class="iso-subtext" style="margin-top:12px;">Editing thresholds for <strong>${esc(typeName)}</strong>.</p>
<div class="iso-grid">
${row("misting", "Misting")}
${row("feeding", "Feeding")}
${row("substrate", "Substrate Check")}
${row("botanicals", "Botanicals Check")}
</div>
<div class="iso-actions">
<button class="iso-btn iso-btn-primary" id="saveThresholdsBtn">Save Thresholds</button>
<button class="iso-btn" id="resetThresholdsBtn">Reset To Defaults</button>
</div>
`;
}

function bindThresholdSave(typeName) {
$("#saveThresholdsBtn").onclick = () => saveThresholds(typeName);
$("#resetThresholdsBtn").onclick = () => resetThresholds(typeName);
}

async function saveThresholds(typeName) {
const payload = {
misting: {
green: Math.max(0, toInt($("#thr_misting_green").value, 0)),
yellow: Math.max(0, toInt($("#thr_misting_yellow").value, 0))
},
feeding: {
green: Math.max(0, toInt($("#thr_feeding_green").value, 0)),
yellow: Math.max(0, toInt($("#thr_feeding_yellow").value, 0))
},
substrate: {
green: Math.max(0, toInt($("#thr_substrate_green").value, 0)),
yellow: Math.max(0, toInt($("#thr_substrate_yellow").value, 0))
},
botanicals: {
green: Math.max(0, toInt($("#thr_botanicals_green").value, 0)),
yellow: Math.max(0, toInt($("#thr_botanicals_yellow").value, 0))
}
};

Object.keys(payload).forEach(key => {
if (payload[key].yellow < payload[key].green) payload[key].yellow = payload[key].green;
});

state.settings.typeThresholds[typeName] = payload;
await saveState();
alert("Thresholds saved.");
renderSettings();
}

async function resetThresholds(typeName) {
delete state.settings.typeThresholds[typeName];
await saveState();
renderSettings();
}

async function addCustomTag() {
const input = $("#newCustomTag");
const value = (input?.value || "").trim();
if (!value) return;
if (getAvailableTags().some(tag => tag.toLowerCase() === value.toLowerCase())) {
return alert("That tag already exists.");
}
state.settings.customTags.push(value);
await saveState();
renderSettings();
}

async function removeCustomTag(tag) {
state.settings.customTags = state.settings.customTags.filter(t => t !== tag);
state.colonies.forEach(colony => {
colony.tags = (colony.tags || []).filter(t => t !== tag);
});
await saveState();
renderSettings();
}

async function exportProfile() {
const profile = {
version: 10,
exportedAt: new Date().toISOString(),
data: state
};

const blob = new Blob([JSON.stringify(profile, null, 2)], { type: "application/json" });
const url = URL.createObjectURL(blob);
const link = document.createElement("a");
link.href = url;
link.download = "isotracker-profile-backup.json";
link.click();
URL.revokeObjectURL(url);
}

async function importProfileFromInput(input) {
const file = input.files && input.files[0];
if (!file) return;

try {
const text = await file.text();
const parsed = JSON.parse(text);
if (!parsed || !parsed.data) return alert("Invalid backup file.");

state = {
...clone(DEFAULT_STATE),
...parsed.data,
settings: {
...DEFAULT_STATE.settings,
...(parsed.data.settings || {})
}
};

migrateState();
await saveState();
applyHeaderBranding();
alert("Profile imported successfully.");
renderSettings();
} catch (err) {
alert("Could not import backup file.");
}
}

async function clearAllData() {
if (!confirm("Clear all saved data?")) return;

state = clone(DEFAULT_STATE);
colonyFilters.search = "";
colonyFilters.category = "all";
colonyFilters.status = "all";
colonyFilters.tag = "all";

await saveState();
applyHeaderBranding();
renderSettings();
}

function renderSettings() {
const types = uniqueTypes().sort((a, b) => a.localeCompare(b));
const selectedType = types[0] || "";
const thresholds = selectedType ? getTypeThresholds(selectedType) : clone(DEFAULT_THRESHOLDS);

app(`
<div class="iso-section-head">
<h2 class="iso-section-title">Settings</h2>
${help("Manage your backup, custom tags, per-type thresholds, and add-to-home-screen instructions here.")}
</div>
<p class="iso-subtext">Manage your local data and app behavior here.</p>

<div class="iso-grid">
<div class="iso-card">
<h3 class="iso-card-title" style="margin-bottom:8px;">Backup</h3>
<p class="iso-subtext">Export your full local profile so you can move it to another device later.</p>
<div class="iso-actions">
<button class="iso-btn iso-btn-primary" id="exportProfileBtn">Export Profile Backup</button>
</div>
</div>

<div class="iso-card">
<h3 class="iso-card-title" style="margin-bottom:8px;">Restore</h3>
<p class="iso-subtext">Import a previously exported backup file.</p>
<div class="iso-actions">
<label class="iso-btn iso-btn-ghost" style="display:inline-flex;align-items:center;justify-content:center;">
Import Profile Backup
<input id="settingsImportBackup" type="file" accept=".json,application/json" style="display:none">
</label>
</div>
</div>

<div class="iso-card">
<h3 class="iso-card-title" style="margin-bottom:8px;">Add to Home Screen</h3>
<p class="iso-subtext">iPhone: open in Safari → Share → Add to Home Screen. Android: browser menu → Add to Home screen / Install app.</p>
<p class="iso-note">No install is required to use the app in a normal browser. Home screen install is optional and just makes it feel more app-like.</p>
</div>

<div class="iso-card">
<h3 class="iso-card-title" style="margin-bottom:8px;">Danger Zone</h3>
<p class="iso-subtext">Clear all locally stored IsoTracker data from this device.</p>
<div class="iso-actions">
<button class="iso-btn iso-btn-danger" id="clearAllDataBtn">Clear All Data</button>
</div>
</div>
</div>

<div class="iso-divider"></div>

<div class="iso-section-head">
<h3 class="iso-card-title" style="margin:0;">Custom Tags</h3>
${help("Built-in tags are Breeding, For Sale, and Experimental. Add your own tags here and they appear in colony forms and filters.")}
</div>

<div class="iso-chip-row" style="margin-bottom:10px;">
${getAvailableTags().map(tag => `
<span class="iso-section-chip">
${esc(tag)}
${BUILTIN_TAGS.includes(tag) ? "" : `<button class="iso-mini-btn" data-remove-custom-tag="${esc(tag)}">✕</button>`}
</span>
`).join("")}
</div>

<div class="iso-actions" style="margin-bottom:18px;">
<input id="newCustomTag" placeholder="Add custom tag like Holdback or Display" style="max-width:320px;">
<button class="iso-btn iso-btn-primary" id="addCustomTagBtn">Add Custom Tag</button>
</div>

<div class="iso-divider"></div>

<div class="iso-section-head">
<h3 class="iso-card-title" style="margin:0;">Per-Type Care Thresholds</h3>
${help("Defaults are 3 days green and 10 days yellow. Set custom thresholds by type and task to better match your husbandry style.")}
</div>

${types.length ? `
<div class="iso-form-grid">
<div>
<label>Select Type</label>
<select id="thresholdTypeSelect">
${types.map(type => `<option value="${esc(type)}">${esc(type)}</option>`).join("")}
</select>
</div>
</div>

<div id="thresholdEditorMount">
${renderThresholdEditor(selectedType, thresholds)}
</div>
` : `<div class="iso-empty">Add colonies first to unlock per-type threshold settings.</div>`}
`);

$("#exportProfileBtn").onclick = exportProfile;

const importInput = $("#settingsImportBackup");
if (importInput) {
importInput.onchange = function () {
importProfileFromInput(this);
};
}

$("#clearAllDataBtn").onclick = clearAllData;
$("#addCustomTagBtn").onclick = addCustomTag;

$all("[data-remove-custom-tag]").forEach(btn => {
btn.onclick = () => removeCustomTag(btn.dataset.removeCustomTag);
});

const typeSelect = $("#thresholdTypeSelect");
if (typeSelect) {
typeSelect.addEventListener("change", () => {
const type = typeSelect.value;
$("#thresholdEditorMount").innerHTML = renderThresholdEditor(type, getTypeThresholds(type));
bindThresholdSave(type);
});
bindThresholdSave(typeSelect.value);
}
}

// =========================
// init
// =========================
async function init() {
await loadState();
applyHeaderBranding();
bindHelpDelegation();
bindTabEvents();
ensureModalRoot();
registerServiceWorker();
renderColonies();
}

document.addEventListener("DOMContentLoaded", init);
})();
