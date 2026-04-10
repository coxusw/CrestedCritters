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
settings: {
appLogoUri: "",
priceSheetLogoUri: "",
businessName: "IsoTracker",
tagline: "Colony Tracker & Price Sheets",
theme: "botanical",
promoText: "",
footerNote: ""
},
priceData: {},
botanicalPriceData: {},
priceSections: ["Isopods", "Springtails", "Botanicals", "Exotic", "Mid Tier", "Beginner"],
itemOrders: {
colonyTypes: [],
botanicals: []
}
};

let state = structuredCloneSafe(DEFAULT_STATE);

const colonyFilters = {
search: "",
category: "all",
status: "all"
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
}
};
} else {
state = structuredCloneSafe(DEFAULT_STATE);
await saveState();
}
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

function getStatus(days) {
if (days <= 3) return "green";
if (days <= 10) return "yellow";
return "red";
}

function statusText(days) {
if (days <= 3) return "Checked Recently";
if (days <= 10) return "Needs Attention Soon";
return "Needs Checked";
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
state.itemOrders.botanicals = orderedList(state.botanicals.map(b => b.itemName), state.itemOrders.botanicals || []);
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

function guideImagePath(key, fallback) {
return CONFIG[key] || fallback;
}

function setTab(tab) {
$all(".iso-tab").forEach(btn => {
btn.classList.toggle("active", btn.dataset.tab === tab);
});

if (tab === "colonies") renderColonies();
if (tab === "population") renderPopulation();
if (tab === "botanicals") renderBotanicals();
if (tab === "price") renderPriceSheet();
if (tab === "guide") renderGuide();
if (tab === "settings") renderSettings();
}

async function exportProfile() {
const profile = {
version: 7,
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
}
};

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

return state.colonies
.slice()
.sort((a, b) => daysSince(b.lastHusbandry) - daysSince(a.lastHusbandry))
.filter(c => {
const hay = `${c.colonyName || ""} ${c.typeName || ""}`.toLowerCase();
if (search && !hay.includes(search)) return false;
if (category !== "all" && (c.category || "") !== category) return false;
if (status !== "all") {
const s = getStatus(daysSince(c.lastHusbandry));
if (s !== status) return false;
}
return true;
});
}

function renderColonies() {
const sorted = filterColonies();
const categories = uniqueCategories();

let html = `
<h2 class="iso-section-title">Colonies</h2>
<p class="iso-subtext">Your main working list. Oldest updated colonies appear first so you can see what needs attention.</p>

<div class="iso-toolbar">
<button class="iso-btn iso-btn-primary" data-action="show-add-colony">+ Add Colony</button>
</div>

<div class="iso-form-grid" style="margin-bottom:14px;">
<div>
<label>Search</label>
<input id="colonySearch" placeholder="Search colony name or type" value="${esc(colonyFilters.search)}">
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
const days = daysSince(c.lastHusbandry);
const status = getStatus(days);

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
<span class="iso-badge iso-badge-${status}">${statusText(days)}</span>
</div>
<div class="iso-meta">
<div><strong>Category:</strong> ${esc(c.category || "-")}</div>
<div><strong>Population:</strong> ${Number(c.population) || 0}</div>
<div><strong>Date Added:</strong> ${c.dateAdded || "-"}</div>
<div><strong>Last Updated:</strong> ${c.lastHusbandry || "Never"}</div>
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

if (search) {
search.addEventListener("input", () => {
colonyFilters.search = search.value;
renderColonies();
});
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
<div>
<label>Population</label>
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
categorySelect.addEventListener("change", () => {
customWrap.style.display = categorySelect.value === "__custom__" ? "block" : "none";
});

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

if (!colonyName) return alert("Colony name is required.");
if (!typeName) return alert("Type name is required.");
if (!category) return alert("Category is required.");
if (state.colonies.some(c => c.colonyName.toLowerCase() === colonyName.toLowerCase())) {
return alert("Colony name already in use. Please choose a different colony name.");
}

const colony = {
colonyName,
typeName,
category,
typeImageUri: "",
dateAdded: $("#dateAdded").value.trim() || todayString(),
population: Math.max(0, parseInt($("#population").value || "0", 10)),
lastMisting: $("#lastMisting").value.trim(),
lastBotanicalsCheck: $("#lastBotanicalsCheck").value.trim(),
lastSubstrateCheck: $("#lastSubstrateCheck").value.trim(),
lastSupplementalFeeding: $("#lastSupplementalFeeding").value.trim(),
lastHusbandry: "",
customNote: $("#customNote").value.trim()
};

updateLastHusbandry(colony);

const file = $("#typeImage").files[0];
if (file) {
colony.typeImageUri = await compressImageFile(file, {
maxWidth: 800,
maxHeight: 800,
quality: 0.72
});
}

state.colonies.push(colony);
refreshOrders();
await saveState();
renderColonies();
}

function openColony(index) {
const c = state.colonies[index];
const knownCats = ["Isopods", "Springtails", "Botanicals", ...uniqueCategories()]
.filter((v, i, a) => v && a.indexOf(v) === i);

app(`
<h2 class="iso-section-title">${esc(c.colonyName)}</h2>
<p class="iso-subtext">${esc(c.typeName)}</p>

${c.typeImageUri ? `<img class="iso-thumb" src="${c.typeImageUri}" alt="">` : ""}

<div class="iso-meta" style="margin-bottom:14px">
<div><strong>Category:</strong> ${esc(c.category || "-")}</div>
<div><strong>Date Added:</strong> ${c.dateAdded || "-"}</div>
<div><strong>Last Updated:</strong> ${c.lastHusbandry || "Never"}</div>
</div>

<div class="iso-actions" style="margin-bottom:12px">
<button class="iso-btn iso-btn-primary" data-quick="misting">Mark Misted Now</button>
<button class="iso-btn iso-btn-primary" data-quick="feeding">Mark Fed Now</button>
<button class="iso-btn iso-btn-primary" data-quick="botanicals">Mark Botanicals Checked Now</button>
<button class="iso-btn iso-btn-primary" data-quick="substrate">Mark Substrate Checked Now</button>
</div>

<div class="iso-form-grid">
<div>
<label>Population</label>
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
<button class="iso-btn iso-btn-primary" id="splitColonyBtn">Split Colony</button>
<button class="iso-btn" id="backToColoniesBtn">Back</button>
<button class="iso-btn iso-btn-danger" id="deleteColonyBtn">Delete Colony</button>
</div>
`);

const select = $("#editcategorySelect");
const wrap = $("#editcustomCategoryWrap");
select.addEventListener("change", () => {
wrap.style.display = select.value === "__custom__" ? "block" : "none";
});

$all("[data-quick]").forEach(btn => {
btn.onclick = () => quickAction(index, btn.dataset.quick);
});

$("#replaceImageBtn").onclick = () => replaceColonyImage(index);
$("#removeImageBtn").onclick = () => removeColonyImage(index);
$("#saveColonyEditsBtn").onclick = () => saveColonyEdits(index);
$("#splitColonyBtn").onclick = () => showSplitColonyForm(index);
$("#backToColoniesBtn").onclick = renderColonies;
$("#deleteColonyBtn").onclick = () => deleteColony(index);
}

function showSplitColonyForm(index) {
const c = state.colonies[index];
const currentPopulation = Number(c.population) || 0;

if (currentPopulation <= 0) {
alert("This colony needs a population greater than 0 before it can be split.");
return;
}

app(`
<h2 class="iso-section-title">Split Colony</h2>
<p class="iso-subtext">Create a new colony from ${esc(c.colonyName)}.</p>

<div class="iso-card">
<div class="iso-meta" style="margin-top:0;">
<div><strong>Original Colony:</strong> ${esc(c.colonyName)}</div>
<div><strong>Type:</strong> ${esc(c.typeName)}</div>
<div><strong>Current Population:</strong> ${currentPopulation}</div>
</div>
</div>

<div class="iso-form-grid" style="margin-top:14px;">
<div>
<label>New Colony Name</label>
<input id="splitNewColonyName" placeholder="Red Panda Bin 2">
</div>
<div>
<label>Population To Move</label>
<input id="splitPopulation" type="number" min="1" step="1" placeholder="50">
</div>
</div>

<div class="iso-actions">
<button class="iso-btn iso-btn-primary" id="confirmSplitColonyBtn">Create Split Colony</button>
<button class="iso-btn" id="cancelSplitColonyBtn">Cancel</button>
</div>
`);

$("#confirmSplitColonyBtn").onclick = () => splitColony(index);
$("#cancelSplitColonyBtn").onclick = () => openColony(index);
}

async function splitColony(index) {
const original = state.colonies[index];
const newColonyName = ($("#splitNewColonyName")?.value || "").trim();
const moveAmount = Math.max(0, parseInt(($("#splitPopulation")?.value || "0"), 10));
const originalPopulation = Number(original.population) || 0;

if (!newColonyName) {
alert("New colony name is required.");
return;
}

if (state.colonies.some(c => c.colonyName.toLowerCase() === newColonyName.toLowerCase())) {
alert("That colony name is already in use. Please choose a different name.");
return;
}

if (!Number.isInteger(moveAmount) || moveAmount <= 0) {
alert("Population to move must be greater than 0.");
return;
}

if (moveAmount > originalPopulation) {
alert("Population to move cannot be more than the current colony population.");
return;
}

const newColony = {
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
customNote: original.customNote || ""
};

original.population = originalPopulation - moveAmount;

state.colonies.push(newColony);
refreshOrders();
await saveState();
renderColonies();
alert("Colony split created.");
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

await saveState();
openColony(index);
alert("Image updated.");
}

async function removeColonyImage(index) {
if (!confirm("Remove this colony image?")) return;
state.colonies[index].typeImageUri = "";
await saveState();
openColony(index);
alert("Image removed.");
}

async function saveColonyEdits(index) {
const c = state.colonies[index];
const category = getChosenCategory("edit");
if (!category) return alert("Category is required.");

c.population = Math.max(0, parseInt($("#editPopulation").value || "0", 10));
c.category = category;
c.lastMisting = $("#editMisting").value.trim();
c.lastBotanicalsCheck = $("#editBotanicals").value.trim();
c.lastSubstrateCheck = $("#editSubstrate").value.trim();
c.lastSupplementalFeeding = $("#editFeeding").value.trim();
c.customNote = $("#editNote").value.trim();
updateLastHusbandry(c);

await saveState();
openColony(index);
alert("Colony updated.");
}

async function quickAction(index, action) {
const today = todayString();
const c = state.colonies[index];
if (action === "misting") c.lastMisting = today;
if (action === "feeding") c.lastSupplementalFeeding = today;
if (action === "botanicals") c.lastBotanicalsCheck = today;
if (action === "substrate") c.lastSubstrateCheck = today;
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
state.itemOrders.colonyTypes = (state.itemOrders.colonyTypes || []).filter(x => x !== typeName);
}

refreshOrders();
await saveState();
renderColonies();
}

function renderPopulation() {
const totals = {};
state.colonies.forEach(c => {
const t = (c.typeName || "").trim();
if (!t) return;
totals[t] = (totals[t] || 0) + (Number(c.population) || 0);
});

const types = Object.keys(totals).sort((a, b) => a.localeCompare(b));
let html = `
<h2 class="iso-section-title">Population</h2>
<p class="iso-subtext">View total population by type. Tap a type for the colony breakdown.</p>
`;

if (!types.length) {
html += `<div class="iso-empty">No population records saved.</div>`;
return app(html);
}

html += `<div class="iso-grid">`;
types.forEach(type => {
html += `
<div class="iso-card iso-card-clickable" data-pop-type="${esc(type)}">
<div class="iso-card-head">
<div>
<h3 class="iso-card-title">${esc(type)}</h3>
<div class="iso-muted">Combined population</div>
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
<p class="iso-subtext">Population breakdown by colony.</p>
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

if (!state.botanicalPriceData[itemName]) {
state.botanicalPriceData[itemName] = {
included: true,
section: "Botanicals",
price: "",
priceNote: ""
};
}

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
delete state.botanicalPriceData[itemName];
state.itemOrders.botanicals = (state.itemOrders.botanicals || []).filter(x => x !== itemName);
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
saveState().then(renderPriceSheet);
}

function deleteSection(name) {
if (name === "Botanicals") {
alert("Botanicals section cannot be removed.");
return;
}

state.priceSections = state.priceSections.filter(s => s !== name);

Object.keys(state.priceData).forEach(k => {
if (state.priceData[k]?.section === name) state.priceData[k].section = "";
});

Object.keys(state.botanicalPriceData).forEach(k => {
if (state.botanicalPriceData[k]?.section === name) state.botanicalPriceData[k].section = "Botanicals";
});

saveState().then(renderPriceSheet);
}

function renderPriceSheet() {
refreshOrders();

const colonyTypes = state.itemOrders.colonyTypes;
const botanicalNames = state.itemOrders.botanicals;
const allSectionOptions = [...new Set([...state.priceSections, ...uniqueCategories(), "Botanicals"])].filter(Boolean);

let html = `
<h2 class="iso-section-title">Price Sheet</h2>
<p class="iso-subtext">Choose exactly which colony types and botanicals appear, organize them into sections, and drag items into the exact order you want.</p>
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
`;

html += `<div style="margin-top:22px;"><h3 style="margin:0 0 10px;">Colony Types</h3>`;
if (!colonyTypes.length) {
html += `<div class="iso-empty">No colony types saved.</div>`;
} else {
html += `<div id="colonyTypeBuilder">`;
colonyTypes.forEach(type => {
const exampleColony = state.colonies.find(c => c.typeName === type);
const defaultSection = exampleColony?.category || "";
const row = state.priceData[type] || {
included: true,
section: defaultSection,
price: "",
countLabel: "10ct"
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
const row = state.botanicalPriceData[name] || {
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

if (after) {
container.insertBefore(dragged, target.nextSibling);
} else {
container.insertBefore(dragged, target);
}
});
});
}

async function persistBuilderOrder() {
const colonyRows = [...document.querySelectorAll("#colonyTypeBuilder .iso-price-row")];
const botanicalRows = [...document.querySelectorAll("#botanicalBuilder .iso-price-row")];

state.itemOrders.colonyTypes = colonyRows.map(row => row.dataset.name);
state.itemOrders.botanicals = botanicalRows.map(row => row.dataset.name);

await saveState();
renderPriceSheetPreview();
}

async function savePriceSheetSettings() {
state.settings.businessName = $("#businessName").value.trim() || "IsoTracker";
state.settings.tagline = $("#tagline").value.trim() || "";
state.settings.theme = $("#themeSelect").value;
state.settings.promoText = $("#promoText").value.trim();
state.settings.footerNote = $("#footerNote").value.trim();

const appLogoFile = $("#appLogoUpload").files[0];
const sheetLogoFile = $("#sheetLogoUpload").files[0];

(state.itemOrders.colonyTypes || []).forEach(type => {
const existing = state.priceData[type] || {};
state.priceData[type] = {
...existing,
included: document.getElementById(`include_${slug(type)}`)?.checked ?? true,
section: document.getElementById(`section_${slug(type)}`)?.value.trim() || "",
price: document.getElementById(`price_${slug(type)}`)?.value.trim() || "",
countLabel: document.getElementById(`count_${slug(type)}`)?.value.trim() || ""
};
});

(state.itemOrders.botanicals || []).forEach(name => {
const existing = state.botanicalPriceData[name] || {};
state.botanicalPriceData[name] = {
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
const sections = {};

(state.itemOrders.colonyTypes || []).forEach(type => {
const row = state.priceData[type];
if (!row || row.included === false) return;

const section = row.section || state.colonies.find(c => c.typeName === type)?.category || "Other";
if (!sections[section]) sections[section] = [];

sections[section].push({
name: type,
note: row.countLabel || "",
price: row.price || "Not Available"
});
});

(state.itemOrders.botanicals || []).forEach(name => {
const row = state.botanicalPriceData[name];
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

function renderGuide() {
app(`
<h2 class="iso-section-title">Guide</h2>
<p class="iso-subtext">Everything in one place so users can quickly understand how IsoTracker works.</p>

<div class="iso-guide-grid">
<div class="iso-guide-card">
<h3>1. Add Colonies</h3>
<p>Use the Colonies tab to save each bin or project. Add a colony name, type name, category, population, care dates, and notes.</p>
<div class="iso-guide-visual">
<img src="${guideImagePath("guideAddColony", "/assets/images/isotracker/guide-add-colony.jpeg")}" alt="Add colony screen">
</div>
</div>

<div class="iso-guide-card">
<h3>2. Work From the Colony List</h3>
<p>The Colonies tab is also the care queue. Older updates stay on top. Search and filters help you quickly find exactly what you need.</p>
<div class="iso-guide-visual">
<img src="${guideImagePath("guideColonyList", "/assets/images/isotracker/guide-colony-list.jpeg")}" alt="Colony list screen">
</div>
</div>

<div class="iso-guide-card">
<h3>3. Update Care Fast</h3>
<p>Open a colony and use the quick buttons to mark misting, feeding, substrate checks, or botanical checks. The last updated date changes automatically.</p>
<div class="iso-guide-visual">
<img src="${guideImagePath("guideUpdateCare", "/assets/images/isotracker/guide-update-care.jpg")}" alt="Update care screen">
</div>
</div>

<div class="iso-guide-card">
<h3>4. Track Botanicals</h3>
<p>The Botanicals tab tracks stock and notes only. Pricing for botanicals is handled inside the Price Sheet tab.</p>
<div class="iso-guide-visual">
<img src="${guideImagePath("guideBotanicals", "/assets/images/isotracker/guide-botanicals.jpeg")}" alt="Botanicals screen">
</div>
</div>

<div class="iso-guide-card">
<h3>5. Build the Price Sheet</h3>
<p>Choose which colony types and botanicals to include. Assign sections, add count notes and prices, then drag items into the exact order you want.</p>
<div class="iso-guide-visual">
<img src="${guideImagePath("guidePriceSheet", "/assets/images/isotracker/guide-price-sheet.jpeg")}" alt="Price sheet builder screen">
</div>
</div>

<div class="iso-guide-card">
<h3>6. Settings Tab</h3>
<p>Use Settings for export backup, import backup, and clear all data so your main workflow stays uncluttered.</p>
<div class="iso-guide-visual">
<img src="${guideImagePath("guideSettings", "/assets/images/isotracker/guide-settings.jpeg")}" alt="Settings screen">
</div>
</div>
</div>
`);
}

function renderSettings() {
app(`
<h2 class="iso-section-title">Settings</h2>
<p class="iso-subtext">Manage your local data and backups here.</p>

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
`);

$("#exportProfileBtn").onclick = exportProfile;
const importInput = $("#settingsImportBackup");
if (importInput) {
importInput.onchange = function () {
importProfileFromInput(this);
};
}
$("#clearAllDataBtn").onclick = clearAllData;
}

async function loadDemoData() {
state.colonies = [
{
colonyName: "Red Panda Bin 1",
typeName: "Red Panda",
category: "Isopods",
typeImageUri: "",
dateAdded: "03/15/2026",
population: 300,
lastMisting: "04/03/2026",
lastBotanicalsCheck: "04/01/2026",
lastSubstrateCheck: "03/28/2026",
lastSupplementalFeeding: "04/05/2026",
lastHusbandry: "04/05/2026",
customNote: "Breeding well."
},
{
colonyName: "Rubber Ducky Project",
typeName: "Rubber Ducky",
category: "Isopods",
typeImageUri: "",
dateAdded: "12/22/2025",
population: 40,
lastMisting: "03/21/2026",
lastBotanicalsCheck: "03/18/2026",
lastSubstrateCheck: "03/12/2026",
lastSupplementalFeeding: "03/19/2026",
lastHusbandry: "03/21/2026",
customNote: "Needs careful monitoring."
},
{
colonyName: "Temperate Springtails Main",
typeName: "Temperate Springtails",
category: "Springtails",
typeImageUri: "",
dateAdded: "03/11/2026",
population: 1200,
lastMisting: "04/06/2026",
lastBotanicalsCheck: "04/06/2026",
lastSubstrateCheck: "04/01/2026",
lastSupplementalFeeding: "04/06/2026",
lastHusbandry: "04/06/2026",
customNote: "Great production."
}
];

state.botanicals = [
{ itemName: "Leaf Litter", quantity: "12 bags", note: "Oak and mixed hardwood." },
{ itemName: "Lotus Pods", quantity: "35", note: "Medium size." },
{ itemName: "Cork Bark", quantity: "18 pieces", note: "Mixed flats and rounds." },
{ itemName: "Moss", quantity: "8 bags", note: "Good for humid species." }
];

state.priceSections = ["Isopods", "Springtails", "Botanicals", "Exotic", "Mid Tier", "Beginner"];

state.priceData = {
"Red Panda": { included: true, section: "Mid Tier", price: "$30", countLabel: "10ct" },
"Rubber Ducky": { included: true, section: "Exotic", price: "", countLabel: "6ct" },
"Temperate Springtails": { included: true, section: "Springtails", price: "$15", countLabel: "8oz cup" }
};

state.botanicalPriceData = {
"Leaf Litter": { included: true, section: "Botanicals", price: "$10", priceNote: "1 gallon" },
"Lotus Pods": { included: true, section: "Botanicals", price: "$10", priceNote: "5 pods" },
"Cork Bark": { included: true, section: "Botanicals", price: "$12", priceNote: "per piece" },
"Moss": { included: false, section: "Botanicals", price: "$8", priceNote: "1 bag" }
};

state.itemOrders = {
colonyTypes: ["Rubber Ducky", "Red Panda", "Temperate Springtails"],
botanicals: ["Leaf Litter", "Lotus Pods", "Cork Bark", "Moss"]
};

state.settings = {
appLogoUri: "",
priceSheetLogoUri: "",
businessName: "IsoTracker",
tagline: "Colony Tracker & Price Sheets",
theme: "botanical",
promoText: "",
footerNote: ""
};

refreshOrders();
await saveState();
applyHeaderBranding();
renderColonies();
}

async function clearAllData() {
if (!confirm("Clear all saved data?")) return;

state = structuredCloneSafe(DEFAULT_STATE);
colonyFilters.search = "";
colonyFilters.category = "all";
colonyFilters.status = "all";

await saveState();
applyHeaderBranding();
renderSettings();
}

function bindTabEvents() {
$all(".iso-tab").forEach(btn => {
btn.addEventListener("click", () => setTab(btn.dataset.tab));
});
}

async function init() {
await loadState();
refreshOrders();
applyHeaderBranding();
bindTabEvents();
renderColonies();
}

document.addEventListener("DOMContentLoaded", init);
})();