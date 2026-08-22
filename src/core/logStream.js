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

module.exports = {
    patchConsole,
    createStream,
    history,
    clients,

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