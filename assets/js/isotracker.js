(function () {
"use strict";

const CONFIG = window.ISO_TRACKER_CONFIG || {};
const DEFAULT_LOGO = CONFIG.defaultLogoUrl || "/assets/images/logo.png";

const DB_NAME = "IsoTrackerDB";
const DB_VERSION = 1;
const STORE_NAME = "kv";
const STATE_KEY = "app_state";

const DEFAULT_STATE = {
colonies: [],
botanicals: [],
salePrep: {
  packaged: [],
  materials: [],
  search: "",
  category: "all",
  type: "all",
  view: "queue"
},
settings: {
appLogoUri: "",
priceSheetLogoUri: "",
businessName: "IsoTracker",
tagline: "Colony Tracker & Price Sheets",
theme: "botanical",
promoText: "",
footerNote: "",
typeThresholds: {}
},

// kept for backward compatibility with older backups
priceData: {},
botanicalPriceData: {},

priceSections: ["Isopods", "Springtails", "Botanicals", "Exotic", "Mid Tier", "Beginner"],

// new cleaner builder model
priceSheetItems: [],
priceSheetBuilder: {
sourceKind: "colony",
selectedColonyType: "",
selectedBotanical: "",
selectedCategory: "Isopods",
selectedPosition: "end"
},

itemOrders: {
colonyTypes: [],
botanicals: []
}
};

let state = structuredCloneSafe(DEFAULT_STATE);

const colonyFilters = {
search: "",
category: "all",
status: "all",
source: "all"
};

function structuredCloneSafe(obj) {
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

function $all(selector) {
return Array.from(document.querySelectorAll(selector));
}

function app(html) {
const root = $("#isoApp");
if (root) root.innerHTML = html;
}

function uid() {
if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
return "id_" + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function sanitizeQuantity(value) {
const num = parseFloat(value);
if (!Number.isFinite(num) || num < 0) return 0;
return Math.round(num * 100) / 100;
}

function formatQty(value) {
const num = Number(value || 0);
if (!Number.isFinite(num)) return "0";
const rounded = Math.round(num * 100) / 100;
return Number.isInteger(rounded) ? String(rounded) : String(rounded).replace(/\.?0+$/, "");
}

function getColonyUnitLabel(colony, fallback = "Population") {
if (colony?.inventoryMode === "custom") {
const unitName = String(colony?.unitName || "").trim();
if (unitName) return unitName;
return fallback === "Population" ? "Units" : "units";
}
return fallback;
}

function formatColonyAmount(value, colony, fallbackUnit = "count") {
return `${formatQty(value)} ${getColonyUnitLabel(colony, fallbackUnit)}`;
}

function getColonyInventorySummaryLabel(colony) {
return getColonyUnitLabel(colony, "Population");
}

function getDB() {
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

function formatDate(input) {
if (!input) return "";
const d = new Date(input);
if (Number.isNaN(d.getTime())) return "";
const m = String(d.getMonth() + 1).padStart(2, "0");
const day = String(d.getDate()).padStart(2, "0");
const y = d.getFullYear();
return `${m}/${day}/${y}`;
}

function formatDateTime(isoString) {
if (!isoString) return "";
const d = new Date(isoString);
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
const a = new Date();
a.setHours(0, 0, 0, 0);
dt.setHours(0, 0, 0, 0);
return Math.floor((a - dt) / 86400000);
}

function normalizeSource(source) {
return {
id: source?.id || uid(),
name: source?.name || "",
quantity: source?.quantity || "",
dateAdded: source?.dateAdded || todayString()
};
}

function normalizeMaterial(material) {
return {
id: material?.id || uid(),
name: material?.name || "",
qty: Math.max(0, parseInt(material?.qty || "0", 10)),
lowStockAt: Math.max(0, parseInt(material?.lowStockAt || "0", 10))
};
}

function normalizePackagedEntry(entry) {
const legacyMaterials = [];

if (entry?.materialName) {
legacyMaterials.push({
materialId: entry.materialId || "",
materialName: entry.materialName || "",
materialQtyUsed: Math.max(1, parseInt(entry.materialQtyUsed || "1", 10))
});
}

return {
colonyIndex: typeof entry?.colonyIndex === "number" ? entry.colonyIndex : null,
colonyName: entry?.colonyName || "",
typeName: entry?.typeName || "",
packCount: sanitizeQuantity(entry?.packCount || 0),
packs: Math.max(1, parseInt(entry?.packs || "1", 10)),
totalRemoved: sanitizeQuantity(
entry?.totalRemoved != null
? entry.totalRemoved
: sanitizeQuantity(entry?.packCount || 0) * Math.max(1, parseInt(entry?.packs || "1", 10))
),
datePacked: entry?.datePacked || todayString(),
inventoryMode: entry?.inventoryMode === "custom" ? "custom" : "population",
unitName: entry?.unitName || "",
materialsUsed: Array.isArray(entry?.materialsUsed)
? entry.materialsUsed
.map(item => ({
materialId: item?.materialId || "",
materialName: item?.materialName || "",
materialQtyUsed: Math.max(1, parseInt(item?.materialQtyUsed || "1", 10))
}))
.filter(item => item.materialName || item.materialId)
: legacyMaterials
};
}

function normalizePriceSheetItem(item) {
return {
id: item?.id || uid(),
sourceKind: item?.sourceKind === "botanical" ? "botanical" : "colony",
sourceName: item?.sourceName || "",
displayName: item?.displayName || item?.sourceName || "",
category: item?.category || "Isopods",
price: item?.price || "",
note: item?.note || ""
};
}

function normalizeColony(colony) {
const normalizedPopulation = sanitizeQuantity(
colony?.population != null ? colony.population : colony?.quantity || 0
);

return {
colonyName: colony?.colonyName || "",
typeName: colony?.typeName || "",
category: colony?.category || "",
typeImageUri: colony?.typeImageUri || "",
dateAdded: colony?.dateAdded || todayString(),

// population remains the stored numeric amount for backward compatibility
population: normalizedPopulation,

// new inventory/unit model
inventoryMode: colony?.inventoryMode === "custom" ? "custom" : "population",
unitName: (colony?.unitName || colony?.customUnitName || "").trim(),

lastMisting: colony?.lastMisting || "",
lastBotanicalsCheck: colony?.lastBotanicalsCheck || "",
lastSubstrateCheck: colony?.lastSubstrateCheck || "",
lastSupplementalFeeding: colony?.lastSupplementalFeeding || "",
lastHusbandry: colony?.lastHusbandry || "",
customNote: colony?.customNote || "",
readyForSale: colony?.readyForSale === true,
history: Array.isArray(colony?.history) ? colony.history : [],
sources: Array.isArray(colony?.sources) ? colony.sources.map(normalizeSource) : []
};
}

function migrateLegacyPriceSheetItems(snapshot) {
const migrated = [];

const colonyTypes = Array.isArray(snapshot?.itemOrders?.colonyTypes)
? snapshot.itemOrders.colonyTypes
: [...new Set((snapshot?.colonies || []).map(c => (c.typeName || "").trim()).filter(Boolean))];

colonyTypes.forEach(type => {
const row = snapshot?.priceData?.[type] || {};
if (row.included === false) return;

const exampleColony = (snapshot?.colonies || []).find(c => c.typeName === type);

migrated.push(normalizePriceSheetItem({
sourceKind: "colony",
sourceName: type,
displayName: type,
category: row.section || exampleColony?.category || "Isopods",
price: row.price || "",
note: row.countLabel || ""
}));
});

const botanicalNames = Array.isArray(snapshot?.itemOrders?.botanicals)
? snapshot.itemOrders.botanicals
: (snapshot?.botanicals || []).map(b => b.itemName).filter(Boolean);

botanicalNames.forEach(name => {
const row = snapshot?.botanicalPriceData?.[name] || {};
if (row.included === false) return;

migrated.push(normalizePriceSheetItem({
sourceKind: "botanical",
sourceName: name,
displayName: name,
category: row.section || "Botanicals",
price: row.price || "",
note: row.priceNote || ""
}));
});

return migrated;
}

async function loadState() {
const saved = await idbGet(STATE_KEY);

if (saved && typeof saved === "object") {
state = {
...structuredCloneSafe(DEFAULT_STATE),
...saved,
settings: {
...DEFAULT_STATE.settings,
...(saved.settings || {})
},
itemOrders: {
...DEFAULT_STATE.itemOrders,
...(saved.itemOrders || {})
},
priceSheetBuilder: {
...DEFAULT_STATE.priceSheetBuilder,
...(saved.priceSheetBuilder || {})
}
};
} else {
state = structuredCloneSafe(DEFAULT_STATE);
await saveState();
}

state.colonies = Array.isArray(state.colonies) ? state.colonies.map(normalizeColony) : [];
state.botanicals = Array.isArray(state.botanicals) ? state.botanicals : [];

state.salePrep = state.salePrep || {
  packaged: [],
  materials: [],
  search: "",
  category: "all",
  type: "all",
  view: "queue"
};

state.salePrep.packaged = Array.isArray(state.salePrep.packaged)
? state.salePrep.packaged.map(normalizePackagedEntry)
: [];

state.salePrep.materials = Array.isArray(state.salePrep.materials)
? state.salePrep.materials.map(normalizeMaterial)
: [];

state.salePrep.search = state.salePrep.search || "";
state.salePrep.category = state.salePrep.category || "all";
state.salePrep.type = state.salePrep.type || "all";
state.salePrep.view = state.salePrep.view || "queue";

state.settings.typeThresholds = state.settings.typeThresholds || {};
state.priceSections = Array.isArray(state.priceSections) && state.priceSections.length
? state.priceSections
: structuredCloneSafe(DEFAULT_STATE.priceSections);

state.priceSheetItems = Array.isArray(state.priceSheetItems)
? state.priceSheetItems.map(normalizePriceSheetItem)
: [];

if (!state.priceSheetItems.length) {
state.priceSheetItems = migrateLegacyPriceSheetItems(state);
}

state.priceSheetBuilder = {
...DEFAULT_STATE.priceSheetBuilder,
...(state.priceSheetBuilder || {})
};

if (!state.priceSheetBuilder.selectedCategory) {
state.priceSheetBuilder.selectedCategory = state.priceSections[0] || "Isopods";
}
}

function getStatus(days) {
if (days <= 3) return "green";
if (days <= 10) return "yellow";
return "red";
}

function statusText(statusOrDays) {
if (statusOrDays === "green") return "Checked Recently";
if (statusOrDays === "yellow") return "Needs Attention Soon";
if (statusOrDays === "red") return "Needs Checked";

if (statusOrDays <= 3) return "Checked Recently";
if (statusOrDays <= 10) return "Needs Attention Soon";
return "Needs Checked";
}

function defaultThresholds() {
return {
misting: { green: 3, yellow: 10 },
feeding: { green: 3, yellow: 10 },
substrate: { green: 3, yellow: 10 },
botanicals: { green: 3, yellow: 10 }
};
}

function getTypeThresholds(typeName) {
const defaults = defaultThresholds();
const saved = state.settings.typeThresholds?.[typeName] || {};

return {
misting: {
green: Number(saved.misting?.green ?? defaults.misting.green),
yellow: Number(saved.misting?.yellow ?? defaults.misting.yellow)
},
feeding: {
green: Number(saved.feeding?.green ?? defaults.feeding.green),
yellow: Number(saved.feeding?.yellow ?? defaults.feeding.yellow)
},
substrate: {
green: Number(saved.substrate?.green ?? defaults.substrate.green),
yellow: Number(saved.substrate?.yellow ?? defaults.substrate.yellow)
},
botanicals: {
green: Number(saved.botanicals?.green ?? defaults.botanicals.green),
yellow: Number(saved.botanicals?.yellow ?? defaults.botanicals.yellow)
}
};
}

function getTaskStatus(days, threshold) {
if (days <= threshold.green) return "green";
if (days <= threshold.yellow) return "yellow";
return "red";
}

function getColonyTaskStatuses(colony) {
const thresholds = getTypeThresholds(colony.typeName);

const mistingDays = daysSince(colony.lastMisting);
const feedingDays = daysSince(colony.lastSupplementalFeeding);
const substrateDays = daysSince(colony.lastSubstrateCheck);
const botanicalsDays = daysSince(colony.lastBotanicalsCheck);

return {
misting: {
days: mistingDays,
status: getTaskStatus(mistingDays, thresholds.misting),
threshold: thresholds.misting
},
feeding: {
days: feedingDays,
status: getTaskStatus(feedingDays, thresholds.feeding),
threshold: thresholds.feeding
},
substrate: {
days: substrateDays,
status: getTaskStatus(substrateDays, thresholds.substrate),
threshold: thresholds.substrate
},
botanicals: {
days: botanicalsDays,
status: getTaskStatus(botanicalsDays, thresholds.botanicals),
threshold: thresholds.botanicals
}
};
}

function getOverallColonyStatus(colony) {
const tasks = getColonyTaskStatuses(colony);
const statuses = Object.values(tasks).map(t => t.status);

if (statuses.includes("red")) return "red";
if (statuses.includes("yellow")) return "yellow";
return "green";
}

function slug(str) {
return (str || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function uniqueTypes() {
return [...new Set(state.colonies.map(c => (c.typeName || "").trim()).filter(Boolean))]
.sort((a, b) => a.localeCompare(b));
}

function uniqueCategories() {
return [...new Set(state.colonies.map(c => (c.category || "").trim()).filter(Boolean))]
.sort((a, b) => a.localeCompare(b));
}

function uniqueSources() {
return [...new Set(
state.colonies.flatMap(c => (c.sources || []).map(s => (s.name || "").trim())).filter(Boolean)
)].sort((a, b) => a.localeCompare(b));
}

function orderedList(sourceList, savedOrder) {
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

function refreshOrders() {
state.itemOrders.colonyTypes = orderedList(uniqueTypes(), state.itemOrders.colonyTypes || []);
state.itemOrders.botanicals = orderedList(
state.botanicals.map(b => b.itemName),
state.itemOrders.botanicals || []
);
}

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

function addHistory(colony, action, detail) {
if (!Array.isArray(colony.history)) colony.history = [];
colony.history.unshift({
ts: new Date().toISOString(),
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

const ratio = Math.min(
1,
maxWidth / width || 1,
maxHeight / height || 1
);

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

function saveInputState(input) {
if (!input) return null;
return {
value: input.value,
selectionStart: input.selectionStart,
selectionEnd: input.selectionEnd
};
}

function restoreInputState(input, stateObj) {
if (!input || !stateObj) return;
input.value = stateObj.value;
try {
input.setSelectionRange(stateObj.selectionStart, stateObj.selectionEnd);
} catch (err) {
// ignore
}
}

function debounce(fn, delay = 250) {
let timer;
return function (...args) {
clearTimeout(timer);
timer = setTimeout(() => fn.apply(this, args), delay);
};
}

function ensureModalRoot() {
let overlay = document.getElementById("isoModalOverlay");
if (overlay) return overlay;

overlay = document.createElement("div");
overlay.id = "isoModalOverlay";
overlay.style.position = "fixed";
overlay.style.inset = "0";
overlay.style.background = "rgba(0,0,0,0.55)";
overlay.style.display = "none";
overlay.style.alignItems = "center";
overlay.style.justifyContent = "center";
overlay.style.padding = "16px";
overlay.style.zIndex = "99999";

overlay.innerHTML = `
<div id="isoModalCard" style="
width:min(760px, 100%);
max-height:90vh;
overflow:auto;
background:#141618;
border:1px solid rgba(255,255,255,0.10);
border-radius:18px;
box-shadow:0 18px 60px rgba(0,0,0,0.45);
padding:16px;
color:#e9ecef;
">
<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;">
<h3 id="isoModalTitle" style="margin:0;font-size:1.1rem;">Modal</h3>
<button id="isoModalCloseBtn" type="button" style="
border:1px solid rgba(255,255,255,0.12);
background:transparent;
color:#e9ecef;
border-radius:10px;
padding:8px 10px;
cursor:pointer;
font-weight:800;
">✕</button>
</div>
<div id="isoModalBody"></div>
</div>
`;

document.body.appendChild(overlay);

overlay.addEventListener("click", function (e) {
if (e.target === overlay) closeModal();
});

const closeBtn = document.getElementById("isoModalCloseBtn");
if (closeBtn) {
closeBtn.addEventListener("click", closeModal);
}

return overlay;
}

function openModal(title, html, onBind) {
const overlay = ensureModalRoot();
const titleEl = document.getElementById("isoModalTitle");
const bodyEl = document.getElementById("isoModalBody");

if (titleEl) titleEl.textContent = title || "Modal";
if (bodyEl) bodyEl.innerHTML = html || "";

overlay.style.display = "flex";

if (typeof onBind === "function") {
onBind();
}
}

function closeModal() {
const overlay = document.getElementById("isoModalOverlay");
if (!overlay) return;
overlay.style.display = "none";
}

function setTab(tab) {
$all(".iso-tab").forEach(btn => {
btn.classList.toggle("active", btn.dataset.tab === tab);
});

if (tab === "colonies") renderColonies();
if (tab === "population") renderPopulation();
if (tab === "botanicals") renderBotanicals();
if (tab === "prep") renderSalePrep();
if (tab === "price") renderPriceSheet();
if (tab === "guide") renderGuide();
if (tab === "settings") renderSettings();
}

async function exportProfile() {
const profile = {
version: 9,
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

if (!parsed || !parsed.data) {
alert("Invalid backup file.");
return;
}

state = {
...structuredCloneSafe(DEFAULT_STATE),
...parsed.data,
settings: {
...DEFAULT_STATE.settings,
...(parsed.data.settings || {})
},
itemOrders: {
...DEFAULT_STATE.itemOrders,
...(parsed.data.itemOrders || {})
},
priceSheetBuilder: {
...DEFAULT_STATE.priceSheetBuilder,
...(parsed.data.priceSheetBuilder || {})
}
};

state.colonies = Array.isArray(state.colonies) ? state.colonies.map(normalizeColony) : [];
state.botanicals = Array.isArray(state.botanicals) ? state.botanicals : [];

state.salePrep = state.salePrep || {
  packaged: [],
  materials: [],
  search: "",
  category: "all",
  type: "all",
  view: "queue"
};

state.salePrep.packaged = Array.isArray(state.salePrep.packaged)
? state.salePrep.packaged.map(normalizePackagedEntry)
: [];

state.salePrep.materials = Array.isArray(state.salePrep.materials)
? state.salePrep.materials.map(normalizeMaterial)
: [];

state.salePrep.search = state.salePrep.search || "";
state.salePrep.category = state.salePrep.category || "all";
state.salePrep.type = state.salePrep.type || "all";
state.salePrep.view = state.salePrep.view || "queue";
state.settings.typeThresholds = state.settings.typeThresholds || {};

state.priceSections = Array.isArray(state.priceSections) && state.priceSections.length
? state.priceSections
: structuredCloneSafe(DEFAULT_STATE.priceSections);

state.priceSheetItems = Array.isArray(state.priceSheetItems)
? state.priceSheetItems.map(normalizePriceSheetItem)
: [];

if (!state.priceSheetItems.length) {
state.priceSheetItems = migrateLegacyPriceSheetItems(state);
}

if (!state.priceSheetBuilder.selectedCategory) {
state.priceSheetBuilder.selectedCategory = state.priceSections[0] || "Isopods";
}

refreshOrders();
await saveState();
applyHeaderBranding();
alert("Profile imported successfully.");
renderSettings();
} catch (err) {
alert("Could not import backup file.");
}
}
function filterColonies() {
const search = colonyFilters.search.trim().toLowerCase();
const category = colonyFilters.category;
const status = colonyFilters.status;
const source = colonyFilters.source;

return state.colonies
.slice()
.sort((a, b) => {
const order = { red: 3, yellow: 2, green: 1 };

const statusA = getOverallColonyStatus(a);
const statusB = getOverallColonyStatus(b);

if (order[statusB] !== order[statusA]) {
return order[statusB] - order[statusA];
}

return daysSince(b.lastHusbandry) - daysSince(a.lastHusbandry);
})
.filter(c => {
const sourceText = (c.sources || [])
.map(s => `${s.name || ""} ${s.quantity || ""} ${s.dateAdded || ""}`)
.join(" ");

const hay = `${c.colonyName || ""} ${c.typeName || ""} ${sourceText}`.toLowerCase();

if (search && !hay.includes(search)) return false;
if (category !== "all" && (c.category || "") !== category) return false;

if (status !== "all") {
const s = getOverallColonyStatus(c);
if (s !== status) return false;
}

if (source !== "all") {
const hasSource = (c.sources || []).some(s => (s.name || "") === source);
if (!hasSource) return false;
}

return true;
});
}

function renderColonies() {
const sorted = filterColonies();
const categories = uniqueCategories();
const sources = uniqueSources();

let html = `
<h2 class="iso-section-title">Colonies</h2>
<p class="iso-subtext">Your main working list. Oldest updated colonies appear first so you can see what needs attention.</p>

<div class="iso-toolbar">
<button class="iso-btn iso-btn-primary" data-action="show-add-colony">+ Add Colony</button>
</div>

<div class="iso-form-grid" style="margin-bottom:14px;">
<div>
<label>Search</label>
<input id="colonySearch" placeholder="Search colony name, type, or source" value="${esc(colonyFilters.search)}">
</div>
<div>
<label>Category</label>
<select id="colonyCategoryFilter">
<option value="all"${colonyFilters.category === "all" ? " selected" : ""}>All Categories</option>
${categories.map(cat => `<option value="${esc(cat)}"${colonyFilters.category === cat ? " selected" : ""}>${esc(cat)}</option>`).join("")}
</select>
</div>
<div>
<label>Status</label>
<select id="colonyStatusFilter">
<option value="all"${colonyFilters.status === "all" ? " selected" : ""}>All Statuses</option>
<option value="green"${colonyFilters.status === "green" ? " selected" : ""}>Checked Recently</option>
<option value="yellow"${colonyFilters.status === "yellow" ? " selected" : ""}>Needs Attention Soon</option>
<option value="red"${colonyFilters.status === "red" ? " selected" : ""}>Needs Checked</option>
</select>
</div>
<div>
<label>Source</label>
<select id="colonySourceFilter">
<option value="all"${colonyFilters.source === "all" ? " selected" : ""}>All Sources</option>
${sources.map(source => `<option value="${esc(source)}"${colonyFilters.source === source ? " selected" : ""}>${esc(source)}</option>`).join("")}
</select>
</div>
</div>
`;

if (!sorted.length) {
html += `<div class="iso-empty">No colonies match your current filter.</div>`;
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
<span class="iso-badge iso-badge-${status}">${statusText(status)}</span>
</div>
<div class="iso-meta">
<div><strong>Category:</strong> ${esc(c.category || "-")}</div>
<div><strong>${esc(getColonyInventorySummaryLabel(c))}:</strong> ${formatQty(c.population || 0)}</div>
<div><strong>Date Added:</strong> ${c.dateAdded || "-"}</div>
<div><strong>Last Updated:</strong> ${c.lastHusbandry || "Never"}</div>
<div><strong>Source Summary:</strong> ${
(c.sources && c.sources.length)
? esc(
c.sources.length === 1
? `${c.sources[0].name}${c.sources[0].quantity ? ` — ${c.sources[0].quantity}` : ""}`
: `${c.sources[0].name}${c.sources[0].quantity ? ` — ${c.sources[0].quantity}` : ""} +${c.sources.length - 1} more`
)
: "-"
}</div>
</div>
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
const addColonyBtn = $("[data-action='show-add-colony']");
if (addColonyBtn) addColonyBtn.onclick = showAddColonyForm;

const search = $("#colonySearch");
const cat = $("#colonyCategoryFilter");
const status = $("#colonyStatusFilter");
const source = $("#colonySourceFilter");

if (search) {
const debouncedSearch = debounce(() => {
const input = $("#colonySearch");
const stateObj = saveInputState(input);

colonyFilters.search = stateObj ? stateObj.value : "";
renderColonies();

setTimeout(() => {
const newInput = $("#colonySearch");
restoreInputState(newInput, stateObj);
if (newInput) newInput.focus();
}, 0);
}, 250);

search.addEventListener("input", debouncedSearch);
}

if (cat) {
cat.addEventListener("change", () => {
colonyFilters.category = cat.value;
renderColonies();
});
}

if (status) {
status.addEventListener("change", () => {
colonyFilters.status = status.value;
renderColonies();
});
}

if (source) {
source.addEventListener("change", () => {
colonyFilters.source = source.value;
renderColonies();
});
}
}

function showAddColonyForm() {
const knownCats = ["Isopods", "Springtails", "Botanicals", ...uniqueCategories()]
.filter((v, i, a) => v && a.indexOf(v) === i);

app(`
<h2 class="iso-section-title">Add Colony</h2>
<p class="iso-subtext">Colony names must be unique. Type names can repeat.</p>

<div class="iso-form-grid">
<div>
<label>Colony Name</label>
<input id="colonyName" placeholder="Red Panda Bin 1">
</div>
<div>
<label>Type Name</label>
<input id="typeName" placeholder="Red Panda">
</div>
<div>
<label>Date Added</label>
<input id="dateAdded" value="${todayString()}" placeholder="mm/dd/yyyy">
</div>
</div>

<div class="iso-form-grid">
<div>
<label>Inventory Mode</label>
<select id="inventoryMode">
<option value="population" selected>Population</option>
<option value="custom">Custom Units</option>
</select>
</div>
<div id="unitNameWrap" style="display:none;">
<label>Custom Unit Name</label>
<input id="unitName" placeholder="oz culture, cups, tubs, cultures">
</div>
<div>
<label id="populationLabel">Population</label>
<input id="population" type="number" min="0" step="0.01" placeholder="0">
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
<div>
<label>Last Misting</label>
<input id="lastMisting" placeholder="mm/dd/yyyy">
</div>
<div>
<label>Last Botanicals Check</label>
<input id="lastBotanicalsCheck" placeholder="mm/dd/yyyy">
</div>
<div>
<label>Last Substrate Check</label>
<input id="lastSubstrateCheck" placeholder="mm/dd/yyyy">
</div>
<div>
<label>Last Supplemental Feeding</label>
<input id="lastSupplementalFeeding" placeholder="mm/dd/yyyy">
</div>
</div>

<div class="iso-divider"></div>

<h3 class="iso-card-title" style="margin:0 0 10px 0;">Initial Source</h3>
<p class="iso-subtext" style="margin-top:0;">Optional now, and you can still add boosters later inside the colony.</p>

<div class="iso-form-grid">
<div>
<label>Source Name</label>
<input id="initialSourceName" placeholder="Resort To Bio">
</div>
<div>
<label>Quantity</label>
<input id="initialSourceQuantity" placeholder="200 count">
</div>
<div>
<label>Date Added</label>
<input id="initialSourceDate" value="${todayString()}" placeholder="mm/dd/yyyy">
</div>
</div>

<div class="iso-divider"></div>

<h3 class="iso-card-title" style="margin:0 0 10px 0;">Sale Status</h3>

<div class="iso-form-grid">
<div>
<label>Ready For Sale</label>
<select id="readyForSale">
<option value="no" selected>Not Ready For Sale</option>
<option value="yes">Ready For Sale</option>
</select>
</div>
</div>

<label>Type Picture</label>
<input id="typeImage" type="file" accept="image/*">

<label>Custom Note</label>
<textarea id="customNote" placeholder="Any notes for this colony..."></textarea>

<div class="iso-actions">
<button class="iso-btn iso-btn-primary" id="saveNewColonyBtn">Save Colony</button>
<button class="iso-btn" id="cancelAddColonyBtn">Cancel</button>
</div>
`);

const categorySelect = $("#categorySelect");
const customWrap = $("#customCategoryWrap");
if (categorySelect) {
categorySelect.addEventListener("change", () => {
customWrap.style.display = categorySelect.value === "__custom__" ? "block" : "none";
});
}

const inventoryMode = $("#inventoryMode");
const unitNameWrap = $("#unitNameWrap");
const populationLabel = $("#populationLabel");

function syncInventoryModeUi() {
const mode = inventoryMode?.value || "population";
if (unitNameWrap) unitNameWrap.style.display = mode === "custom" ? "block" : "none";
if (populationLabel) populationLabel.textContent = mode === "custom" ? "Starting Amount" : "Population";
}

if (inventoryMode) {
inventoryMode.addEventListener("change", syncInventoryModeUi);
syncInventoryModeUi();
}

$("#saveNewColonyBtn").onclick = saveNewColony;
$("#cancelAddColonyBtn").onclick = renderColonies;
}

function getChosenCategory(prefix = "") {
const select = document.getElementById(prefix + "categorySelect");
if (!select) return "";
if (select.value === "__custom__") {
return (document.getElementById(prefix + "customCategory")?.value || "").trim();
}
return select.value.trim();
}

async function saveNewColony() {
const colonyName = $("#colonyName").value.trim();
const typeName = $("#typeName").value.trim();
const category = getChosenCategory("");
const inventoryMode = ($("#inventoryMode")?.value || "population") === "custom" ? "custom" : "population";
const unitName = ($("#unitName")?.value || "").trim();

if (!colonyName) return alert("Colony name is required.");
if (!typeName) return alert("Type name is required.");
if (!category) return alert("Category is required.");
if (inventoryMode === "custom" && !unitName) return alert("Custom unit name is required when using custom units.");

if (state.colonies.some(c => c.colonyName.toLowerCase() === colonyName.toLowerCase())) {
return alert("Colony name already in use. Please choose a different colony name.");
}

const initialSourceName = ($("#initialSourceName")?.value || "").trim();
const initialSourceQuantity = ($("#initialSourceQuantity")?.value || "").trim();
const initialSourceDate = ($("#initialSourceDate")?.value || "").trim() || todayString();

const sources = [];
if (initialSourceName) {
sources.push({
id: uid(),
name: initialSourceName,
quantity: initialSourceQuantity,
dateAdded: initialSourceDate
});
}

const startingAmount = sanitizeQuantity($("#population").value || "0");

const colony = normalizeColony({
colonyName,
typeName,
category,
typeImageUri: "",
dateAdded: $("#dateAdded").value.trim() || todayString(),
population: startingAmount,
inventoryMode,
unitName,
lastMisting: $("#lastMisting").value.trim(),
lastBotanicalsCheck: $("#lastBotanicalsCheck").value.trim(),
lastSubstrateCheck: $("#lastSubstrateCheck").value.trim(),
lastSupplementalFeeding: $("#lastSupplementalFeeding").value.trim(),
lastHusbandry: "",
customNote: $("#customNote").value.trim(),
readyForSale: ($("#readyForSale")?.value || "no") === "yes",
sources
});

updateLastHusbandry(colony);

addHistory(
colony,
"Created colony",
`Created colony ${colonyName} with ${formatColonyAmount(startingAmount, colony, inventoryMode === "custom" ? "units" : "count")}.`
);

if (initialSourceName) {
addHistory(
colony,
"Added source",
`${initialSourceName}${initialSourceQuantity ? `, ${initialSourceQuantity}` : ""}${initialSourceDate ? `, ${initialSourceDate}` : ""}.`
);
}

const file = $("#typeImage").files[0];
if (file) {
colony.typeImageUri = await compressImageFile(file, {
maxWidth: 800,
maxHeight: 800,
quality: 0.72
});
addHistory(colony, "Added image", "Added colony image.");
}

state.colonies.push(colony);
refreshOrders();
await saveState();
renderColonies();
}
function renderSourcesList(colony, colonyIndex) {
const sortedSources = (colony.sources || []).slice().sort((a, b) => {
const aDate = parseDateString(a.dateAdded || "") || new Date(0);
const bDate = parseDateString(b.dateAdded || "") || new Date(0);
return aDate - bDate;
});

if (!sortedSources.length) {
return `<div class="iso-empty" style="padding:14px 12px;">No sources added yet.</div>`;
}

return `
<div class="iso-history-list">
${sortedSources.map(source => `
<div class="iso-history-item">
<div class="iso-history-time">${esc(source.dateAdded || "-")}</div>
<div class="iso-history-text">
<strong>${esc(source.name || "-")}</strong>${source.quantity ? ` — ${esc(source.quantity)}` : ""}
</div>
<div class="iso-actions" style="margin-top:8px;">
<button class="iso-btn" data-edit-source="${esc(source.id)}" data-colony-index="${colonyIndex}">Edit</button>
<button class="iso-btn iso-btn-danger" data-delete-source="${esc(source.id)}" data-colony-index="${colonyIndex}">Delete</button>
</div>
</div>
`).join("")}
</div>
`;
}

function renderHistory(colony) {
if (!colony.history || !colony.history.length) {
return `<div class="iso-empty" style="padding:14px 12px;">No history yet.</div>`;
}

return `
<div class="iso-history-list">
${(colony.history || []).map(item => `
<div class="iso-history-item">
<div class="iso-history-time">${esc(formatDateTime(item.ts || ""))}</div>
<div class="iso-history-text">
<strong>${esc(item.action || "")}</strong>${item.detail ? ` — ${esc(item.detail)}` : ""}
</div>
</div>
`).join("")}
</div>
`;
}

function openSourceModal(colonyIndex, sourceId = "") {
const colony = state.colonies[colonyIndex];
if (!colony) return;

const existing = sourceId
? (colony.sources || []).find(s => s.id === sourceId)
: null;

openModal(
existing ? "Edit Source" : "Add Source",
`
<div class="iso-form-grid">
<div>
<label>Source Name</label>
<input id="sourceNameInput" value="${esc(existing?.name || "")}" placeholder="SnJ Terrariums">
</div>
<div>
<label>Quantity</label>
<input id="sourceQuantityInput" value="${esc(existing?.quantity || "")}" placeholder="200 count">
</div>
<div>
<label>Date Added</label>
<input id="sourceDateInput" value="${esc(existing?.dateAdded || todayString())}" placeholder="mm/dd/yyyy">
</div>
</div>

<div class="iso-actions">
<button class="iso-btn iso-btn-primary" id="saveSourceBtn">${existing ? "Save Changes" : "Add Source"}</button>
<button class="iso-btn" id="cancelSourceBtn">Cancel</button>
</div>
`,
() => {
const saveBtn = $("#saveSourceBtn");
const cancelBtn = $("#cancelSourceBtn");
if (saveBtn) saveBtn.onclick = () => saveSource(colonyIndex, sourceId);
if (cancelBtn) cancelBtn.onclick = closeModal;
}
);
}

async function saveSource(colonyIndex, sourceId = "") {
const colony = state.colonies[colonyIndex];
if (!colony) return;

const name = ($("#sourceNameInput")?.value || "").trim();
const quantity = ($("#sourceQuantityInput")?.value || "").trim();
const dateAdded = ($("#sourceDateInput")?.value || "").trim() || todayString();

if (!name) {
alert("Source name is required.");
return;
}

if (!Array.isArray(colony.sources)) colony.sources = [];

if (sourceId) {
const source = colony.sources.find(s => s.id === sourceId);
if (!source) return;

const oldName = source.name || "";
const oldQuantity = source.quantity || "";
const oldDate = source.dateAdded || "";

source.name = name;
source.quantity = quantity;
source.dateAdded = dateAdded;

addHistory(
colony,
"Edited source",
`Changed source from "${oldName}${oldQuantity ? `, ${oldQuantity}` : ""}${oldDate ? `, ${oldDate}` : ""}" to "${name}${quantity ? `, ${quantity}` : ""}${dateAdded ? `, ${dateAdded}` : ""}".`
);
} else {
const newSource = {
id: uid(),
name,
quantity,
dateAdded
};

colony.sources.push(newSource);

addHistory(
colony,
"Added source",
`${name}${quantity ? `, ${quantity}` : ""}${dateAdded ? `, ${dateAdded}` : ""}.`
);
}

await saveState();
closeModal();
openColony(colonyIndex);
}

async function deleteSource(colonyIndex, sourceId) {
const colony = state.colonies[colonyIndex];
if (!colony || !Array.isArray(colony.sources)) return;

const source = colony.sources.find(s => s.id === sourceId);
if (!source) return;

if (!confirm(`Delete source "${source.name}"?`)) return;

colony.sources = colony.sources.filter(s => s.id !== sourceId);

addHistory(
colony,
"Deleted source",
`${source.name}${source.quantity ? `, ${source.quantity}` : ""}${source.dateAdded ? `, ${source.dateAdded}` : ""}.`
);

await saveState();
openColony(colonyIndex);
}

function openSplitModal(index) {
const colony = state.colonies[index];
if (!colony) return;

openModal(
"Split Colony",
`
<div class="iso-form-grid">
<div>
<label>New Colony Name</label>
<input id="splitColonyName" placeholder="${esc(colony.typeName)} Bin 2">
</div>
<div>
<label>Amount To Move (${esc(getColonyUnitLabel(colony, "amount"))})</label>
<input id="splitColonyPopulation" type="number" min="0.01" step="0.01" placeholder="10">
</div>
</div>

<div class="iso-actions">
<button class="iso-btn iso-btn-primary" id="confirmSplitColonyBtn">Split Colony</button>
<button class="iso-btn" id="cancelSplitColonyBtn">Cancel</button>
</div>
`,
() => {
const confirmBtn = $("#confirmSplitColonyBtn");
const cancelBtn = $("#cancelSplitColonyBtn");
if (confirmBtn) confirmBtn.onclick = () => splitColony(index);
if (cancelBtn) cancelBtn.onclick = closeModal;
}
);
}

async function splitColony(index) {
const original = state.colonies[index];
if (!original) return;

const newName = ($("#splitColonyName")?.value || "").trim();
const moveCount = sanitizeQuantity($("#splitColonyPopulation")?.value || "0");

if (!newName) {
alert("New colony name is required.");
return;
}

if (state.colonies.some(c => c.colonyName.toLowerCase() === newName.toLowerCase())) {
alert("That colony name is already in use.");
return;
}

if (moveCount <= 0) {
alert("Amount to move must be greater than 0.");
return;
}

if (moveCount >= Number(original.population || 0)) {
alert(`Amount to move must be less than the current ${getColonyUnitLabel(original, "amount").toLowerCase()}.`);
return;
}

const newColony = normalizeColony({
colonyName: newName,
typeName: original.typeName,
category: original.category,
typeImageUri: original.typeImageUri,
dateAdded: todayString(),
population: moveCount,
inventoryMode: original.inventoryMode,
unitName: original.unitName,
lastMisting: original.lastMisting,
lastBotanicalsCheck: original.lastBotanicalsCheck,
lastSubstrateCheck: original.lastSubstrateCheck,
lastSupplementalFeeding: original.lastSupplementalFeeding,
lastHusbandry: original.lastHusbandry,
customNote: original.customNote,
readyForSale: original.readyForSale,
history: [],
sources: structuredCloneSafe(original.sources || [])
});

original.population = sanitizeQuantity(Number(original.population || 0) - moveCount);

addHistory(original, "Split colony", `Created "${newName}" and moved ${formatColonyAmount(moveCount, original, "units")}.`);
addHistory(newColony, "Created by split", `Split from "${original.colonyName}" with ${formatColonyAmount(moveCount, original, "units")}.`);

state.colonies.push(newColony);
refreshOrders();
await saveState();
closeModal();
renderColonies();
}

function openColony(index) {
const c = state.colonies[index];
const knownCats = ["Isopods", "Springtails", "Botanicals", ...uniqueCategories()]
.filter((v, i, a) => v && a.indexOf(v) === i);

const isCustomUnit = c.inventoryMode === "custom";

app(`
<h2 class="iso-section-title">${esc(c.colonyName)}</h2>
<p class="iso-subtext">${esc(c.typeName)}</p>

${c.typeImageUri ? `<img class="iso-thumb" src="${c.typeImageUri}" alt="">` : ""}

<div class="iso-meta" style="margin-bottom:14px">
<div><strong>Category:</strong> ${esc(c.category || "-")}</div>
<div><strong>Date Added:</strong> ${c.dateAdded || "-"}</div>
<div><strong>${esc(getColonyInventorySummaryLabel(c))}:</strong> ${formatQty(c.population || 0)}</div>
<div><strong>Last Updated:</strong> ${c.lastHusbandry || "Never"}</div>
<div>
<strong>Source Summary:</strong>
${
(c.sources && c.sources.length)
? esc(
c.sources.length === 1
? `${c.sources[0].name}${c.sources[0].quantity ? ` — ${c.sources[0].quantity}` : ""}`
: `${c.sources[0].name}${c.sources[0].quantity ? ` — ${c.sources[0].quantity}` : ""} +${c.sources.length - 1} more`
)
: "-"
}
</div>
</div>

<div class="iso-actions" style="margin-bottom:12px">
<button class="iso-btn iso-btn-primary" data-quick="misting">Mark Misted Now</button>
<button class="iso-btn iso-btn-primary" data-quick="feeding">Mark Fed Now</button>
<button class="iso-btn iso-btn-primary" data-quick="botanicals">Mark Botanicals Checked Now</button>
<button class="iso-btn iso-btn-primary" data-quick="substrate">Mark Substrate Checked Now</button>
</div>

<div class="iso-form-grid">
<div>
<label>Inventory Mode</label>
<select id="editInventoryMode">
<option value="population" ${!isCustomUnit ? "selected" : ""}>Population</option>
<option value="custom" ${isCustomUnit ? "selected" : ""}>Custom Units</option>
</select>
</div>
<div id="editUnitNameWrap" style="${isCustomUnit ? "" : "display:none;"}">
<label>Custom Unit Name</label>
<input id="editUnitName" value="${esc(c.unitName || "")}" placeholder="oz culture, cups, tubs">
</div>
<div>
<label id="editPopulationLabel">${esc(getColonyInventorySummaryLabel(c))}</label>
<input id="editPopulation" type="number" min="0" step="0.01" value="${formatQty(c.population || 0)}">
</div>
</div>

<div class="iso-form-grid">
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
<div>
<label>Last Misting</label>
<input id="editMisting" value="${c.lastMisting || ""}" placeholder="mm/dd/yyyy">
</div>
<div>
<label>Last Botanicals Check</label>
<input id="editBotanicals" value="${c.lastBotanicalsCheck || ""}" placeholder="mm/dd/yyyy">
</div>
<div>
<label>Last Substrate Check</label>
<input id="editSubstrate" value="${c.lastSubstrateCheck || ""}" placeholder="mm/dd/yyyy">
</div>
<div>
<label>Last Supplemental Feeding</label>
<input id="editFeeding" value="${c.lastSupplementalFeeding || ""}" placeholder="mm/dd/yyyy">
</div>
</div>

<div class="iso-form-grid">
<div>
<label>Sale Status</label>
<select id="editReadyForSale">
<option value="no" ${!c.readyForSale ? "selected" : ""}>Not Ready For Sale</option>
<option value="yes" ${c.readyForSale ? "selected" : ""}>Ready For Sale</option>
</select>
</div>
</div>

<label>Replace Type Picture</label>
<input id="replaceTypeImage" type="file" accept="image/*">

<div class="iso-actions" style="margin-top:8px;">
<button class="iso-btn" id="replaceImageBtn">Save New Image</button>
<button class="iso-btn iso-btn-danger" id="removeImageBtn" ${c.typeImageUri ? "" : "disabled"}>Remove Image</button>
</div>

<label>Custom Note</label>
<textarea id="editNote">${esc(c.customNote || "")}</textarea>

<div class="iso-actions">
<button class="iso-btn iso-btn-primary" id="saveColonyEditsBtn">Save Changes</button>
<button class="iso-btn" id="splitColonyBtn">Split Colony</button>
<button class="iso-btn" id="backToColoniesBtn">Back</button>
<button class="iso-btn iso-btn-danger" id="deleteColonyBtn">Delete Colony</button>
</div>

<div class="iso-divider"></div>

<div class="iso-section-head">
<h3 class="iso-card-title" style="margin:0;">Colony Sources</h3>
</div>

<div class="iso-actions" style="margin-bottom:12px;">
<button class="iso-btn iso-btn-primary" id="addSourceBtn">+ Add Source</button>
</div>

${renderSourcesList(c, index)}

<div class="iso-divider"></div>

<div class="iso-section-head">
<h3 class="iso-card-title" style="margin:0;">History</h3>
</div>
${renderHistory(c)}
`);

const select = $("#editcategorySelect");
const wrap = $("#editcustomCategoryWrap");
if (select) {
select.addEventListener("change", () => {
wrap.style.display = select.value === "__custom__" ? "block" : "none";
});
}

const inventoryMode = $("#editInventoryMode");
const unitNameWrap = $("#editUnitNameWrap");
const populationLabel = $("#editPopulationLabel");

function syncEditInventoryModeUi() {
const mode = inventoryMode?.value || "population";
if (unitNameWrap) unitNameWrap.style.display = mode === "custom" ? "block" : "none";
if (populationLabel) {
populationLabel.textContent = mode === "custom"
? ($("#editUnitName")?.value.trim() || "Units")
: "Population";
}
}

if (inventoryMode) {
inventoryMode.addEventListener("change", syncEditInventoryModeUi);
}

const unitNameInput = $("#editUnitName");
if (unitNameInput) {
unitNameInput.addEventListener("input", syncEditInventoryModeUi);
}

syncEditInventoryModeUi();

$all("[data-quick]").forEach(btn => {
btn.onclick = () => quickAction(index, btn.dataset.quick);
});

const replaceBtn = $("#replaceImageBtn");
const removeBtn = $("#removeImageBtn");
const saveBtn = $("#saveColonyEditsBtn");
const splitBtn = $("#splitColonyBtn");
const backBtn = $("#backToColoniesBtn");
const deleteBtn = $("#deleteColonyBtn");

if (replaceBtn) replaceBtn.onclick = () => replaceColonyImage(index);
if (removeBtn) removeBtn.onclick = () => removeColonyImage(index);
if (saveBtn) saveBtn.onclick = () => saveColonyEdits(index);
if (splitBtn) splitBtn.onclick = () => openSplitModal(index);
if (backBtn) backBtn.onclick = renderColonies;
if (deleteBtn) deleteBtn.onclick = () => deleteColony(index);

const addSourceBtn = $("#addSourceBtn");
if (addSourceBtn) {
addSourceBtn.onclick = () => openSourceModal(index);
}

$all("[data-edit-source]").forEach(btn => {
btn.onclick = () => openSourceModal(
Number(btn.dataset.colonyIndex),
btn.dataset.editSource
);
});

$all("[data-delete-source]").forEach(btn => {
btn.onclick = () => deleteSource(
Number(btn.dataset.colonyIndex),
btn.dataset.deleteSource
);
});
}

async function replaceColonyImage(index) {
const file = $("#replaceTypeImage").files[0];
if (!file) {
alert("Choose an image first.");
return;
}

state.colonies[index].typeImageUri = await compressImageFile(file, {
maxWidth: 800,
maxHeight: 800,
quality: 0.72
});

addHistory(state.colonies[index], "Updated image", "Replaced colony image.");
await saveState();
openColony(index);
alert("Image updated.");
}

async function removeColonyImage(index) {
if (!confirm("Remove this colony image?")) return;
state.colonies[index].typeImageUri = "";
addHistory(state.colonies[index], "Removed image", "Removed colony image.");
await saveState();
openColony(index);
alert("Image removed.");
}

async function saveColonyEdits(index) {
const c = state.colonies[index];
const category = getChosenCategory("edit");
const newInventoryMode = ($("#editInventoryMode")?.value || "population") === "custom" ? "custom" : "population";
const newUnitName = ($("#editUnitName")?.value || "").trim();

if (!category) return alert("Category is required.");
if (newInventoryMode === "custom" && !newUnitName) {
return alert("Custom unit name is required when using custom units.");
}

const oldNote = c.customNote || "";
const newNote = $("#editNote").value.trim();

const oldPopulation = Number(c.population || 0);
const oldInventoryMode = c.inventoryMode || "population";
const oldUnitName = c.unitName || "";

c.population = sanitizeQuantity($("#editPopulation").value || "0");
c.inventoryMode = newInventoryMode;
c.unitName = newInventoryMode === "custom" ? newUnitName : "";
c.category = category;
c.lastMisting = $("#editMisting").value.trim();
c.lastBotanicalsCheck = $("#editBotanicals").value.trim();
c.lastSubstrateCheck = $("#editSubstrate").value.trim();
c.lastSupplementalFeeding = $("#editFeeding").value.trim();
c.customNote = newNote;
c.readyForSale = ($("#editReadyForSale")?.value || "no") === "yes";
updateLastHusbandry(c);

if (oldInventoryMode !== c.inventoryMode || oldUnitName !== c.unitName) {
addHistory(
c,
"Changed inventory mode",
c.inventoryMode === "custom"
? `Switched to custom units: ${c.unitName}.`
: "Switched to population mode."
);
}

if (oldPopulation !== Number(c.population || 0)) {
addHistory(
c,
"Adjusted amount",
`Changed from ${formatQty(oldPopulation)} to ${formatColonyAmount(c.population, c, "units")}.`
);
}

if (oldNote !== newNote) {
if (!oldNote && newNote) {
addHistory(c, "Added note", newNote);
} else if (oldNote && !newNote) {
addHistory(c, "Removed note", oldNote);
} else {
addHistory(c, "Edited note", `From "${oldNote}" to "${newNote}".`);
}
}

await saveState();
openColony(index);
alert("Colony updated.");
}

async function quickAction(index, action) {
const today = todayString();
const c = state.colonies[index];

if (action === "misting") {
c.lastMisting = today;
addHistory(c, "Care action", `Marked misted on ${today}.`);
}
if (action === "feeding") {
c.lastSupplementalFeeding = today;
addHistory(c, "Care action", `Marked fed on ${today}.`);
}
if (action === "botanicals") {
c.lastBotanicalsCheck = today;
addHistory(c, "Care action", `Marked botanicals checked on ${today}.`);
}
if (action === "substrate") {
c.lastSubstrateCheck = today;
addHistory(c, "Care action", `Marked substrate checked on ${today}.`);
}

c.lastHusbandry = today;
await saveState();
openColony(index);
alert("Colony updated.");
}

async function deleteColony(index) {
const typeName = state.colonies[index].typeName;
if (!confirm("Are you sure you want to delete this colony?")) return;

state.colonies.splice(index, 1);

const typeStillExists = state.colonies.some(c => c.typeName === typeName);
if (!typeStillExists) {
delete state.priceData[typeName];
delete state.settings.typeThresholds[typeName];
state.itemOrders.colonyTypes = (state.itemOrders.colonyTypes || []).filter(x => x !== typeName);

state.priceSheetItems = (state.priceSheetItems || []).filter(item => {
return !(item.sourceKind === "colony" && item.sourceName === typeName);
});
}

refreshOrders();
await saveState();
renderColonies();
}

function renderPopulation() {
const grouped = {};

state.colonies.forEach(c => {
const t = (c.typeName || "").trim();
if (!t) return;

if (!grouped[t]) {
grouped[t] = {
total: 0,
mode: c.inventoryMode === "custom" ? "custom" : "population",
unitName: c.unitName || ""
};
}

grouped[t].total += Number(c.population || 0);

if (grouped[t].mode !== c.inventoryMode) {
grouped[t].mode = "mixed";
grouped[t].unitName = "";
} else if (grouped[t].mode === "custom" && !grouped[t].unitName && c.unitName) {
grouped[t].unitName = c.unitName;
}
});

const types = Object.keys(grouped).sort((a, b) => a.localeCompare(b));
let html = `
<h2 class="iso-section-title">Population</h2>
<p class="iso-subtext">View total inventory by type. Tap a type for the colony breakdown.</p>
`;

if (!types.length) {
html += `<div class="iso-empty">No population records saved.</div>`;
return app(html);
}

html += `<div class="iso-grid">`;
types.forEach(type => {
const info = grouped[type];
const badgeLabel = info.mode === "custom"
? `${formatQty(info.total)} ${esc(info.unitName || "units")}`
: info.mode === "mixed"
? `${formatQty(info.total)} total`
: formatQty(info.total);

html += `
<div class="iso-card iso-card-clickable" data-pop-type="${esc(type)}">
<div class="iso-card-head">
<div>
<h3 class="iso-card-title">${esc(type)}</h3>
<div class="iso-muted">
${
info.mode === "custom"
? `Combined ${esc(info.unitName || "units")}`
: info.mode === "mixed"
? "Mixed inventory units"
: "Combined population"
}
</div>
</div>
<span class="iso-badge">${badgeLabel}</span>
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
.sort((a, b) => Number(b.population || 0) - Number(a.population || 0));

const total = matches.reduce((sum, c) => sum + Number(c.population || 0), 0);

let totalLabel = `${formatQty(total)} total`;
if (matches.length && matches.every(c => c.inventoryMode === "population")) {
totalLabel = `${formatQty(total)} population`;
} else if (matches.length && matches.every(c => c.inventoryMode === "custom" && c.unitName === matches[0].unitName)) {
totalLabel = `${formatQty(total)} ${esc(matches[0].unitName || "units")}`;
}

let html = `
<h2 class="iso-section-title">${esc(type)} — ${totalLabel}</h2>
<p class="iso-subtext">Inventory breakdown by colony.</p>
<div class="iso-actions" style="margin-bottom:14px">
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
<span class="iso-badge">${formatColonyAmount(c.population, c, "units")}</span>
</div>
<div class="iso-meta">
<div><strong>Inventory Mode:</strong> ${c.inventoryMode === "custom" ? `Custom (${esc(c.unitName || "units")})` : "Population"}</div>
<div><strong>Last Updated:</strong> ${c.lastHusbandry || "Never"}</div>
</div>
</div>
`;
});

html += `</div>`;
app(html);
$("#popBackBtn").onclick = renderPopulation;
}
function renderBotanicals() {
let html = `
<h2 class="iso-section-title">Botanicals</h2>
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
const itemName = $("#botItemName").value.trim();
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
refreshOrders();
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

state.itemOrders.botanicals = (state.itemOrders.botanicals || []).filter(x => x !== itemName);
state.priceSheetItems = (state.priceSheetItems || []).filter(item => {
return !(item.sourceKind === "botanical" && item.sourceName === itemName);
});

refreshOrders();
await saveState();
renderBotanicals();
}

function addSection() {
const input = $("#newSectionName");
const name = (input?.value || "").trim();
if (!name) return;

if (state.priceSections.includes(name)) {
alert("That section already exists.");
return;
}

state.priceSections.push(name);
state.priceSheetBuilder.selectedCategory = name;
saveState().then(renderPriceSheet);
}

function deleteSection(name) {
if (name === "Botanicals") {
alert("Botanicals section cannot be removed.");
return;
}

const isInUse = (state.priceSheetItems || []).some(item => (item.category || "") === name);
if (isInUse) {
alert("That section is still being used by items on the price sheet. Move or remove those items first.");
return;
}

state.priceSections = state.priceSections.filter(s => s !== name);

if (state.priceSheetBuilder.selectedCategory === name) {
state.priceSheetBuilder.selectedCategory = state.priceSections[0] || "Isopods";
}

saveState().then(renderPriceSheet);
}

function getPriceSheetCategoryOptions() {
return [...new Set([...state.priceSections, ...uniqueCategories(), "Botanicals"])].filter(Boolean);
}

function getPriceSheetSourceOptions() {
const colonyTypes = uniqueTypes().map(type => ({
sourceKind: "colony",
sourceName: type,
display: type
}));

const botanicals = state.botanicals
.map(item => ({
sourceKind: "botanical",
sourceName: item.itemName,
display: item.itemName
}));

return {
colonyTypes,
botanicals
};
}

function getDefaultCategoryForSheetSource(sourceKind, sourceName) {
if (sourceKind === "botanical") return "Botanicals";

const exampleColony = state.colonies.find(c => c.typeName === sourceName);
return exampleColony?.category || "Isopods";
}

function getDefaultNoteForSheetSource(sourceKind, sourceName) {
if (sourceKind === "botanical") return "";
const matches = state.colonies.filter(c => c.typeName === sourceName);
if (!matches.length) return "";
const usesCustomUnits = matches.some(c => c.inventoryMode === "custom");
if (usesCustomUnits) return "";
return "10ct";
}

function getSheetItemsByCategory() {
const map = {};
(state.priceSheetItems || []).forEach(item => {
const category = item.category || "Other";
if (!map[category]) map[category] = [];
map[category].push(item);
});
return map;
}

function findPriceSheetItem(itemId) {
return (state.priceSheetItems || []).find(item => item.id === itemId) || null;
}

function updateBuilderSelectionsFromUi() {
if ($("#sheetSourceKind")) {
state.priceSheetBuilder.sourceKind = $("#sheetSourceKind").value === "botanical" ? "botanical" : "colony";
}

if ($("#sheetColonyTypeSelect")) {
state.priceSheetBuilder.selectedColonyType = $("#sheetColonyTypeSelect").value || "";
}

if ($("#sheetBotanicalSelect")) {
state.priceSheetBuilder.selectedBotanical = $("#sheetBotanicalSelect").value || "";
}

if ($("#sheetCategorySelect")) {
state.priceSheetBuilder.selectedCategory = $("#sheetCategorySelect").value || "";
}

if ($("#sheetPositionSelect")) {
state.priceSheetBuilder.selectedPosition = $("#sheetPositionSelect").value || "end";
}
}

function getSelectedBuilderSource() {
const kind = state.priceSheetBuilder.sourceKind === "botanical" ? "botanical" : "colony";
const sourceName = kind === "botanical"
? (state.priceSheetBuilder.selectedBotanical || "")
: (state.priceSheetBuilder.selectedColonyType || "");

return {
sourceKind: kind,
sourceName
};
}

function syncBuilderFormVisibility() {
const kind = $("#sheetSourceKind")?.value === "botanical" ? "botanical" : "colony";
const colonyWrap = $("#sheetColonyWrap");
const botanicalWrap = $("#sheetBotanicalWrap");

if (colonyWrap) colonyWrap.style.display = kind === "colony" ? "block" : "none";
if (botanicalWrap) botanicalWrap.style.display = kind === "botanical" ? "block" : "none";
}

function renderBuilderPositionOptions(selectedCategory) {
const select = $("#sheetPositionSelect");
if (!select) return;

const inCategory = (state.priceSheetItems || []).filter(item => (item.category || "") === selectedCategory);

let options = `<option value="end">End of ${esc(selectedCategory || "section")}</option>`;
inCategory.forEach((item, idx) => {
options += `<option value="${idx}">Position ${idx + 1}</option>`;
});

select.innerHTML = options;

const existingValue = state.priceSheetBuilder.selectedPosition || "end";
const validValues = ["end", ...inCategory.map((_, idx) => String(idx))];
select.value = validValues.includes(existingValue) ? existingValue : "end";
}

async function addSelectedItemToPriceSheet() {
updateBuilderSelectionsFromUi();

const selected = getSelectedBuilderSource();
if (!selected.sourceName) {
alert("Choose an item to add.");
return;
}

const alreadyExists = (state.priceSheetItems || []).some(item =>
item.sourceKind === selected.sourceKind && item.sourceName === selected.sourceName
);

if (alreadyExists) {
alert("That item is already on the price sheet.");
return;
}

const category = state.priceSheetBuilder.selectedCategory || getDefaultCategoryForSheetSource(selected.sourceKind, selected.sourceName);
const position = state.priceSheetBuilder.selectedPosition || "end";

const newItem = normalizePriceSheetItem({
sourceKind: selected.sourceKind,
sourceName: selected.sourceName,
displayName: selected.sourceName,
category,
price: "",
note: getDefaultNoteForSheetSource(selected.sourceKind, selected.sourceName)
});

if (!Array.isArray(state.priceSheetItems)) state.priceSheetItems = [];

if (position === "end") {
state.priceSheetItems.push(newItem);
} else {
const categoryIndexes = state.priceSheetItems
.map((item, idx) => ({ item, idx }))
.filter(row => (row.item.category || "") === category);

const insertAtWithinCategory = Math.max(0, parseInt(position, 10));
if (insertAtWithinCategory >= categoryIndexes.length) {
state.priceSheetItems.push(newItem);
} else {
const actualIndex = categoryIndexes[insertAtWithinCategory].idx;
state.priceSheetItems.splice(actualIndex, 0, newItem);
}
}

await saveState();
renderPriceSheet();
}

async function removePriceSheetItem(itemId) {
const item = findPriceSheetItem(itemId);
if (!item) return;

if (!confirm(`Remove "${item.displayName}" from the price sheet?`)) return;

state.priceSheetItems = (state.priceSheetItems || []).filter(entry => entry.id !== itemId);
await saveState();
renderPriceSheet();
}

async function movePriceSheetItem(itemId, direction) {
const index = (state.priceSheetItems || []).findIndex(item => item.id === itemId);
if (index < 0) return;

const item = state.priceSheetItems[index];
const category = item.category || "";

const categoryIndexes = state.priceSheetItems
.map((entry, idx) => ({ entry, idx }))
.filter(row => (row.entry.category || "") === category)
.map(row => row.idx);

const currentPosition = categoryIndexes.indexOf(index);
if (currentPosition < 0) return;

const targetPosition = direction === "up" ? currentPosition - 1 : currentPosition + 1;
if (targetPosition < 0 || targetPosition >= categoryIndexes.length) return;

const swapIndex = categoryIndexes[targetPosition];
const temp = state.priceSheetItems[index];
state.priceSheetItems[index] = state.priceSheetItems[swapIndex];
state.priceSheetItems[swapIndex] = temp;

await saveState();
renderPriceSheet();
}

async function updatePriceSheetItemField(itemId, field, value) {
const item = findPriceSheetItem(itemId);
if (!item) return;

if (field === "displayName") item.displayName = value.trim();
if (field === "price") item.price = value.trim();
if (field === "note") item.note = value.trim();

if (field === "category") {
item.category = value.trim() || "Other";
}

await saveState();
renderPriceSheetPreview();
renderBuilderPositionOptions($("#sheetCategorySelect")?.value || state.priceSheetBuilder.selectedCategory || "Isopods");
}

async function savePriceSheetBrandingSettings() {
state.settings.businessName = $("#businessName").value.trim() || "IsoTracker";
state.settings.tagline = $("#tagline").value.trim() || "";
state.settings.theme = $("#themeSelect").value;
state.settings.promoText = $("#promoText").value.trim();
state.settings.footerNote = $("#footerNote").value.trim();

const appLogoFile = $("#appLogoUpload").files[0];
const sheetLogoFile = $("#sheetLogoUpload").files[0];

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
const sections = {};

(state.priceSheetItems || []).forEach(item => {
const section = item.category || "Other";
if (!sections[section]) sections[section] = [];

sections[section].push({
id: item.id,
name: item.displayName || item.sourceName || "",
note: item.note || "",
price: item.price || "Not Available",
sourceKind: item.sourceKind,
sourceName: item.sourceName
});
});

return sections;
}
function renderPriceSheet() {
refreshOrders();

const sourceOptions = getPriceSheetSourceOptions();
const allSectionOptions = getPriceSheetCategoryOptions();
const groupedItems = getSheetItemsByCategory();

if (!state.priceSheetBuilder.selectedCategory) {
state.priceSheetBuilder.selectedCategory = allSectionOptions[0] || "Isopods";
}

if (!state.priceSheetBuilder.selectedColonyType && sourceOptions.colonyTypes.length) {
state.priceSheetBuilder.selectedColonyType = sourceOptions.colonyTypes[0].sourceName;
}

if (!state.priceSheetBuilder.selectedBotanical && sourceOptions.botanicals.length) {
state.priceSheetBuilder.selectedBotanical = sourceOptions.botanicals[0].sourceName;
}

let html = `
<h2 class="iso-section-title">Price Sheet</h2>
<p class="iso-subtext">Add only the items you want on the sheet, choose the category, choose the position, then drag within each category if you want to fine tune the order.</p>
<p class="iso-info-note">Blank price automatically shows as Not Available.</p>

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

<div class="iso-divider"></div>

<h3 class="iso-card-title" style="margin:0 0 10px 0;">Add Item To Price Sheet</h3>
<div class="iso-form-grid">
<div>
<label>Item Type</label>
<select id="sheetSourceKind">
<option value="colony" ${state.priceSheetBuilder.sourceKind !== "botanical" ? "selected" : ""}>Colony Type</option>
<option value="botanical" ${state.priceSheetBuilder.sourceKind === "botanical" ? "selected" : ""}>Botanical</option>
</select>
</div>

<div id="sheetColonyWrap" style="${state.priceSheetBuilder.sourceKind === "botanical" ? "display:none;" : ""}">
<label>Colony Type</label>
<select id="sheetColonyTypeSelect">
${sourceOptions.colonyTypes.length
? sourceOptions.colonyTypes.map(item => `
<option value="${esc(item.sourceName)}" ${state.priceSheetBuilder.selectedColonyType === item.sourceName ? "selected" : ""}>${esc(item.display)}</option>
`).join("")
: `<option value="">No colony types</option>`
}
</select>
</div>

<div id="sheetBotanicalWrap" style="${state.priceSheetBuilder.sourceKind === "botanical" ? "" : "display:none;"}">
<label>Botanical</label>
<select id="sheetBotanicalSelect">
${sourceOptions.botanicals.length
? sourceOptions.botanicals.map(item => `
<option value="${esc(item.sourceName)}" ${state.priceSheetBuilder.selectedBotanical === item.sourceName ? "selected" : ""}>${esc(item.display)}</option>
`).join("")
: `<option value="">No botanicals</option>`
}
</select>
</div>

<div>
<label>Category</label>
<select id="sheetCategorySelect">
${allSectionOptions.map(cat => `
<option value="${esc(cat)}" ${state.priceSheetBuilder.selectedCategory === cat ? "selected" : ""}>${esc(cat)}</option>
`).join("")}
</select>
</div>

<div>
<label>Position</label>
<select id="sheetPositionSelect"></select>
</div>
</div>

<div class="iso-actions" style="margin-bottom:16px;">
<button class="iso-btn iso-btn-primary" id="addSheetItemBtn">Add To Price Sheet</button>
</div>
`;

html += `<div class="iso-divider"></div>`;
html += `<h3 class="iso-card-title" style="margin:0 0 10px 0;">Current Price Sheet Items</h3>`;

if (!(state.priceSheetItems || []).length) {
html += `<div class="iso-empty">No items added to the price sheet yet.</div>`;
} else {
const orderedCategories = [...new Set([...allSectionOptions, ...Object.keys(groupedItems)])]
.filter(category => groupedItems[category] && groupedItems[category].length);

html += `<div id="priceSheetBuilderGroups">`;

orderedCategories.forEach(category => {
const items = groupedItems[category] || [];

html += `
<div class="iso-sheet-builder-group">
<div class="iso-card" style="margin-bottom:14px;">
<div class="iso-card-head">
<div>
<h3 class="iso-card-title">${esc(category)}</h3>
<div class="iso-muted">${items.length} item${items.length === 1 ? "" : "s"}</div>
</div>
</div>

<div class="iso-history-list iso-sheet-builder-list" data-sheet-category="${esc(category)}">
`;

items.forEach((item, idx) => {
html += `
<div class="iso-history-item iso-sheet-builder-item" draggable="true" data-sheet-item-id="${esc(item.id)}" data-sheet-item-category="${esc(category)}">
<div class="iso-builder-topline" style="margin-bottom:10px;">
<div class="iso-builder-left" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
<span class="iso-drag-handle">☰</span>
<strong>${esc(item.displayName || item.sourceName)}</strong>
<span class="iso-muted">${item.sourceKind === "botanical" ? "Botanical" : "Colony Type"}</span>
<span class="iso-muted">Position ${idx + 1}</span>
</div>
<div class="iso-actions" style="margin:0;">
<button class="iso-btn" data-move-sheet-item="${esc(item.id)}" data-direction="up">↑</button>
<button class="iso-btn" data-move-sheet-item="${esc(item.id)}" data-direction="down">↓</button>
<button class="iso-btn iso-btn-danger" data-remove-sheet-item="${esc(item.id)}">Remove</button>
</div>
</div>

<div class="iso-form-grid">
<div>
<label>Display Name</label>
<input
value="${esc(item.displayName || "")}"
data-sheet-field="displayName"
data-sheet-item="${esc(item.id)}"
placeholder="Display name"
>
</div>
<div>
<label>Category</label>
<select data-sheet-field="category" data-sheet-item="${esc(item.id)}">
${allSectionOptions.map(cat => `
<option value="${esc(cat)}" ${(item.category || "") === cat ? "selected" : ""}>${esc(cat)}</option>
`).join("")}
</select>
</div>
<div>
<label>Price</label>
<input
value="${esc(item.price || "")}"
data-sheet-field="price"
data-sheet-item="${esc(item.id)}"
placeholder="$25"
>
</div>
<div>
<label>${item.sourceKind === "botanical" ? "Note" : "Count / Note"}</label>
<input
value="${esc(item.note || "")}"
data-sheet-field="note"
data-sheet-item="${esc(item.id)}"
placeholder="${item.sourceKind === "botanical" ? "1 gallon, 5 pods" : "10ct"}"
>
</div>
</div>
</div>
`;
});

html += `
</div>
</div>
</div>
`;
});

html += `</div>`;
}

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

$("#addSectionBtn").onclick = addSection;
$all("[data-delete-section]").forEach(btn => {
btn.onclick = () => deleteSection(btn.dataset.deleteSection);
});

const sourceKind = $("#sheetSourceKind");
const categorySelect = $("#sheetCategorySelect");
const colonySelect = $("#sheetColonyTypeSelect");
const botanicalSelect = $("#sheetBotanicalSelect");

if (sourceKind) {
sourceKind.addEventListener("change", () => {
updateBuilderSelectionsFromUi();
syncBuilderFormVisibility();

const selected = getSelectedBuilderSource();
const defaultCategory = getDefaultCategoryForSheetSource(selected.sourceKind, selected.sourceName);
if ($("#sheetCategorySelect") && defaultCategory) {
$("#sheetCategorySelect").value = defaultCategory;
state.priceSheetBuilder.selectedCategory = defaultCategory;
}

renderBuilderPositionOptions(state.priceSheetBuilder.selectedCategory || defaultCategory || "Isopods");
});
}

if (categorySelect) {
categorySelect.addEventListener("change", () => {
updateBuilderSelectionsFromUi();
renderBuilderPositionOptions(categorySelect.value || "Isopods");
});
}

if (colonySelect) {
colonySelect.addEventListener("change", () => {
updateBuilderSelectionsFromUi();
if ($("#sheetSourceKind")?.value === "colony") {
const defaultCategory = getDefaultCategoryForSheetSource("colony", colonySelect.value || "");
if ($("#sheetCategorySelect") && defaultCategory) {
$("#sheetCategorySelect").value = defaultCategory;
state.priceSheetBuilder.selectedCategory = defaultCategory;
renderBuilderPositionOptions(defaultCategory);
}
}
});
}

if (botanicalSelect) {
botanicalSelect.addEventListener("change", () => {
updateBuilderSelectionsFromUi();
if ($("#sheetSourceKind")?.value === "botanical") {
const defaultCategory = getDefaultCategoryForSheetSource("botanical", botanicalSelect.value || "");
if ($("#sheetCategorySelect") && defaultCategory) {
$("#sheetCategorySelect").value = defaultCategory;
state.priceSheetBuilder.selectedCategory = defaultCategory;
renderBuilderPositionOptions(defaultCategory);
}
}
});
}

const addSheetItemBtn = $("#addSheetItemBtn");
if (addSheetItemBtn) {
addSheetItemBtn.onclick = addSelectedItemToPriceSheet;
}

$all("[data-remove-sheet-item]").forEach(btn => {
btn.onclick = () => removePriceSheetItem(btn.dataset.removeSheetItem);
});

$all("[data-move-sheet-item]").forEach(btn => {
btn.onclick = () => movePriceSheetItem(btn.dataset.moveSheetItem, btn.dataset.direction);
});

$all("[data-sheet-field]").forEach(el => {
const field = el.dataset.sheetField;
const itemId = el.dataset.sheetItem;

const handler = debounce(async () => {
await updatePriceSheetItemField(itemId, field, el.value || "");
}, 180);

el.addEventListener("input", handler);

if (el.tagName === "SELECT") {
el.addEventListener("change", async () => {
await updatePriceSheetItemField(itemId, field, el.value || "");
renderPriceSheet();
});
}
});

wirePriceSheetDragAndDrop();
renderBuilderPositionOptions(state.priceSheetBuilder.selectedCategory || allSectionOptions[0] || "Isopods");
syncBuilderFormVisibility();
renderPriceSheetPreview();

$("#savePriceSheetBtn").onclick = savePriceSheetBrandingSettings;
$("#exportPriceSheetBtn").onclick = exportPriceSheetImage;
}

function wirePriceSheetDragAndDrop() {
let draggedId = "";
let draggedCategory = "";

$all(".iso-sheet-builder-item[draggable='true']").forEach(item => {
item.addEventListener("dragstart", () => {
draggedId = item.dataset.sheetItemId || "";
draggedCategory = item.dataset.sheetItemCategory || "";
item.classList.add("dragging");
});

item.addEventListener("dragend", () => {
item.classList.remove("dragging");
draggedId = "";
draggedCategory = "";
});

item.addEventListener("dragover", e => {
e.preventDefault();
});

item.addEventListener("drop", async e => {
e.preventDefault();

const targetId = item.dataset.sheetItemId || "";
const targetCategory = item.dataset.sheetItemCategory || "";

if (!draggedId || !targetId || draggedId === targetId) return;
if (draggedCategory !== targetCategory) return;

await reorderPriceSheetItemWithinCategory(draggedId, targetId, targetCategory);
});
});

$all(".iso-sheet-builder-list").forEach(list => {
list.addEventListener("dragover", e => {
e.preventDefault();
});
});
}

async function reorderPriceSheetItemWithinCategory(draggedId, targetId, category) {
const items = state.priceSheetItems || [];
const draggedItem = items.find(item => item.id === draggedId);
const targetItem = items.find(item => item.id === targetId);

if (!draggedItem || !targetItem) return;
if ((draggedItem.category || "") !== category || (targetItem.category || "") !== category) return;

const categoryItems = items.filter(item => (item.category || "") === category);
const draggedIndexInCategory = categoryItems.findIndex(item => item.id === draggedId);
const targetIndexInCategory = categoryItems.findIndex(item => item.id === targetId);

if (draggedIndexInCategory < 0 || targetIndexInCategory < 0) return;

const reordered = categoryItems.slice();
const [moved] = reordered.splice(draggedIndexInCategory, 1);
reordered.splice(targetIndexInCategory, 0, moved);

const rebuilt = [];
const replacementQueue = reordered.slice();

items.forEach(item => {
if ((item.category || "") === category) {
rebuilt.push(replacementQueue.shift());
} else {
rebuilt.push(item);
}
});

state.priceSheetItems = rebuilt;
await saveState();
renderPriceSheet();
}

function renderPriceSheetPreview() {
const mount = $("#priceSheetPreviewMount");
if (!mount) return;

const sections = buildSheetSections();
const orderedKeys = [...new Set([...state.priceSections, ...Object.keys(sections)])]
.filter(k => sections[k] && sections[k].length);

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
if (!el) {
alert("No price sheet found to export.");
return;
}

try {
const canvas = await window.html2canvas(el, {
backgroundColor: null,
scale: 2,
useCORS: true
});

const link = document.createElement("a");
link.download = "isotracker-price-sheet.png";
link.href = canvas.toDataURL("image/png");
link.click();
} catch (err) {
alert("Image export failed.");
}
}
function renderSalePrep() {
  const prepSearch = (state.salePrep.search || "").trim().toLowerCase();
  const prepCategory = state.salePrep.category || "all";
  const prepType = state.salePrep.type || "all";
  const prepView = state.salePrep.view || "queue";

  const prepCategories = uniqueCategories();
  const prepTypes = uniqueTypes();

  const eligibleColonies = state.colonies
    .map((colony, originalIndex) => ({ colony, originalIndex }))
    .filter(row => row.colony.readyForSale === true)
    .filter(row => {
      const colony = row.colony;
      const hay = `${colony.colonyName || ""} ${colony.typeName || ""}`.toLowerCase();

      if (prepSearch && !hay.includes(prepSearch)) return false;
      if (prepCategory !== "all" && (colony.category || "") !== prepCategory) return false;
      if (prepType !== "all" && (colony.typeName || "") !== prepType) return false;
      return true;
    })
    .sort((a, b) => a.colony.colonyName.localeCompare(b.colony.colonyName));

  const packaged = state.salePrep.packaged || [];
  const materials = state.salePrep.materials || [];

  let html = `
    <h2 class="iso-section-title">For Sale Prep</h2>
    <p class="iso-subtext">Prep inventory by subtracting from colony counts or custom units and moving it into packaged stock.</p>

    <div class="iso-tabs" style="margin-bottom:18px;">
      <button class="iso-tab ${prepView === "queue" ? "active" : ""}" data-prep-view="queue">Prep Queue</button>
      <button class="iso-tab ${prepView === "packaged" ? "active" : ""}" data-prep-view="packaged">Packaged Inventory</button>
      <button class="iso-tab ${prepView === "materials" ? "active" : ""}" data-prep-view="materials">Packaging Materials</button>
    </div>
  `;

  if (prepView === "queue") {
    html += `
      <div class="iso-form-grid" style="margin-bottom:14px;">
        <div>
          <label>Search</label>
          <input id="prepSearch" placeholder="Search colony or type" value="${esc(state.salePrep.search || "")}">
        </div>
        <div>
          <label>Category</label>
          <select id="prepCategoryFilter">
            <option value="all"${prepCategory === "all" ? " selected" : ""}>All Categories</option>
            ${prepCategories.map(cat => `<option value="${esc(cat)}"${prepCategory === cat ? " selected" : ""}>${esc(cat)}</option>`).join("")}
          </select>
        </div>
        <div>
          <label>Type</label>
          <select id="prepTypeFilter">
            <option value="all"${prepType === "all" ? " selected" : ""}>All Types</option>
            ${prepTypes.map(type => `<option value="${esc(type)}"${prepType === type ? " selected" : ""}>${esc(type)}</option>`).join("")}
          </select>
        </div>
      </div>

      <div class="iso-divider"></div>
      <h3 class="iso-card-title" style="margin:0 0 10px 0;">Ready For Sale Colonies</h3>
    `;

    if (!eligibleColonies.length) {
      html += `<div class="iso-empty">No ready-for-sale colonies match your filters.</div>`;
    } else {
      html += `<div class="iso-grid">`;

      eligibleColonies.forEach(row => {
        const colony = row.colony;
        const originalIndex = row.originalIndex;
        const inventoryLabel = getColonyUnitLabel(colony, "Population");
        const packLabel = colony.inventoryMode === "custom" ? `Per Pack (${esc(inventoryLabel)})` : "Pack Count";

        html += `
          <div class="iso-card">
            <div class="iso-card-head">
              <div>
                <h3 class="iso-card-title">${esc(colony.colonyName)}</h3>
                <div class="iso-muted">${esc(colony.typeName)}</div>
              </div>
            </div>

            <div class="iso-meta">
              <div><strong>Available ${esc(inventoryLabel)}:</strong> ${formatQty(colony.population || 0)}</div>
              <div><strong>Category:</strong> ${esc(colony.category || "-")}</div>
              <div><strong>Inventory Mode:</strong> ${colony.inventoryMode === "custom" ? `Custom (${esc(colony.unitName || "units")})` : "Population"}</div>
            </div>

            <div class="iso-form-grid" style="margin-top:12px;">
              <div>
                <label>${packLabel}</label>
                <input id="prepCount_${originalIndex}" type="number" min="0.01" step="0.01" value="${colony.inventoryMode === "custom" ? "1" : "10"}">
              </div>
              <div>
                <label>How Many Packs</label>
                <input id="prepPacks_${originalIndex}" type="number" min="1" step="1" value="1">
              </div>
            </div>

            <div class="iso-form-grid" style="margin-top:12px;">
              <div>
                <label>Material 1</label>
                <select id="prepMaterial_${originalIndex}_0">
                  <option value="">None</option>
                  ${materials.map(mat => `<option value="${esc(mat.id)}">${esc(mat.name)} (${mat.qty})</option>`).join("")}
                </select>
              </div>
              <div>
                <label>Qty Used</label>
                <input id="prepMaterialQty_${originalIndex}_0" type="number" min="1" step="1" value="1">
              </div>

              <div>
                <label>Material 2</label>
                <select id="prepMaterial_${originalIndex}_1">
                  <option value="">None</option>
                  ${materials.map(mat => `<option value="${esc(mat.id)}">${esc(mat.name)} (${mat.qty})</option>`).join("")}
                </select>
              </div>
              <div>
                <label>Qty Used</label>
                <input id="prepMaterialQty_${originalIndex}_1" type="number" min="1" step="1" value="1">
              </div>

              <div>
                <label>Material 3</label>
                <select id="prepMaterial_${originalIndex}_2">
                  <option value="">None</option>
                  ${materials.map(mat => `<option value="${esc(mat.id)}">${esc(mat.name)} (${mat.qty})</option>`).join("")}
                </select>
              </div>
              <div>
                <label>Qty Used</label>
                <input id="prepMaterialQty_${originalIndex}_2" type="number" min="1" step="1" value="1">
              </div>

              <div>
                <label>Material 4</label>
                <select id="prepMaterial_${originalIndex}_3">
                  <option value="">None</option>
                  ${materials.map(mat => `<option value="${esc(mat.id)}">${esc(mat.name)} (${mat.qty})</option>`).join("")}
                </select>
              </div>
              <div>
                <label>Qty Used</label>
                <input id="prepMaterialQty_${originalIndex}_3" type="number" min="1" step="1" value="1">
              </div>

              <div>
                <label>Material 5</label>
                <select id="prepMaterial_${originalIndex}_4">
                  <option value="">None</option>
                  ${materials.map(mat => `<option value="${esc(mat.id)}">${esc(mat.name)} (${mat.qty})</option>`).join("")}
                </select>
              </div>
              <div>
                <label>Qty Used</label>
                <input id="prepMaterialQty_${originalIndex}_4" type="number" min="1" step="1" value="1">
              </div>
            </div>

            <div class="iso-actions">
              <button class="iso-btn iso-btn-primary" data-prep-index="${originalIndex}">Prep For Sale</button>
            </div>
          </div>
        `;
      });

      html += `</div>`;
    }
  }

  if (prepView === "packaged") {
    html += `
      <div class="iso-divider"></div>
      <h3 class="iso-card-title" style="margin:0 0 10px 0;">Packaged Inventory</h3>
    `;

    if (!packaged.length) {
      html += `<div class="iso-empty">No packaged inventory yet.</div>`;
    } else {
      html += `<div class="iso-history-list">`;
      packaged.forEach((item, i) => {
        html += `
          <div class="iso-history-item">
            <div class="iso-history-time">${esc(item.datePacked || "-")}</div>
            <div class="iso-history-text">
              <strong>${esc(item.colonyName)}</strong> — ${esc(item.typeName)} — ${item.packs} pack(s) of ${formatQty(item.packCount)}
              ${item.inventoryMode === "custom" ? ` ${esc(item.unitName || "units")}` : ""}
              ${item.materialsUsed && item.materialsUsed.length ? `
                <br><span class="iso-muted">Materials: ${
                  item.materialsUsed.map(m => `${esc(m.materialName)} x ${m.materialQtyUsed}`).join(", ")
                }</span>
              ` : ""}
            </div>
            <div class="iso-actions" style="margin-top:8px;">
              <button class="iso-btn iso-btn-danger" data-delete-packaged="${i}">Delete Packaged Entry</button>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }
  }

  if (prepView === "materials") {
    html += `
      <div class="iso-divider"></div>
      <h3 class="iso-card-title" style="margin:0 0 10px 0;">Packaging Materials</h3>
      <div class="iso-actions" style="margin-bottom:12px;">
        <button class="iso-btn iso-btn-primary" id="addMaterialBtn">+ Add Packaging Material</button>
      </div>
    `;

    if (!materials.length) {
      html += `<div class="iso-empty">No packaging materials added yet.</div>`;
    } else {
      html += `<div class="iso-grid">`;
      materials.forEach(mat => {
        const low = mat.lowStockAt > 0 && mat.qty <= mat.lowStockAt;
        html += `
          <div class="iso-card ${low ? "iso-status-red" : ""}">
            <div class="iso-card-head">
              <div>
                <h3 class="iso-card-title">${esc(mat.name)}</h3>
                <div class="iso-muted">Packaging Material</div>
              </div>
              <span class="iso-badge ${low ? "iso-badge-red" : ""}">${mat.qty}</span>
            </div>
            <div class="iso-meta">
              <div><strong>Low Stock At:</strong> ${mat.lowStockAt}</div>
            </div>
            <div class="iso-actions">
              <button class="iso-btn" data-edit-material="${mat.id}">Edit</button>
              <button class="iso-btn iso-btn-danger" data-delete-material="${mat.id}">Delete</button>
            </div>
          </div>
        `;
      });
      html += `</div>`;
    }
  }

  app(html);

  $all("[data-prep-view]").forEach(btn => {
    btn.onclick = () => {
      state.salePrep.view = btn.dataset.prepView || "queue";
      renderSalePrep();
    };
  });

  if (prepView === "queue") {
    const prepSearchInput = $("#prepSearch");
    const prepCategoryFilter = $("#prepCategoryFilter");
    const prepTypeFilter = $("#prepTypeFilter");

    if (prepSearchInput) {
      prepSearchInput.addEventListener("input", debounce(() => {
        state.salePrep.search = prepSearchInput.value || "";
        renderSalePrep();
      }, 250));
    }

    if (prepCategoryFilter) {
      prepCategoryFilter.addEventListener("change", () => {
        state.salePrep.category = prepCategoryFilter.value;
        renderSalePrep();
      });
    }

    if (prepTypeFilter) {
      prepTypeFilter.addEventListener("change", () => {
        state.salePrep.type = prepTypeFilter.value;
        renderSalePrep();
      });
    }

    $all("[data-prep-index]").forEach(btn => {
      btn.onclick = () => prepColonyForSale(Number(btn.dataset.prepIndex));
    });
  }

  if (prepView === "packaged") {
    $all("[data-delete-packaged]").forEach(btn => {
      btn.onclick = () => deletePackagedEntry(Number(btn.dataset.deletePackaged));
    });
  }

  if (prepView === "materials") {
    const addMaterialBtn = $("#addMaterialBtn");
    if (addMaterialBtn) addMaterialBtn.onclick = () => openMaterialModal();

    $all("[data-edit-material]").forEach(btn => {
      btn.onclick = () => openMaterialModal(btn.dataset.editMaterial);
    });

    $all("[data-delete-material]").forEach(btn => {
      btn.onclick = () => deleteMaterial(btn.dataset.deleteMaterial);
    });
  }
}

async function prepColonyForSale(index) {
const colony = state.colonies[index];
if (!colony) return;

const packCountRaw = sanitizeQuantity($(`#prepCount_${index}`)?.value || "0");
const packsRaw = parseInt($(`#prepPacks_${index}`)?.value || "0", 10);

const packCount = packCountRaw;
const packs = Math.max(1, packsRaw);
const totalToRemove = sanitizeQuantity(packCount * packs);

if (!packCountRaw || packCountRaw <= 0) {
alert("Enter a valid amount per pack.");
return;
}

if (!packsRaw || packsRaw <= 0) {
alert("Enter a valid number of packs.");
return;
}

if (totalToRemove > Number(colony.population || 0)) {
alert(`Not enough ${getColonyUnitLabel(colony, "inventory").toLowerCase()} in this colony.`);
return;
}

const materialsUsed = [];
const materialTotals = {};

for (let i = 0; i < 5; i += 1) {
const materialId = $(`#prepMaterial_${index}_${i}`)?.value || "";
const materialQtyUsed = Math.max(1, parseInt($(`#prepMaterialQty_${index}_${i}`)?.value || "1", 10));

if (!materialId) continue;

const material = (state.salePrep.materials || []).find(m => m.id === materialId);
if (!material) {
alert(`Selected packaging material in slot ${i + 1} was not found.`);
return;
}

if (!materialTotals[materialId]) {
materialTotals[materialId] = {
material,
qty: 0
};
}

materialTotals[materialId].qty += materialQtyUsed;
}

const totalMaterialEntries = Object.keys(materialTotals).length;
if (totalMaterialEntries > 5) {
alert("You can only use up to 5 packaging materials.");
return;
}

for (const materialId of Object.keys(materialTotals)) {
const entry = materialTotals[materialId];
if (entry.qty > entry.material.qty) {
alert(`Not enough ${entry.material.name} in stock.`);
return;
}
}

for (const materialId of Object.keys(materialTotals)) {
const entry = materialTotals[materialId];
entry.material.qty = Math.max(0, entry.material.qty - entry.qty);

materialsUsed.push({
materialId,
materialName: entry.material.name,
materialQtyUsed: entry.qty
});
}

colony.population = sanitizeQuantity(Number(colony.population || 0) - totalToRemove);

state.salePrep.packaged.push(normalizePackagedEntry({
colonyIndex: index,
colonyName: colony.colonyName,
typeName: colony.typeName,
packCount,
packs,
totalRemoved: totalToRemove,
datePacked: todayString(),
inventoryMode: colony.inventoryMode,
unitName: colony.unitName,
materialsUsed
}));

addHistory(
colony,
"Prepared for sale",
`Prepared ${packs} pack(s) of ${formatQty(packCount)}${colony.inventoryMode === "custom" ? ` ${colony.unitName || "units"}` : ""}, removed ${formatColonyAmount(totalToRemove, colony, "units")}${materialsUsed.length ? `, used ${materialsUsed.map(m => `${m.materialName} x ${m.materialQtyUsed}`).join(", ")}` : ""}.`
);

await saveState();
renderSalePrep();
}

async function deletePackagedEntry(index) {
const item = state.salePrep.packaged[index];
if (!item) return;

if (!confirm("Delete this packaged entry and restore the colony/material stock?")) return;

const colony =
typeof item.colonyIndex === "number" && state.colonies[item.colonyIndex]
? state.colonies[item.colonyIndex]
: state.colonies.find(c => c.colonyName === item.colonyName);

if (colony) {
colony.population = sanitizeQuantity(Number(colony.population || 0) + Number(item.totalRemoved || 0));

addHistory(
colony,
"Packaged entry deleted",
`Restored ${formatColonyAmount(item.totalRemoved || 0, colony, "units")} back to colony from deleted packaged entry.`
);
}

(item.materialsUsed || []).forEach(used => {
const material = (state.salePrep.materials || []).find(m => m.id === used.materialId);
if (material) {
material.qty = Math.max(0, material.qty + Number(used.materialQtyUsed || 0));
}
});

state.salePrep.packaged.splice(index, 1);
await saveState();
renderSalePrep();
}

function openMaterialModal(materialId = "") {
const existing = (state.salePrep.materials || []).find(m => m.id === materialId);

openModal(
existing ? "Edit Packaging Material" : "Add Packaging Material",
`
<div class="iso-form-grid">
<div>
<label>Name</label>
<input id="materialName" value="${esc(existing?.name || "")}" placeholder="10 count deli cups">
</div>
<div>
<label>Quantity In Stock</label>
<input id="materialQty" type="number" min="0" step="1" value="${existing ? existing.qty : 0}">
</div>
<div>
<label>Low Stock At</label>
<input id="materialLowStock" type="number" min="0" step="1" value="${existing ? existing.lowStockAt : 0}">
</div>
</div>

<div class="iso-actions">
<button class="iso-btn iso-btn-primary" id="saveMaterialBtn">${existing ? "Save Changes" : "Add Material"}</button>
<button class="iso-btn" id="cancelMaterialBtn">Cancel</button>
</div>
`,
() => {
$("#saveMaterialBtn").onclick = () => saveMaterial(materialId);
$("#cancelMaterialBtn").onclick = closeModal;
}
);
}

async function saveMaterial(materialId = "") {
const name = ($("#materialName")?.value || "").trim();
const qty = Math.max(0, parseInt($("#materialQty")?.value || "0", 10));
const lowStockAt = Math.max(0, parseInt($("#materialLowStock")?.value || "0", 10));

if (!name) {
alert("Material name is required.");
return;
}

if (!Array.isArray(state.salePrep.materials)) state.salePrep.materials = [];

if (materialId) {
const mat = state.salePrep.materials.find(m => m.id === materialId);
if (!mat) return;
mat.name = name;
mat.qty = qty;
mat.lowStockAt = lowStockAt;
} else {
state.salePrep.materials.push(normalizeMaterial({
name,
qty,
lowStockAt
}));
}

await saveState();
closeModal();
renderSalePrep();
}

async function deleteMaterial(materialId) {
const mat = (state.salePrep.materials || []).find(m => m.id === materialId);
if (!mat) return;

const isUsed = (state.salePrep.packaged || []).some(entry =>
Array.isArray(entry.materialsUsed) && entry.materialsUsed.some(used => used.materialId === materialId)
);

if (isUsed) {
if (!confirm(`"${mat.name}" is referenced by packaged entries. Delete it anyway? Existing packaged history will keep the text label only.`)) {
return;
}
} else {
if (!confirm(`Delete packaging material "${mat.name}"?`)) return;
}

state.salePrep.materials = (state.salePrep.materials || []).filter(m => m.id !== materialId);
await saveState();
renderSalePrep();
}
function renderGuide() {
app(`
<h2 class="iso-section-title">Guide</h2>
<p class="iso-subtext">Everything in one place so users can quickly understand how IsoTracker works.</p>

<div class="iso-guide-grid">
<div class="iso-guide-card">
<h3>1. Add Colonies</h3>
<p>Use the Colonies tab to save each bin or project. Add a colony name, type name, category, population or custom units, care dates, and notes.</p>
<div class="iso-guide-visual">
<img src="${CONFIG.guideAddColony || "/assets/images/isotracker/guide-add-colony.jpg"}" alt="Add colony screen">
</div>
</div>

<div class="iso-guide-card">
<h3>2. Work From the Colony List</h3>
<p>The Colonies tab is also the care queue. Older updates stay on top. Search and filters help you quickly find exactly what you need.</p>
<div class="iso-guide-visual">
<img src="${CONFIG.guideColonyList || "/assets/images/isotracker/guide-colony-list.jpg"}" alt="Colony list screen">
</div>
</div>

<div class="iso-guide-card">
<h3>3. Update Care Fast</h3>
<p>Open a colony and use the quick buttons to mark misting, feeding, substrate checks, or botanical checks. The last updated date changes automatically.</p>
<div class="iso-guide-visual">
<img src="${CONFIG.guideUpdateCare || "/assets/images/isotracker/guide-update-care.jpg"}" alt="Update care screen">
</div>
</div>

<div class="iso-guide-card">
<h3>4. Track Botanicals</h3>
<p>The Botanicals tab tracks supply items and notes only. Pricing for botanicals is handled inside the Price Sheet tab.</p>
<div class="iso-guide-visual">
<img src="${CONFIG.guideBotanicals || "/assets/images/isotracker/guide-botanicals.jpg"}" alt="Botanicals screen">
</div>
</div>

<div class="iso-guide-card">
<h3>5. Build the Price Sheet</h3>
<p>Add only the colony types and botanicals you want. Assign categories, set price and notes, and drag items within each category into the order you want.</p>
<div class="iso-guide-visual">
<img src="${CONFIG.guidePriceSheet || "/assets/images/isotracker/guide-price-sheet.jpg"}" alt="Price sheet builder screen">
</div>
</div>

<div class="iso-guide-card">
<h3>6. Prep For Sale</h3>
<p>Prep stock from either population or custom units. You can now assign up to five packaging materials to one prep action.</p>
<div class="iso-guide-visual">
<img src="${CONFIG.guidePrep || "/assets/images/isotracker/guide-prep.jpg"}" alt="Sale prep screen">
</div>
</div>

<div class="iso-guide-card">
<h3>7. Settings Tab</h3>
<p>Use Settings for export backup, import backup, and clear all data so your main workflow stays uncluttered.</p>
<div class="iso-guide-visual">
<img src="${CONFIG.guideSettings || "/assets/images/isotracker/guide-settings.jpg"}" alt="Settings screen">
</div>
</div>
</div>
`);
}

function renderSettings() {
const types = uniqueTypes();
const selectedType = types[0] || "";
const t = selectedType ? getTypeThresholds(selectedType) : defaultThresholds();

app(`
<h2 class="iso-section-title">Settings</h2>
<p class="iso-subtext">Manage your local data, backups, and care thresholds here.</p>

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
<h3 class="iso-card-title" style="margin-bottom:8px;">Danger Zone</h3>
<p class="iso-subtext">Clear all locally stored IsoTracker data from this device.</p>
<div class="iso-actions">
<button class="iso-btn iso-btn-danger" id="clearAllDataBtn">Clear All Data</button>
</div>
</div>
</div>

<div class="iso-divider"></div>

<h3 class="iso-card-title" style="margin:0 0 10px 0;">Per-Type Husbandry Thresholds</h3>
<p class="iso-subtext">Set custom attention timing by type and by task. Green means checked recently, yellow means attention soon, red means needs checked.</p>

${
types.length
? `
<div class="iso-form-grid">
<div>
<label>Type</label>
<select id="thresholdTypeSelect">
${types.map(type => `<option value="${esc(type)}">${esc(type)}</option>`).join("")}
</select>
</div>
</div>

<div id="thresholdEditor" class="iso-form-grid" style="margin-top:14px;">
<div>
<label>Misting Green / Yellow</label>
<input id="thr_misting_green" type="number" min="0" step="1" value="${t.misting.green}" placeholder="Green">
<input id="thr_misting_yellow" type="number" min="0" step="1" value="${t.misting.yellow}" placeholder="Yellow" style="margin-top:8px;">
</div>

<div>
<label>Feeding Green / Yellow</label>
<input id="thr_feeding_green" type="number" min="0" step="1" value="${t.feeding.green}" placeholder="Green">
<input id="thr_feeding_yellow" type="number" min="0" step="1" value="${t.feeding.yellow}" placeholder="Yellow" style="margin-top:8px;">
</div>

<div>
<label>Substrate Green / Yellow</label>
<input id="thr_substrate_green" type="number" min="0" step="1" value="${t.substrate.green}" placeholder="Green">
<input id="thr_substrate_yellow" type="number" min="0" step="1" value="${t.substrate.yellow}" placeholder="Yellow" style="margin-top:8px;">
</div>

<div>
<label>Botanicals Green / Yellow</label>
<input id="thr_botanicals_green" type="number" min="0" step="1" value="${t.botanicals.green}" placeholder="Green">
<input id="thr_botanicals_yellow" type="number" min="0" step="1" value="${t.botanicals.yellow}" placeholder="Yellow" style="margin-top:8px;">
</div>
</div>

<div class="iso-actions">
<button class="iso-btn iso-btn-primary" id="saveThresholdsBtn">Save Thresholds</button>
<button class="iso-btn" id="resetThresholdsBtn">Reset Type To Defaults</button>
</div>
`
: `<div class="iso-empty">Add at least one colony type to unlock custom thresholds.</div>`
}
`);

$("#exportProfileBtn").onclick = exportProfile;

const importInput = $("#settingsImportBackup");
if (importInput) {
importInput.onchange = function () {
importProfileFromInput(this);
};
}

$("#clearAllDataBtn").onclick = clearAllData;

const thresholdTypeSelect = $("#thresholdTypeSelect");
if (thresholdTypeSelect) {
thresholdTypeSelect.onchange = function () {
renderSettingsForThresholdType(this.value);
};
}

const saveThresholdsBtn = $("#saveThresholdsBtn");
if (saveThresholdsBtn) {
saveThresholdsBtn.onclick = saveTypeThresholds;
}

const resetThresholdsBtn = $("#resetThresholdsBtn");
if (resetThresholdsBtn) {
resetThresholdsBtn.onclick = resetTypeThresholds;
}
}

function renderSettingsForThresholdType(typeName) {
renderSettings();
const select = $("#thresholdTypeSelect");
if (select) {
select.value = typeName;
}

const thresholds = getTypeThresholds(typeName);

const mg = $("#thr_misting_green");
const my = $("#thr_misting_yellow");
const fg = $("#thr_feeding_green");
const fy = $("#thr_feeding_yellow");
const sg = $("#thr_substrate_green");
const sy = $("#thr_substrate_yellow");
const bg = $("#thr_botanicals_green");
const by = $("#thr_botanicals_yellow");

if (mg) mg.value = thresholds.misting.green;
if (my) my.value = thresholds.misting.yellow;
if (fg) fg.value = thresholds.feeding.green;
if (fy) fy.value = thresholds.feeding.yellow;
if (sg) sg.value = thresholds.substrate.green;
if (sy) sy.value = thresholds.substrate.yellow;
if (bg) bg.value = thresholds.botanicals.green;
if (by) by.value = thresholds.botanicals.yellow;
}

async function saveTypeThresholds() {
const typeName = $("#thresholdTypeSelect")?.value || "";
if (!typeName) return;

const payload = {
misting: {
green: Math.max(0, parseInt($("#thr_misting_green")?.value || "3", 10)),
yellow: Math.max(0, parseInt($("#thr_misting_yellow")?.value || "10", 10))
},
feeding: {
green: Math.max(0, parseInt($("#thr_feeding_green")?.value || "3", 10)),
yellow: Math.max(0, parseInt($("#thr_feeding_yellow")?.value || "10", 10))
},
substrate: {
green: Math.max(0, parseInt($("#thr_substrate_green")?.value || "3", 10)),
yellow: Math.max(0, parseInt($("#thr_substrate_yellow")?.value || "10", 10))
},
botanicals: {
green: Math.max(0, parseInt($("#thr_botanicals_green")?.value || "3", 10)),
yellow: Math.max(0, parseInt($("#thr_botanicals_yellow")?.value || "10", 10))
}
};

if (payload.misting.yellow < payload.misting.green) payload.misting.yellow = payload.misting.green;
if (payload.feeding.yellow < payload.feeding.green) payload.feeding.yellow = payload.feeding.green;
if (payload.substrate.yellow < payload.substrate.green) payload.substrate.yellow = payload.substrate.green;
if (payload.botanicals.yellow < payload.botanicals.green) payload.botanicals.yellow = payload.botanicals.green;

state.settings.typeThresholds[typeName] = payload;
await saveState();
alert("Thresholds saved.");
renderSettingsForThresholdType(typeName);
}

async function resetTypeThresholds() {
const typeName = $("#thresholdTypeSelect")?.value || "";
if (!typeName) return;

delete state.settings.typeThresholds[typeName];
await saveState();
alert("Thresholds reset to defaults.");
renderSettingsForThresholdType(typeName);
}

async function clearAllData() {
if (!confirm("Clear all saved data?")) return;

state = structuredCloneSafe(DEFAULT_STATE);
state.salePrep = {
  packaged: [],
  materials: [],
  search: "",
  category: "all",
  type: "all",
  view: "queue"
};

colonyFilters.search = "";
colonyFilters.category = "all";
colonyFilters.status = "all";
colonyFilters.source = "all";

await saveState();
applyHeaderBranding();
renderSettings();
}
function ensurePriceSheetBuilderSelections() {
const categoryOptions = getPriceSheetCategoryOptions();
const sourceOptions = getPriceSheetSourceOptions();

if (!Array.isArray(state.priceSections) || !state.priceSections.length) {
state.priceSections = structuredCloneSafe(DEFAULT_STATE.priceSections);
}

if (!state.priceSheetBuilder || typeof state.priceSheetBuilder !== "object") {
state.priceSheetBuilder = structuredCloneSafe(DEFAULT_STATE.priceSheetBuilder);
}

state.priceSheetBuilder.sourceKind =
state.priceSheetBuilder.sourceKind === "botanical" ? "botanical" : "colony";

if (!categoryOptions.includes(state.priceSheetBuilder.selectedCategory)) {
state.priceSheetBuilder.selectedCategory = categoryOptions[0] || "Isopods";
}

const colonyNames = sourceOptions.colonyTypes.map(item => item.sourceName);
const botanicalNames = sourceOptions.botanicals.map(item => item.sourceName);

if (!colonyNames.includes(state.priceSheetBuilder.selectedColonyType)) {
state.priceSheetBuilder.selectedColonyType = colonyNames[0] || "";
}

if (!botanicalNames.includes(state.priceSheetBuilder.selectedBotanical)) {
state.priceSheetBuilder.selectedBotanical = botanicalNames[0] || "";
}

if (!state.priceSheetBuilder.selectedPosition) {
state.priceSheetBuilder.selectedPosition = "end";
}
}

function repairPackagedEntryIndexes() {
(state.salePrep?.packaged || []).forEach(entry => {
if (typeof entry.colonyIndex === "number") {
const colonyAtIndex = state.colonies[entry.colonyIndex];
if (colonyAtIndex && colonyAtIndex.colonyName === entry.colonyName) return;
}

const matchedIndex = state.colonies.findIndex(c => c.colonyName === entry.colonyName);
entry.colonyIndex = matchedIndex >= 0 ? matchedIndex : null;
});
}

function dedupePriceSheetItems() {
const seen = new Set();
const cleaned = [];

(state.priceSheetItems || []).forEach(item => {
const key = `${item.sourceKind}::${item.sourceName}`;
if (!item.sourceName) return;
if (seen.has(key)) return;
seen.add(key);
cleaned.push(normalizePriceSheetItem(item));
});

state.priceSheetItems = cleaned;
}

function pruneDeadPriceSheetItems() {
const validColonyTypes = new Set(uniqueTypes());
const validBotanicals = new Set((state.botanicals || []).map(item => item.itemName));

state.priceSheetItems = (state.priceSheetItems || []).filter(item => {
if (item.sourceKind === "botanical") {
return validBotanicals.has(item.sourceName);
}
return validColonyTypes.has(item.sourceName);
});
}

function backfillLegacyPriceMapsFromItems() {
state.priceData = state.priceData || {};
state.botanicalPriceData = state.botanicalPriceData || {};

Object.keys(state.priceData).forEach(key => delete state.priceData[key]);
Object.keys(state.botanicalPriceData).forEach(key => delete state.botanicalPriceData[key]);

(state.priceSheetItems || []).forEach(item => {
if (item.sourceKind === "botanical") {
state.botanicalPriceData[item.sourceName] = {
included: true,
section: item.category || "Botanicals",
price: item.price || "",
priceNote: item.note || ""
};
} else {
state.priceData[item.sourceName] = {
included: true,
section: item.category || getDefaultCategoryForSheetSource("colony", item.sourceName),
price: item.price || "",
countLabel: item.note || ""
};
}
});
}

function repairColonyUnitData() {
(state.colonies || []).forEach(colony => {
colony.inventoryMode = colony.inventoryMode === "custom" ? "custom" : "population";

if (colony.inventoryMode !== "custom") {
colony.unitName = "";
} else {
colony.unitName = (colony.unitName || "").trim() || "units";
}

colony.population = sanitizeQuantity(colony.population || 0);
});
}

function repairPackagedMaterialData() {
(state.salePrep?.packaged || []).forEach(entry => {
entry.materialsUsed = Array.isArray(entry.materialsUsed)
? entry.materialsUsed
.map(item => ({
materialId: item?.materialId || "",
materialName: item?.materialName || "",
materialQtyUsed: Math.max(1, parseInt(item?.materialQtyUsed || "1", 10))
}))
.filter(item => item.materialName || item.materialId)
: [];

entry.packCount = sanitizeQuantity(entry.packCount || 0);
entry.totalRemoved = sanitizeQuantity(
entry.totalRemoved != null
? entry.totalRemoved
: sanitizeQuantity(entry.packCount || 0) * Math.max(1, parseInt(entry.packs || "1", 10))
);

entry.packs = Math.max(1, parseInt(entry.packs || "1", 10));
entry.inventoryMode = entry.inventoryMode === "custom" ? "custom" : "population";
entry.unitName = entry.inventoryMode === "custom" ? (entry.unitName || "units") : "";
});
}

function repairStateIntegrity() {
repairColonyUnitData();
repairPackagedMaterialData();
refreshOrders();
dedupePriceSheetItems();
pruneDeadPriceSheetItems();
repairPackagedEntryIndexes();
ensurePriceSheetBuilderSelections();
backfillLegacyPriceMapsFromItems();
}

function bindGlobalKeyboardShortcuts() {
document.addEventListener("keydown", function (e) {
if (e.key === "Escape") {
closeModal();
}
});
}

function bindTabEvents() {
$all(".iso-tab").forEach(btn => {
btn.addEventListener("click", () => setTab(btn.dataset.tab));
});
}

function bindStartupTabFromHash() {
const hash = (window.location.hash || "").replace(/^#/, "").trim().toLowerCase();
const validTabs = new Set(["colonies", "population", "botanicals", "prep", "price", "guide", "settings"]);

if (validTabs.has(hash)) {
setTab(hash);
return true;
}

return false;
}

function syncHashOnTabClick() {
$all(".iso-tab").forEach(btn => {
btn.addEventListener("click", () => {
const tab = btn.dataset.tab || "colonies";
if (window.location.hash !== `#${tab}`) {
history.replaceState(null, "", `#${tab}`);
}
});
});
}
function bootInitialTab() {
if (bindStartupTabFromHash()) return;
renderColonies();
}

async function init() {
await loadState();
repairStateIntegrity();
await saveState();

applyHeaderBranding();
bindTabEvents();
syncHashOnTabClick();
bindGlobalKeyboardShortcuts();
bootInitialTab();
}

document.addEventListener("DOMContentLoaded", init);
})();