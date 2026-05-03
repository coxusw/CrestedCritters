(function () {
  "use strict";

  const TOKEN_KEY = "isopedia_token";
  const USER_KEY = "isopedia_user";

  function config() {
    return window.ISOPEDIA_CONFIG || {};
  }

  function apiUrl() {
    return (config().API_URL || "").trim();
  }

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || "";
  }

  function setToken(token) {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(USER_KEY) || "null");
    } catch (err) {
      return null;
    }
  }

  function setUser(user) {
    if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(USER_KEY);
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
    setToken(data.token);
    setUser(data.user);
    return data;
  }

  async function login(payload) {
    const data = await apiCall("login", payload);
    setToken(data.token);
    setUser(data.user);
    return data;
  }

  async function logout() {
    try {
      await apiCall("logout", {});
    } catch (err) {
      // Clear local session even if backend logout fails.
    }
    setToken("");
    setUser(null);
  }

  async function refreshMe() {
    if (!getToken()) return null;
    try {
      const data = await apiCall("me", {});
      setUser(data.user);
      return data.user;
    } catch (err) {
      setToken("");
      setUser(null);
      return null;
    }
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
