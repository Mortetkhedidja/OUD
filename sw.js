// Service worker لتطبيق منصة عضد.
// دوره الوحيد: عرض صفحة «لا يوجد اتصال» بدل صفحة خطأ المتصفح عند انقطاع الإنترنت.
// لا يحفظ الصفحات ولا يتدخل في طلبات Firebase (Firestore و Auth و Storage)،
// فتبقى الحملات والتسجيلات محدّثة دائماً كما في الموقع.

// غيّر رقم النسخة عند تعديل offline.html حتى يحفظ المتصفح النسخة الجديدة.
const CACHE_NAME = "oud-offline-v1";
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.add(new Request(OFFLINE_URL, { cache: "reload" })))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil((async () => {
        // حذف النسخ القديمة من صفحة عدم الاتصال.
        const names = await caches.keys();
        await Promise.all(
            names
                .filter(name => name.startsWith("oud-") && name !== CACHE_NAME)
                .map(name => caches.delete(name))
        );

        // يبدأ تحميل الصفحة من الشبكة أثناء تشغيل service worker، فلا يتأخر فتحها.
        if (self.registration.navigationPreload) {
            await self.registration.navigationPreload.enable();
        }

        await self.clients.claim();
    })());
});

self.addEventListener("fetch", event => {
    if (event.request.mode !== "navigate") {
        return;
    }

    // روابط Firebase الداخلية (مثل /__/auth/handler) تمر دون أي تدخل.
    if (new URL(event.request.url).pathname.startsWith("/__/")) {
        return;
    }

    event.respondWith((async () => {
        try {
            const preloaded = await event.preloadResponse;
            return preloaded || await fetch(event.request);
        } catch (error) {
            const cache = await caches.open(CACHE_NAME);
            const offlinePage = await cache.match(OFFLINE_URL);
            return offlinePage || Response.error();
        }
    })());
});
