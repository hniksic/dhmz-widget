/**
 * Weather Widget - Configuration
 *
 * Data source configuration, constants, and shared state.
 */

// =============================================================================
// DATA SOURCE CONFIGURATION
// =============================================================================

/** LocalStorage key for source preference */
export const SOURCE_KEY = 'weather-source';

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
    // Otherwise use localStorage, defaulting to 'dhmz'
    const saved = localStorage.getItem(SOURCE_KEY);
    return saved === 'pljusak' ? 'pljusak' : 'dhmz';
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
        locationKey: 'dhmz-location',
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
        locationKey: 'pljusak-location',
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

/** CORS proxy (neither vrijeme.hr nor pljusak.com send CORS headers) */
export const PROXY_URL = 'https://api.codetabs.com/v1/proxy?quest=';

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

/** Get LocalStorage key for selected location (source-specific) */
export function getLocationKey() {
    return getSourceConfig().locationKey;
}

/** Check if user has explicitly chosen a location */
export function hasSelectedLocation() {
    return localStorage.getItem(getLocationKey()) !== null;
}

/** Get selected location from localStorage */
export function getSelectedLocation() {
    return localStorage.getItem(getLocationKey()) || NEAREST_LOCATION;
}

/** Save selected location to localStorage */
export function setSelectedLocation(location) {
    localStorage.setItem(getLocationKey(), location);
    // Clear cached coords; they'll be re-saved on next render
    localStorage.removeItem(getLocationKey() + '-coords');
}

/**
 * Save coordinates of the currently displayed station.
 * Used to find the nearest station if the saved station disappears from the data.
 */
export function setSelectedLocationCoords(lat, lon) {
    localStorage.setItem(getLocationKey() + '-coords', JSON.stringify({ lat, lon }));
}

/**
 * Get saved coordinates of the selected station.
 * @returns {{lat: number, lon: number} | null}
 */
export function getSelectedLocationCoords() {
    const raw = localStorage.getItem(getLocationKey() + '-coords');
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
