(function () {
  "use strict";

  const ORGANISM_TYPES = ["Isopod", "Springtail", "Millipede", "Beetle", "Roach", "Other"];

  const ORGANISM_GROUPS = {
    Isopod: ["Armadillidium", "Porcellio", "Cubaris", "Porcellionides", "Ardentiella", "Troglodillo", "Other"],
    Springtail: ["Tropical Springtail", "Temperate Springtail", "Orange Springtail", "White Springtail", "Coecobrya", "Folsomia", "Sinella", "Other Springtail"],
    Millipede: ["Narceus", "Bumblebee Millipede", "Ivory Millipede", "Scarlet Millipede", "Other Millipede"],
    Beetle: ["Asbolus", "Blue Death Feigning Beetle", "Darkling Beetle", "Flower Beetle", "Other Beetle"],
    Roach: ["Dubia Roach", "Hissing Roach", "Surinam Roach", "Cleaner Roach", "Other Roach"],
    Other: ["Bioactive Invertebrate", "Cleanup Crew", "Other"]
  };

  const GENUS = Array.from(new Set(Object.values(ORGANISM_GROUPS).flat()));

  let allIsopods = [];

  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  function $all(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalize(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w\s-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function words(value) {
    return normalize(value).split(" ").filter(Boolean);
  }

  function statusClass(status) {
    const s = String(status || "pending").toLowerCase();
    if (s === "verified") return "status-verified";
    if (s === "contested") return "status-contested";
    return "status-pending";
  }

  function statusLabel(status) {
    const s = String(status || "pending").toLowerCase();
    if (s === "verified") return "Verified";
    if (s === "contested") return "Contested";
    return "Pending Verification";
  }

  function page() {
    return document.body.getAttribute("data-page") || "home";
  }

  function setMessage(el, message, type) {
    if (!el) return;
    el.className = "notice " + (type || "");
    el.textContent = message || "";
    el.hidden = !message;
  }

  function getQueryParam(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  function tagsArray(item) {
    if (Array.isArray(item.tags)) return item.tags;
    return String(item.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
  }

  function organismType(item) {
    const type = String((item && item.organismType) || "Isopod").trim();
    return ORGANISM_TYPES.includes(type) ? type : "Isopod";
  }

  function groupLabelForType(type) {
    return type === "Isopod" ? "Genus" : "Genus / Group";
  }

  function entryWord(item) {
    const type = organismType(item);
    return type === "Isopod" ? "isopod" : type.toLowerCase();
  }

  const CARE_FIELDS = [
    { label: "Difficulty", key: "difficulty", legacy: "careDifficulty", aliases: ["Care Difficulty", "Isopod Basic Care Knowledge Level"] },
    { label: "Temperature", key: "temperature", legacy: "careTemperature", aliases: ["Temperature Range", "Preferred Temperatures", "Isopod Preferred Temperatures"] },
    { label: "Humidity", key: "humidity", legacy: "careHumidity", aliases: ["Humidity Level", "Preferred Humidity", "Isopod Preferred Humidity"] },
    { label: "Substrate Moisture", key: "substrateMoisture", legacy: "careSubstrateMoisture", aliases: ["Substrate Humidity", "Preferred Substrate Humidity", "Isopod Preferred Substrate Humidity"] },
    { label: "Ventilation", key: "ventilation", legacy: "careVentilation", aliases: ["Preferred Ventilation"] },
    { label: "Favorite Foods / Diet", key: "foods", legacy: "careFoods", aliases: ["Favorite Foods", "Diet", "Food"] },
    { label: "Protein Needs", key: "protein", legacy: "careProtein", aliases: ["Protein", "Protein Level"] },
    { label: "Calcium Needs", key: "calcium", legacy: "careCalcium", aliases: ["Calcium", "Calcium Sources"] },
    { label: "Breeding Notes", key: "breeding", legacy: "careBreeding", aliases: ["Breeding", "Breeding Speed"] },
    { label: "Special Notes", key: "notes", legacy: "careNotes", aliases: ["Notes", "Additional Notes"] }
  ];

  function careFieldValue(item, field) {
    if (!item) return "";
    const care = item.care && typeof item.care === "object" ? item.care : {};
    const direct = String(item[field.legacy] || care[field.key] || "").trim();
    return direct || legacyCareValue(item, field);
  }

  function legacyCareValue(item, wantedField) {
    const text = careSummaryText(item).replace(/\s+/g, " ").trim();
    if (!text) return "";

    const matches = [];
    const lower = text.toLowerCase();

    CARE_FIELDS.forEach((field) => {
      [field.label].concat(field.aliases || []).forEach((label) => {
        const target = String(label).toLowerCase() + ":";
        let start = lower.indexOf(target);
        while (start !== -1) {
          matches.push({ start, valueStart: start + target.length, field });
          start = lower.indexOf(target, start + 1);
        }
      });
    });

    matches.sort((a, b) => a.start - b.start || b.valueStart - a.valueStart);
    const match = matches.find((m) => m.field === wantedField);
    if (!match) return "";

    const next = matches.find((m) => m.start > match.valueStart);
    return text.slice(match.valueStart, next ? next.start : text.length)
      .replace(/^[-–—\s]+/, "")
      .replace(/[.;,\s]+$/, "")
      .trim();
  }

  function careSummaryText(item) {
    if (!item) return "";
    const care = item.care && typeof item.care === "object" ? item.care : {};
    return String(item.careGuide || care.summary || "").trim();
  }

  function getCareSearchText(item) {
    return CARE_FIELDS.map((field) => careFieldValue(item, field)).concat(careSummaryText(item)).join(" ");
  }

  function renderCareGuideHtml(item) {
    const rows = CARE_FIELDS
      .map((field) => ({ label: field.label, value: careFieldValue(item, field) }))
      .filter((row) => row.value);

    const summary = careSummaryText(item);

    if (!rows.length && !summary) {
      return `<p>No care guide available.</p>`;
    }

    if (!rows.length && summary) {
      return `<p class="preline">${escapeHtml(summary)}</p>`;
    }

    return `
      <div class="care-grid">
        ${rows.map((row) => `
          <article class="care-item">
            <span class="care-label">${escapeHtml(row.label)}</span>
            <p class="care-value">${escapeHtml(row.value)}</p>
          </article>
        `).join("")}
      </div>
      ${summary && rows.length < 4 ? `<p class="care-legacy-note preline">${escapeHtml(summary)}</p>` : ""}
    `;
  }

  function extractDriveFileId(url) {
    const text = String(url || "");
    let match = text.match(/[?&]id=([^&#]+)/);
    if (match) return decodeURIComponent(match[1]);
    match = text.match(/\/d\/([^/]+)/);
    if (match) return decodeURIComponent(match[1]);
    return "";
  }

  function displayImageUrl(item) {
    const raw = String((item && item.imageUrl) || "").trim();
    const fileId = String((item && (item.imageDriveFileId || item.driveFileId)) || "").trim() || extractDriveFileId(raw);

    // Google Drive's older uc?export=view links often fail inside <img> tags.
    // The thumbnail endpoint is much more reliable for public/shared Drive images.
    if (fileId) {
      return "https://drive.google.com/thumbnail?id=" + encodeURIComponent(fileId) + "&sz=w1200";
    }

    return raw || "assets/placeholder.svg";
  }

  function imageFallbackAttr() {
    return "onerror=\"this.onerror=null;this.src='assets/placeholder.svg';\"";
  }


  function profileUrl(userId) {
    return "profile.html?id=" + encodeURIComponent(String(userId || ""));
  }

  function profileCreditHtml(userId, displayName, fallback) {
    const name = String(displayName || fallback || "").trim();
    if (!name) return escapeHtml(fallback || "Anonymous Member");
    if (!userId || name === "Anonymous Member" || name === "Waiting for verification") {
      return escapeHtml(name);
    }
    return `<a class="profile-credit-link" href="${profileUrl(userId)}">${escapeHtml(name)}</a>`;
  }

  function safeExternalLink(url, label) {
    const clean = String(url || "").trim();
    if (!clean) return "";
    if (!/^https?:\/\//i.test(clean)) return "";
    return `<a class="button" href="${escapeHtml(clean)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  }

  function apiConfigured() {
    const cfg = window.ISOPEDIA_CONFIG || {};
    return !!(cfg.API_URL && !cfg.API_URL.includes("PASTE_YOUR"));
  }

  async function loadIsopods() {
    const cfg = window.ISOPEDIA_CONFIG || {};
    const dataUrl = cfg.DATA_URL || "data/isopods.json";

    // During setup/testing, this lets the public pages show current Google Sheet data immediately.
    // Later, set USE_LIVE_API_DATA to false in assets/config.js after GitHub JSON publishing is working.
    if (cfg.USE_LIVE_API_DATA && apiConfigured()) {
      try {
        const data = await IsopediaAPI.publicApi("publicIsopods");
        allIsopods = data.isopods || [];
        return allIsopods;
      } catch (apiErr) {
        console.warn("Live API entry load failed, falling back to static JSON:", apiErr);
      }
    }

    try {
      const res = await fetch(dataUrl + "?v=" + Date.now());
      if (!res.ok) throw new Error("Could not load static JSON.");
      allIsopods = await res.json();
      if (!Array.isArray(allIsopods)) allIsopods = [];
      return allIsopods;
    } catch (staticErr) {
      if (apiConfigured()) {
        try {
          const data = await IsopediaAPI.publicApi("publicIsopods");
          allIsopods = data.isopods || [];
          return allIsopods;
        } catch (apiErr) {
          console.warn(apiErr);
        }
      }
      allIsopods = [];
      return allIsopods;
    }
  }

  async function loadDonators() {
    const cfg = window.ISOPEDIA_CONFIG || {};
    const dataUrl = cfg.DONATORS_URL || "data/donators.json";

    if (cfg.USE_LIVE_API_DATA && apiConfigured()) {
      try {
        const data = await IsopediaAPI.publicApi("publicDonators");
        return data.donators || [];
      } catch (apiErr) {
        console.warn("Live API donator load failed, falling back to static JSON:", apiErr);
      }
    }

    try {
      const res = await fetch(dataUrl + "?v=" + Date.now());
      if (!res.ok) throw new Error("Could not load donators JSON.");
      const list = await res.json();
      return Array.isArray(list) ? list : [];
    } catch (staticErr) {
      if (apiConfigured()) {
        try {
          const data = await IsopediaAPI.publicApi("publicDonators");
          return data.donators || [];
        } catch (apiErr) {
          console.warn(apiErr);
        }
      }
      return [];
    }
  }

  function buildSearchText(item) {
    return normalize([
      item.speciesName,
      organismType(item),
      item.genus,
      tagsArray(item).join(" "),
      item.origin,
      item.basicDescription,
      getCareSearchText(item)
    ].join(" "));
  }

  function scoreItem(item, query) {
    const q = normalize(query);
    if (!q) return 1;

    const queryWords = words(q);
    const name = normalize(item.speciesName);
    const type = normalize(organismType(item));
    const genus = normalize(item.genus);
    const tags = tagsArray(item).map(normalize);
    const origin = normalize(item.origin);
    const desc = normalize(item.basicDescription + " " + getCareSearchText(item));
    const full = buildSearchText(item);

    let score = 0;

    if (name === q) score += 1000;
    if (tags.some((t) => t === q)) score += 900;
    if (name.includes(q)) score += 600;
    if (tags.some((t) => t.includes(q))) score += 550;
    if (type.includes(q)) score += 400;
    if (genus.includes(q)) score += 350;
    if (origin.includes(q)) score += 150;
    if (desc.includes(q)) score += 75;

    queryWords.forEach((w) => {
      if (!w) return;
      if (name.includes(w)) score += 90;
      if (tags.some((t) => t.includes(w))) score += 80;
      if (type.includes(w)) score += 45;
      if (genus.includes(w)) score += 30;
      if (full.includes(w)) score += 10;
    });

    // Light fuzzy support for plural/singular hobby names.
    if (q.endsWith("ies")) {
      const singularY = q.slice(0, -3) + "y";
      if (full.includes(singularY)) score += 80;
    }
    if (q.endsWith("s")) {
      const singular = q.slice(0, -1);
      if (full.includes(singular)) score += 60;
    }

    return score;
  }

  function searchIsopods(query, genus, activeType) {
    return allIsopods
      .map((item) => ({ item, score: scoreItem(item, query) }))
      .filter(({ item, score }) => {
        const typeOk = !activeType || activeType === "All" || organismType(item) === activeType;
        const genusOk = !genus || genus === "All" || item.genus === genus;
        const queryOk = !query || score > 0;
        return typeOk && genusOk && queryOk;
      })
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        return String(a.item.speciesName || "").localeCompare(String(b.item.speciesName || ""));
      })
      .map(({ item }) => item);
  }

  function cardHtml(item) {
    const tags = tagsArray(item);
    const tagsHtml = tags.slice(0, 4).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("");
    const img = displayImageUrl(item);
    return `
      <article class="iso-card ${String(item.status).toLowerCase() !== "verified" ? "card-highlight" : ""}">
        <a class="iso-card-link" href="species.html?id=${encodeURIComponent(item.id)}" aria-label="View ${escapeHtml(item.speciesName)}">
          <img class="iso-thumb" src="${escapeHtml(img)}" alt="${escapeHtml(item.speciesName)}" loading="lazy" ${imageFallbackAttr()}>
          <div class="iso-card-body">
            <div class="card-topline">
              <span class="badge ${statusClass(item.status)}">${statusLabel(item.status)}</span>
              <span class="type-pill">${escapeHtml(organismType(item))}</span>
              <span class="genus-pill">${escapeHtml(item.genus || "Other")}</span>
            </div>
            <h3>${escapeHtml(item.speciesName || "Unnamed Entry")}</h3>
            <p>${escapeHtml(item.basicDescription || "No description available.").slice(0, 180)}${String(item.basicDescription || "").length > 180 ? "..." : ""}</p>
            <div class="tag-row">${tagsHtml}</div>
          </div>
        </a>
      </article>
    `;
  }

  function renderCards(items, container) {
    if (!container) return;
    if (!items.length) {
      container.innerHTML = `
        <div class="empty-state">
          <h3>No entries found</h3>
          <p>Try another search term, browse by category/group, or add a new entry.</p>
        </div>
      `;
      return;
    }
    container.innerHTML = items.map(cardHtml).join("");
  }

  function updateNavForUser(user) {
    const accountLink = $("#accountLink");
    const loginLink = $("#loginLink");
    const verifyLink = $("#verifyLink");

    if (user) {
      if (accountLink) {
        accountLink.textContent = user.username;
        accountLink.href = "account.html";
      }
      if (loginLink) {
        loginLink.textContent = "Log Out";
        loginLink.href = "#logout";
        loginLink.addEventListener("click", async (event) => {
          event.preventDefault();
          await IsopediaAPI.logout();
          window.location.href = "index.html";
        }, { once: true });
      }
      if (verifyLink) verifyLink.hidden = false;
    } else {
      if (accountLink) {
        accountLink.textContent = "Account";
        accountLink.href = "login.html";
      }
      if (loginLink) {
        loginLink.textContent = "Log In";
        loginLink.href = "login.html";
      }
      if (verifyLink) verifyLink.hidden = true;
    }
  }

  function setupOrganismButtons() {
    const wrap = $("#organismButtons");
    if (!wrap) return;
    wrap.innerHTML = ["All"].concat(ORGANISM_TYPES).map((type) => `
      <button class="organism-btn" data-type="${escapeHtml(type)}">${escapeHtml(type)}</button>
    `).join("");
  }

  function setupGenusButtons(activeType) {
    const wrap = $("#genusButtons");
    if (!wrap) return;
    const groups = activeType && activeType !== "All"
      ? (ORGANISM_GROUPS[activeType] || ["Other"])
      : GENUS;
    wrap.innerHTML = ["All"].concat(groups).map((g) => `
      <button class="genus-btn" data-genus="${escapeHtml(g)}">${escapeHtml(g)}</button>
    `).join("");
  }

  function attachHomeSearch() {
    const searchInput = $("#searchInput");
    const resultGrid = $("#resultGrid");
    const activeGenusLabel = $("#activeGenusLabel");
    const genusHelp = $("#genusHelp");
    let activeType = "All";
    let activeGenus = "All";

    function refreshGroupButtons() {
      setupGenusButtons(activeType);
      $all(".genus-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          activeGenus = btn.getAttribute("data-genus") || "All";
          $all(".genus-btn").forEach((b) => b.classList.remove("active"));
          btn.classList.add("active");
          runSearch();
        });
      });
      const allBtn = $('.genus-btn[data-genus="All"]');
      if (allBtn) allBtn.classList.add("active");
    }

    function runSearch() {
      const query = searchInput ? searchInput.value : "";
      const items = searchIsopods(query, activeGenus, activeType);
      renderCards(items, resultGrid);
      if (activeGenusLabel) {
        const typeText = activeType === "All" ? "All Entries" : activeType + " Entries";
        activeGenusLabel.textContent = activeGenus === "All" ? typeText : activeType + " · " + activeGenus;
      }
      if (genusHelp) {
        genusHelp.textContent = activeType === "All"
          ? "Choose an organism type first, or browse all groups below."
          : "Browse " + activeType.toLowerCase() + " groups.";
      }
    }

    if (searchInput) {
      searchInput.addEventListener("input", runSearch);
    }

    $all(".organism-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeType = btn.getAttribute("data-type") || "All";
        activeGenus = "All";
        $all(".organism-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        refreshGroupButtons();
        runSearch();
      });
    });

    const startType = getQueryParam("type");
    const startGenus = getQueryParam("genus");
    if (startType && ORGANISM_TYPES.includes(startType)) activeType = startType;
    const typeBtn = $(`.organism-btn[data-type="${CSS.escape(activeType)}"]`);
    if (typeBtn) typeBtn.classList.add("active");
    else {
      const allTypeBtn = $('.organism-btn[data-type="All"]');
      if (allTypeBtn) allTypeBtn.classList.add("active");
    }

    refreshGroupButtons();

    if (startGenus && GENUS.includes(startGenus)) {
      activeGenus = startGenus;
      const btn = $(`.genus-btn[data-genus="${CSS.escape(startGenus)}"]`);
      if (btn) {
        $all(".genus-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
      }
    }

    runSearch();
  }

  function renderStats() {
    const total = $("#statTotal");
    const verified = $("#statVerified");
    const pending = $("#statPending");
    if (total) total.textContent = allIsopods.length;
    if (verified) verified.textContent = allIsopods.filter((i) => String(i.status).toLowerCase() === "verified").length;
    if (pending) pending.textContent = allIsopods.filter((i) => String(i.status).toLowerCase() !== "verified").length;
  }

  async function initHome() {
    setupOrganismButtons();
    setupGenusButtons("All");
    await loadIsopods();
    renderStats();
    attachHomeSearch();

    const recentGrid = $("#recentGrid");
    if (recentGrid) {
      const recent = allIsopods.slice().sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))).slice(0, 6);
      renderCards(recent, recentGrid);
    }
  }

  function publicPhotosForItem(item) {
    const photos = Array.isArray(item.photos) ? item.photos.slice() : [];
    if (!photos.length) {
      photos.push({
        photoId: "primary_" + (item.id || item.isopodId || ""),
        isopodId: item.id || item.isopodId || "",
        imageUrl: item.imageUrl,
        imageDriveFileId: item.imageDriveFileId,
        uploadedByName: item.contributorName || "Anonymous Member",
        uploadedByUserId: item.contributorUserId || "",
        isPrimary: true
      });
    }
    return photos;
  }

  function photoGalleryHtml(item, user) {
    const photos = publicPhotosForItem(item);
    const isAdmin = user && user.role === "admin";

    return `
      <section class="content-card">
        <div class="section-head dark photo-section-head">
          <div>
            <h2>Photo Gallery</h2>
            <p class="muted">Photos are credited to the member who uploaded them unless they chose to stay anonymous.</p>
          </div>
          <span class="genus-pill">${photos.length} photo${photos.length === 1 ? "" : "s"}</span>
        </div>
        <div class="photo-gallery">
          ${photos.map((photo, index) => `
            <article class="photo-card">
              <button class="photo-preview-btn" type="button" data-photo-preview="${escapeHtml(String(index))}" aria-label="View photo ${index + 1}">
                <img src="${escapeHtml(displayImageUrl(photo))}" alt="${escapeHtml(item.speciesName || "Entry photo")}" ${imageFallbackAttr()}>
              </button>
              <div class="photo-card-body">
                <p><strong>${photo.isPrimary ? "Primary photo" : "Additional photo"}</strong></p>
                <p class="muted">Uploaded by ${profileCreditHtml(photo.uploadedByUserId, photo.uploadedByName, "Anonymous Member")}</p>
                ${photo.uploadedAt ? `<p class="muted">${escapeHtml(String(photo.uploadedAt).slice(0, 10))}</p>` : ""}
                ${isAdmin && !photo.isPrimary && photo.photoId ? `
                  <button class="button danger small-button" type="button" data-delete-photo-id="${escapeHtml(photo.photoId)}">
                    Delete Photo
                  </button>
                ` : ""}
              </div>
            </article>
          `).join("")}
        </div>
      </section>
    `;
  }

  function uploadPhotoPanelHtml(item, user) {
    if (!user) {
      return `
        <section class="content-card">
          <h2>Add a Photo</h2>
          <p>Logged-in members can upload additional photos for this entry. Photos must be attached to an existing entry and are credited to the uploader.</p>
          <div class="photo-rights-note">
            <strong>Photo notice:</strong> Photos should be your own or shared with permission. Uploaded photos may be used by Crested Critters for Isopedia and other Crested Critters educational, promotional, or project-related uses.
          </div>
          <a class="button primary" href="login.html?next=${encodeURIComponent(location.href)}">Log in to Add a Photo</a>
        </section>
      `;
    }

    return `
      <section class="content-card">
        <h2>Add a Photo</h2>
        <p>Upload another clear photo for this entry. Please only add useful, accurate photos that help the hobby. Admins may remove duplicate, low-quality, or unrelated photos.</p>
        <div class="photo-rights-note">
          <strong>Photo notice:</strong> Upload only photos you personally took or have clear permission to share. Do not upload photos copied from other keepers, sellers, social media, websites, or search results. By uploading, you allow Crested Critters to use the photo for Isopedia and other Crested Critters educational, promotional, or project-related uses.
        </div>
        <form id="photoUploadForm" class="form-grid photo-upload-form">
          <input type="hidden" name="isopodId" value="${escapeHtml(item.id || item.isopodId || "")}">
          <label>
            Photo
            <input name="photo" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required>
          </label>
          <label class="check-row">
            <input name="photoPublicOptIn" type="checkbox" checked>
            List my name publicly as the photo contributor
          </label>
          <label>
            Photo Contributor Display Name
            <input name="photoPublicName" type="text" value="${escapeHtml(user.publicDisplayName || user.username || "")}" placeholder="Name to show for this photo">
          </label>
          <label>
            Notes for admin / viewers, optional
            <textarea name="notes" placeholder="Example: Adult male, natural light photo, captive-bred colony."></textarea>
          </label>
          <button class="button primary submit-wide" type="submit">Upload Photo</button>
        </form>
        <p id="photoUploadNotice" class="notice" hidden></p>
      </section>
    `;
  }

  function photoLightboxHtml() {
    return `
      <div id="photoLightbox" class="modal-backdrop" hidden>
        <div class="modal-panel photo-lightbox-panel" role="dialog" aria-modal="true" aria-label="Isopedia photo preview">
          <button id="photoLightboxClose" class="modal-close" type="button" aria-label="Close photo preview">×</button>
          <img id="photoLightboxImage" class="photo-lightbox-image" src="assets/placeholder.svg" alt="Expanded entry photo">
        </div>
      </div>
    `;
  }

  async function initSpecies() {
    await loadIsopods();
    const id = getQueryParam("id");
    const item = allIsopods.find((i) => String(i.id) === String(id));
    const root = $("#speciesRoot");
    let user = IsopediaAPI.getUser();
    if (!user && IsopediaAPI.getToken && IsopediaAPI.getToken()) {
      user = await IsopediaAPI.refreshMe();
    }

    if (!item) {
      root.innerHTML = `
        <div class="empty-state">
          <h2>Entry not found</h2>
          <p>This entry may not exist yet or the public JSON has not been published.</p>
          <a class="button primary" href="index.html">Back to Isopedia</a>
        </div>
      `;
      return;
    }

    document.title = item.speciesName + " | Isopedia";
    const tags = tagsArray(item);
    const photos = publicPhotosForItem(item);
    const primaryPhoto = photos[0] || item;
    const img = displayImageUrl(primaryPhoto);

    root.innerHTML = `
      <section class="species-hero ${String(item.status).toLowerCase() !== "verified" ? "card-highlight" : ""}">
        <img class="species-image" src="${escapeHtml(img)}" alt="${escapeHtml(item.speciesName)}" ${imageFallbackAttr()}>
        <div>
          <div class="card-topline">
            <span class="badge ${statusClass(item.status)}">${statusLabel(item.status)}</span>
            <span class="type-pill">${escapeHtml(organismType(item))}</span>
            <span class="genus-pill">${escapeHtml(item.genus || "Other")}</span>
          </div>
          <h1>${escapeHtml(item.speciesName)}</h1>
          <p class="muted">Origin: ${escapeHtml(item.origin || "Unknown")}</p>
          <div class="tag-row large">
            ${tags.length ? tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("") : `<span class="muted">No tags listed yet.</span>`}
          </div>
        </div>
      </section>

      ${photoGalleryHtml(item, user)}

      <section class="content-card">
        <h2>Basic Description</h2>
        <p>${escapeHtml(item.basicDescription || "No description available.")}</p>
      </section>

      <section class="content-card">
        <h2>Care Guide</h2>
        ${renderCareGuideHtml(item)}
      </section>

      <section class="content-card two-col">
        <div>
          <h2>Credit</h2>
          <p><strong>Contributor:</strong> ${profileCreditHtml(item.contributorUserId, item.contributorName, "Anonymous Member")}</p>
          <p><strong>Verified by:</strong> ${profileCreditHtml(item.verifierUserId, item.verifierName || (String(item.status).toLowerCase() === "verified" ? "Anonymous Member" : "Waiting for verification"), "Waiting for verification")}</p>
        </div>
        <div>
          <h2>Community Review</h2>
          <p>Logged-in members can dispute or suggest a correction if something looks inaccurate.</p>
          <button class="button warning" id="openDisputeBtn">Contest / Suggest Correction</button>
        </div>
      </section>

      ${uploadPhotoPanelHtml(item, user)}
      ${photoLightboxHtml()}
    `;

    $("#openDisputeBtn").addEventListener("click", () => openDisputeDialog(item));
    initPhotoGalleryHandlers(item, user);
  }

  function initPhotoGalleryHandlers(item, user) {
    const lightbox = $("#photoLightbox");
    const lightboxImg = $("#photoLightboxImage");
    const lightboxClose = $("#photoLightboxClose");
    const photos = publicPhotosForItem(item);

    function closeLightbox() {
      if (!lightbox) return;
      lightbox.hidden = true;
      lightbox.classList.remove("open");
      document.body.classList.remove("modal-open");
    }

    $all("[data-photo-preview]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const index = Number(btn.getAttribute("data-photo-preview") || 0);
        const photo = photos[index] || photos[0] || item;
        if (lightboxImg) lightboxImg.src = displayImageUrl(photo);
        if (lightbox) {
          lightbox.hidden = false;
          lightbox.classList.add("open");
          document.body.classList.add("modal-open");
        }
      });
    });

    if (lightboxClose) lightboxClose.addEventListener("click", closeLightbox);
    if (lightbox) lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) closeLightbox();
    });

    $all("[data-delete-photo-id]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!user || user.role !== "admin") return;
        const photoId = btn.getAttribute("data-delete-photo-id");
        if (!confirm("Delete this photo from the public gallery and move the Drive file to trash?")) return;
        btn.disabled = true;
        btn.textContent = "Deleting...";
        try {
          await IsopediaAPI.apiCall("deleteIsopodPhoto", { photoId, deleteDriveFile: true });
          alert("Photo deleted.");
          location.reload();
        } catch (err) {
          alert(err.message);
          btn.disabled = false;
          btn.textContent = "Delete Photo";
        }
      });
    });

    const uploadForm = $("#photoUploadForm");
    const notice = $("#photoUploadNotice");
    if (uploadForm) {
      uploadForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const data = new FormData(uploadForm);
        const file = data.get("photo");
        try {
          setMessage(notice, "Compressing photo for storage...", "info");
          const imageDataUrl = await IsopediaAPI.imageFileToCompressedDataUrl(file, {
            maxInputBytes: 15 * 1024 * 1024,
            maxOutputBytes: 4.5 * 1024 * 1024,
            maxDimension: 1400,
            quality: 0.82
          });
          setMessage(notice, "Uploading photo...", "info");
          await IsopediaAPI.apiCall("uploadIsopodPhoto", {
            isopodId: data.get("isopodId"),
            imageDataUrl,
            photoPublicOptIn: data.get("photoPublicOptIn") === "on",
            photoPublicName: data.get("photoPublicName"),
            notes: data.get("notes")
          });
          setMessage(notice, "Photo uploaded. Refreshing gallery...", "success");
          setTimeout(() => location.reload(), 800);
        } catch (err) {
          setMessage(notice, err.message, "error");
        }
      });
    }
  }

  function openDisputeDialog(item) {
    const user = IsopediaAPI.getUser();
    if (!user) {
      alert("Please log in before disputing information.");
      window.location.href = "login.html?next=" + encodeURIComponent(location.href);
      return;
    }

    const field = prompt(
      "What are you disputing? Use one of these for automatic correction: Organism Type, Genus, Species Name, Tags, Origin, Basic Description, Care Guide, Care Difficulty, Temperature, Humidity, Substrate Moisture, Ventilation, Favorite Foods, Protein Needs, Calcium Needs, Breeding Notes, Special Notes, Image, Other",
      "Origin"
    );
    if (field === null) return;
    const reason = prompt("Please explain why this information may be inaccurate.");
    if (!reason) return;
    const suggestedCorrection = prompt("Optional: what correction or additional information do you suggest?", "") || "";
    const publicOptIn = confirm("Would you like your display name listed with this dispute? Click Cancel to stay anonymous.");

    IsopediaAPI.apiCall("contest", {
      isopodId: item.id,
      field,
      reason,
      suggestedCorrection,
      publicOptIn,
      publicName: user.publicDisplayName || user.username
    }).then(() => {
      alert("Dispute submitted. Thank you for helping improve Isopedia.");
    }).catch((err) => {
      alert(err.message);
    });
  }

  async function initRegister() {
    const form = $("#registerForm");
    const notice = $("#formNotice");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage(notice, "Creating your account...", "info");

      const data = new FormData(form);
      try {
        await IsopediaAPI.register({
          username: data.get("username"),
          email: data.get("email"),
          password: data.get("password"),
          publicCreditOptIn: data.get("publicCreditOptIn") === "on",
          publicDisplayName: data.get("publicDisplayName")
        });
        setMessage(notice, "Account created. Redirecting...", "success");
        window.location.href = "contribute.html";
      } catch (err) {
        setMessage(notice, err.message, "error");
      }
    });
  }

  async function initLogin() {
    const form = $("#loginForm");
    const notice = $("#formNotice");
    if (!form) return;

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage(notice, "Logging in...", "info");

      const data = new FormData(form);
      try {
        await IsopediaAPI.login({
          username: data.get("username"),
          password: data.get("password")
        });
        setMessage(notice, "Logged in. Redirecting...", "success");
        const next = getQueryParam("next") || "contribute.html";
        window.location.href = next;
      } catch (err) {
        setMessage(notice, err.message, "error");
      }
    });
  }

  async function requireLoggedIn() {
    let user = IsopediaAPI.getUser();
    if (!user) user = await IsopediaAPI.refreshMe();
    if (!user) {
      window.location.href = "login.html?next=" + encodeURIComponent(location.href);
      return null;
    }
    return user;
  }

  async function initContribute() {
    const user = await requireLoggedIn();
    if (!user) return;

    const organismSelect = $("#organismType");
    const genusSelect = $("#genus");
    const genusLabelText = $("#genusLabelText");

    function populateGroups() {
      if (!genusSelect) return;
      const type = organismSelect ? organismSelect.value : "Isopod";
      const groups = ORGANISM_GROUPS[type] || ORGANISM_GROUPS.Other;
      genusSelect.innerHTML = groups.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
      if (genusLabelText) genusLabelText.textContent = groupLabelForType(type);
    }

    if (organismSelect) {
      organismSelect.innerHTML = ORGANISM_TYPES.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join("");
      organismSelect.addEventListener("change", populateGroups);
    }
    populateGroups();

    const nameInput = $("#contributorPublicName");
    if (nameInput && user.publicDisplayName) nameInput.value = user.publicDisplayName;

    const form = $("#contributionForm");
    const notice = $("#formNotice");

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      setMessage(notice, "Submitting contribution...", "info");

      const data = new FormData(form);
      const imageFile = data.get("image");

      try {
        setMessage(notice, "Compressing image for storage...", "info");
        const imageDataUrl = await IsopediaAPI.imageFileToCompressedDataUrl(imageFile, {
          maxInputBytes: 15 * 1024 * 1024,
          maxOutputBytes: 4.5 * 1024 * 1024,
          maxDimension: 1400,
          quality: 0.82
        });

        setMessage(notice, "Submitting contribution...", "info");
        const result = await IsopediaAPI.apiCall("submitContribution", {
          type: "new",
          organismType: data.get("organismType"),
          genus: data.get("genus"),
          speciesName: data.get("speciesName"),
          tags: data.get("tags"),
          origin: data.get("origin"),
          basicDescription: data.get("basicDescription"),
          careDifficulty: data.get("careDifficulty"),
          careTemperature: data.get("careTemperature"),
          careHumidity: data.get("careHumidity"),
          careSubstrateMoisture: data.get("careSubstrateMoisture"),
          careVentilation: data.get("careVentilation"),
          careFoods: data.get("careFoods"),
          careProtein: data.get("careProtein"),
          careCalcium: data.get("careCalcium"),
          careBreeding: data.get("careBreeding"),
          careNotes: data.get("careNotes"),
          imageDataUrl,
          contributorPublicOptIn: data.get("contributorPublicOptIn") === "on",
          contributorPublicName: data.get("contributorPublicName")
        });

        setMessage(notice, "Submitted! Your entry is now pending verification.", "success");
        form.reset();
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (err) {
        setMessage(notice, err.message, "error");
      }
    });
  }

  async function initVerify() {
    const user = await requireLoggedIn();
    if (!user) return;

    const notice = $("#formNotice");
    const pendingGrid = $("#pendingGrid");
    const disputeGrid = $("#disputeGrid");
    const verifierName = $("#verifierPublicName");
    const modal = $("#verifyModal");
    const modalContent = $("#verifyModalContent");
    const modalClose = $("#verifyModalClose");
    let pendingItems = [];
    let disputeItems = [];

    if (verifierName && user.publicDisplayName) verifierName.value = user.publicDisplayName;

    function closeModal() {
      if (!modal) return;
      modal.hidden = true;
      modal.classList.remove("open");
      document.body.classList.remove("modal-open");
    }

    async function submitContest(item) {
      const field = prompt(
        "What are you contesting? Use one of these for automatic correction: Organism Type, Genus, Species Name, Tags, Origin, Basic Description, Care Guide, Care Difficulty, Temperature, Humidity, Substrate Moisture, Ventilation, Favorite Foods, Protein Needs, Calcium Needs, Breeding Notes, Special Notes, Image, Other",
        "Origin"
      );
      if (field === null) return;
      const reason = prompt("Why are you contesting this contribution?");
      if (!reason) return;
      const suggestedCorrection = prompt("Optional suggested correction:", "") || "";

      await IsopediaAPI.apiCall("contest", {
        isopodId: item.isopodId,
        contributionId: item.contributionId,
        field,
        reason,
        suggestedCorrection,
        publicOptIn: true,
        publicName: user.publicDisplayName || user.username
      });

      alert("Dispute submitted.");
      closeModal();
      await loadAllReviewItems();
    }

    async function submitVerification(item) {
      const publicOptIn = $("#verifierPublicOptIn").checked;
      const publicName = $("#verifierPublicName").value;
      if (!confirm("Verify this contribution as accurate to the best of your knowledge?")) return;

      await IsopediaAPI.apiCall("verifyContribution", {
        contributionId: item.contributionId,
        verifierPublicOptIn: publicOptIn,
        verifierPublicName: publicName
      });

      alert("Contribution verified.");
      closeModal();
      await loadAllReviewItems();
    }

    async function submitDisputeReview(item, decision) {
      const actionText = decision === "accepted" ? "accept and automatically apply this suggested correction" : "reject / close this dispute";
      if (!confirm(`Are you sure you want to ${actionText}?`)) return;
      const resolutionNotes = prompt("Optional review note:", decision === "accepted" ? "Suggested correction accepted and applied." : "Dispute rejected / closed.") || "";

      const result = await IsopediaAPI.apiCall("reviewDispute", {
        disputeId: item.disputeId,
        decision,
        resolutionNotes
      });

      alert(result.message || "Dispute reviewed.");
      closeModal();
      await loadAllReviewItems();
    }

    function wireContributionModalActions(item) {
      const verifyBtn = $("#modalVerifyBtn");
      const contestBtn = $("#modalContestBtn");

      if (verifyBtn) {
        verifyBtn.addEventListener("click", async () => {
          try {
            await submitVerification(item);
          } catch (err) {
            alert(err.message);
          }
        });
      }

      if (contestBtn) {
        contestBtn.addEventListener("click", async () => {
          try {
            await submitContest(item);
          } catch (err) {
            alert(err.message);
          }
        });
      }
    }

    function wireDisputeModalActions(item) {
      const acceptBtn = $("#modalAcceptDisputeBtn");
      const rejectBtn = $("#modalRejectDisputeBtn");

      if (acceptBtn) {
        acceptBtn.addEventListener("click", async () => {
          try {
            await submitDisputeReview(item, "accepted");
          } catch (err) {
            alert(err.message);
          }
        });
      }

      if (rejectBtn) {
        rejectBtn.addEventListener("click", async () => {
          try {
            await submitDisputeReview(item, "rejected");
          } catch (err) {
            alert(err.message);
          }
        });
      }
    }

    function openContributionModal(contributionId) {
      const item = pendingItems.find((entry) => String(entry.contributionId) === String(contributionId));
      if (!item || !modal || !modalContent) return;

      modalContent.innerHTML = verifyModalHtml(item, user);
      modal.hidden = false;
      modal.classList.add("open");
      document.body.classList.add("modal-open");
      wireContributionModalActions(item);
    }

    function openDisputeModal(disputeId) {
      const item = disputeItems.find((entry) => String(entry.disputeId) === String(disputeId));
      if (!item || !modal || !modalContent) return;

      modalContent.innerHTML = disputeModalHtml(item, user);
      modal.hidden = false;
      modal.classList.add("open");
      document.body.classList.add("modal-open");
      wireDisputeModalActions(item);
    }

    if (modalClose) modalClose.addEventListener("click", closeModal);
    if (modal) {
      modal.addEventListener("click", (event) => {
        if (event.target === modal) closeModal();
      });
    }
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal && modal.classList.contains("open")) closeModal();
    });

    async function loadAllReviewItems() {
      setMessage(notice, "Loading review items...", "info");
      try {
        const [pendingData, disputeData] = await Promise.all([
          IsopediaAPI.apiCall("getPending", {}),
          IsopediaAPI.apiCall("getOpenDisputes", {})
        ]);

        pendingItems = pendingData.contributions || [];
        disputeItems = disputeData.disputes || [];
        setMessage(notice, "", "");

        if (!pendingItems.length) {
          pendingGrid.innerHTML = `
            <div class="empty-state">
              <h3>No pending submissions</h3>
              <p>No new entries need verification right now.</p>
            </div>
          `;
        } else {
          pendingGrid.innerHTML = pendingItems.map((item) => verifyListCardHtml(item, user)).join("");
        }

        if (!disputeItems.length) {
          disputeGrid.innerHTML = `
            <div class="empty-state">
              <h3>No open disputes</h3>
              <p>No contested information or suggested corrections need review right now.</p>
            </div>
          `;
        } else {
          disputeGrid.innerHTML = disputeItems.map((item) => disputeListCardHtml(item, user)).join("");
        }

        $all("[data-review-id]", pendingGrid).forEach((btn) => {
          btn.addEventListener("click", () => {
            openContributionModal(btn.getAttribute("data-review-id"));
          });
        });

        $all("[data-dispute-id]", disputeGrid).forEach((btn) => {
          btn.addEventListener("click", () => {
            openDisputeModal(btn.getAttribute("data-dispute-id"));
          });
        });
      } catch (err) {
        setMessage(notice, err.message, "error");
      }
    }

    await loadAllReviewItems();
  }

  function verifyListCardHtml(c, user) {
    const p = c.proposedData || {};
    const own = String(c.submittedByUserId) === String(user.userId);
    const img = displayImageUrl(p);
    const summary = p.basicDescription || p.origin || "Open this submission to review the full details.";

    return `
      <article class="verify-card">
        <img class="iso-thumb" src="${escapeHtml(img)}" alt="${escapeHtml(p.speciesName || "Pending entry")}" ${imageFallbackAttr()}>
        <div class="verify-card-body">
          <div class="card-topline">
            <span class="badge status-pending">Pending Verification</span>
            <span class="genus-pill">${escapeHtml(p.genus || "Other")}</span>
          </div>
          <h3>${escapeHtml(p.speciesName || "Unnamed")}</h3>
          <p class="verify-meta"><strong>Submitted by:</strong> ${escapeHtml(c.submittedByPublicName || "Anonymous Member")}</p>
          <p class="verify-summary">${escapeHtml(summary)}</p>
          ${own ? `<p class="verify-own-note">You submitted this entry, so you cannot verify it yourself.</p>` : ""}
          <div class="button-row">
            <button class="button primary" data-review-id="${escapeHtml(c.contributionId)}">Review Submission</button>
          </div>
        </div>
      </article>
    `;
  }

  function disputeListCardHtml(d, user) {
    const iso = d.isopod || {};
    const own = String(d.disputedByUserId) === String(user.userId);
    const img = displayImageUrl(iso);
    const title = iso.speciesName || "Contested Entry";
    const field = d.field || "Other";
    const summary = d.suggestedCorrection || d.reason || "Open this dispute to review the details.";

    return `
      <article class="verify-card dispute-card">
        <img class="iso-thumb" src="${escapeHtml(img)}" alt="${escapeHtml(title)}" ${imageFallbackAttr()}>
        <div class="verify-card-body">
          <div class="card-topline">
            <span class="badge status-contested">Open Dispute</span>
            <span class="genus-pill">${escapeHtml(iso.genus || "Other")}</span>
          </div>
          <h3>${escapeHtml(title)}</h3>
          <p class="verify-meta"><strong>Field:</strong> ${escapeHtml(field)}</p>
          <p class="verify-meta"><strong>Submitted by:</strong> ${escapeHtml(d.disputedByPublicName || "Anonymous Member")}</p>
          <p class="verify-summary">${escapeHtml(summary)}</p>
          ${own ? `<p class="verify-own-note">You submitted this dispute, so you cannot review it yourself.</p>` : ""}
          <div class="button-row">
            <button class="button warning" data-dispute-id="${escapeHtml(d.disputeId)}">Review Dispute</button>
          </div>
        </div>
      </article>
    `;
  }

  function verifyModalHtml(c, user) {
    const p = c.proposedData || {};
    const own = String(c.submittedByUserId) === String(user.userId);
    const img = displayImageUrl(p);
    const tags = tagsArray(p);

    return `
      <div class="verify-detail">
        <div class="verify-detail-head">
          <img class="verify-detail-image" src="${escapeHtml(img)}" alt="${escapeHtml(p.speciesName || "Pending entry")}" ${imageFallbackAttr()}>
          <div class="verify-detail-copy">
            <div class="card-topline">
              <span class="badge status-pending">Pending Verification</span>
              <span class="genus-pill">${escapeHtml(p.genus || "Other")}</span>
            </div>
            <h2 id="verifyModalHeading">${escapeHtml(p.speciesName || "Unnamed")}</h2>
            <p><strong>Submitted by:</strong> ${escapeHtml(c.submittedByPublicName || "Anonymous Member")}</p>
            ${p.origin ? `<p><strong>Origin:</strong> ${escapeHtml(p.origin)}</p>` : ""}
            ${tags.length ? `<div class="tag-row">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
            ${p.basicDescription ? `<p class="verify-detail-summary">${escapeHtml(p.basicDescription)}</p>` : ""}
            ${own ? `<p class="verify-own-note">You submitted this entry, so you cannot verify it yourself.</p>` : ""}
            <div class="button-row">
              <button id="modalVerifyBtn" class="button primary" ${own ? "disabled title='You cannot verify your own contribution.'" : ""}>
                ${own ? "Cannot Verify Own Entry" : "Verify Contribution"}
              </button>
              <button id="modalContestBtn" class="button warning">Contest / Suggest Correction</button>
            </div>
          </div>
        </div>

        <section class="verify-detail-section">
          <h3>Basic Description</h3>
          <p>${escapeHtml(p.basicDescription || "No description provided.")}</p>
        </section>

        <section class="verify-detail-section">
          <h3>Care Guide</h3>
          ${renderCareGuideHtml(p)}
        </section>
      </div>
    `;
  }

  function disputeModalHtml(d, user) {
    const iso = d.isopod || {};
    const own = String(d.disputedByUserId) === String(user.userId);
    const img = displayImageUrl(iso);
    const title = iso.speciesName || "Contested Entry";
    const tags = tagsArray(iso);
    const correction = d.suggestedCorrection || "No suggested correction was provided.";

    return `
      <div class="verify-detail dispute-detail">
        <div class="verify-detail-head">
          <img class="verify-detail-image" src="${escapeHtml(img)}" alt="${escapeHtml(title)}" ${imageFallbackAttr()}>
          <div class="verify-detail-copy">
            <div class="card-topline">
              <span class="badge status-contested">Open Dispute</span>
              <span class="genus-pill">${escapeHtml(iso.genus || "Other")}</span>
            </div>
            <h2 id="verifyModalHeading">${escapeHtml(title)}</h2>
            <p><strong>Contested field:</strong> ${escapeHtml(d.field || "Other")}</p>
            <p><strong>Submitted by:</strong> ${escapeHtml(d.disputedByPublicName || "Anonymous Member")}</p>
            <p><strong>Current entry status:</strong> ${escapeHtml(iso.status || "contested")}</p>
            ${tags.length ? `<div class="tag-row">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>` : ""}
            ${own ? `<p class="verify-own-note">You submitted this dispute, so you cannot review it yourself.</p>` : ""}
            <div class="button-row">
              <button id="modalAcceptDisputeBtn" class="button primary" ${own ? "disabled title='You cannot review your own dispute.'" : ""}>Accept / Apply Correction</button>
              <button id="modalRejectDisputeBtn" class="button danger" ${own ? "disabled title='You cannot review your own dispute.'" : ""}>Reject / Close Dispute</button>
            </div>
          </div>
        </div>

        <section class="verify-detail-section dispute-reason-box">
          <h3>Why this was contested</h3>
          <p>${escapeHtml(d.reason || "No reason provided.")}</p>
        </section>

        <section class="verify-detail-section dispute-correction-box">
          <h3>Suggested correction / additional information</h3>
          <p class="muted"><strong>Note:</strong> accepting this will automatically update the matching entry field when the field is editable.</p>
          <p>${escapeHtml(correction)}</p>
        </section>

        <section class="verify-detail-section">
          <h3>Current entry information</h3>
          <p><strong>Origin:</strong> ${escapeHtml(iso.origin || "Not listed")}</p>
          <p><strong>Description:</strong> ${escapeHtml(iso.basicDescription || "No description listed.")}</p>
          <div class="dispute-current-care">${renderCareGuideHtml(iso)}</div>
        </section>
      </div>
    `;
  }

  async function initFaq() {

    const donorList = $("#donatorList");
    if (!donorList) return;

    const donors = await loadDonators();
    if (!donors.length) {
      donorList.innerHTML = "<p class='muted'>No public donators listed yet.</p>";
      return;
    }

    donorList.innerHTML = donors.map((d) => `
      <li>
        <strong>${escapeHtml(d.displayName)}</strong>
        ${d.date ? `<span class="muted"> — ${escapeHtml(d.date)}</span>` : ""}
      </li>
    `).join("");
  }

  function initDonate() {
    const links = ((window.ISOPEDIA_CONFIG || {}).DONATE_LINKS || {});
    const square = $("#squareDonate");
    const paypal = $("#paypalDonate");
    const cashapp = $("#cashappDonate");

    setDonateLink(square, links.square);
    setDonateLink(paypal, links.paypal);
    setDonateLink(cashapp, links.cashapp);
  }

  function setDonateLink(el, url) {
    if (!el) return;
    if (url) {
      el.href = url;
      el.hidden = false;
    } else {
      el.hidden = true;
    }
  }

  async function initProfile() {
    const root = $("#profileRoot");
    if (!root) return;

    const userId = getQueryParam("id") || getQueryParam("userId");
    if (!userId) {
      root.innerHTML = `
        <div class="empty-state">
          <h2>Profile not found</h2>
          <p>No profile ID was provided.</p>
          <a class="button primary" href="index.html">Back to Isopedia</a>
        </div>
      `;
      return;
    }

    try {
      const data = await IsopediaAPI.publicApi("getPublicProfile", { userId });
      const profile = data.profile;

      if (!profile) {
        root.innerHTML = `
          <div class="empty-state">
            <h2>Profile not public</h2>
            <p>This contributor has not made their profile public, or the account could not be found.</p>
            <a class="button primary" href="index.html">Back to Isopedia</a>
          </div>
        `;
        return;
      }

      document.title = profile.displayName + " | Isopedia Profile";
      const links = [
        safeExternalLink(profile.facebookUrl, "Facebook"),
        safeExternalLink(profile.websiteUrl, "Website")
      ].filter(Boolean).join("");

      root.innerHTML = `
        <section class="profile-hero content-card">
          <div>
            <span class="genus-pill">Isopedia Contributor</span>
            <h1>${escapeHtml(profile.displayName || "Contributor")}</h1>
            <p class="profile-bio">${escapeHtml(profile.bio || "This contributor has not added a bio yet.")}</p>
            <div class="button-row profile-link-row">
              ${links || `<span class="muted">No public links listed.</span>`}
            </div>
          </div>
          <div class="profile-stats">
            <article class="profile-stat"><strong>${Number(profile.contributorCount || 0)}</strong><span>Contributions</span></article>
            <article class="profile-stat"><strong>${Number(profile.verifierCount || 0)}</strong><span>Verifications</span></article>
          </div>
        </section>

        <section class="content-card">
          <h2>Recent Credited Contributions</h2>
          <div id="profileContributionGrid" class="grid"></div>
        </section>
      `;

      const grid = $("#profileContributionGrid");
      const contributions = profile.contributions || [];
      if (!contributions.length) {
        grid.innerHTML = `<p class="muted">No public credited contributions are listed yet.</p>`;
      } else {
        renderCards(contributions, grid);
      }
    } catch (err) {
      root.innerHTML = `
        <div class="empty-state">
          <h2>Could not load profile</h2>
          <p>${escapeHtml(err.message)}</p>
        </div>
      `;
    }
  }

  async function initAccount() {
    const user = await requireLoggedIn();
    if (!user) return;

    const root = $("#accountRoot");
    root.innerHTML = `
      <section class="content-card account-profile-card">
        <h1>Account</h1>
        <p><strong>Username:</strong> ${escapeHtml(user.username)}</p>
        <p><strong>Role:</strong> ${escapeHtml(user.role)}</p>

        <div class="button-row">
          <a class="button primary" href="contribute.html">Add an Entry</a>
          <a class="button" href="verify.html">Verify Contributions</a>
          <a class="button" href="${profileUrl(user.userId)}">View Public Profile</a>
          ${user.role === "admin" ? `<button class="button warning" id="publishBtn">Publish Public JSON</button>` : ""}
          <button class="button" id="logoutBtn">Log Out</button>
        </div>
      </section>

      <section class="form-card wide-form account-profile-card">
        <h2>Contributor Profile</h2>
        <p class="field-help">
          This is the profile people can view when they click your credited contributor or verifier name.
          Turn off public profile if you do not want your profile page visible.
        </p>

        <form id="profileForm" class="form-grid">
          <label class="check-row">
            <input id="profilePublic" type="checkbox" ${String(user.profilePublic || "yes").toLowerCase() === "yes" ? "checked" : ""}>
            Make my contributor profile public
          </label>

          <label class="check-row">
            <input id="publicCreditOptIn" type="checkbox" ${String(user.publicCreditOptIn || "yes").toLowerCase() === "yes" ? "checked" : ""}>
            List my display name for future credits by default
          </label>

          <label>
            Public Display Name
            <input id="publicDisplayName" type="text" maxlength="80" value="${escapeHtml(user.publicDisplayName || user.username || "")}" placeholder="Name shown on credits and profile">
          </label>

          <label>
            Short Bio
            <textarea id="profileBio" maxlength="600" placeholder="Tell other keepers a little about yourself, your collection, or your business.">${escapeHtml(user.profileBio || "")}</textarea>
            <span class="field-help">Keep this short. Suggested max: 2–4 sentences.</span>
          </label>

          <label>
            Facebook Link
            <input id="facebookUrl" type="url" value="${escapeHtml(user.facebookUrl || "")}" placeholder="https://www.facebook.com/your-page-or-profile">
          </label>

          <label>
            Website Link
            <input id="websiteUrl" type="url" value="${escapeHtml(user.websiteUrl || "")}" placeholder="https://yourwebsite.com">
          </label>

          <div class="button-row">
            <button class="button primary" type="submit">Save Profile</button>
          </div>
        </form>
      </section>
    `;

    $("#logoutBtn").addEventListener("click", async () => {
      await IsopediaAPI.logout();
      window.location.href = "index.html";
    });

    const profileForm = $("#profileForm");
    profileForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const saveBtn = profileForm.querySelector('button[type="submit"]');
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";
      try {
        const data = await IsopediaAPI.apiCall("updateProfile", {
          profilePublic: $("#profilePublic").checked,
          publicCreditOptIn: $("#publicCreditOptIn").checked,
          publicDisplayName: $("#publicDisplayName").value,
          profileBio: $("#profileBio").value,
          facebookUrl: $("#facebookUrl").value,
          websiteUrl: $("#websiteUrl").value
        });
        IsopediaAPI.setUser(data.user);
        alert("Profile saved.");
        await initAccount();
      } catch (err) {
        alert(err.message);
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Profile";
      }
    });

    const publishBtn = $("#publishBtn");
    if (publishBtn) {
      publishBtn.addEventListener("click", async () => {
        if (!confirm("Publish current public Isopedia entry and donator JSON to GitHub?")) return;
        publishBtn.disabled = true;
        publishBtn.textContent = "Publishing...";
        try {
          const result = await IsopediaAPI.apiCall("publishPublicJson", {});
          if (result.ok) {
            alert("Published to GitHub.");
          } else {
            alert(result.error || "Publishing failed.");
          }
        } catch (err) {
          alert(err.message);
        } finally {
          publishBtn.disabled = false;
          publishBtn.textContent = "Publish Public JSON";
        }
      });
    }
  }

  async function main() {
    updateNavForUser(IsopediaAPI.getUser());
    IsopediaAPI.refreshMe().then(updateNavForUser);

    const current = page();
    if (current === "home") await initHome();
    if (current === "species") await initSpecies();
    if (current === "register") await initRegister();
    if (current === "login") await initLogin();
    if (current === "contribute") await initContribute();
    if (current === "verify") await initVerify();
    if (current === "faq") await initFaq();
    if (current === "donate") await initDonate();
    if (current === "account") await initAccount();
    if (current === "profile") await initProfile();
  }

  document.addEventListener("DOMContentLoaded", main);
})();
