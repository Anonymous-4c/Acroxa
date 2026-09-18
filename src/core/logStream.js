const clients = new Set();

const MAX_LOGS = 1000;
const history = [];

let streamingEnabled = true;

const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console)
};

function addLog(type, args) {

    const entry = {
        type,
        timestamp: Date.now(),
        message: args.map(arg => {
            try {
                return typeof arg === "object"
                    ? JSON.stringify(arg)
                    : String(arg);
            } catch {
                return "[Unserializable]";
            }
        })
    };

    history.push(entry);

    if (history.length > MAX_LOGS) {
        history.shift();
    }

    if (!streamingEnabled) return;

    const payload = `data: ${JSON.stringify(entry)}\n\n`;

    for (const client of clients) {
        client.write(payload);
    }
}

// Quiet channel: writes to the Logs UI (history + live SSE) but never to the
// terminal. For routine informational noise (model loads, route mounts,
// page rebuilds) that belongs on /acrx/system/logs, not the dev console.
// Errors should use console.error so they reach BOTH terminal and Logs UI.
function quiet(type, ...args) {
    addLog(type || "info", args);
}

// Terminal suppression for third-party noise (mongoose warnings etc.) is
// deliberately NOT done by overriding console.warn globally; call sites use
// quiet() instead so the Logs page stays the single source of truth.

function patchConsole() {

    console.log = (...args) => {
        original.log(...args);
        addLog("log", args);
    };

    console.info = (...args) => {
        original.info(...args);
        addLog("info", args);
    };

    console.warn = (...args) => {
        original.warn(...args);
        addLog("warn", args);
    };

    console.error = (...args) => {
        original.error(...args);
        addLog("error", args);
    };

    process.on("uncaughtException", err => {
        addLog("uncaughtException", [err.stack || err.message]);
    });

    process.on("unhandledRejection", err => {
        addLog("unhandledRejection", [
            err?.stack || err?.message || String(err)
        ]);
    });
}

function createStream(req, res) {

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    res.flushHeaders?.();

    for (const log of history) {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
    }

    clients.add(res);

    req.on("close", () => {
        clients.delete(res);
    });
}

// Paginated JSON read of the ring buffer (newest first). Bounded and
// copy-safe: never exposes the live array, never more than MAX_LOGS.
function readHistory({ limit = 200, offset = 0, types = null } = {}) {
    const n = Math.max(1, Math.min(parseInt(limit, 10) || 200, MAX_LOGS));
    const off = Math.max(0, parseInt(offset, 10) || 0);
    const wanted = Array.isArray(types) && types.length ? new Set(types.map(String)) : null;
    const out = [];
    for (let i = history.length - 1 - off; i >= 0 && out.length < n; i--) {
        const e = history[i];
        if (wanted && !wanted.has(e.type)) continue;
        out.push({ type: e.type, timestamp: e.timestamp, message: [...e.message] });
    }
    return { entries: out, total: history.length };
}

module.exports = {
    patchConsole,
    createStream,
    history,
    clients,
    readHistory,
    quiet,

    enable() {
        streamingEnabled = true;
    },

    disable() {
        streamingEnabled = false;
    },

    clear() {
        history.length = 0;
    },

    status() {
        return {
            enabled: streamingEnabled,
            connectedClients: clients.size,
            logsStored: history.length
        };
    }
};