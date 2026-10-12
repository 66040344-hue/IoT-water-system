// Service Worker: เก็บโครงหน้าเว็บ สคริปต์ และฟอนต์ไว้ในเครื่อง เปิดซ้ำเร็วและเปิดโครงหน้าได้แม้เน็ตหลุด
// ข้อมูลสด (Firebase, Open-Meteo) ไม่ผ่าน SW จึงไม่ถูกแคช ถ้าแก้ไฟล์ในเว็บให้เปลี่ยน VERSION ด้านล่างทุกครั้งที่ deploy
const VERSION = "xf-v12";
const SHELL = [
  "./", "index.html", "view.html", "login.html", "control.html", "calculator.html", "schedule.html", "history.html", "settings.html", "weather.html",
  "css/style.css", "js/theme.js", "js/config.js", "js/store.js", "js/app.js", "icon.svg",
];
const HOSTS = ["www.gstatic.com", "fonts.googleapis.com", "fonts.gstatic.com"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) => Promise.allSettled(SHELL.map((url) => cache.add(url)))).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin && !HOSTS.includes(url.hostname)) return;
  if (url.pathname.endsWith("/sw.js")) return;

  // ใช้ของในเครื่องก่อนแล้วอัปเดตเบื้องหลัง (ครั้งถัดไปจะได้ของใหม่)
  event.respondWith(
    caches.open(VERSION).then(async (cache) => {
      const cached = await cache.match(req, { ignoreSearch: false });
      const network = fetch(req)
        .then((res) => {
          if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone());
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});