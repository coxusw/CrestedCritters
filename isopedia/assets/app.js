(function () {
  "use strict";

  const GENUS = [
    "Armadillidium",
    "Porcellio",
    "Cubaris",
    "Porcellionides",
    "Ardentiella",
    "Other"
  ];

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
        console.warn("Live API isopod load failed, falling back to static JSON:", apiErr);
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
      item.genus,
      tagsArray(item).join(" "),
      item.origin,
      item.basicDescription,
      item.careGuide
    ].join(" "));
  }

  function scoreItem(item, query) {
    const q = normalize(query);
    if (!q) return 1;

    const queryWords = words(q);
    const name = normalize(item.speciesName);
    const genus = normalize(item.genus);
    const tags = tagsArray(item).map(normalize);
    const origin = normalize(item.origin);
    const desc = normalize(item.basicDescription + " " + item.careGuide);
    const full = buildSearchText(item);

    let score = 0;

    if (name === q) score += 1000;
    if (tags.some((t) => t === q)) score += 900;
    if (name.includes(q)) score += 600;
    if (tags.some((t) => t.includes(q))) score += 550;
    if (genus.includes(q)) score += 350;
    if (origin.includes(q)) score += 150;
    if (desc.includes(q)) score += 75;

    queryWords.forEach((w) => {
      if (!w) return;
      if (name.includes(w)) score += 90;
      if (tags.some((t) => t.includes(w))) score += 80;
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

  function searchIsopods(query, genus) {
    return allIsopods
      .map((item) => ({ item, score: scoreItem(item, query) }))
      .filter(({ item, score }) => {
        const genusOk = !genus || genus === "All" || item.genus === genus;
        const queryOk = !query || score > 0;
        return genusOk && queryOk;
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
              <span class="genus-pill">${escapeHtml(item.genus || "Other")}</span>
            </div>
            <h3>${escapeHtml(item.speciesName || "Unnamed Isopod")}</h3>
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
          <h3>No isopods found</h3>
          <p>Try another search term, browse by genus, or add a new isopod.</p>
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

  function setupGenusButtons() {
    const wrap = $("#genusButtons");
    if (!wrap) return;
    wrap.innerHTML = ["All"].concat(GENUS).map((g) => `
      <button class="genus-btn" data-genus="${escapeHtml(g)}">${escapeHtml(g)}</button>
    `).join("");
  }

  function attachHomeSearch() {
    const searchInput = $("#searchInput");
    const resultGrid = $("#resultGrid");
    const activeGenusLabel = $("#activeGenusLabel");
    let activeGenus = "All";

    function runSearch() {
      const query = searchInput ? searchInput.value : "";
      const items = searchIsopods(query, activeGenus);
      renderCards(items, resultGrid);
      if (activeGenusLabel) {
        activeGenusLabel.textContent = activeGenus === "All" ? "All Isopods" : activeGenus;
      }
    }

    if (searchInput) {
      searchInput.addEventListener("input", runSearch);
    }

    $all(".genus-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeGenus = btn.getAttribute("data-genus") || "All";
        $all(".genus-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        runSearch();
      });
    });

    const startGenus = getQueryParam("genus");
    if (startGenus && GENUS.includes(startGenus)) {
      const btn = $(`.genus-btn[data-genus="${CSS.escape(startGenus)}"]`);
      if (btn) btn.click();
      else runSearch();
    } else {
      const allBtn = $('.genus-btn[data-genus="All"]');
      if (allBtn) allBtn.classList.add("active");
      runSearch();
    }
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
    setupGenusButtons();
    await loadIsopods();
    renderStats();
    attachHomeSearch();

    const recentGrid = $("#recentGrid");
    if (recentGrid) {
      const recent = allIsopods.slice().sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""))).slice(0, 6);
      renderCards(recent, recentGrid);
    }
  }

  async function initSpecies() {
    await loadIsopods();
    const id = getQueryParam("id");
    const item = allIsopods.find((i) => String(i.id) === String(id));
    const root = $("#speciesRoot");

    if (!item) {
      root.innerHTML = `
        <div class="empty-state">
          <h2>Isopod not found</h2>
          <p>This entry may not exist yet or the public JSON has not been published.</p>
          <a class="button primary" href="index.html">Back to Isopedia</a>
        </div>
      `;
      return;
    }

    document.title = item.speciesName + " | Isopedia";
    const tags = tagsArray(item);
    const img = displayImageUrl(item);

    root.innerHTML = `
      <section class="species-hero ${String(item.status).toLowerCase() !== "verified" ? "card-highlight" : ""}">
        <img class="species-image" src="${escapeHtml(img)}" alt="${escapeHtml(item.speciesName)}" ${imageFallbackAttr()}>
        <div>
          <div class="card-topline">
            <span class="badge ${statusClass(item.status)}">${statusLabel(item.status)}</span>
            <span class="genus-pill">${escapeHtml(item.genus || "Other")}</span>
          </div>
          <h1>${escapeHtml(item.speciesName)}</h1>
          <p class="muted">Origin: ${escapeHtml(item.origin || "Unknown")}</p>
          <div class="tag-row large">
            ${tags.length ? tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("") : `<span class="muted">No tags listed yet.</span>`}
          </div>
        </div>
      </section>

      <section class="content-card">
        <h2>Basic Description</h2>
        <p>${escapeHtml(item.basicDescription || "No description available.")}</p>
      </section>

      <section class="content-card">
        <h2>Care Guide</h2>
        <p>${escapeHtml(item.careGuide || "No care guide available.")}</p>
      </section>

      <section class="content-card two-col">
        <div>
          <h2>Credit</h2>
          <p><strong>Contributor:</strong> ${escapeHtml(item.contributorName || "Anonymous Member")}</p>
          <p><strong>Verified by:</strong> ${escapeHtml(item.verifierName || (String(item.status).toLowerCase() === "verified" ? "Anonymous Member" : "Waiting for verification"))}</p>
        </div>
        <div>
          <h2>Community Review</h2>
          <p>Logged-in members can dispute or suggest a correction if something looks inaccurate.</p>
          <button class="button warning" id="openDisputeBtn">Contest / Suggest Correction</button>
        </div>
      </section>
    `;

    $("#openDisputeBtn").addEventListener("click", () => openDisputeDialog(item));
  }

  function openDisputeDialog(item) {
    const user = IsopediaAPI.getUser();
    if (!user) {
      alert("Please log in before disputing information.");
      window.location.href = "login.html?next=" + encodeURIComponent(location.href);
      return;
    }

    const field = prompt("What are you disputing? Example: Origin, Care Guide, Tags, Species Name, Image, Other", "Other");
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

    const genusSelect = $("#genus");
    if (genusSelect) {
      genusSelect.innerHTML = GENUS.map((g) => `<option value="${escapeHtml(g)}">${escapeHtml(g)}</option>`).join("");
    }

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
        const imageDataUrl = await IsopediaAPI.fileToDataUrl(imageFile, 5 * 1024 * 1024);

        const result = await IsopediaAPI.apiCall("submitContribution", {
          type: "new",
          genus: data.get("genus"),
          speciesName: data.get("speciesName"),
          tags: data.get("tags"),
          origin: data.get("origin"),
          basicDescription: data.get("basicDescription"),
          careGuide: data.get("careGuide"),
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
    const grid = $("#pendingGrid");
    const verifierName = $("#verifierPublicName");
    if (verifierName && user.publicDisplayName) verifierName.value = user.publicDisplayName;

    async function loadPending() {
      setMessage(notice, "Loading pending contributions...", "info");
      try {
        const data = await IsopediaAPI.apiCall("getPending", {});
        const list = data.contributions || [];
        setMessage(notice, "", "");

        if (!list.length) {
          grid.innerHTML = `
            <div class="empty-state">
              <h3>No pending contributions</h3>
              <p>Nothing needs verification right now.</p>
            </div>
          `;
          return;
        }

        grid.innerHTML = list.map((c) => pendingContributionHtml(c, user)).join("");

        $all("[data-verify-id]", grid).forEach((btn) => {
          btn.addEventListener("click", async () => {
            const contributionId = btn.getAttribute("data-verify-id");
            const publicOptIn = $("#verifierPublicOptIn").checked;
            const publicName = $("#verifierPublicName").value;

            if (!confirm("Verify this contribution as accurate to the best of your knowledge?")) return;

            try {
              await IsopediaAPI.apiCall("verifyContribution", {
                contributionId,
                verifierPublicOptIn: publicOptIn,
                verifierPublicName: publicName
              });
              alert("Contribution verified.");
              await loadPending();
            } catch (err) {
              alert(err.message);
            }
          });
        });

        $all("[data-contest-isopod]", grid).forEach((btn) => {
          btn.addEventListener("click", async () => {
            const isopodId = btn.getAttribute("data-contest-isopod");
            const contributionId = btn.getAttribute("data-contest-id");
            const field = prompt("What are you contesting?", "Other");
            if (field === null) return;
            const reason = prompt("Why are you contesting this contribution?");
            if (!reason) return;
            const suggestedCorrection = prompt("Optional suggested correction:", "") || "";
            try {
              await IsopediaAPI.apiCall("contest", {
                isopodId,
                contributionId,
                field,
                reason,
                suggestedCorrection,
                publicOptIn: true,
                publicName: user.publicDisplayName || user.username
              });
              alert("Dispute submitted.");
              await loadPending();
            } catch (err) {
              alert(err.message);
            }
          });
        });
      } catch (err) {
        setMessage(notice, err.message, "error");
      }
    }

    await loadPending();
  }

  function pendingContributionHtml(c, user) {
    const p = c.proposedData || {};
    const own = String(c.submittedByUserId) === String(user.userId);
    const img = displayImageUrl(p);
    const tags = tagsArray(p);

    return `
      <article class="pending-card">
        <img class="iso-thumb" src="${escapeHtml(img)}" alt="${escapeHtml(p.speciesName || "Pending isopod")}" ${imageFallbackAttr()}>
        <div>
          <div class="card-topline">
            <span class="badge status-pending">Pending Verification</span>
            <span class="genus-pill">${escapeHtml(p.genus || "Other")}</span>
          </div>
          <h3>${escapeHtml(p.speciesName || "Unnamed")}</h3>
          <p><strong>Submitted by:</strong> ${escapeHtml(c.submittedByPublicName || "Anonymous Member")}</p>
          <p><strong>Origin:</strong> ${escapeHtml(p.origin || "")}</p>
          <p>${escapeHtml(p.basicDescription || "")}</p>
          <details>
            <summary>Care Guide</summary>
            <p>${escapeHtml(p.careGuide || "")}</p>
          </details>
          <div class="tag-row">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
          <div class="button-row">
            <button class="button primary" data-verify-id="${escapeHtml(c.contributionId)}" ${own ? "disabled title='You cannot verify your own contribution.'" : ""}>
              ${own ? "Cannot Verify Own Entry" : "Verify Contribution"}
            </button>
            <button class="button warning" data-contest-isopod="${escapeHtml(c.isopodId)}" data-contest-id="${escapeHtml(c.contributionId)}">
              Contest / Suggest Correction
            </button>
          </div>
        </div>
      </article>
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

  async function initAccount() {
    const user = await requireLoggedIn();
    if (!user) return;

    const root = $("#accountRoot");
    root.innerHTML = `
      <section class="content-card">
        <h1>Account</h1>
        <p><strong>Username:</strong> ${escapeHtml(user.username)}</p>
        <p><strong>Role:</strong> ${escapeHtml(user.role)}</p>
        <p><strong>Public display name:</strong> ${escapeHtml(user.publicDisplayName || "Not set")}</p>
        <p><strong>Public credit default:</strong> ${escapeHtml(user.publicCreditOptIn || "no")}</p>
        <div class="button-row">
          <a class="button primary" href="contribute.html">Add an Isopod</a>
          <a class="button" href="verify.html">Verify Contributions</a>
          ${user.role === "admin" ? `<button class="button warning" id="publishBtn">Publish Public JSON</button>` : ""}
          <button class="button" id="logoutBtn">Log Out</button>
        </div>
        <p class="muted">Account editing can be added in the next version. For now, public credit choices are asked during contribution and verification.</p>
      </section>
    `;

    $("#logoutBtn").addEventListener("click", async () => {
      await IsopediaAPI.logout();
      window.location.href = "index.html";
    });

    const publishBtn = $("#publishBtn");
    if (publishBtn) {
      publishBtn.addEventListener("click", async () => {
        if (!confirm("Publish current public isopod and donator JSON to GitHub?")) return;
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
  }

  document.addEventListener("DOMContentLoaded", main);
})();
