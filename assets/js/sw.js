const CACHE_NAME = "isotracker-v1";

// Files to cache (core app shell)
const CORE_ASSETS = [
"/",
"/isotracker/",
"/assets/css/isotracker.css",
"/assets/js/isotracker.js",
"/assets/images/logo.png",
];

// Install - cache core files
self.addEventListener("install", (event) => {
event.waitUntil(
caches.open(CACHE_NAME).then((cache) => {
return cache.addAll(CORE_ASSETS);
})
);
self.skipWaiting();
});

// Activate - clean old caches
self.addEventListener("activate", (event) => {
event.waitUntil(
caches.keys().then((keys) =>
Promise.all(
keys.map((key) => {
if (key !== CACHE_NAME) {
return caches.delete(key);
}
})
)
)
);
self.clients.claim();
});

// Fetch - cache-first strategy
self.addEventListener("fetch", (event) => {
if (event.request.method !== "GET") return;

event.respondWith(
caches.match(event.request).then((cached) => {
if (cached) return cached;

return fetch(event.request)
.then((response) => {
// Save to cache
const cloned = response.clone();
caches.open(CACHE_NAME).then((cache) => {
cache.put(event.request, cloned);
});
return response;
})
.catch(() => {
// Optional fallback (could add offline page later)
return cached;
});
})
);
});
