/**
 * Weather Widget - Configuration
 *
 * Data source configuration, constants, and shared state.
 */

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
    // Otherwise use localStorage, defaulting to 'dhmz'
    const saved = localStorage.getItem(SOURCE_KEY);
    return saved === 'pljusak' ? 'pljusak' : 'dhmz';
}

/**
 * Save source preference to localStorage.
 * @param {'dhmz' | 'pljusak'} source
 */
function saveSource(source) {
    localStorage.setItem(SOURCE_KEY, source);
}

/** Current data source (mutable - can be changed via UI) */
let DATA_SOURCE = getSavedSource();

/**
 * Update the current data source.
 * @param {'dhmz' | 'pljusak'} source
 */
function setDataSource(source) {
    DATA_SOURCE = source;
}

/**
 * Data source configurations.
 * Each source has a parser object (DhmzParser or PljusakParser) that handles
 * parsing the response and formatting measurement times.
 */
const DATA_SOURCES = {
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
function getSourceConfig() {
    return DATA_SOURCES[DATA_SOURCE];
}

/** CORS proxy (neither vrijeme.hr nor pljusak.com send CORS headers) */
const PROXY_URL = 'https://corsproxy.io/?';

// =============================================================================
// CONSTANTS
// =============================================================================

/** Special location that uses geolocation to find nearest station */
const NEAREST_LOCATION = 'Najbliža';

/** Refresh interval in milliseconds (15 minutes) */
const REFRESH_INTERVAL = 15 * 60 * 1000;

/** Data older than this is considered stale (1 hour) */
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

/** Data older than this shows "staro" instead of the hour (23 hours) */
const OLD_THRESHOLD_MS = 23 * 60 * 60 * 1000;

/** Type-ahead search buffer timeout (ms) */
const TYPEAHEAD_TIMEOUT_MS = 2000;

/** Distance (km) at which to warn user about station distance */
const DISTANCE_WARNING_THRESHOLD = 20;

// =============================================================================
// SHARED STATE
// =============================================================================

/** Cached station data from last fetch */
let cachedStations = null;

/**
 * Update cached stations.
 * @param {Object<string, StationData>|null} stations
 */
function setCachedStations(stations) {
    cachedStations = stations;
}

/** Whether a fetch is currently in progress (prevents concurrent fetches) */
let fetchInProgress = false;

/**
 * Set fetch in progress state.
 * @param {boolean} inProgress
 */
function setFetchInProgress(inProgress) {
    fetchInProgress = inProgress;
}

/** Timestamp of last fetch start (for throttling auto-refresh) */
let lastRefresh = 0;

/**
 * Set last refresh timestamp.
 * @param {number} timestamp
 */
function setLastRefresh(timestamp) {
    lastRefresh = timestamp;
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
