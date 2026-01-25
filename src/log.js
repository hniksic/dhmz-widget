/**
 * Weather Widget - Logging Utility
 *
 * Provides timestamped logging with consistent formatting.
 */

/**
 * Formats current time as HH:MM:SS.mmm
 * @returns {string}
 */
function timestamp() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    const ms = String(now.getMilliseconds()).padStart(3, '0');
    return `${h}:${m}:${s}.${ms}`;
}

/**
 * Log an info message with timestamp.
 * @param {...any} args
 */
export function log(...args) {
    console.log(`[${timestamp()}]`, ...args);
}

/**
 * Log a warning message with timestamp.
 * @param {...any} args
 */
export function warn(...args) {
    console.warn(`[${timestamp()}]`, ...args);
}
