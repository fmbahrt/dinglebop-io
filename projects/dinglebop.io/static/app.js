(() => {
    "use strict";

    const els = {
        clicks: document.getElementById("clicks"),
        online: document.getElementById("online"),
        button: document.getElementById("bop"),
        statusDot: document.getElementById("status-dot"),
        statusText: document.getElementById("status-text"),
    };

    // API origin lives in a <meta> in index.html so dev/prod can differ
    // without touching this file. Empty = same-origin (production via
    // ingress); a full origin (e.g. http://localhost:8080) targets a
    // separate backend.
    const apiOrigin = (
        document.querySelector('meta[name="dinglebop-api-origin"]')?.content || ""
    ).replace(/\/$/, "");
    const API_BASE = `${apiOrigin}/api/v1`;
    const wsUrl = (() => {
        if (apiOrigin) {
            const wsOrigin = apiOrigin.replace(/^http/, "ws");
            return `${wsOrigin}/api/v1/ws`;
        }
        const proto = location.protocol === "https:" ? "wss:" : "ws:";
        return `${proto}//${location.host}/api/v1/ws`;
    })();

    let ws = null;
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let lastMessageAt = 0;

    function setOnline(online) {
        els.statusDot.classList.toggle("online", online);
        els.statusDot.classList.toggle("offline", !online);
        els.statusText.textContent = online ? "online" : "reconnecting…";
        els.button.disabled = !online;
    }

    function bumpAndSet(el, value) {
        if (el.textContent === String(value)) return;
        el.textContent = value.toLocaleString();
        el.classList.remove("bump");
        // Force reflow so the animation restarts.
        void el.offsetWidth;
        el.classList.add("bump");
    }

    function applyMessage(msg) {
        switch (msg.type) {
            case "state":
                bumpAndSet(els.clicks, msg.clicks);
                bumpAndSet(els.online, msg.online);
                break;
            case "click":
                bumpAndSet(els.clicks, msg.clicks);
                break;
            case "online":
                bumpAndSet(els.online, msg.online);
                break;
        }
    }

    function connect() {
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        try {
            ws = new WebSocket(wsUrl);
        } catch (err) {
            scheduleReconnect();
            return;
        }

        ws.addEventListener("open", () => {
            reconnectAttempts = 0;
            lastMessageAt = Date.now();
            setOnline(true);
        });

        ws.addEventListener("message", (event) => {
            lastMessageAt = Date.now();
            try {
                const msg = JSON.parse(event.data);
                applyMessage(msg);
            } catch (err) {
                // Ignore malformed messages.
            }
        });

        ws.addEventListener("close", () => {
            setOnline(false);
            scheduleReconnect();
        });

        ws.addEventListener("error", () => {
            // The close handler is what actually triggers the reconnect.
            try { ws.close(); } catch (_) { /* noop */ }
        });
    }

    function scheduleReconnect() {
        if (reconnectTimer) return;
        const base = Math.min(10_000, 250 * Math.pow(2, reconnectAttempts));
        const jitter = Math.random() * 250;
        const delay = base + jitter;
        reconnectAttempts += 1;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            connect();
        }, delay);
    }

    // Watchdog: if we go silent for too long, force a reconnect.
    setInterval(() => {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;
        if (Date.now() - lastMessageAt > 60_000) {
            try { ws.close(); } catch (_) { /* noop */ }
        }
    }, 10_000);

    els.button.addEventListener("click", async () => {
        try {
            await fetch(`${API_BASE}/click`, { method: "POST" });
        } catch (err) {
            // The broadcast will reconcile state on reconnect.
        }
    });

    setOnline(false);
    connect();
})();
