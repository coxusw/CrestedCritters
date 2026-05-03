(function () {
  "use strict";

  const TOKEN_KEY = "isopedia_token";
  const USER_KEY = "isopedia_user";
  const COOKIE_DAYS = 7;

  function config() {
    return window.ISOPEDIA_CONFIG || {};
  }

  function apiUrl() {
    return (config().API_URL || "").trim();
  }

  function safeStorage(type) {
    try {
      const store = window[type];
      const testKey = "__isopedia_storage_test__";
      store.setItem(testKey, "1");
      store.removeItem(testKey);
      return store;
    } catch (err) {
      return null;
    }
  }

  function localStore() {
    return safeStorage("localStorage");
  }

  function sessionStore() {
    return safeStorage("sessionStorage");
  }

  function setCookie(name, value, days) {
    try {
      if (!value) {
        document.cookie = encodeURIComponent(name) + "=; Max-Age=0; path=/; SameSite=Lax";
        return;
      }
      const maxAge = Math.max(1, days || COOKIE_DAYS) * 24 * 60 * 60;
      document.cookie = encodeURIComponent(name) + "=" + encodeURIComponent(value) + "; Max-Age=" + maxAge + "; path=/; SameSite=Lax";
    } catch (err) {}
  }

  function getCookie(name) {
    try {
      const target = encodeURIComponent(name) + "=";
      const parts = String(document.cookie || "").split(";");
      for (const part of parts) {
        const clean = part.trim();
        if (clean.indexOf(target) === 0) return decodeURIComponent(clean.slice(target.length));
      }
    } catch (err) {}
    return "";
  }

  function writeStoredValue(key, value) {
    const local = localStore();
    const session = sessionStore();

    if (value == null || value === "") {
      if (local) local.removeItem(key);
      if (session) session.removeItem(key);
      setCookie(key, "");
      return;
    }

    if (local) local.setItem(key, value);
    if (session) session.setItem(key, value);
    setCookie(key, value, COOKIE_DAYS);
  }

  function readStoredValue(key) {
    const local = localStore();
    const session = sessionStore();
    return (local && local.getItem(key)) || (session && session.getItem(key)) || getCookie(key) || "";
  }

  function getToken() {
    return readStoredValue(TOKEN_KEY);
  }

  function setToken(token) {
    writeStoredValue(TOKEN_KEY, token || "");
  }

  function getUser() {
    const raw = readStoredValue(USER_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      setUser(null);
      return null;
    }
  }

  function setUser(user) {
    writeStoredValue(USER_KEY, user ? JSON.stringify(user) : "");
  }

  function setSession(token, user) {
    setToken(token || "");
    setUser(user || null);
  }

  function clearSession() {
    setSession("", null);
  }

  function hasSession() {
    return !!(getToken() && getUser());
  }

  function isAuthError(err) {
    const msg = String((err && err.message) || err || "").toLowerCase();
    return msg.includes("session expired") || msg.includes("must be logged in") || msg.includes("not active") || msg.includes("incorrect username") || msg.includes("incorrect password");
  }

  async function apiCall(action, payload) {
    const url = apiUrl();
    if (!url || url.includes("PASTE_YOUR")) {
      throw new Error("Apps Script API URL is not configured. Edit assets/config.js first.");
    }

    const body = Object.assign({}, payload || {}, {
      action: action,
      token: payload && payload.token !== undefined ? payload.token : getToken()
    });

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(body)
    });

    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (err) {
      throw new Error("Backend did not return JSON. Response: " + text.substring(0, 300));
    }

    if (!data.ok) {
      throw new Error(data.error || "Request failed.");
    }

    return data;
  }

  async function publicApi(action, params) {
    const url = apiUrl();
    if (!url || url.includes("PASTE_YOUR")) {
      throw new Error("Apps Script API URL is not configured. Edit assets/config.js first.");
    }
    const q = new URLSearchParams(Object.assign({ action }, params || {}));
    const res = await fetch(url + "?" + q.toString());
    const text = await res.text();
    const data = JSON.parse(text);
    if (!data.ok) throw new Error(data.error || "Request failed.");
    return data;
  }

  async function register(payload) {
    const data = await apiCall("register", payload);
    setSession(data.token, data.user);
    return data;
  }

  async function login(payload) {
    const data = await apiCall("login", payload);
    setSession(data.token, data.user);
    return data;
  }

  async function logout() {
    try {
      await apiCall("logout", {});
    } catch (err) {
      // Clear local session even if backend logout fails.
    }
    clearSession();
  }

  async function refreshMe(options) {
    const opts = Object.assign({ clearOnFailure: true }, options || {});
    if (!getToken()) return null;
    try {
      const data = await apiCall("me", {});
      setUser(data.user);
      return data.user;
    } catch (err) {
      // Only clear local login data for true auth/session failures. This avoids
      // asking users to log in again because of a temporary Apps Script/network hiccup.
      if (opts.clearOnFailure && isAuthError(err)) {
        clearSession();
        return null;
      }
      return getUser();
    }
  }

  async function getReliableUser() {
    const cached = getUser();
    const token = getToken();
    if (cached && token) return cached;
    if (token) return await refreshMe({ clearOnFailure: true });
    return null;
  }

  function estimateDataUrlBytes(dataUrl) {
    const clean = String(dataUrl || "");
    const comma = clean.indexOf(",");
    const base64 = comma === -1 ? clean : clean.slice(comma + 1);
    return Math.ceil((base64.length * 3) / 4);
  }

  function loadImageFromDataUrl(dataUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Could not load the selected image for compression."));
      img.src = dataUrl;
    });
  }

  function canvasToJpegDataUrl(sourceImage, maxDimension, quality) {
    const longestSide = Math.max(sourceImage.width, sourceImage.height);
    const scale = longestSide > maxDimension ? maxDimension / longestSide : 1;
    const width = Math.max(1, Math.round(sourceImage.width * scale));
    const height = Math.max(1, Math.round(sourceImage.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(sourceImage, 0, 0, width, height);

    return canvas.toDataURL("image/jpeg", quality);
  }

  async function imageFileToCompressedDataUrl(file, options) {
    const opts = Object.assign({
      maxInputBytes: 15 * 1024 * 1024,
      maxOutputBytes: 4.5 * 1024 * 1024,
      maxDimension: 1400,
      quality: 0.82
    }, options || {});

    if (!file) throw new Error("Please choose an image.");

    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (allowed.indexOf(file.type) === -1) {
      throw new Error("Only JPEG, PNG, WEBP, and GIF images are allowed.");
    }

    if (file.size > opts.maxInputBytes) {
      throw new Error("Image is too large. Please use an image under " + Math.round(opts.maxInputBytes / 1024 / 1024) + "MB.");
    }

    // Keep GIFs untouched so animated GIFs do not get flattened by canvas.
    // Backend still enforces the final 5MB upload limit.
    if (file.type === "image/gif") {
      return await fileToDataUrl(file, 5 * 1024 * 1024);
    }

    const originalDataUrl = await fileToDataUrl(file, opts.maxInputBytes);
    const img = await loadImageFromDataUrl(originalDataUrl);

    const dimensionAttempts = [opts.maxDimension, 1200, 1000, 850];
    const qualityAttempts = [opts.quality, 0.76, 0.68, 0.6];
    let best = "";

    for (const dimension of dimensionAttempts) {
      for (const quality of qualityAttempts) {
        const dataUrl = canvasToJpegDataUrl(img, dimension, quality);
        best = dataUrl;
        if (estimateDataUrlBytes(dataUrl) <= opts.maxOutputBytes) {
          return dataUrl;
        }
      }
    }

    if (best && estimateDataUrlBytes(best) <= 5 * 1024 * 1024) {
      return best;
    }

    throw new Error("Image is still too large after compression. Please crop it or choose a smaller image.");
  }

  async function fileToDataUrl(file, maxBytes) {
    if (!file) throw new Error("Please choose an image.");
    if (maxBytes && file.size > maxBytes) {
      throw new Error("Image is too large. Please use an image under " + Math.round(maxBytes / 1024 / 1024) + "MB.");
    }
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Could not read image."));
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(file);
    });
  }

  window.IsopediaAPI = {
    getToken,
    setToken,
    getUser,
    setUser,
    setSession,
    clearSession,
    hasSession,
    getReliableUser,
    apiCall,
    publicApi,
    register,
    login,
    logout,
    refreshMe,
    fileToDataUrl,
    imageFileToCompressedDataUrl
  };
})();
