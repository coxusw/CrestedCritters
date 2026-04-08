const STORAGE = "isoTrackerData_v2";
const DEFAULT_LOGO = "/assets/images/logo.png";

let data = JSON.parse(localStorage.getItem(STORAGE) || JSON.stringify({
colonies: [],
botanicals: [],
prices: {},
botanicalPrices: {},
sections: ["Isopods", "Springtails", "Botanicals"],
order: {
colonyTypes: [],
botanicals: []
},
settings: {
appLogo: "",
sheetLogo: "",
businessName: "IsoTracker",
tagline: "Colony Tracker & Price Sheets",
theme: "botanical",
bannerText: "",
footerText: ""
}
}));

function save() {
localStorage.setItem(STORAGE, JSON.stringify(data));
}

function today() {
const d = new Date();
return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}/${d.getFullYear()}`;
}

function parseDate(str) {
if (!str) return null;
const parts = str.split("/");
if (parts.length !== 3) return null;
const [m, d, y] = parts.map(Number);
if (!m || !d || !y) return null;
return new Date(y, m - 1, d);
}

function daysSince(date) {
if (!date) return 999;
const dt = parseDate(date);
if (!dt) return 999;
const now = new Date();
now.setHours(0,0,0,0);
dt.setHours(0,0,0,0);
return Math.floor((now - dt) / 86400000);
}

function status(days) {
if (days <= 3) return "green";
if (days <= 10) return "yellow";
return "red";
}

function statusText(days) {
if (days <= 3) return "Checked Recently";
if (days <= 10) return "Needs Attention Soon";
return "Needs Checked";
}

function appLogo() {
return data.settings.appLogo || DEFAULT_LOGO;
}

function sheetLogo() {
return data.settings.sheetLogo || data.settings.appLogo || DEFAULT_LOGO;
}

function getUniqueTypes() {
return [...new Set(data.colonies.map(c => (c.type || "").trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b));
}

function getUniqueCategories() {
return [...new Set(data.colonies.map(c => (c.category || "").trim()).filter(Boolean))].sort((a,b) => a.localeCompare(b));
}

function slug(str) {
return String(str || "").toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function reorderList(source, savedOrder) {
const sourceList = source.slice();
const seen = new Set();
const result = [];

(savedOrder || []).forEach(item => {
if (sourceList.includes(item) && !seen.has(item)) {
result.push(item);
seen.add(item);
}
});

sourceList.forEach(item => {
if (!seen.has(item)) {
result.push(item);
seen.add(item);
}
});

return result;
}

function refreshOrders() {
data.order.colonyTypes = reorderList(getUniqueTypes(), data.order.colonyTypes);
data.order.botanicals = reorderList(data.botanicals.map(b => b.name), data.order.botanicals);
save();
}

function renderShell(activeTab, contentHtml) {
document.getElementById("isoApp").innerHTML = `
<div class="iso-header">
<img src="${appLogo()}" alt="Crested Critters logo">
<div>
<h1>IsoTracker</h1>
<p>Brought to you by Crested Critters</p>
</div>
</div>

<div class="iso-tabs">
<div class="iso-tab ${activeTab === "colonies" ? "active" : ""}" onclick="renderColonies()">Colonies</div>
<div class="iso-tab ${activeTab === "population" ? "active" : ""}" onclick="renderPopulation()">Population</div>
<div class="iso-tab ${activeTab === "botanicals" ? "active" : ""}" onclick="renderBotanicals()">Botanicals</div>
<div class="iso-tab ${activeTab === "price" ? "active" : ""}" onclick="renderPrice()">Price Sheet</div>
<div class="iso-tab ${activeTab === "guide" ? "active" : ""}" onclick="renderGuide()">Guide</div>
</div>

<div id="isoContent">${contentHtml}</div>
`;
}

function renderColonies() {
const sorted = data.colonies.slice().sort((a,b) => daysSince(b.lastUpdated) - daysSince(a.lastUpdated));

let html = `
<div class="iso-toolbar">
<button class="iso-btn iso-btn-primary" onclick="showAddColony()">+ Add Colony</button>
</div>
`;

if (!sorted.length) {
html += `<div class="iso-empty">No colonies yet.</div>`;
renderShell("colonies", html);
return;
}

html += `<div class="iso-grid-auto">`;

sorted.forEach(c => {
const index = data.colonies.findIndex(x => x.name === c.name);
const d = daysSince(c.lastUpdated);
const s = status(d);

html += `
<div class="iso-card clickable ${s}" onclick="openColony(${index})">

<div style="display:flex; gap:12px; align-items:flex-start;">

${c.image ? `<img class="thumb" src="${c.image}" alt="">` : ""}

<div style="flex:1;">

<div class="iso-card-head">
<div>
<h3>${escapeHtml(c.name)}</h3>
<div class="iso-muted">${escapeHtml(c.type)}</div>
</div>
<span class="iso-badge ${s}-badge">${statusText(d)}</span>
</div>

<div class="iso-meta">
<div><strong>Category:</strong> ${escapeHtml(c.category || "-")}</div>
<div><strong>Population:</strong> ${Number(c.population) || 0}</div>
<div><strong>Date Added:</strong> ${escapeHtml(c.dateAdded || "-")}</div>
<div><strong>Last Updated:</strong> ${escapeHtml(c.lastUpdated || "Never")}</div>
</div>

</div>
</div>

</div>
`;
});

html += `</div>`;
renderShell("colonies", html);
}

function showAddColony() {
const categories = ["Isopods", "Springtails", "Botanicals", ...getUniqueCategories()]
.filter((v, i, a) => v && a.indexOf(v) === i);

renderShell("colonies", `
<h2 class="section-title">Add Colony</h2>
<p class="subtext">Colony names must be unique. Type names can repeat.</p>

<div class="iso-grid-2">
<div>
<label>Colony Name</label>
<input id="newName" class="iso-input" placeholder="Red Panda Bin 1">
</div>
<div>
<label>Type Name</label>
<input id="newType" class="iso-input" placeholder="Red Panda">
</div>
<div>
<label>Date Added</label>
<input id="newDateAdded" class="iso-input" value="${today()}">
</div>
<div>
<label>Population</label>
<input id="newPopulation" class="iso-input" type="number" min="0" step="1" placeholder="0">
</div>
</div>

<div class="iso-grid-2">
<div>
<label>Category</label>
<select id="newCategory" class="iso-select" onchange="toggleNewCustomCategory()">
${categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}
<option value="__custom__">Custom</option>
</select>
</div>
<div id="newCustomCategoryWrap" style="display:none;">
<label>Custom Category</label>
<input id="newCustomCategory" class="iso-input" placeholder="Example: Millipedes">
</div>
</div>

<div class="iso-grid-2">
<div>
<label>Last Misting</label>
<input id="newMisting" class="iso-input" placeholder="mm/dd/yyyy">
</div>
<div>
<label>Last Botanicals Check</label>
<input id="newBotCheck" class="iso-input" placeholder="mm/dd/yyyy">
</div>
<div>
<label>Last Substrate Check</label>
<input id="newSubCheck" class="iso-input" placeholder="mm/dd/yyyy">
</div>
<div>
<label>Last Supplemental Feeding</label>
<input id="newFeed" class="iso-input" placeholder="mm/dd/yyyy">
</div>
</div>

<label>Type Picture</label>
<input id="newImage" class="iso-input" type="file" accept="image/*">

<label>Custom Note</label>
<textarea id="newNote" class="iso-textarea" placeholder="Any notes for this colony..."></textarea>

<div class="actions">
<button class="iso-btn iso-btn-primary" onclick="saveNewColony()">Save Colony</button>
<button class="iso-btn iso-btn-secondary" onclick="renderColonies()">Cancel</button>
</div>
`);
}

function toggleNewCustomCategory() {
const sel = document.getElementById("newCategory");
const wrap = document.getElementById("newCustomCategoryWrap");
if (sel && wrap) wrap.style.display = sel.value === "__custom__" ? "block" : "none";
}

function saveNewColony() {
const name = document.getElementById("newName").value.trim();
const type = document.getElementById("newType").value.trim();
const categorySelect = document.getElementById("newCategory").value;
const category = categorySelect === "__custom__"
? document.getElementById("newCustomCategory").value.trim()
: categorySelect;

if (!name) return alert("Colony name is required.");
if (!type) return alert("Type name is required.");
if (!category) return alert("Category is required.");
if (data.colonies.some(c => c.name.toLowerCase() === name.toLowerCase())) {
return alert("Colony name already in use.");
}

const colony = {
name,
type,
category,
dateAdded: document.getElementById("newDateAdded").value.trim() || today(),
population: Math.max(0, parseInt(document.getElementById("newPopulation").value || "0", 10)),
lastMisting: document.getElementById("newMisting").value.trim(),
lastBotCheck: document.getElementById("newBotCheck").value.trim(),
lastSubCheck: document.getElementById("newSubCheck").value.trim(),
lastFeed: document.getElementById("newFeed").value.trim(),
lastUpdated: "",
note: document.getElementById("newNote").value.trim(),
image: ""
};

colony.lastUpdated = latestUpdateDate(colony);

const file = document.getElementById("newImage").files[0];
if (file) {
const reader = new FileReader();
reader.onload = e => {
colony.image = e.target.result;
data.colonies.push(colony);
refreshOrders();
save();
renderColonies();
};
reader.readAsDataURL(file);
} else {
data.colonies.push(colony);
refreshOrders();
save();
renderColonies();
}
}

function latestUpdateDate(colony) {
const dates = [
colony.lastMisting,
colony.lastBotCheck,
colony.lastSubCheck,
colony.lastFeed
].filter(Boolean);

if (!dates.length) return "";
let latest = dates[0];
dates.forEach(d => {
if (parseDate(d) > parseDate(latest)) latest = d;
});
return latest;
}

function openColony(index) {
const c = data.colonies[index];
const categories = ["Isopods", "Springtails", "Botanicals", ...getUniqueCategories()]
.filter((v, i, a) => v && a.indexOf(v) === i);

renderShell("colonies", `
<h2 class="section-title">${escapeHtml(c.name)}</h2>
<p class="subtext">${escapeHtml(c.type)}</p>

${c.image ? `<img class="thumb" src="${c.image}" alt="">` : ""}

<div class="iso-meta" style="margin-bottom:14px;">
<div><strong>Category:</strong> ${escapeHtml(c.category || "-")}</div>
<div><strong>Date Added:</strong> ${escapeHtml(c.dateAdded || "-")}</div>
<div><strong>Last Updated:</strong> ${escapeHtml(c.lastUpdated || "Never")}</div>
</div>

<div class="actions" style="margin-bottom:12px;">
<button class="iso-btn iso-btn-primary" onclick="quickAction(${index}, 'mist')">Mark Misted Now</button>
<button class="iso-btn iso-btn-primary" onclick="quickAction(${index}, 'feed')">Mark Fed Now</button>
<button class="iso-btn iso-btn-primary" onclick="quickAction(${index}, 'bot')">Mark Botanicals Checked Now</button>
<button class="iso-btn iso-btn-primary" onclick="quickAction(${index}, 'sub')">Mark Substrate Checked Now</button>
</div>

<div class="iso-grid-2">
<div>
<label>Population</label>
<input id="editPopulation" class="iso-input" type="number" min="0" step="1" value="${Number(c.population) || 0}">
</div>
<div>
<label>Category</label>
<select id="editCategory" class="iso-select" onchange="toggleEditCustomCategory()">
${categories.map(cat => `<option value="${escapeHtml(cat)}" ${c.category === cat ? "selected" : ""}>${escapeHtml(cat)}</option>`).join("")}
<option value="__custom__" ${!categories.includes(c.category) ? "selected" : ""}>Custom</option>
</select>
</div>
<div id="editCustomCategoryWrap" style="${!categories.includes(c.category) ? "" : "display:none;"}">
<label>Custom Category</label>
<input id="editCustomCategory" class="iso-input" value="${!categories.includes(c.category) ? escapeHtml(c.category) : ""}" placeholder="Example: Beetles">
</div>
</div>

<div class="iso-grid-2">
<div>
<label>Last Misting</label>
<input id="editMisting" class="iso-input" value="${escapeHtml(c.lastMisting || "")}">
</div>
<div>
<label>Last Botanicals Check</label>
<input id="editBotCheck" class="iso-input" value="${escapeHtml(c.lastBotCheck || "")}">
</div>
<div>
<label>Last Substrate Check</label>
<input id="editSubCheck" class="iso-input" value="${escapeHtml(c.lastSubCheck || "")}">
</div>
<div>
<label>Last Supplemental Feeding</label>
<input id="editFeed" class="iso-input" value="${escapeHtml(c.lastFeed || "")}">
</div>
</div>

<label>Custom Note</label>
<textarea id="editNote" class="iso-textarea">${escapeHtml(c.note || "")}</textarea>

<div class="actions">
<button class="iso-btn iso-btn-primary" onclick="saveColonyEdits(${index})">Save Changes</button>
<button class="iso-btn iso-btn-secondary" onclick="renderColonies()">Back</button>
<button class="iso-btn iso-btn-danger" onclick="deleteColony(${index})">Delete Colony</button>
</div>
`);
}

function toggleEditCustomCategory() {
const sel = document.getElementById("editCategory");
const wrap = document.getElementById("editCustomCategoryWrap");
if (sel && wrap) wrap.style.display = sel.value === "__custom__" ? "block" : "none";
}

function saveColonyEdits(index) {
const c = data.colonies[index];
const categorySelect = document.getElementById("editCategory").value;
const category = categorySelect === "__custom__"
? document.getElementById("editCustomCategory").value.trim()
: categorySelect;

if (!category) return alert("Category is required.");

c.population = Math.max(0, parseInt(document.getElementById("editPopulation").value || "0", 10));
c.category = category;
c.lastMisting = document.getElementById("editMisting").value.trim();
c.lastBotCheck = document.getElementById("editBotCheck").value.trim();
c.lastSubCheck = document.getElementById("editSubCheck").value.trim();
c.lastFeed = document.getElementById("editFeed").value.trim();
c.note = document.getElementById("editNote").value.trim();
c.lastUpdated = latestUpdateDate(c);
save();
openColony(index);
alert("Colony updated.");
}

function quickAction(index, type) {
const c = data.colonies[index];
const t = today();
if (type === "mist") c.lastMisting = t;
if (type === "feed") c.lastFeed = t;
if (type === "bot") c.lastBotCheck = t;
if (type === "sub") c.lastSubCheck = t;
c.lastUpdated = t;
save();
openColony(index);
}

function deleteColony(index) {
const typeName = data.colonies[index].type;
if (!confirm("Delete this colony?")) return;

data.colonies.splice(index, 1);

const stillExists = data.colonies.some(c => c.type === typeName);
if (!stillExists) {
delete data.prices[typeName];
data.order.colonyTypes = (data.order.colonyTypes || []).filter(x => x !== typeName);
}

refreshOrders();
save();
renderColonies();
}

function renderPopulation() {
const totals = {};
data.colonies.forEach(c => {
if (!c.type) return;
totals[c.type] = (totals[c.type] || 0) + (Number(c.population) || 0);
});

const types = Object.keys(totals).sort((a,b) => a.localeCompare(b));

let html = `
<h2 class="section-title">Population</h2>
<p class="subtext">View total population by type. Tap a type for the colony breakdown.</p>
`;

if (!types.length) {
html += `<div class="iso-empty">No population data yet.</div>`;
renderShell("population", html);
return;
}

html += `<div class="iso-grid-auto">`;
types.forEach(type => {
html += `
<div class="iso-card clickable" onclick="openPopulationBreakdown('${escapeJs(type)}')">
<div class="iso-card-head">
<div>
<h3>${escapeHtml(type)}</h3>
<div class="iso-muted">Combined population</div>
</div>
<span class="iso-badge">${totals[type]}</span>
</div>
</div>
`;
});
html += `</div>`;

renderShell("population", html);
}

function openPopulationBreakdown(type) {
const matches = data.colonies.filter(c => c.type === type).sort((a,b) => (Number(b.population)||0) - (Number(a.population)||0));
const total = matches.reduce((sum,c) => sum + (Number(c.population)||0), 0);

let html = `
<h2 class="section-title">${escapeHtml(type)} — Total ${total}</h2>
<p class="subtext">Population breakdown by colony.</p>
<div class="actions" style="margin-bottom:14px;">
<button class="iso-btn iso-btn-secondary" onclick="renderPopulation()">Back</button>
</div>
<div class="iso-grid-auto">
`;

matches.forEach(c => {
html += `
<div class="iso-card">
<div class="iso-card-head">
<div>
<h3>${escapeHtml(c.name)}</h3>
<div class="iso-muted">${escapeHtml(c.category || "")}</div>
</div>
<span class="iso-badge">${Number(c.population) || 0}</span>
</div>
<div class="iso-meta">
<div><strong>Last Updated:</strong> ${escapeHtml(c.lastUpdated || "Never")}</div>
</div>
</div>
`;
});

html += `</div>`;
renderShell("population", html);
}

function renderBotanicals() {
let html = `
<h2 class="section-title">Botanicals</h2>
<p class="subtext">Track inventory and notes here. Pricing for botanicals is managed inside the Price Sheet tab.</p>
<div class="iso-toolbar">
<button class="iso-btn iso-btn-primary" onclick="showAddBotanical()">+ Add Botanical Item</button>
</div>
`;

if (!data.botanicals.length) {
html += `<div class="iso-empty">No botanical items saved.</div>`;
renderShell("botanicals", html);
return;
}

html += `<div class="iso-grid-auto">`;
data.botanicals.slice().sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
const index = data.botanicals.findIndex(x => x.name === item.name);
html += `
<div class="iso-card clickable" onclick="openBotanical(${index})">
<div class="iso-card-head">
<div>
<h3>${escapeHtml(item.name)}</h3>
<div class="iso-muted">Inventory item</div>
</div>
<span class="iso-badge">${escapeHtml(item.quantity || "—")}</span>
</div>
<div class="iso-meta">
<div><strong>Quantity:</strong> ${escapeHtml(item.quantity || "-")}</div>
<div><strong>Note:</strong> ${escapeHtml(item.note || "-")}</div>
</div>
</div>
`;
});
html += `</div>`;

renderShell("botanicals", html);
}

function showAddBotanical() {
renderShell("botanicals", `
<h2 class="section-title">Add Botanical Item</h2>
<p class="subtext">Save supply items and keep notes with each one.</p>

<div class="iso-grid-2">
<div>
<label>Item Name</label>
<input id="newBotName" class="iso-input" placeholder="Lotus Pods">
</div>
<div>
<label>Quantity</label>
<input id="newBotQty" class="iso-input" placeholder="20 packs, 3 bins, 10 lb">
</div>
</div>

<label>Item Note</label>
<textarea id="newBotNote" class="iso-textarea" placeholder="Any notes about this item..."></textarea>

<div class="actions">
<button class="iso-btn iso-btn-primary" onclick="saveNewBotanical()">Save Item</button>
<button class="iso-btn iso-btn-secondary" onclick="renderBotanicals()">Cancel</button>
</div>
`);
}

function saveNewBotanical() {
const name = document.getElementById("newBotName").value.trim();
if (!name) return alert("Item name is required.");
if (data.botanicals.some(b => b.name.toLowerCase() === name.toLowerCase())) {
return alert("Botanical item name already exists.");
}

const item = {
name,
quantity: document.getElementById("newBotQty").value.trim(),
note: document.getElementById("newBotNote").value.trim()
};

data.botanicals.push(item);

if (!data.botanicalPrices[name]) {
data.botanicalPrices[name] = {
included: true,
section: "Botanicals",
price: "",
priceNote: ""
};
}

refreshOrders();
save();
renderBotanicals();
}

function openBotanical(index) {
const item = data.botanicals[index];
renderShell("botanicals", `
<h2 class="section-title">${escapeHtml(item.name)}</h2>
<p class="subtext">Update quantity and notes any time.</p>

<div class="iso-grid-2">
<div>
<label>Quantity</label>
<input id="editBotQty" class="iso-input" value="${escapeHtml(item.quantity || "")}">
</div>
</div>

<label>Item Note</label>
<textarea id="editBotNote" class="iso-textarea">${escapeHtml(item.note || "")}</textarea>

<div class="actions">
<button class="iso-btn iso-btn-primary" onclick="saveBotanicalEdits(${index})">Save Changes</button>
<button class="iso-btn iso-btn-secondary" onclick="renderBotanicals()">Back</button>
<button class="iso-btn iso-btn-danger" onclick="deleteBotanical(${index})">Delete Item</button>
</div>
`);
}

function saveBotanicalEdits(index) {
const item = data.botanicals[index];
item.quantity = document.getElementById("editBotQty").value.trim();
item.note = document.getElementById("editBotNote").value.trim();
save();
openBotanical(index);
}

function deleteBotanical(index) {
const name = data.botanicals[index].name;
if (!confirm("Delete this botanical item?")) return;

data.botanicals.splice(index, 1);
delete data.botanicalPrices[name];
data.order.botanicals = (data.order.botanicals || []).filter(x => x !== name);
refreshOrders();
save();
renderBotanicals();
}

function renderPrice() {
refreshOrders();

const colonyTypes = data.order.colonyTypes || [];
const botanicalNames = data.order.botanicals || [];
const allSections = [...new Set([...data.sections, ...getUniqueCategories(), "Botanicals"])].filter(Boolean);

let html = `
<h2 class="section-title">Price Sheet</h2>
<p class="subtext">Choose exactly which items appear, assign sections, set pricing, and drag items into the order you want.</p>
<p class="info-note">If a price is left blank, the sheet will display Not Available.</p>

<div class="iso-section-box">
<h3 style="margin-top:0;">Price Sheet Sections</h3>
<div class="iso-section-chips">
${allSections.map(s => `
<span class="iso-chip">
${escapeHtml(s)}
${s !== "Botanicals" ? `<button onclick="deleteSection('${escapeJs(s)}')">✕</button>` : ""}
</span>
`).join("")}
</div>
<div class="iso-toolbar">
<input id="newSectionName" class="iso-input" placeholder="Add new section like Exotic or Mid Tier" style="max-width:320px;margin-bottom:0;">
<button class="iso-btn iso-btn-primary" onclick="addSection()">Add Section</button>
</div>
</div>

<div class="iso-grid-2">
<div>
<label>Sheet Title</label>
<input id="sheetTitle" class="iso-input" value="${escapeHtml(data.settings.businessName || "")}" placeholder="IsoTracker">

<label>Tagline</label>
<input id="sheetTagline" class="iso-input" value="${escapeHtml(data.settings.tagline || "")}" placeholder="Colony Tracker & Price Sheets">

<label>Theme</label>
<select id="sheetTheme" class="iso-select">
<option value="botanical" ${data.settings.theme === "botanical" ? "selected" : ""}>Botanical Premium</option>
<option value="parchment" ${data.settings.theme === "parchment" ? "selected" : ""}>Parchment Expo</option>
<option value="luxe" ${data.settings.theme === "luxe" ? "selected" : ""}>Dark Luxe</option>
</select>

<label>App / Header Logo</label>
<input id="appLogoInput" class="iso-input" type="file" accept="image/*">

<label>Price Sheet Logo</label>
<input id="sheetLogoInput" class="iso-input" type="file" accept="image/*">
</div>

<div>
<label>Banner Text</label>
<input id="sheetBanner" class="iso-input" value="${escapeHtml(data.settings.bannerText || "")}" placeholder="Optional banner text">

<label>Footer Note</label>
<input id="sheetFooter" class="iso-input" value="${escapeHtml(data.settings.footerText || "")}" placeholder="Optional footer note">
</div>
</div>
`;

html += `<div class="iso-builder-group"><h3>Colony Types</h3>`;
if (!colonyTypes.length) {
html += `<div class="iso-empty">No colony types saved.</div>`;
} else {
html += `<div id="colonyBuilder">`;
colonyTypes.forEach(type => {
const sample = data.colonies.find(c => c.type === type);
const defaultSection = sample?.category || "";
const row = data.prices[type] || {
included: true,
section: defaultSection,
price: "",
countLabel: "10ct"
};

html += `
<div class="iso-builder-row" draggable="true" data-kind="colonyTypes" data-name="${escapeHtml(type)}">
<div class="iso-builder-top">
<div class="iso-builder-left">
<span class="iso-drag">☰</span>
<label class="iso-checkline" style="margin:0;">
<input type="checkbox" id="include_${slug(type)}" ${row.included !== false ? "checked" : ""}>
<strong>${escapeHtml(type)}</strong>
</label>
<span class="iso-muted">(${escapeHtml(sample?.category || "Uncategorized")})</span>
</div>
</div>

<div class="iso-grid-3">
<div>
<label>Section</label>
<select id="section_${slug(type)}" class="iso-select">
<option value="">-- Select Section --</option>
${allSections.map(s => `<option value="${escapeHtml(s)}" ${row.section === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
</select>
</div>
<div>
<label>Count / Note</label>
<input id="count_${slug(type)}" class="iso-input" value="${escapeHtml(row.countLabel || "")}" placeholder="10ct">
</div>
<div>
<label>Price</label>
<input id="price_${slug(type)}" class="iso-input" value="${escapeHtml(row.price || "")}" placeholder="$25">
</div>
</div>
</div>
`;
});
html += `</div>`;
}
html += `</div>`;

html += `<div class="iso-builder-group"><h3>Botanicals</h3>`;
if (!botanicalNames.length) {
html += `<div class="iso-empty">No botanical items saved.</div>`;
} else {
html += `<div id="botanicalBuilder">`;
botanicalNames.forEach(name => {
const row = data.botanicalPrices[name] || {
included: true,
section: "Botanicals",
price: "",
priceNote: ""
};

html += `
<div class="iso-builder-row" draggable="true" data-kind="botanicals" data-name="${escapeHtml(name)}">
<div class="iso-builder-top">
<div class="iso-builder-left">
<span class="iso-drag">☰</span>
<label class="iso-checkline" style="margin:0;">
<input type="checkbox" id="botinclude_${slug(name)}" ${row.included !== false ? "checked" : ""}>
<strong>${escapeHtml(name)}</strong>
</label>
</div>
</div>

<div class="iso-grid-3">
<div>
<label>Section</label>
<select id="botsection_${slug(name)}" class="iso-select">
${allSections.map(s => `<option value="${escapeHtml(s)}" ${((row.section || "Botanicals") === s) ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
</select>
</div>
<div>
<label>Note</label>
<input id="botnote_${slug(name)}" class="iso-input" value="${escapeHtml(row.priceNote || "")}" placeholder="1 gallon, 5 pods, 2 lb">
</div>
<div>
<label>Price</label>
<input id="botprice_${slug(name)}" class="iso-input" value="${escapeHtml(row.price || "")}" placeholder="$10">
</div>
</div>
</div>
`;
});
html += `</div>`;
}
html += `</div>`;

html += `
<div class="actions">
<button class="iso-btn iso-btn-primary" onclick="savePriceSheet()">Save Price Sheet</button>
<button class="iso-btn iso-btn-primary" onclick="exportPriceSheetImage()">Export Price Sheet Image</button>
</div>

<div class="iso-preview-wrap">
<div id="priceSheetPreview"></div>
</div>
`;

renderShell("price", html);
wireDragAndDrop();
renderPricePreview();
}

function addSection() {
const input = document.getElementById("newSectionName");
const name = (input?.value || "").trim();
if (!name) return;
if (data.sections.includes(name)) return alert("That section already exists.");
data.sections.push(name);
save();
renderPrice();
}

function deleteSection(name) {
if (name === "Botanicals") {
alert("Botanicals section cannot be removed.");
return;
}

data.sections = data.sections.filter(s => s !== name);

Object.keys(data.prices).forEach(k => {
if (data.prices[k]?.section === name) data.prices[k].section = "";
});

Object.keys(data.botanicalPrices).forEach(k => {
if (data.botanicalPrices[k]?.section === name) data.botanicalPrices[k].section = "Botanicals";
});

save();
renderPrice();
}

function wireDragAndDrop() {
let dragged = null;

document.querySelectorAll(".iso-builder-row[draggable='true']").forEach(row => {
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

function persistBuilderOrder() {
const colonyRows = [...document.querySelectorAll("#colonyBuilder .iso-builder-row")];
const botanicalRows = [...document.querySelectorAll("#botanicalBuilder .iso-builder-row")];
data.order.colonyTypes = colonyRows.map(row => row.dataset.name);
data.order.botanicals = botanicalRows.map(row => row.dataset.name);
save();
renderPricePreview();
}

function savePriceSheet() {
data.settings.businessName = document.getElementById("sheetTitle").value.trim() || "IsoTracker";
data.settings.tagline = document.getElementById("sheetTagline").value.trim() || "";
data.settings.theme = document.getElementById("sheetTheme").value;
data.settings.bannerText = document.getElementById("sheetBanner").value.trim();
data.settings.footerText = document.getElementById("sheetFooter").value.trim();

const appLogoFile = document.getElementById("appLogoInput").files[0];
const sheetLogoFile = document.getElementById("sheetLogoInput").files[0];

(data.order.colonyTypes || []).forEach(type => {
const existing = data.prices[type] || {};
data.prices[type] = {
...existing,
included: document.getElementById(`include_${slug(type)}`)?.checked ?? true,
section: document.getElementById(`section_${slug(type)}`)?.value.trim() || "",
price: document.getElementById(`price_${slug(type)}`)?.value.trim() || "",
countLabel: document.getElementById(`count_${slug(type)}`)?.value.trim() || ""
};
});

(data.order.botanicals || []).forEach(name => {
const existing = data.botanicalPrices[name] || {};
data.botanicalPrices[name] = {
...existing,
included: document.getElementById(`botinclude_${slug(name)}`)?.checked ?? true,
section: document.getElementById(`botsection_${slug(name)}`)?.value.trim() || "Botanicals",
price: document.getElementById(`botprice_${slug(name)}`)?.value.trim() || "",
priceNote: document.getElementById(`botnote_${slug(name)}`)?.value.trim() || ""
};
});

const readers = [];

if (appLogoFile) {
readers.push(new Promise(resolve => {
const reader = new FileReader();
reader.onload = e => {
data.settings.appLogo = e.target.result;
resolve();
};
reader.readAsDataURL(appLogoFile);
}));
}

if (sheetLogoFile) {
readers.push(new Promise(resolve => {
const reader = new FileReader();
reader.onload = e => {
data.settings.sheetLogo = e.target.result;
resolve();
};
reader.readAsDataURL(sheetLogoFile);
}));
}

Promise.all(readers).then(() => {
save();
renderPrice();
});
}

function buildSheetSections() {
const sections = {};

(data.order.colonyTypes || []).forEach(type => {
const row = data.prices[type];
if (!row || row.included === false) return;
const section = row.section || data.colonies.find(c => c.type === type)?.category || "Other";
if (!sections[section]) sections[section] = [];
sections[section].push({
name: type,
note: row.countLabel || "",
price: row.price || "Not Available"
});
});

(data.order.botanicals || []).forEach(name => {
const row = data.botanicalPrices[name];
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

function renderPricePreview() {
const mount = document.getElementById("priceSheetPreview");
if (!mount) return;

const sections = buildSheetSections();
const orderedKeys = [...new Set([...data.sections, ...Object.keys(sections)])].filter(k => sections[k] && sections[k].length);

const themeClass = {
botanical: "iso-theme-botanical",
parchment: "iso-theme-parchment",
luxe: "iso-theme-luxe"
}[data.settings.theme] || "iso-theme-botanical";

const renderItems = items => items.map(item => `
<div class="iso-sheet-item">
<div class="iso-sheet-item-top">
<div class="iso-sheet-item-name">${escapeHtml(item.name)}</div>
<div class="iso-sheet-item-price">${escapeHtml(item.price || "Not Available")}</div>
</div>
${item.note ? `<div class="iso-sheet-item-note">${escapeHtml(item.note)}</div>` : ""}
</div>
`).join("");

mount.innerHTML = `
<div class="iso-sheet ${themeClass}" id="isoSheetExport">
<div class="iso-sheet-header">
<img class="iso-sheet-logo" src="${sheetLogo()}" alt="Logo">
<h1 class="iso-sheet-title">${escapeHtml(data.settings.businessName || "IsoTracker")}</h1>
<div class="iso-sheet-subtitle">${escapeHtml(data.settings.tagline || "Colony Tracker & Price Sheets")}</div>
</div>

${data.settings.bannerText ? `<div class="iso-sheet-banner">${escapeHtml(data.settings.bannerText)}</div>` : ""}

<div class="iso-sheet-body">
${orderedKeys.map(section => `
<div class="iso-sheet-section">
<h3>${escapeHtml(section)}</h3>
<div class="iso-sheet-card-grid">
${renderItems(sections[section])}
</div>
</div>
`).join("") || `<div class="iso-empty">No items selected for this sheet.</div>`}
</div>

${data.settings.footerText ? `<div class="iso-sheet-footer">${escapeHtml(data.settings.footerText)}</div>` : ""}
</div>
`;
}

async function exportPriceSheetImage() {
const el = document.getElementById("isoSheetExport");
if (!el) return alert("No price sheet found to export.");

try {
const canvas = await html2canvas(el, {
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
renderShell("guide", `
<h2 class="section-title">Guide</h2>
<p class="subtext">Everything in IsoTracker explained in one place.</p>

<div class="iso-grid-auto">
<div class="iso-card">
<h3>1. Colonies Tab</h3>
<p class="iso-muted">Add colonies, assign category, track care, and use the quick update buttons. The colony list also works as your husbandry queue.</p>
</div>

<div class="iso-card">
<h3>2. Population Tab</h3>
<p class="iso-muted">See combined totals by type, then open each type to view which colonies make up the total. This helps when you have multiple colonies of the same type.</p>
</div>

<div class="iso-card">
<h3>3. Botanicals Tab</h3>
<p class="iso-muted">Track stock and notes for bark, lotuspods, moss, leaf litter, and similar items.</p>
</div>

<div class="iso-card">
<h3>4. Price Sheet Builder</h3>
<p class="iso-muted">Choose which types and botanicals appear, assign sections, enter pricing, and drag items into the exact order you want.</p>
</div>

<div class="iso-card">
<h3>5. Price Sheet Rules</h3>
<p class="iso-muted">Blank prices show as Not Available.</p>
</div>

<div class="iso-card">
<h3>6. Backup & Restore</h3>
<p class="iso-muted">Use Export Profile Backup to save everything locally. Import that file on another device to restore your setup.</p>
</div>
</div>
`);
}

function exportBackup() {
const blob = new Blob([JSON.stringify(data, null, 2)], {type:"application/json"});
const a = document.createElement("a");
a.href = URL.createObjectURL(blob);
a.download = "isotracker-backup.json";
a.click();
}

function importBackup(e) {
const file = e.target.files[0];
if (!file) return;
const reader = new FileReader();
reader.onload = () => {
try {
data = JSON.parse(reader.result);
refreshOrders();
save();
renderColonies();
} catch {
alert("Backup file could not be imported.");
}
};
reader.readAsText(file);
}

function loadDemoData() {
data = {
colonies: [
{
name: "Red Panda Bin 1",
type: "Red Panda",
category: "Isopods",
population: 300,
dateAdded: "03/15/2026",
lastMisting: "04/03/2026",
lastBotCheck: "04/01/2026",
lastSubCheck: "03/28/2026",
lastFeed: "04/05/2026",
lastUpdated: "04/05/2026",
note: "Breeding well.",
image: ""
},
{
name: "Rubber Ducky Project",
type: "Rubber Ducky",
category: "Isopods",
population: 40,
dateAdded: "12/22/2025",
lastMisting: "03/21/2026",
lastBotCheck: "03/18/2026",
lastSubCheck: "03/12/2026",
lastFeed: "03/19/2026",
lastUpdated: "03/21/2026",
note: "Needs careful monitoring.",
image: ""
},
{
name: "Temperate Springtails Main",
type: "Temperate Springtails",
category: "Springtails",
population: 1200,
dateAdded: "03/11/2026",
lastMisting: "04/06/2026",
lastBotCheck: "04/06/2026",
lastSubCheck: "04/01/2026",
lastFeed: "04/06/2026",
lastUpdated: "04/06/2026",
note: "Great production.",
image: ""
}
],
botanicals: [
{ name: "Leaf Litter", quantity: "12 bags", note: "Oak and mixed hardwood." },
{ name: "Lotus Pods", quantity: "35", note: "Medium size." },
{ name: "Cork Bark", quantity: "18 pieces", note: "Mixed flats and rounds." }
],
prices: {
"Red Panda": { included: true, section: "Mid Tier", price: "$30", countLabel: "10ct" },
"Rubber Ducky": { included: true, section: "Exotic", price: "", countLabel: "6ct" },
"Temperate Springtails": { included: true, section: "Springtails", price: "$15", countLabel: "8oz cup" }
},
botanicalPrices: {
"Leaf Litter": { included: true, section: "Botanicals", price: "$10", priceNote: "1 gallon" },
"Lotus Pods": { included: true, section: "Botanicals", price: "$10", priceNote: "5 pods" },
"Cork Bark": { included: true, section: "Botanicals", price: "$12", priceNote: "per piece" }
},
sections: ["Isopods", "Springtails", "Botanicals", "Beginner", "Mid Tier", "Exotic"],
order: {
colonyTypes: ["Rubber Ducky", "Red Panda", "Temperate Springtails"],
botanicals: ["Leaf Litter", "Lotus Pods", "Cork Bark"]
},
settings: {
appLogo: "",
sheetLogo: "",
businessName: "IsoTracker",
tagline: "Colony Tracker & Price Sheets",
theme: "botanical",
bannerText: "",
footerText: ""
}
};
refreshOrders();
save();
renderColonies();
}

function clearAllData() {
if (!confirm("Clear all saved data?")) return;

data = {
colonies: [],
botanicals: [],
prices: {},
botanicalPrices: {},
sections: ["Isopods", "Springtails", "Botanicals"],
order: {
colonyTypes: [],
botanicals: []
},
settings: {
appLogo: "",
sheetLogo: "",
businessName: "IsoTracker",
tagline: "Colony Tracker & Price Sheets",
theme: "botanical",
bannerText: "",
footerText: ""
}
};

save();
renderColonies();
}

function escapeHtml(str) {
return String(str || "").replace(/[&<>"']/g, m => ({
"&":"&amp;",
"<":"&lt;",
">":"&gt;",
'"':"&quot;",
"'":"&#039;"
}[m]));
}

function escapeJs(str) {
return String(str || "").replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

refreshOrders();
renderColonies();
