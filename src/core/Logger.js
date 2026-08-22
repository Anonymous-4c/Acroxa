// src/core/logger.js

class Logger {
  constructor() {
    this.enabled = true;

    this.channels = {
      info: true,
      warn: true,
      error: true,
      db: true,
      auth: true,
      layout: true,
      api: true,
      plugin: true
    };
  }

  log(channel, ...args) {
    if (!this.enabled) return;
    if (!this.channels[channel]) return;

    console.log(`[${channel.toUpperCase()}]`, ...args);
  }

  warn(channel, ...args) {
    if (!this.enabled) return;
    if (!this.channels[channel]) return;

    console.warn(`[${channel.toUpperCase()}]`, ...args);
  }

  error(channel, ...args) {
    if (!this.enabled) return;
    if (!this.channels[channel]) return;

    console.error(`[${channel.toUpperCase()}]`, ...args);
  }
}

module.exports = new Logger();