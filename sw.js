const CACHE_NAME = "jeju-olle-app-v4-20260915-5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./data.js",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/jeju-olle-coast.jpg",
  "./assets/app-icon-192.png",
  "./assets/app-icon-512.png",
  "./assets/icons/award.svg",
  "./assets/icons/bookmark.svg",
  "./assets/icons/briefcase.svg",
  "./assets/icons/calendar-days.svg",
  "./assets/icons/camera.svg",
  "./assets/icons/check.svg",
  "./assets/icons/coffee.svg",
  "./assets/icons/database.svg",
  "./assets/icons/download.svg",
  "./assets/icons/ellipsis.svg",
  "./assets/icons/external-link.svg",
  "./assets/icons/history.svg",
  "./assets/icons/house.svg",
  "./assets/icons/link.svg",
  "./assets/icons/map.svg",
  "./assets/icons/map-pin.svg",
  "./assets/icons/map-pin-check.svg",
  "./assets/icons/map-pin-off.svg",
  "./assets/icons/navigation.svg",
  "./assets/icons/notebook-pen.svg",
  "./assets/icons/pencil.svg",
  "./assets/icons/plane.svg",
  "./assets/icons/plus.svg",
  "./assets/icons/printer.svg",
  "./assets/icons/search.svg",
  "./assets/icons/settings-2.svg",
  "./assets/icons/shopping-bag.svg",
  "./assets/icons/trash-2.svg",
  "./assets/icons/upload.svg",
  "./assets/icons/utensils.svg",
  "./assets/icons/x.svg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(caches.open(CACHE_NAME).then(function (cache) {
    return cache.addAll(APP_SHELL);
  }));
});

self.addEventListener("activate", function (event) {
  event.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (key) {
      return key.startsWith("jeju-olle-app-") && key !== CACHE_NAME;
    }).map(function (key) {
      return caches.delete(key);
    }));
  }).then(function () {
    return self.clients.claim();
  }));
});

self.addEventListener("fetch", function (event) {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (event.request.mode === "navigate") {
    event.respondWith(caches.match("./index.html").then(function (cached) {
      if (cached) {
        fetch(event.request).then(function (response) {
          if (!response.ok) return;
          caches.open(CACHE_NAME).then(function (cache) {
            cache.put("./index.html", response.clone());
          });
        }).catch(function () {});
        return cached;
      }
      return fetch(event.request);
    }));
    return;
  }

  event.respondWith(caches.match(event.request).then(function (cached) {
    if (cached) return cached;
    return fetch(event.request).then(function (response) {
      if (response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(function (cache) { cache.put(event.request, copy); });
      }
      return response;
    });
  }));
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});
