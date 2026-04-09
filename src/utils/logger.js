// Log-Level: debug < info < warn < error
const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

class Logger {
  constructor(level = process.env.LOG_LEVEL || "info") {
    this.level = LEVELS[level] ?? LEVELS.info;
  }

  debug(message, ...args) {
    this._log("DEBUG", 0, message, ...args);
  }

  info(message, ...args) {
    this._log("INFO", 1, message, ...args);
  }

  warn(message, ...args) {
    this._log("WARN", 2, message, ...args);
  }

  error(message, ...args) {
    this._log("ERROR", 3, message, ...args);
  }

  _log(label, level, message, ...args) {
    if (level < this.level) return;
    const timestamp = new Date().toISOString();
    const output = level >= 2 ? console.error : console.log;
    output(`[${timestamp}] [${label}] ${message}`, ...args);
  }
}

export default new Logger();
