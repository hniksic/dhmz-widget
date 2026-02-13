/**
 * Weather Widget - Configuration
 *
 * Data source configuration, constants, and shared state.
 */

import { log, warn } from './log.js';

// =============================================================================
// DATA SOURCE CONFIGURATION
// =============================================================================

/** LocalStorage key for source preference */
const SOURCE_KEY = 'weather-source';

/**
 * Get saved source from localStorage, with URL override for backwards compatibility.
 * @returns {'dhmz' | 'pljusak'}
 */
function getSavedSource() {
    // URL parameter overrides localStorage (for backwards compatibility)
    const urlSource = new URLSearchParams(window.location.search).get('source');
    if (urlSource === 'pljusak' || urlSource === 'dhmz') {
        return urlSource;
    }
    // Otherwise use localStorage, defaulting to 'pljusak'
    const saved = localStorage.getItem(SOURCE_KEY);
    return saved === 'dhmz' ? 'dhmz' : 'pljusak';
}

/**
 * Save source preference to localStorage.
 * @param {'dhmz' | 'pljusak'} source
 */
export function saveSource(source) {
    localStorage.setItem(SOURCE_KEY, source);
}

/** Current data source (mutable - can be changed via UI) */
export let DATA_SOURCE = getSavedSource();

/**
 * Update the current data source.
 * @param {'dhmz' | 'pljusak'} source
 */
export function setDataSource(source) {
    DATA_SOURCE = source;
}

/**
 * Data source configurations.
 * Each source has a parser object (DhmzParser or PljusakParser) that handles
 * parsing the response and formatting measurement times.
 */
export const DATA_SOURCES = {
    dhmz: {
        url: 'https://vrijeme.hr/hrvatska1_n.xml',
        // Station name uses hyphen separator (e.g., "Zagreb-Grič")
        nameSeparator: '-',
        // Only split these city prefixes (others like "Bilogora-Bjelovar" stay as-is)
        cityPrefixes: [
            'Dubrovnik',
            'Osijek',
            'Pula',
            'Rijeka',
            'Split',
            'Zadar',
            'Zagreb',
        ],
        label: 'DHMZ',
        parser: null,  // Set by parsers.js
    },
    pljusak: {
        url: 'https://pljusak.com/karta.php',
        // Station name uses comma separator (e.g., "Zagreb, Podsused")
        nameSeparator: ', ',
        // null = always split on separator (all pljusak names with comma are "City, Location")
        cityPrefixes: null,
        label: 'pljusak',
        parser: null,  // Set by parsers.js
    }
};

/** Get current source configuration (dynamic lookup) */
export function getSourceConfig() {
    return DATA_SOURCES[DATA_SOURCE];
}

// =============================================================================
// CORS PROXY
// =============================================================================

/**
 * CORS proxies to try in order (neither vrijeme.hr nor pljusak.com send CORS headers).
 * Each proxy has a name for logging, a baseUrl, and whether to encodeURIComponent the URL.
 */
const CORS_PROXIES = [
    { name: 'cors.lol', baseUrl: 'https://api.cors.lol/?url=', encode: true },
    { name: 'codetabs', baseUrl: 'https://api.codetabs.com/v1/proxy?quest=', encode: true },
    { name: 'corsproxy.dev', baseUrl: 'https://corsproxy-8uo5.onrender.com/?url=', encode: true },
];

/**
 * Two-list proxy selection:
 * - workingProxies: assumed functional, picked randomly for load distribution
 * - failedProxies: have failed recently, retried oldest-first (FIFO)
 */
let workingProxies = [...CORS_PROXIES];
let failedProxies = [];

/** Timeout per proxy attempt in milliseconds */
const PROXY_TIMEOUT_MS = 1000;

/**
 * Fetches a URL via CORS proxy with automatic fallback.
 *
 * Selection strategy:
 * - If working list is non-empty, pick a random proxy (distributes load)
 * - Otherwise, pick the oldest failed proxy (gives it time to recover)
 *
 * After each attempt:
 * - Success: proxy returns to working list
 * - Failure: proxy goes to back of failed list
 *
 * @param {string} url - The URL to fetch
 * @param {RequestInit} [options] - Optional fetch options (will be merged with abort signal)
 * @param {((response: Response) => Promise<void>)|null} [validate] - Optional async
 *        validator called with a cloned response. If it throws, the proxy is
 *        treated as failed and the next one is tried.
 * @returns {Promise<Response>} The response from the first successful proxy
 * @throws {Error} If all proxies fail
 */
export async function fetchViaProxy(url, options = {}, validate = null) {
    const errors = [];

    // Snapshot globals - work on local copies to avoid interference from concurrent requests
    let localWorking = [...workingProxies];
    let localFailed = [...failedProxies];
    const totalProxies = localWorking.length + localFailed.length;

    for (let attempt = 0; attempt < totalProxies; attempt++) {
        // Pick proxy: random from working, or oldest from failed
        let proxy;
        if (localWorking.length > 0) {
            const idx = Math.floor(Math.random() * localWorking.length);
            proxy = localWorking.splice(idx, 1)[0];
        } else {
            proxy = localFailed.shift();
        }

        const proxyUrl = proxy.baseUrl + (proxy.encode ? encodeURIComponent(url) : url);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), PROXY_TIMEOUT_MS);

        try {
            const response = await fetch(proxyUrl, {
                ...options,
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            if (validate) {
                await validate(response.clone());
            }

            log(`Proxy ${proxy.name}: success`);
            localWorking.push(proxy);
            // Update globals with our local state (last concurrent request wins)
            workingProxies = localWorking;
            failedProxies = localFailed;
            return response;
        } catch (error) {
            clearTimeout(timeoutId);
            const reason = error.name === 'AbortError' ? 'timeout' : error.message;
            warn(`Proxy ${proxy.name}: ${reason}`);
            errors.push(`${proxy.name}: ${reason}`);
            localFailed.push(proxy);
        }
    }

    // All failed - still update globals so future requests know the state
    workingProxies = localWorking;
    failedProxies = localFailed;
    throw new Error(`All proxies failed: ${errors.join(', ')}`);
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Special location that uses geolocation to find nearest station */
export const NEAREST_LOCATION = 'Najbliža';

/** Refresh interval in milliseconds (15 minutes) */
export const REFRESH_INTERVAL = 15 * 60 * 1000;

/** Data older than this is considered stale (1 hour) */
export const STALE_THRESHOLD_MS = 60 * 60 * 1000;

/** Data older than this shows "staro" instead of the hour (23 hours) */
export const OLD_THRESHOLD_MS = 23 * 60 * 60 * 1000;

/** Type-ahead search buffer timeout (ms) */
export const TYPEAHEAD_TIMEOUT_MS = 2000;

/** Distance (km) at which to warn user about station distance */
export const DISTANCE_WARNING_THRESHOLD = 20;

// =============================================================================
// SHARED STATE
// =============================================================================

/** Cached station data from last fetch */
export let cachedStations = null;

/**
 * Update cached stations.
 * @param {Object<string, StationData>|null} stations
 */
export function setCachedStations(stations) {
    cachedStations = stations;
}

/** Whether a fetch is currently in progress (prevents concurrent fetches) */
export let fetchInProgress = false;

/**
 * Set fetch in progress state.
 * @param {boolean} inProgress
 */
export function setFetchInProgress(inProgress) {
    fetchInProgress = inProgress;
}

/** Timestamp of last fetch start (for throttling auto-refresh) */
export let lastRefresh = 0;

/**
 * Set last refresh timestamp.
 * @param {number} timestamp
 */
export function setLastRefresh(timestamp) {
    lastRefresh = timestamp;
}

// =============================================================================
// LOCATION STORAGE
// =============================================================================

/** LocalStorage key for selected location (shared across sources) */
const LOCATION_KEY = 'selected-location';

/** Check if user has explicitly chosen a location */
export function hasSelectedLocation() {
    return localStorage.getItem(LOCATION_KEY) !== null;
}

/** Get selected location from localStorage */
export function getSelectedLocation() {
    return localStorage.getItem(LOCATION_KEY) || NEAREST_LOCATION;
}

/** Save selected location to localStorage */
export function setSelectedLocation(location) {
    localStorage.setItem(LOCATION_KEY, location);
    // Clear cached coords; they'll be re-saved on next render
    localStorage.removeItem(LOCATION_KEY + '-coords');
}

/**
 * Save coordinates of the currently displayed station.
 * Used to find the nearest station if the saved station disappears from the data.
 */
export function setSelectedLocationCoords(lat, lon) {
    localStorage.setItem(LOCATION_KEY + '-coords', JSON.stringify({ lat, lon }));
}

/**
 * Get saved coordinates of the selected station.
 * @returns {{lat: number, lon: number} | null}
 */
export function getSelectedLocationCoords() {
    const raw = localStorage.getItem(LOCATION_KEY + '-coords');
    if (!raw) return null;
    try {
        const { lat, lon } = JSON.parse(raw);
        if (isFinite(lat) && isFinite(lon)) return { lat, lon };
    } catch { /* ignore */ }
    return null;
}

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

/**
 * @typedef {Object} StationData
 * @property {string} name - Station name
 * @property {number} lat - Latitude
 * @property {number} lon - Longitude
 * @property {number} temperature - Temperature in °C
 * @property {number|null} humidity - Relative humidity %
 * @property {number|null} pressure - Atmospheric pressure in hPa
 * @property {number|null} pressureTrend - Pressure tendency (+/- value)
 * @property {string|null} windDirection - Wind direction
 * @property {number|null} windSpeed - Wind speed in m/s
 * @property {string|null} condition - Weather condition description
 * @property {Date|null} measurementTime - When the measurement was taken
 */
