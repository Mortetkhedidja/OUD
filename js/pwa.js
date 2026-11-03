// تطبيق منصة عضد (PWA):
// 1. تسجيل service worker (sw.js).
// 2. إظهار شريط «ثبّت التطبيق» على أندرويد والكمبيوتر، وشرح طريقة التثبيت على الآيفون.
// يكفي إضافة <script src="/js/pwa.js" defer></script> في كل صفحة.

(function () {
    "use strict";

    // بعد إغلاق الشريط لا يظهر مرة أخرى إلا بعد هذه المدة.
    const DISMISS_DAYS = 14;
    const DISMISS_KEY = "oud-install-dismissed-at";
    const SHOW_DELAY_MS = 3000;

    if ("serviceWorker" in navigator) {
        window.addEventListener("load", () => {
            navigator.serviceWorker.register("/sw.js").catch(error => {
                console.warn("تعذر تسجيل service worker:", error);
            });
        });
    }

    const isInstalled =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.navigator.standalone === true;

    if (isInstalled) {
        return;
    }

    const isIos =
        /iphone|ipad|ipod/i.test(navigator.userAgent) ||
        (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    let installEvent = null;
    let banner = null;

    function wasDismissedRecently() {
        try {
            const dismissedAt = Number(localStorage.getItem(DISMISS_KEY));
            return dismissedAt > 0 && Date.now() - dismissedAt < DISMISS_DAYS * 24 * 60 * 60 * 1000;
        } catch {
            return false;
        }
    }

    function rememberDismiss() {
        try {
            localStorage.setItem(DISMISS_KEY, String(Date.now()));
        } catch {
            // التخزين غير متاح (وضع التصفح الخاص مثلاً): يظهر الشريط مرة أخرى في الزيارة القادمة.
        }
    }

    function addStyles() {
        if (document.getElementById("oud-pwa-style")) {
            return;
        }

        const style = document.createElement("style");
        style.id = "oud-pwa-style";
        style.textContent = `
            .oud-pwa-banner {
                position: fixed;
                left: 12px;
                right: 12px;
                bottom: calc(12px + env(safe-area-inset-bottom, 0px));
                z-index: 2147483000;
                max-width: 460px;
                margin: 0 auto;
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 14px 16px;
                border-radius: 16px;
                background: linear-gradient(135deg, #073B3A, #0B5D5B);
                color: #ffffff;
                box-shadow: 0 12px 32px rgba(7, 59, 58, 0.35);
                font: inherit;
                line-height: 1.6;
                direction: rtl;
                text-align: right;
                animation: oud-pwa-in 0.3s ease-out;
            }

            .oud-pwa-banner[hidden] {
                display: none;
            }

            .oud-pwa-logo {
                flex: none;
                width: 44px;
                height: 44px;
                display: flex;
                align-items: center;
                justify-content: center;
                border-radius: 12px;
                background: #D6AD45;
                color: #073B3A;
                font-size: 23px;
                font-weight: 700;
            }

            .oud-pwa-text {
                flex: 1;
                min-width: 0;
                font-size: 14px;
            }

            .oud-pwa-text strong {
                display: block;
                font-size: 15px;
            }

            .oud-pwa-install {
                flex: none;
                padding: 9px 16px;
                border: 0;
                border-radius: 9px;
                background: #D6AD45;
                color: #073B3A;
                font: inherit;
                font-size: 14px;
                font-weight: 700;
                cursor: pointer;
            }

            .oud-pwa-close {
                flex: none;
                width: 32px;
                height: 32px;
                border: 0;
                border-radius: 50%;
                background: rgba(255, 255, 255, 0.12);
                color: #ffffff;
                font-size: 18px;
                line-height: 1;
                cursor: pointer;
            }

            .oud-pwa-install:focus-visible,
            .oud-pwa-close:focus-visible {
                outline: 3px solid #ffffff;
                outline-offset: 2px;
            }

            /* لا يظهر الشريط عند طباعة بطاقة المتطوع. */
            @media print {
                .oud-pwa-banner { display: none !important; }
            }

            @keyframes oud-pwa-in {
                from { opacity: 0; transform: translateY(16px); }
                to { opacity: 1; transform: none; }
            }

            @media (prefers-reduced-motion: reduce) {
                .oud-pwa-banner { animation: none; }
            }
        `;
        document.head.appendChild(style);
    }

    function hideBanner() {
        if (banner) {
            banner.remove();
            banner = null;
        }
    }

    function showBanner(mode) {
        if (banner || wasDismissedRecently()) {
            return;
        }

        addStyles();

        banner = document.createElement("div");
        banner.className = "oud-pwa-banner";
        banner.setAttribute("role", "dialog");
        banner.setAttribute("aria-label", "تثبيت تطبيق منصة عضد");

        const text = mode === "ios"
            ? `<strong>ثبّت تطبيق عضد على الآيفون</strong>
               اضغط زر المشاركة <span aria-hidden="true">⬆️</span> في المتصفح، ثم اختر «إضافة إلى الشاشة الرئيسية».`
            : `<strong>ثبّت تطبيق عضد</strong>
               وصول أسرع إلى الحملات ومشاركاتك من الشاشة الرئيسية.`;

        banner.innerHTML = `
            <div class="oud-pwa-logo" aria-hidden="true">ع</div>
            <div class="oud-pwa-text">${text}</div>
            ${mode === "ios" ? "" : '<button type="button" class="oud-pwa-install">تثبيت</button>'}
            <button type="button" class="oud-pwa-close" aria-label="إغلاق">×</button>
        `;

        banner.querySelector(".oud-pwa-close").addEventListener("click", () => {
            rememberDismiss();
            hideBanner();
        });

        const installButton = banner.querySelector(".oud-pwa-install");

        if (installButton) {
            installButton.addEventListener("click", promptInstall);
        }

        document.body.appendChild(banner);
    }

    async function promptInstall() {
        if (!installEvent) {
            return;
        }

        const event = installEvent;
        installEvent = null;
        hideBanner();
        setCustomButtonsVisible(false);

        event.prompt();
        const choice = await event.userChoice;

        if (choice.outcome !== "accepted") {
            rememberDismiss();
        }
    }

    // يمكن وضع زر خاص في أي مكان بالموقع: <button data-install-app hidden>ثبّت التطبيق</button>
    // يظهر الزر تلقائياً عندما يكون التثبيت ممكناً.
    function setCustomButtonsVisible(visible) {
        document.querySelectorAll("[data-install-app]").forEach(button => {
            button.hidden = !visible;
        });
    }

    document.addEventListener("click", event => {
        if (event.target.closest("[data-install-app]")) {
            promptInstall();
        }
    });

    // أندرويد والكمبيوتر (Chrome و Edge و Samsung Internet).
    window.addEventListener("beforeinstallprompt", event => {
        event.preventDefault();
        installEvent = event;
        setCustomButtonsVisible(true);
        setTimeout(() => {
            if (installEvent) {
                showBanner("install");
            }
        }, SHOW_DELAY_MS);
    });

    window.addEventListener("appinstalled", () => {
        installEvent = null;
        hideBanner();
        setCustomButtonsVisible(false);

        if (typeof window.gtag === "function") {
            window.gtag("event", "pwa_installed");
        }
    });

    // الآيفون والآيباد: لا يوجد زر تثبيت تلقائي، فنشرح الطريقة.
    if (isIos) {
        window.addEventListener("load", () => {
            setTimeout(() => showBanner("ios"), SHOW_DELAY_MS);
        });
    }
})();
