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
  type: "all"
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

  function normalizeColony(colony) {
    return {
      colonyName: colony?.colonyName || "",
      typeName: colony?.typeName || "",
      category: colony?.category || "",
      typeImageUri: colony?.typeImageUri || "",
      dateAdded: colony?.dateAdded || todayString(),
      population: Math.max(0, parseInt(colony?.population || "0", 10)),
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

    state.colonies = Array.isArray(state.colonies) ? state.colonies.map(normalizeColony) : [];
state.botanicals = Array.isArray(state.botanicals) ? state.botanicals : [];
state.salePrep = state.salePrep || { packaged: [], materials: [], search: "", category: "all", type: "all" };
state.salePrep.packaged = Array.isArray(state.salePrep.packaged) ? state.salePrep.packaged : [];
state.salePrep.materials = Array.isArray(state.salePrep.materials) ? state.salePrep.materials : [];
state.salePrep.search = state.salePrep.search || "";
state.salePrep.category = state.salePrep.category || "all";
state.salePrep.type = state.salePrep.type || "all";
state.settings.typeThresholds = state.settings.typeThresholds || {};
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
        width:min(680px, 100%);
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
      version: 8,
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

      state.colonies = Array.isArray(state.colonies) ? state.colonies.map(normalizeColony) : [];
      state.salePrep = state.salePrep || { packaged: [] };
state.salePrep.packaged = Array.isArray(state.salePrep.packaged) ? state.salePrep.packaged : [];
state.salePrep.search = state.salePrep.search || "";
state.salePrep.category = state.salePrep.category || "all";
state.salePrep.type = state.salePrep.type || "all";
state.settings.typeThresholds = state.settings.typeThresholds || {};
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
const days = daysSince(c.lastHusbandry);

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
            <div><strong>Population:</strong> ${Number(c.population) || 0}</div>
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

  const colony = normalizeColony({
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
customNote: $("#customNote").value.trim(),
readyForSale: ($("#readyForSale")?.value || "no") === "yes",
sources
  });

  updateLastHusbandry(colony);
  addHistory(colony, "Created colony", `Created colony ${colonyName}.`);

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
            <label>Amount To Move</label>
            <input id="splitColonyPopulation" type="number" min="1" step="1" placeholder="10">
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
    const moveCount = Math.max(0, parseInt($("#splitColonyPopulation")?.value || "0", 10));

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
      alert("Amount to move must be less than the current colony population.");
      return;
    }

    const newColony = normalizeColony({
      colonyName: newName,
      typeName: original.typeName,
      category: original.category,
      typeImageUri: original.typeImageUri,
      dateAdded: todayString(),
      population: moveCount,
      lastMisting: original.lastMisting,
      lastBotanicalsCheck: original.lastBotanicalsCheck,
      lastSubstrateCheck: original.lastSubstrateCheck,
      lastSupplementalFeeding: original.lastSupplementalFeeding,
      lastHusbandry: original.lastHusbandry,
      customNote: original.customNote,
      history: [],
      sources: structuredCloneSafe(original.sources || [])
    });

    original.population = Math.max(0, Number(original.population || 0) - moveCount);

    addHistory(original, "Split colony", `Created "${newName}" and moved ${moveCount}.`);
    addHistory(newColony, "Created by split", `Split from "${original.colonyName}" with ${moveCount}.`);

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

    app(`
      <h2 class="iso-section-title">${esc(c.colonyName)}</h2>
      <p class="iso-subtext">${esc(c.typeName)}</p>

      ${c.typeImageUri ? `<img class="iso-thumb" src="${c.typeImageUri}" alt="">` : ""}

      <div class="iso-meta" style="margin-bottom:14px">
        <div><strong>Category:</strong> ${esc(c.category || "-")}</div>
        <div><strong>Date Added:</strong> ${c.dateAdded || "-"}</div>
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
    if (!category) return alert("Category is required.");

    const oldNote = c.customNote || "";
    const newNote = $("#editNote").value.trim();

    c.population = Math.max(0, parseInt($("#editPopulation").value || "0", 10));
    c.category = category;
    c.lastMisting = $("#editMisting").value.trim();
    c.lastBotanicalsCheck = $("#editBotanicals").value.trim();
    c.lastSubstrateCheck = $("#editSubstrate").value.trim();
    c.lastSupplementalFeeding = $("#editFeeding").value.trim();
c.customNote = newNote;
c.readyForSale = ($("#editReadyForSale")?.value || "no") === "yes";
updateLastHusbandry(c);

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
      <p class="iso-subtext">Choose exactly which colony types and botanicals appear, organize them into sections, and drag items into the order you want.</p>
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

function renderSalePrep() {
  const prepSearch = (state.salePrep.search || "").trim().toLowerCase();
const prepCategory = state.salePrep.category || "all";
const prepType = state.salePrep.type || "all";

const eligibleColonies = state.colonies
  .filter(colony => colony.readyForSale === true)
  .filter(colony => {
    const hay = `${colony.colonyName || ""} ${colony.typeName || ""}`.toLowerCase();

    if (prepSearch && !hay.includes(prepSearch)) return false;
    if (prepCategory !== "all" && (colony.category || "") !== prepCategory) return false;
    if (prepType !== "all" && (colony.typeName || "") !== prepType) return false;

    return true;
  })
  .slice()
  .sort((a, b) => a.colonyName.localeCompare(b.colonyName));

  let html = `
    <h2 class="iso-section-title">For Sale Prep</h2>
    <p class="iso-subtext">Prep inventory by subtracting from colony counts and moving it into packaged stock.</p>
  `;
  
  const prepCategories = uniqueCategories();
const prepTypes = uniqueTypes();

html += `
  <div class="iso-form-grid" style="margin-bottom:14px;">
    <div>
      <label>Search</label>
      <input id="prepSearch" placeholder="Search colony or type" value="${esc(state.salePrep.search || "")}">
    </div>
    <div>
      <label>Category</label>
      <select id="prepCategoryFilter">
        <option value="all"${(state.salePrep.category || "all") === "all" ? " selected" : ""}>All Categories</option>
        ${prepCategories.map(cat => `<option value="${esc(cat)}"${state.salePrep.category === cat ? " selected" : ""}>${esc(cat)}</option>`).join("")}
      </select>
    </div>
    <div>
      <label>Type</label>
      <select id="prepTypeFilter">
        <option value="all"${(state.salePrep.type || "all") === "all" ? " selected" : ""}>All Types</option>
        ${prepTypes.map(type => `<option value="${esc(type)}"${state.salePrep.type === type ? " selected" : ""}>${esc(type)}</option>`).join("")}
      </select>
    </div>
  </div>
`;

  if (!eligibleColonies.length) {
    html += `<div class="iso-empty">No colonies available for sale prep yet.</div>`;
    app(html);
    return;
  }

  html += `<div class="iso-grid">`;

  eligibleColonies.forEach((colony, index) => {
    html += `
      <div class="iso-card">
        <div class="iso-card-head">
          <div>
            <h3 class="iso-card-title">${esc(colony.colonyName)}</h3>
            <div class="iso-muted">${esc(colony.typeName)}</div>
          </div>
        </div>

        <div class="iso-meta">
          <div><strong>Available Population:</strong> ${Number(colony.population) || 0}</div>
        </div>

        <div class="iso-form-grid" style="margin-top:12px;">
          <div>
            <label>Pack Count</label>
            <input id="prepCount_${index}" type="number" min="1" step="1" placeholder="10">
          </div>
          <div>
            <label>How Many Packs</label>
            <input id="prepPacks_${index}" type="number" min="1" step="1" value="1">
          </div>
        </div>

        <div class="iso-actions">
          <button class="iso-btn iso-btn-primary" data-prep-index="${index}">Prep For Sale</button>
        </div>
      </div>
    `;
  });

  html += `</div>`;

  const packaged = state.salePrep.packaged || [];
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
            <strong>${esc(item.colonyName)}</strong> — ${esc(item.typeName)} — ${item.packs} pack(s) of ${item.packCount}
          </div>
          <div class="iso-actions" style="margin-top:8px;">
            <button class="iso-btn iso-btn-danger" data-delete-packaged="${i}">Delete Packaged Entry</button>
          </div>
        </div>
      `;
    });
    html += `</div>`;
  }

  app(html);

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

$all("[data-delete-packaged]").forEach(btn => {
  btn.onclick = () => deletePackagedEntry(Number(btn.dataset.deletePackaged));
});
}

async function prepColonyForSale(index) {
  const colony = state.colonies[index];
  if (!colony) return;

  const packCount = Math.max(1, parseInt($(`#prepCount_${index}`)?.value || "0", 10));
  const packs = Math.max(1, parseInt($(`#prepPacks_${index}`)?.value || "1", 10));
  const totalToRemove = packCount * packs;

  if (!packCount || packCount <= 0) {
    alert("Enter a valid pack count.");
    return;
  }

  if (totalToRemove > Number(colony.population || 0)) {
    alert("Not enough population in this colony.");
    return;
  }

  colony.population = Math.max(0, Number(colony.population || 0) - totalToRemove);

  state.salePrep.packaged.push({
    colonyName: colony.colonyName,
    typeName: colony.typeName,
    packCount,
    packs,
    totalRemoved: totalToRemove,
    datePacked: todayString()
  });

  addHistory(colony, "Prepared for sale", `Prepared ${packs} pack(s) of ${packCount}, removed ${totalToRemove} total.`);

  await saveState();
  renderSalePrep();
}

async function deletePackagedEntry(index) {
  const item = state.salePrep.packaged[index];
  if (!item) return;

  if (!confirm("Delete this packaged entry? This will not restore colony counts automatically.")) return;

  state.salePrep.packaged.splice(index, 1);
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
          <p>Use the Colonies tab to save each bin or project. Add a colony name, type name, category, population, care dates, and notes.</p>
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
          <p>The Botanicals tab tracks stock and notes only. Pricing for botanicals is handled inside the Price Sheet tab.</p>
          <div class="iso-guide-visual">
            <img src="${CONFIG.guideBotanicals || "/assets/images/isotracker/guide-botanicals.jpg"}" alt="Botanicals screen">
          </div>
        </div>

        <div class="iso-guide-card">
          <h3>5. Build the Price Sheet</h3>
          <p>Choose which colony types and botanicals to include. Assign sections, add count notes and prices, then drag items into the exact order you want.</p>
          <div class="iso-guide-visual">
            <img src="${CONFIG.guidePriceSheet || "/assets/images/isotracker/guide-price-sheet.jpg"}" alt="Price sheet builder screen">
          </div>
        </div>

        <div class="iso-guide-card">
          <h3>6. Settings Tab</h3>
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
  search: "",
  category: "all",
  type: "all"
};
    colonyFilters.search = "";
    colonyFilters.category = "all";
    colonyFilters.status = "all";
    colonyFilters.source = "all";

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