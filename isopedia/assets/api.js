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
    fileToDataUrl
  };
})();
