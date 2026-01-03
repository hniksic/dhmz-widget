/**
 * Weather Widget
 *
 * Fetches current weather data from either:
 * - DHMZ (Croatian Meteorological Service) - official stations
 * - pljusak.com - amateur weather station network
 *
 * Source can be switched via the UI toggle in the top-left corner.
 * Source preference is saved to localStorage.
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
 * Data source configurations
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
    },
    pljusak: {
        url: 'https://pljusak.com/karta.php',
        locationKey: 'pljusak-location',
        // Station name uses comma separator (e.g., "Zagreb, Podsused")
        nameSeparator: ', ',
        // null = always split on separator (all pljusak names with comma are "City, Location")
        cityPrefixes: null,
        label: 'pljusak',
    }
};

/** Get current source configuration (dynamic lookup) */
function getSourceConfig() {
    return DATA_SOURCES[DATA_SOURCE];
}

/** CORS proxy (neither vrijeme.hr nor pljusak.com send CORS headers) */
const PROXY_URL = 'https://corsproxy.io/?';

/** Special location that uses geolocation to find nearest station */
const NEAREST_LOCATION = 'Najbliža';

/** Get LocalStorage key for selected location (source-specific) */
function getLocationKey() {
    return getSourceConfig().locationKey;
}

/** Cached station data from last fetch */
let cachedStations = null;

/**
 * Geolocation - Handles user location detection.
 *
 * Flow when user selects "Najbliža" (nearest station):
 * 1. If coords available → show weather for nearest station
 * 2. If coords not available:
 *    - status 'unknown' → show "Tražim lokaciju..." with cancel button
 *      - Cancel hides the status overlay and opens dropdown for manual selection
 *        (sets cancelledByUser flag to prevent geolocation timeout from showing error)
 *      - Re-selecting "Najbliža" retries geolocation (resets status and cancelledByUser)
 *    - status 'denied' → show error with instructions to enable in device settings
 *    - status 'unavailable' → show error suggesting manual selection
 * 3. When geolocation resolves:
 *    - Success → set status='granted', cache coords, render weather
 *    - Permission denied (code 1) → set status='denied', show error
 *    - Other failure (timeout, etc.) → set status='unavailable', show error
 */
const Geolocation = {
    /** Status: 'unknown' | 'granted' | 'denied' | 'unavailable' */
    status: 'unknown',
    /** Cached coordinates from last successful geolocation */
    coords: null,
    /** Set to true when user cancels geolocation prompt to prevent UI updates */
    cancelledByUser: false,

    /** Check if coordinates are available */
    hasCoords() {
        return this.coords !== null;
    },

    /**
     * Request user's geolocation and cache coordinates.
     * On first visit, auto-selects "Najbliža" location.
     */
    request() {
        if (!('geolocation' in navigator)) {
            console.log('[vrijeme] Geolocation not available');
            this.status = 'unavailable';
            LocationPicker.updateDetectedLabel();
            return;
        }

        const self = this;
        navigator.geolocation.getCurrentPosition(
            (position) => {
                self.status = 'granted';
                self.coords = {
                    lat: position.coords.latitude,
                    lon: position.coords.longitude
                };
                console.log('[vrijeme] User location:', self.coords.lat.toFixed(4), self.coords.lon.toFixed(4));

                // On first visit, auto-select "Najbliža"
                if (!hasSelectedLocation()) {
                    setSelectedLocation(NEAREST_LOCATION);
                }

                // Update dropdown and re-render if "Najbliža" is selected
                LocationPicker.updateDetectedLabel();
                if (getSelectedLocation() === NEAREST_LOCATION) {
                    LocationPicker.updateSelection(NEAREST_LOCATION);
                    renderSelectedStation();
                }
            },
            (error) => {
                console.log('[vrijeme] Geolocation denied or failed:', error.message, 'code:', error.code);
                // error.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
                self.status = error.code === 1 ? 'denied' : 'unavailable';
                LocationPicker.updateDetectedLabel();

                // If "Najbliža" is currently selected and we can't get location, render error
                // (unless user cancelled and is manually selecting a station)
                if (getSelectedLocation() === NEAREST_LOCATION && !self.cancelledByUser) {
                    renderSelectedStation();
                }
            },
            { timeout: 10000, maximumAge: 300000 }
        );
    },

    /**
     * Retry geolocation (resets status to allow fresh attempt).
     * Called when user re-selects "Najbliža" after a previous failure.
     */
    retry() {
        this.status = 'unknown';
        this.cancelledByUser = false;
        LocationPicker.updateDetectedLabel();
        this.request();
    }
};

/** Refresh interval in milliseconds (15 minutes) */
const REFRESH_INTERVAL = 15 * 60 * 1000;

/** Data older than this is considered stale (1 hour) */
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

/** Data older than this shows "staro" instead of the hour (23 hours) */
const OLD_THRESHOLD_MS = 23 * 60 * 60 * 1000;

/** Type-ahead search buffer timeout (ms) */
const TYPEAHEAD_TIMEOUT_MS = 2000;

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

/** Whether a fetch is currently in progress (prevents concurrent fetches) */
let fetchInProgress = false;

/** Timestamp of last fetch start (for throttling auto-refresh) */
let lastRefresh = 0;

/**
 * Fetches weather data from the configured source via CORS proxy and updates the display.
 */
async function fetchWeatherData() {
    // Prevent concurrent fetches (e.g., click + focus firing together)
    if (fetchInProgress) {
        console.log('[vrijeme] Fetch already in progress, skipping');
        return;
    }
    fetchInProgress = true;
    lastRefresh = Date.now();

    const cacheBuster = `?_=${Date.now()}`;
    const fetchUrl = PROXY_URL + encodeURIComponent(getSourceConfig().url + cacheBuster);
    const widget = document.getElementById('widget');

    widget.classList.add('refreshing');
    console.log('[vrijeme] Fetching weather data from', DATA_SOURCE);

    try {
        const response = await fetch(fetchUrl);
        console.log('[vrijeme] Response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const responseText = await response.text();
        console.log('[vrijeme] Response length:', responseText.length, 'chars');

        // Parse based on data source
        if (DATA_SOURCE === 'pljusak') {
            cachedStations = parsePljusakResponse(responseText);
        } else {
            cachedStations = parseDhmzResponse(responseText);
        }

        const collator = new Intl.Collator('hr');
        const stationNames = Object.keys(cachedStations).sort(collator.compare);
        console.log('[vrijeme] Found stations:', stationNames.length);

        // Clear any previous error toast on successful fetch
        hideToast();

        LocationPicker.populate(stationNames);
        Geolocation.request();
        renderSelectedStation();

    } catch (error) {
        console.error('[vrijeme] Error:', error);
        // If we have cached data, show toast and keep displaying old data
        if (cachedStations) {
            console.log('[vrijeme] Using cached data due to fetch error');
            showToast('Učitavanje nije uspjelo');
        } else {
            renderError('Greška: ' + error.message);
        }
    } finally {
        fetchInProgress = false;
        widget.classList.remove('refreshing');
    }
}

// =============================================================================
// DHMZ PARSER (vrijeme.hr XML format)
// =============================================================================

/*
 * DHMZ XML STRUCTURE (https://vrijeme.hr/hrvatska1_n.xml)
 *
 * <?xml version="1.0" encoding="UTF-8"?>
 * <Hrvatska>
 *   <DatumTermin>
 *     <Datum>DD.MM.YYYY</Datum>    <!-- Measurement date -->
 *     <Termin>HH</Termin>          <!-- Hour (0-23) -->
 *   </DatumTermin>
 *   <Grad autom="0|1">             <!-- autom: 0=manual, 1=automatic station -->
 *     <GradIme>Station Name</GradIme>
 *     <Lat>XX.XXX</Lat>            <!-- Latitude (42-47°N) -->
 *     <Lon>XX.XXX</Lon>            <!-- Longitude (13-19°E) -->
 *     <Podatci>
 *       <Temp>XX.X</Temp>          <!-- Temperature in °C -->
 *       <Vlaga>XX</Vlaga>          <!-- Relative humidity % -->
 *       <Tlak>XXXX.X</Tlak>        <!-- Pressure in hPa -->
 *       <TlakTend>+X.X</TlakTend>  <!-- Pressure tendency -->
 *       <VjetarSmjer>XX</VjetarSmjer>      <!-- Wind direction -->
 *       <VjetarBrzina>X.X</VjetarBrzina>   <!-- Wind speed in m/s -->
 *       <Vrijeme>description</Vrijeme>     <!-- Weather description -->
 *     </Podatci>
 *   </Grad>
 * </Hrvatska>
 */

/**
 * Parses DHMZ XML response and returns station data.
 * @param {string} xmlText - Raw XML response
 * @returns {Object<string, StationData>}
 */
function parseDhmzResponse(xmlText) {
    // Verify we got XML, not an error page
    if (!xmlText.startsWith('<?xml')) {
        console.error('[vrijeme] Invalid response (not XML):', xmlText.substring(0, 200));
        throw new Error('Invalid response from proxy');
    }

    const xmlDoc = new DOMParser().parseFromString(xmlText, 'text/xml');

    // Check for XML parse errors
    const parseError = xmlDoc.querySelector('parsererror');
    if (parseError) {
        console.error('[vrijeme] XML parse error:', parseError.textContent);
        throw new Error('XML parse error');
    }

    const measurementTime = extractDhmzMeasurementTime(xmlDoc);
    return extractDhmzStations(xmlDoc, measurementTime);
}

/**
 * Extracts measurement timestamp from DHMZ XML.
 * @param {Document} xmlDoc
 * @returns {Date|null}
 */
function extractDhmzMeasurementTime(xmlDoc) {
    const datumTermin = xmlDoc.querySelector('DatumTermin');
    if (!datumTermin) return null;

    const datum = datumTermin.querySelector('Datum');
    const termin = datumTermin.querySelector('Termin');

    if (datum && termin) {
        // Datum format: "DD.MM.YYYY", Termin format: "HH"
        const match = datum.textContent.trim().match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (!match) return null;
        const [, day, month, year] = match;
        const hour = parseInt(termin.textContent.trim(), 10);
        return new Date(year, month - 1, day, hour);
    }
    return null;
}

/**
 * Extracts all stations from DHMZ XML.
 * @param {Document} xmlDoc
 * @param {Date|null} measurementTime
 * @returns {Object<string, StationData>}
 */
function extractDhmzStations(xmlDoc, measurementTime) {
    const stations = xmlDoc.querySelectorAll('Grad');
    /** @type {Object<string, StationData>} */
    const result = {};

    stations.forEach(station => {
        const nameEl = station.querySelector('GradIme');
        if (!nameEl) return;

        const name = nameEl.textContent.trim();
        const lat = parseFloat(station.querySelector('Lat')?.textContent);
        const lon = parseFloat(station.querySelector('Lon')?.textContent);
        const data = station.querySelector('Podatci');
        if (!data) return;

        const temp = data.querySelector('Temp');
        const tempValue = temp?.textContent.trim();

        // Skip if no valid temperature
        if (!tempValue || tempValue === '-') return;

        result[name] = {
            name,
            lat,
            lon,
            temperature: parseFloat(tempValue),
            humidity: getNumberOrNull(data, 'Vlaga'),
            pressure: getNumberOrNull(data, 'Tlak'),
            pressureTrend: getNumberOrNull(data, 'TlakTend'),
            windDirection: getTextOrNull(data, 'VjetarSmjer'),
            windSpeed: getNumberOrNull(data, 'VjetarBrzina'),
            condition: getTextOrNull(data, 'Vrijeme'),
            measurementTime
        };
    });

    return result;
}

// =============================================================================
// PLJUSAK PARSER (pljusak.com JavaScript array format)
// =============================================================================

/*
 * PLJUSAK.COM DATA STRUCTURE (https://pljusak.com/karta.php)
 *
 * The page contains a JavaScript array `var podaci = [...]` with weather
 * observations from amateur stations. Data updates every 5-15 minutes.
 *
 * Each station entry is an array:
 *   [0]  Type (lokalna, wu_05, wu_15, dhmz, arso, etc.)
 *   [1]  Station name
 *   [2]  Latitude (string)
 *   [3]  Longitude (string)
 *   [4]  Elevation in meters
 *   [5]  Priority/order number
 *   [6]  Station URL
 *   [7]  Device type (e.g., "Davis Vantage Pro2")
 *   [8]  Software (e.g., "WeatherLink")
 *   [9]  Notes
 *   [10] Measurement time (HH:MM:SS)
 *   [11] Webcam URL (optional)
 *   [12] Temperature in °C
 *   [13] Temperature trend
 *   [14] Pressure in hPa
 *   [15] Pressure trend
 *   [16] Humidity %
 *   [17] Wind direction (e.g., "SSW", "N")
 *   [18] Wind speed in m/s
 *   ...  additional fields for precipitation, min/max temps, etc.
 */

/** Pljusak.com data array indices */
const PODACI = {
    TYPE: 0,
    NAME: 1,
    LAT: 2,
    LON: 3,
    ELEVATION: 4,
    TIME: 10,
    TEMPERATURE: 12,
    PRESSURE: 14,
    PRESSURE_TREND: 15,
    HUMIDITY: 16,
    WIND_DIR: 17,
    WIND_SPEED: 18,
    DEWPOINT: 24
};

/**
 * Generates a weather description based on measured values.
 * Used for pljusak.com which doesn't provide condition text.
 *
 * @param {number} temp - Temperature in °C
 * @param {number|null} humidity - Relative humidity in %
 * @param {number|null} windSpeed - Wind speed in m/s
 * @param {number|null} dewpoint - Dewpoint temperature in °C
 * @returns {string} Weather description in Croatian
 */
function generateWeatherDescription(temp, humidity, windSpeed, dewpoint) {
    // Wind levels (m/s)
    const isCalm = windSpeed === null || windSpeed < 3;
    const hasBreeze = windSpeed !== null && windSpeed >= 3 && windSpeed < 6;
    const isWindy = windSpeed !== null && windSpeed >= 6 && windSpeed < 11;
    const isStrongWind = windSpeed !== null && windSpeed >= 11;

    // Fog: very strict - near-saturation, tight dewpoint spread, calm, cool temps.
    // Real fog is rare; when uncertain, prefer non-fog descriptions.
    const isFoggy = dewpoint !== null &&
                    humidity !== null &&
                    humidity >= 97 &&
                    Math.abs(temp - dewpoint) <= 1 &&
                    temp >= -3 && temp <= 15 &&
                    isCalm;

    // Humidity feel (temperature-dependent)
    const isMuggy = humidity !== null && humidity >= 65 && temp >= 26;
    const isOppressive = humidity !== null && humidity >= 75 && temp >= 30;
    const isDamp = humidity !== null && humidity >= 85 && temp < 12;
    const isDry = humidity !== null && humidity < 30 && temp >= 25;

    // Fog (rare)
    if (isFoggy) {
        return temp <= 0 ? 'ledena magla' : 'magla';
    }

    // Extreme heat (>= 36°C)
    if (temp >= 36) {
        if (isOppressive) return 'neizdrživa sparina';
        if (isMuggy) return 'teška vrućina';
        return 'žega';
    }

    // Hot (30-36°C)
    if (temp >= 30) {
        if (isOppressive) return 'sparina';
        if (isMuggy) return 'sparno';
        if (isDry) return 'suha vrućina';
        if (isStrongWind) return 'vruće, jak vjetar';
        return 'vruće';
    }

    // Warm (25-30°C)
    if (temp >= 25) {
        if (isMuggy) return 'toplo i sparno';
        if (hasBreeze) return 'toplo uz povjetarac';
        if (isWindy || isStrongWind) return 'toplo, vjetrovito';
        return 'toplo';
    }

    // Pleasant (20-25°C)
    if (temp >= 20) {
        if (humidity !== null && humidity >= 75) return 'toplo i vlažno';
        if (hasBreeze) return 'ugodno';
        if (isWindy) return 'ugodno uz vjetar';
        if (isStrongWind) return 'umjereno, vjetrovito';
        return 'ugodna temperatura';
    }

    // Mild (15-20°C)
    if (temp >= 15) {
        if (isStrongWind) return 'svježe, jak vjetar';
        if (isWindy) return 'svježe uz vjetar';
        if (isDamp) return 'svježe i vlažno';
        return 'svježe';
    }

    // Cool (10-15°C)
    if (temp >= 10) {
        if (isStrongWind) return 'hladan vjetar';
        if (isWindy) return 'prohladno uz vjetar';
        if (isDamp) return 'prohladno i vlažno';
        return 'prohladno';
    }

    // Chilly (5-10°C)
    if (temp >= 5) {
        if (isStrongWind) return 'oštar vjetar';
        if (isWindy) return 'hladno uz vjetar';
        if (isDamp) return 'neugodna vlaga';
        return 'prohladno';
    }

    // Cold (0-5°C)
    if (temp >= 0) {
        if (isStrongWind) return 'prodoran vjetar';
        if (isWindy) return 'hladno, vjetrovito';
        if (isDamp) return 'vlažna hladnoća';
        return 'hladno';
    }

    // Freezing (-5 to 0°C)
    if (temp >= -5) {
        if (isStrongWind) return 'ledeno, oštar vjetar';
        if (isWindy) return 'ledeno uz vjetar';
        return 'ledeno';
    }

    // Very cold (-10 to -5°C)
    if (temp >= -10) {
        if (isWindy || isStrongWind) return 'vrlo ledeno uz vjetar';
        return 'vrlo ledeno';
    }

    // Extreme cold (< -10°C)
    if (isWindy || isStrongWind) return 'jaka studen';
    return 'studen';
}

/**
 * Parses pljusak.com HTML response and returns station data.
 * @param {string} htmlText - Raw HTML response containing JavaScript
 * @returns {Object<string, StationData>}
 */
function parsePljusakResponse(htmlText) {
    // Extract the podaci array from the JavaScript
    const podaciMatch = htmlText.match(/var\s+podaci\s*=\s*(\[[\s\S]*?\]);/);
    if (!podaciMatch) {
        console.error('[vrijeme] Could not find podaci array in response');
        throw new Error('Invalid response format');
    }

    let podaci;
    try {
        podaci = JSON.parse(podaciMatch[1]);
    } catch (e) {
        console.error('[vrijeme] Failed to parse podaci array:', e);
        throw new Error('Failed to parse weather data');
    }

    console.log('[vrijeme] Parsed', podaci.length, 'station entries');
    return extractPljusakStations(podaci);
}

/**
 * Parses measurement time from pljusak.com format (HH:MM:SS).
 * @param {string|null} timeStr - Time string like "18:10:00"
 * @returns {Date|null}
 */
function parsePljusakTime(timeStr) {
    if (!timeStr || typeof timeStr !== 'string') return null;
    const match = timeStr.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
    if (!match) return null;

    const now = new Date();
    const hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);

    const measurementTime = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute);

    // If measurement time is in the future, assume it's from yesterday
    if (measurementTime > now) {
        measurementTime.setDate(measurementTime.getDate() - 1);
    }

    return measurementTime;
}

/** Maximum age for pljusak.com readings - older stations are filtered out (12 hours) */
const PLJUSAK_MAX_AGE_MS = 12 * 60 * 60 * 1000;

/**
 * Extracts all stations from pljusak.com podaci array.
 * Filters out stations with readings older than 12 hours.
 * @param {Array[]} podaci - Array of station data arrays
 * @returns {Object<string, StationData>}
 */
function extractPljusakStations(podaci) {
    /** @type {Object<string, StationData>} */
    const result = {};
    const now = Date.now();
    let staleCount = 0;

    for (const entry of podaci) {
        const name = entry[PODACI.NAME];
        if (!name) continue;

        const tempStr = entry[PODACI.TEMPERATURE];
        // Skip if no valid temperature
        if (tempStr === null || tempStr === undefined || tempStr === '-' || tempStr === '') continue;

        const temperature = parseFloat(tempStr);
        if (isNaN(temperature)) continue;

        const lat = parseFloat(entry[PODACI.LAT]);
        const lon = parseFloat(entry[PODACI.LON]);
        if (!isFinite(lat) || !isFinite(lon)) continue;

        const measurementTime = parsePljusakTime(entry[PODACI.TIME]);

        // Filter out stations with stale readings (older than 12 hours)
        if (!measurementTime || (now - measurementTime) > PLJUSAK_MAX_AGE_MS) {
            staleCount++;
            continue;
        }

        const humidity = parseNumberOrNull(entry[PODACI.HUMIDITY]);
        const windSpeed = parseNumberOrNull(entry[PODACI.WIND_SPEED]);
        const dewpoint = parseNumberOrNull(entry[PODACI.DEWPOINT]);

        result[name] = {
            name,
            lat,
            lon,
            temperature,
            humidity,
            pressure: parseNumberOrNull(entry[PODACI.PRESSURE]),
            pressureTrend: parseNumberOrNull(entry[PODACI.PRESSURE_TREND]),
            windDirection: entry[PODACI.WIND_DIR] || null,
            windSpeed,
            condition: generateWeatherDescription(temperature, humidity, windSpeed, dewpoint),
            measurementTime
        };
    }

    if (staleCount > 0) {
        console.log('[vrijeme] Filtered out', staleCount, 'stations with readings older than 12h');
    }

    return result;
}

/**
 * Parses a string value as a number, or returns null if invalid.
 * @param {string|number|null} value
 * @returns {number|null}
 */
function parseNumberOrNull(value) {
    if (value === null || value === undefined || value === '-' || value === '') return null;
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
}

/**
 * Gets station data for the selected location.
 * @param {Object<string, StationData>} allStations
 * @param {string} location
 * @returns {{station: StationData, distance: number|null}|null}
 */
function getStationForLocation(allStations, location) {
    if (location === NEAREST_LOCATION) {
        // Use geolocation to find nearest station
        if (Geolocation.hasCoords()) {
            const nearest = findNearestStation(allStations, Geolocation.coords.lat, Geolocation.coords.lon);
            return nearest ? { station: allStations[nearest.name], distance: nearest.distance } : null;
        }
        return null;
    }
    const station = allStations[location];
    return station ? { station, distance: null } : null;
}

/**
 * Calculates distance between two coordinates using Haversine formula.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in kilometers
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const toRad = deg => deg * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Finds the nearest station to given coordinates.
 * @param {Object<string, StationData>} stations
 * @param {number} lat
 * @param {number} lon
 * @returns {{name: string, distance: number}|null} Station name and distance in km, or null if none found
 */
function findNearestStation(stations, lat, lon) {
    let nearest = null;
    let minDist = Infinity;

    for (const [name, station] of Object.entries(stations)) {
        if (!isFinite(station.lat) || !isFinite(station.lon)) continue;
        const dist = haversineDistance(lat, lon, station.lat, station.lon);
        if (dist < minDist) {
            minDist = dist;
            nearest = name;
        }
    }

    console.log('[vrijeme] Nearest station:', nearest, `(${minDist.toFixed(1)} km)`);
    return nearest ? { name: nearest, distance: minDist } : null;
}

/** Check if user has explicitly chosen a location */
function hasSelectedLocation() {
    return localStorage.getItem(getLocationKey()) !== null;
}

/** Get selected location from localStorage */
function getSelectedLocation() {
    return localStorage.getItem(getLocationKey()) || NEAREST_LOCATION;
}

/** Save selected location to localStorage */
function setSelectedLocation(location) {
    localStorage.setItem(getLocationKey(), location);
}

/** Special value for "show map" option in dropdown */
const SHOW_MAP_OPTION = '__show_map__';

/**
 * LocationPicker - Handles the station selection dropdown.
 */
const LocationPicker = {
    // --- State ---
    /** Type-ahead search buffer */
    searchBuffer: '',
    /** Timer for clearing search buffer */
    searchTimeout: null,

    // --- DOM Helpers ---
    getDropdown() {
        return document.getElementById('location-dropdown');
    },

    getOptions() {
        return [...this.getDropdown().querySelectorAll('.location-option')];
    },

    // --- Dropdown State ---
    isOpen() {
        return !this.getDropdown().hidden;
    },

    open() {
        this.getDropdown().hidden = false;
        // Push state so Android back button closes dropdown instead of exiting app
        history.pushState({ dropdown: true }, '');
    },

    /**
     * Close the dropdown.
     * @param {boolean} [popHistory=true] - Whether to pop the history state.
     *        Set to false when closing in response to popstate (back button).
     */
    close(popHistory = true) {
        if (!this.isOpen()) return;
        this.getDropdown().hidden = true;
        if (popHistory) history.back();
    },

    toggle() {
        if (this.isOpen()) {
            this.close();
        } else {
            this.open();
        }
    },

    // --- Option Management ---
    /**
     * Populate dropdown with station options.
     * @param {string[]} stationNames - Sorted list of station names
     */
    populate(stationNames) {
        const dropdown = this.getDropdown();
        const currentValue = getSelectedLocation();
        const self = this;

        dropdown.innerHTML = '';

        // Add "Najbliža" first
        const nearestOpt = document.createElement('div');
        nearestOpt.className = 'location-option' + (NEAREST_LOCATION === currentValue ? ' selected' : '');
        nearestOpt.setAttribute('role', 'option');
        nearestOpt.dataset.value = NEAREST_LOCATION;
        nearestOpt.textContent = this.getLabel(NEAREST_LOCATION);
        nearestOpt.addEventListener('click', () => self.select(NEAREST_LOCATION));
        dropdown.appendChild(nearestOpt);

        // Add "Show map" option second
        const mapOpt = document.createElement('div');
        mapOpt.className = 'location-option map-option';
        mapOpt.setAttribute('role', 'option');
        mapOpt.dataset.value = SHOW_MAP_OPTION;
        mapOpt.textContent = 'Izaberi na karti...';
        mapOpt.addEventListener('click', () => {
            self.close(false);  // Don't pop history, map will replace the state
            StationMap.openModal(true);  // Replace dropdown's history entry
        });
        dropdown.appendChild(mapOpt);

        // Add all station options
        stationNames.forEach(name => {
            const opt = document.createElement('div');
            opt.className = 'location-option' + (name === currentValue ? ' selected' : '');
            opt.setAttribute('role', 'option');
            opt.dataset.value = name;
            opt.textContent = name;
            opt.addEventListener('click', () => self.select(name));
            dropdown.appendChild(opt);
        });
    },

    /**
     * Get display label for an option.
     * @param {string} location
     * @returns {string}
     */
    getLabel(location) {
        if (location === NEAREST_LOCATION) {
            if (Geolocation.hasCoords() && cachedStations) {
                const nearest = findNearestStation(cachedStations, Geolocation.coords.lat, Geolocation.coords.lon);
                if (nearest) return `${NEAREST_LOCATION} (${nearest.name})`;
            }
            if (Geolocation.status === 'denied') return `${NEAREST_LOCATION} (lokacija onemogućena)`;
            if (Geolocation.status === 'unavailable') return `${NEAREST_LOCATION} (lokacija nedostupna)`;
            return NEAREST_LOCATION;
        }
        return location;
    },

    /** Update the "Najbliža" option text after geolocation resolves */
    updateDetectedLabel() {
        const opt = this.getDropdown().querySelector(`[data-value="${NEAREST_LOCATION}"]`);
        if (opt) {
            opt.textContent = this.getLabel(NEAREST_LOCATION);
        }
    },

    /** Update visual selection state in dropdown */
    updateSelection(value) {
        this.getOptions().forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.value === value);
        });
    },

    /**
     * Handle option selection.
     * @param {string} value - Station name or NEAREST_LOCATION
     */
    select(value) {
        setSelectedLocation(value);
        this.close();
        this.updateSelection(value);

        // If selecting "Najbliža" without coords, retry geolocation
        // (user may have just enabled permissions in settings)
        if (value === NEAREST_LOCATION && !Geolocation.hasCoords()) {
            Geolocation.retry();
        }

        renderSelectedStation();
    },

    // --- Keyboard Navigation ---
    /** Focus an option by index */
    focusOption(index) {
        const options = this.getOptions();
        options.forEach((opt, i) => {
            opt.classList.toggle('focused', i === index);
        });
        if (index >= 0 && options[index]) {
            options[index].scrollIntoView({ block: 'nearest' });
        }
    },

    /** Get currently focused option index */
    getFocusedIndex() {
        return this.getOptions().findIndex(opt => opt.classList.contains('focused'));
    },

    /** Handle keyboard events */
    handleKeydown(e) {
        if (!this.isOpen()) return;

        const options = this.getOptions();
        const currentIndex = this.getFocusedIndex();

        switch (e.key) {
            case 'Escape':
                this.close();
                e.preventDefault();
                break;

            case 'ArrowDown':
                e.preventDefault();
                this.focusOption(currentIndex < options.length - 1 ? currentIndex + 1 : 0);
                break;

            case 'ArrowUp':
                e.preventDefault();
                this.focusOption(currentIndex > 0 ? currentIndex - 1 : options.length - 1);
                break;

            case 'Enter':
                e.preventDefault();
                if (currentIndex >= 0) {
                    const value = options[currentIndex].dataset.value;
                    if (value === SHOW_MAP_OPTION) {
                        this.close(false);  // Don't pop history, map will replace the state
                        StationMap.openModal(true);  // Replace dropdown's history entry
                    } else {
                        this.select(value);
                    }
                }
                break;

            default:
                // Type-ahead search
                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    this.searchBuffer += e.key.toLowerCase();
                    clearTimeout(this.searchTimeout);
                    this.searchTimeout = setTimeout(() => { this.searchBuffer = ''; }, TYPEAHEAD_TIMEOUT_MS);

                    const match = options.findIndex(opt =>
                        opt.textContent.toLowerCase().startsWith(this.searchBuffer)
                    );
                    if (match >= 0) {
                        this.focusOption(match);
                    }
                }
                break;
        }
    },

    // --- Initialization ---
    init() {
        const self = this;

        // Toggle on trigger click
        document.getElementById('location-trigger').addEventListener('click', (e) => {
            e.stopPropagation();
            self.toggle();
        });

        // Cancel button opens dropdown for manual selection
        document.getElementById('status-cancel').addEventListener('click', () => {
            Geolocation.cancelledByUser = true;
            hide('status');
            self.open();
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.location-picker')) {
                self.close();
            }
        });

        // Keyboard navigation
        document.addEventListener('keydown', (e) => self.handleKeydown(e));

    }
};

// Initialize location picker
LocationPicker.init();

/**
 * SourceSwitcher - Handles toggling between data sources (DHMZ/pljusak).
 *
 * When switching sources, finds the nearest station in the new source:
 * - If "Najbliža" was selected: uses user's GPS to find nearest
 * - Otherwise: uses old station's coordinates to find nearest in new source
 */
const SourceSwitcher = {
    /** Update button labels to show current source (widget and map) */
    updateLabel() {
        const label = getSourceConfig().label;
        const btn = document.getElementById('source-trigger');
        if (btn) btn.textContent = label;
        const mapBtn = document.getElementById('map-source');
        if (mapBtn) mapBtn.textContent = label;
    },

    /** Update URL to reflect current source (without page reload) */
    updateUrl() {
        const url = new URL(window.location.href);
        if (DATA_SOURCE === 'dhmz') {
            url.searchParams.delete('source');
        } else {
            url.searchParams.set('source', DATA_SOURCE);
        }
        history.replaceState(null, '', url);
    },

    /** Toggle to the other source and reload data */
    async toggle() {
        // Capture old station info before switching
        const oldLocation = getSelectedLocation();
        const oldStation = cachedStations?.[oldLocation] ?? null;
        const wasNearest = oldLocation === NEAREST_LOCATION;

        // Switch source
        const newSource = DATA_SOURCE === 'dhmz' ? 'pljusak' : 'dhmz';
        DATA_SOURCE = newSource;
        saveSource(newSource);
        this.updateLabel();
        this.updateUrl();

        // Clear cached data
        cachedStations = null;

        // Fetch new data
        await fetchWeatherData();

        // Map to nearest station in new source
        if (cachedStations) {
            if (wasNearest) {
                // "Najbliža" was selected - keep it (nearest logic uses GPS automatically)
                setSelectedLocation(NEAREST_LOCATION);
            } else if (oldStation && isFinite(oldStation.lat) && isFinite(oldStation.lon)) {
                // Find station nearest to old station's coordinates
                const nearest = findNearestStation(cachedStations, oldStation.lat, oldStation.lon);
                if (nearest) {
                    console.log('[vrijeme] Source switch: mapped', oldLocation, '→', nearest.name);
                    setSelectedLocation(nearest.name);
                }
            }
            renderSelectedStation();
        }
    },

    init() {
        const self = this;
        const btn = document.getElementById('source-trigger');

        if (btn) {
            this.updateLabel();
            btn.addEventListener('click', () => self.toggle());
        }
    }
};

// Initialize source switcher
SourceSwitcher.init();

/** Render the currently selected station from cached data */
function renderSelectedStation() {
    if (!cachedStations) return;

    const stationNames = Object.keys(cachedStations);
    if (stationNames.length === 0) {
        renderError('Nema podataka o stanicama');
        return;
    }

    let selectedLocation = getSelectedLocation();
    let result = getStationForLocation(cachedStations, selectedLocation);

    // If NEAREST_LOCATION selected but no coords yet
    if (!result && selectedLocation === NEAREST_LOCATION) {
        if (Geolocation.status === 'denied') {
            renderError('Lokacija je onemogućena. Omogućite lokaciju u postavkama uređaja ili izaberite stanicu ručno.');
            return;
        }
        if (Geolocation.status === 'unavailable') {
            renderError('Lokacija nije dostupna. Izaberite stanicu ručno.');
            return;
        }
        // Still waiting for geolocation - show feedback
        renderStatus('Tražim lokaciju...');
        return;
    }

    // Fall back to NEAREST_LOCATION if selected station no longer exists
    if (!result) {
        const notFoundStation = selectedLocation;
        selectedLocation = NEAREST_LOCATION;
        setSelectedLocation(selectedLocation);
        LocationPicker.updateSelection(selectedLocation);
        // If still no station (no coords), just return and wait
        result = getStationForLocation(cachedStations, selectedLocation);
        if (result) {
            console.warn(`[vrijeme] Station "${notFoundStation}" not found, falling back to nearest (${result.station.name})`);
        } else {
            console.warn(`[vrijeme] Station "${notFoundStation}" not found, cannot determine nearest (no location)`);
        }
        if (!result) return;
    }

    console.log('[vrijeme] Displaying:', result.station.name, result.station.temperature + '°C');
    render(result.station, result.distance);
}

/**
 * Gets text content of a child element, or null if empty/missing.
 * @param {Element} parent
 * @param {string} selector
 * @returns {string|null}
 */
function getTextOrNull(parent, selector) {
    const el = parent.querySelector(selector);
    const text = el?.textContent.trim();
    return (text && text !== '-') ? text : null;
}

/** Helper to get numeric content from an XML element, or null if missing/invalid */
function getNumberOrNull(parent, selector) {
    const text = getTextOrNull(parent, selector);
    if (text === null) return null;
    const num = parseFloat(text);
    return isNaN(num) ? null : num;
}

/** Helper to show/hide an element */
function show(id) { document.getElementById(id).hidden = false; }
function hide(id) { document.getElementById(id).hidden = true; }
function setText(id, text) { document.getElementById(id).textContent = text; }

/** Timer for auto-hiding toast */
let toastTimeout = null;

/**
 * Shows a toast notification with the given message.
 * Auto-hides after 5 seconds, or can be manually dismissed.
 * @param {string} message
 */
function showToast(message) {
    // Clear any existing timeout
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    setText('toast-message', message);
    show('toast');
    toastTimeout = setTimeout(hideToast, 5000);
}

/** Hides the toast notification */
function hideToast() {
    hide('toast');
    if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
    }
}

/**
 * Parses station name into display components.
 * For city stations (e.g., "Zagreb-Grič" or "Zagreb, Podsused"), returns city as title
 * and location as subtitle. Separator depends on data source.
 * For other stations, returns full name as title with no subtitle.
 * @param {string} name - Station name
 * @returns {{title: string, subtitle: string|null}}
 */
function parseStationName(name) {
    const config = getSourceConfig();
    const separator = config.nameSeparator;
    const sepIndex = name.indexOf(separator);
    if (sepIndex > 0) {
        const prefix = name.substring(0, sepIndex);
        // If cityPrefixes is null, always split; otherwise check whitelist
        if (config.cityPrefixes === null || config.cityPrefixes.includes(prefix)) {
            return {
                title: prefix,
                subtitle: name.substring(sepIndex + separator.length)
            };
        }
    }
    return { title: name, subtitle: null };
}

/** Threshold for showing distance warning (in km) */
const DISTANCE_WARNING_THRESHOLD = 20;

/**
 * Renders weather data to the widget.
 * @param {StationData} station
 * @param {number|null} distance - Distance to station in km (only for "nearest" mode)
 */
function render(station, distance) {
    hide('error');
    hide('status');

    // Reset optional containers
    document.getElementById('humidity-container').classList.add('empty');
    document.getElementById('pressure-container').classList.add('empty');
    document.getElementById('wind-container').classList.add('empty');

    // Parse station name for city stations (e.g., "Zagreb-Grič" → "Zagreb" + "Grič")
    const { title, subtitle } = parseStationName(station.name);
    setText('title', title);
    setText('temperature', station.temperature.toFixed(1));

    // Format and display measurement time, with stale color if needed
    const { formattedTime, isStale } = formatMeasurementTime(station.measurementTime);
    const timeEl = document.getElementById('time');

    timeEl.textContent = formattedTime;
    timeEl.classList.toggle('stale', isStale);
    timeEl.hidden = !formattedTime;

    // Show station subtitle for city stations (e.g., "Grič" for Zagreb-Grič)
    const subtitleEl = document.getElementById('station-subtitle');
    if (subtitle) {
        setText('subtitle-value', subtitle);
        subtitleEl.hidden = false;
    } else {
        subtitleEl.hidden = true;
    }

    // Show distance warning if station is far away
    const distanceWarning = document.getElementById('distance-warning');
    if (distance !== null && distance > DISTANCE_WARNING_THRESHOLD) {
        setText('distance-value', Math.round(distance));
        distanceWarning.hidden = false;
    } else {
        distanceWarning.hidden = true;
    }

    if (station.condition) {
        setText('condition', station.condition.charAt(0).toUpperCase() + station.condition.slice(1));
    } else {
        setText('condition', '—');
    }
    show('condition-container');

    if (station.humidity !== null) {
        setText('humidity', station.humidity);
        document.getElementById('humidity-container').classList.remove('empty');
    }

    if (station.pressure !== null) {
        setText('pressure', Math.round(station.pressure));
        const trend = station.pressureTrend;
        const arrow = trend > 0 ? '▲' : trend < 0 ? '▼' : '';
        setText('pressure-trend', arrow);
        document.getElementById('pressure-container').classList.remove('empty');
    }

    if (station.windSpeed !== null && station.windSpeed > 0) {
        const dir = (station.windDirection && station.windDirection !== 'C') ? ` ${station.windDirection}` : '';
        setText('wind', `${station.windSpeed} m/s${dir}`);
        document.getElementById('wind-container').classList.remove('empty');
    }

    show('weather');
}

/**
 * Renders an error message to the widget.
 * @param {string} message
 */
function renderError(message) {
    hide('weather');
    hide('status');
    setText('error-message', message);
    show('error');
}

/**
 * Renders a status/loading message as an overlay on the widget.
 * @param {string} message
 * @param {boolean} [showCancel=true] - Whether to show the cancel button
 */
function renderStatus(message, showCancel = true) {
    hide('error');
    // Don't hide weather - status overlays it
    setText('status-message', message);
    document.getElementById('status-cancel').hidden = !showCancel;
    show('status');
}

/**
 * Formats measurement time for display and checks if data is stale.
 * @param {Date|null} measurementTime
 * @returns {{formattedTime: string, isStale: boolean}}
 */
function formatMeasurementTime(measurementTime) {
    if (!measurementTime) {
        return { formattedTime: '', isStale: false };
    }

    const ageMs = Date.now() - measurementTime;

    let formattedTime;
    if (ageMs > OLD_THRESHOLD_MS) {
        formattedTime = 'staro';
    } else if (DATA_SOURCE === 'pljusak') {
        // Pljusak has minute precision, show HH:MM
        const hours = measurementTime.getHours().toString().padStart(2, '0');
        const minutes = measurementTime.getMinutes().toString().padStart(2, '0');
        formattedTime = `${hours}:${minutes}`;
    } else {
        // DHMZ only has hour precision, show "19h"
        formattedTime = `${measurementTime.getHours()}h`;
    }

    return {
        formattedTime,
        isStale: ageMs > STALE_THRESHOLD_MS
    };
}

// --- Initialization ---

fetchWeatherData();
setInterval(fetchWeatherData, REFRESH_INTERVAL);

// Auto-refresh when returning to the app (mobile PWA)
// Multiple events for reliability; throttled via lastRefresh set by fetchWeatherData
function refreshIfStale() {
    if (Date.now() - lastRefresh > 5000) {
        fetchWeatherData();
        return true;
    }
    return false;
}
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshIfStale();
});
window.addEventListener('pageshow', refreshIfStale);
window.addEventListener('focus', refreshIfStale);

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .catch(err => console.warn('[SW] Registration failed:', err));
}

// Tap on conditions to refresh (always fetches, no throttle)
document.getElementById('condition-container').addEventListener('click', fetchWeatherData);

// Toast dismiss button
document.getElementById('toast-dismiss').addEventListener('click', hideToast);

// --- Station Map ---

/**
 * StationMap - Handles all map-related state and interactions.
 *
 * Interaction modes:
 * - Desktop: hover highlights nearest station + shows tooltip,
 *            single-click selects and closes map,
 *            scroll wheel to zoom, drag to pan when zoomed in
 * - Mobile:  tap highlights station + shows label, second tap selects,
 *            pinch to zoom, drag to pan when zoomed in
 */
const StationMap = {
    // --- Configuration ---
    config: {
        /** Latitude correction factor - tuned to match Google Maps appearance */
        latCorrection: 0.85,
        /** Original SVG width before latitude correction */
        originalWidth: 610,
        /** SVG viewBox dimensions (width is corrected for latitude) */
        get viewBox() {
            return { width: this.originalWidth * this.latCorrection, height: 476 };
        },
        /** Croatia lat/lon bounding box (with padding) */
        bounds: { minLon: 13.2, maxLon: 19.6, minLat: 42.2, maxLat: 46.7 },
        /** Snap distance for station selection (km) at zoom level 1 */
        snapDistance: 20,
        /** Zoom limits */
        minZoom: 1,
        maxZoom: 100
    },

    // --- State ---
    /** Current zoom/pan state: scale and pan offset in base (unzoomed) coordinates */
    zoom: { scale: 1, x: 0, y: 0 },
    /** Currently prehighlighted station name (desktop hover) */
    highlight: null,
    /** Currently tapped station name (mobile two-tap selection) */
    tapped: null,
    /** Active pan/drag state (shared by mouse and touch) */
    drag: null,
    /** Active pinch-to-zoom state (touch only) */
    pinch: null,
    /** Tracks if a gesture (pinch/pan) occurred during current touch sequence */
    gestureOccurred: false,

    // --- State Queries ---
    isZoomed() { return this.zoom.scale > 1; },
    isDragging() { return this.drag?.moved === true; },
    isPinching() { return this.pinch !== null; },

    // --- Coordinate Conversion ---
    /**
     * Converts lat/lon to base SVG coordinates (without zoom).
     * @param {number} lat
     * @param {number} lon
     * @returns {{x: number, y: number}}
     */
    latLonToBase(lat, lon) {
        const { bounds, viewBox } = this.config;
        return {
            x: (lon - bounds.minLon) / (bounds.maxLon - bounds.minLon) * viewBox.width,
            y: (bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat) * viewBox.height
        };
    },

    /**
     * Converts lat/lon to SVG coordinates (with zoom applied).
     * @param {number} lat
     * @param {number} lon
     * @returns {{x: number, y: number}}
     */
    latLonToSvg(lat, lon) {
        const base = this.latLonToBase(lat, lon);
        return {
            x: (base.x - this.zoom.x) * this.zoom.scale,
            y: (base.y - this.zoom.y) * this.zoom.scale
        };
    },

    /**
     * Converts SVG coordinates back to lat/lon (accounting for zoom).
     * @param {number} x - SVG x coordinate (in zoomed space)
     * @param {number} y - SVG y coordinate (in zoomed space)
     * @returns {{lat: number, lon: number}}
     */
    svgToLatLon(x, y) {
        const { bounds, viewBox } = this.config;
        const baseX = x / this.zoom.scale + this.zoom.x;
        const baseY = y / this.zoom.scale + this.zoom.y;
        return {
            lon: (baseX / viewBox.width) * (bounds.maxLon - bounds.minLon) + bounds.minLon,
            lat: bounds.maxLat - (baseY / viewBox.height) * (bounds.maxLat - bounds.minLat)
        };
    },

    /**
     * Converts a DOM event (mouse or touch) to SVG coordinates.
     * @param {MouseEvent|TouchEvent} event
     * @returns {{x: number, y: number}}
     */
    eventToSvg(event) {
        const svg = document.getElementById('station-map');
        const rect = svg.getBoundingClientRect();
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;
        return {
            x: (clientX - rect.left) / rect.width * this.config.viewBox.width,
            y: (clientY - rect.top) / rect.height * this.config.viewBox.height
        };
    },

    // --- Core Operations ---
    /** Clamp pan to keep content visible within viewBox */
    clampPan() {
        const visibleWidth = this.config.viewBox.width / this.zoom.scale;
        const visibleHeight = this.config.viewBox.height / this.zoom.scale;
        this.zoom.x = Math.max(0, Math.min(this.zoom.x, this.config.viewBox.width - visibleWidth));
        this.zoom.y = Math.max(0, Math.min(this.zoom.y, this.config.viewBox.height - visibleHeight));
    },

    /** Reset zoom to default (scale 1, no pan) */
    resetZoom() {
        this.zoom = { scale: 1, x: 0, y: 0 };
    },

    /**
     * Apply zoom centered on a point, keeping that point fixed on screen.
     * @param {number} newScale - Target zoom scale
     * @param {number} centerX - SVG x coordinate to keep fixed
     * @param {number} centerY - SVG y coordinate to keep fixed
     */
    zoomTo(newScale, centerX, centerY) {
        const oldScale = this.zoom.scale;
        newScale = Math.max(this.config.minZoom, Math.min(this.config.maxZoom, newScale));
        if (newScale === oldScale) return;

        // Convert center to base coordinates
        const baseX = centerX / oldScale + this.zoom.x;
        const baseY = centerY / oldScale + this.zoom.y;

        // Update scale and pan to keep center fixed
        this.zoom.scale = newScale;
        this.zoom.x = baseX - centerX / newScale;
        this.zoom.y = baseY - centerY / newScale;

        this.clampPan();
        this.updatePositions();
    },

    // --- Rendering ---
    /** Update the Croatia outline transform based on current zoom */
    updateOutlineTransform() {
        const outline = document.getElementById('croatia-outline');
        if (outline) {
            // Path uses original 610×476 coords; apply lat correction, pan, then zoom
            outline.setAttribute('transform',
                `scale(${this.zoom.scale}) translate(${-this.zoom.x}, ${-this.zoom.y}) scale(${this.config.latCorrection}, 1)`);
        }
    },

    /** Update all circle positions based on current zoom (without recreating them) */
    updatePositions() {
        const self = this;

        // Update station dots
        document.querySelectorAll('.station-dot').forEach(dot => {
            const lat = parseFloat(dot.getAttribute('data-lat'));
            const lon = parseFloat(dot.getAttribute('data-lon'));
            const { x, y } = self.latLonToSvg(lat, lon);
            dot.setAttribute('cx', x);
            dot.setAttribute('cy', y);
        });

        // Update user location dots
        document.querySelectorAll('.user-dot, .user-dot-pulse').forEach(dot => {
            const lat = parseFloat(dot.getAttribute('data-lat'));
            const lon = parseFloat(dot.getAttribute('data-lon'));
            if (isFinite(lat) && isFinite(lon)) {
                const { x, y } = self.latLonToSvg(lat, lon);
                dot.setAttribute('cx', x);
                dot.setAttribute('cy', y);
            }
        });

        this.updateOutlineTransform();

        // Update station label position if one is shown
        if (this.tapped) {
            this.showLabel(this.tapped);
        }
    },

    /** Render all station dots and user location on the map */
    renderStations() {
        const dotsGroup = document.getElementById('station-dots');
        const userGroup = document.getElementById('user-location');
        if (!dotsGroup || !cachedStations) return;

        dotsGroup.innerHTML = '';
        userGroup.innerHTML = '';

        const selectedLocation = getSelectedLocation();
        const coords = Geolocation.coords;
        const selectedStation = selectedLocation === NEAREST_LOCATION
            ? (coords ? findNearestStation(cachedStations, coords.lat, coords.lon)?.name : null)
            : selectedLocation;

        const self = this;

        // Add station dots
        for (const [name, station] of Object.entries(cachedStations)) {
            if (!isFinite(station.lat) || !isFinite(station.lon)) continue;

            const { x, y } = this.latLonToSvg(station.lat, station.lon);
            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', x);
            circle.setAttribute('cy', y);
            circle.setAttribute('r', 6);
            circle.setAttribute('class', 'station-dot' + (name === selectedStation ? ' selected' : ''));
            circle.setAttribute('data-station', name);
            circle.setAttribute('data-lat', station.lat);
            circle.setAttribute('data-lon', station.lon);
            circle.addEventListener('click', () => self.selectStation(name));
            circle.addEventListener('mouseenter', (e) => self.showTooltip(e, name));
            circle.addEventListener('mouseleave', () => self.hideTooltip());
            dotsGroup.appendChild(circle);
        }

        // Add user location marker if available
        if (coords) {
            const { x, y } = this.latLonToSvg(coords.lat, coords.lon);

            const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            pulse.setAttribute('cx', x);
            pulse.setAttribute('cy', y);
            pulse.setAttribute('r', 6);
            pulse.setAttribute('class', 'user-dot-pulse');
            pulse.setAttribute('data-lat', coords.lat);
            pulse.setAttribute('data-lon', coords.lon);
            userGroup.appendChild(pulse);

            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', x);
            dot.setAttribute('cy', y);
            dot.setAttribute('r', 5);
            dot.setAttribute('class', 'user-dot');
            dot.setAttribute('data-lat', coords.lat);
            dot.setAttribute('data-lon', coords.lon);
            userGroup.appendChild(dot);
        }

        this.updateOutlineTransform();
    },

    // --- Selection and Highlighting ---
    /**
     * Find the nearest station to given lat/lon within snap distance.
     * @param {number} lat
     * @param {number} lon
     * @returns {string|null} Station name or null if none within range
     */
    findNearestWithinSnap(lat, lon) {
        if (!cachedStations) return null;
        let nearest = null;
        // Divide by zoom scale so snap distance stays constant in screen space
        let minDist = this.config.snapDistance / this.zoom.scale;

        for (const [name, station] of Object.entries(cachedStations)) {
            if (!isFinite(station.lat) || !isFinite(station.lon)) continue;
            const dist = haversineDistance(lat, lon, station.lat, station.lon);
            if (dist < minDist) {
                minDist = dist;
                nearest = name;
            }
        }
        return nearest;
    },

    /**
     * Update prehighlight based on SVG coordinates.
     * @param {number} svgX
     * @param {number} svgY
     * @returns {string|null} Nearest station name
     */
    updateHighlight(svgX, svgY) {
        const { lat, lon } = this.svgToLatLon(svgX, svgY);
        const nearest = this.findNearestWithinSnap(lat, lon);

        if (nearest !== this.highlight) {
            // Remove old highlight
            document.querySelectorAll('.station-dot.prehighlight').forEach(el => {
                el.classList.remove('prehighlight');
                el.setAttribute('r', 6);
            });

            // Add new highlight
            if (nearest) {
                const dot = document.querySelector(`.station-dot[data-station="${nearest}"]`);
                if (dot) {
                    dot.classList.add('prehighlight');
                    dot.setAttribute('r', 10);
                }
            }
            this.highlight = nearest;
        }
        return nearest;
    },

    /** Clear prehighlight state */
    clearHighlight() {
        document.querySelectorAll('.station-dot.prehighlight').forEach(el => {
            el.classList.remove('prehighlight');
            el.setAttribute('r', 6);
        });
        this.highlight = null;
    },

    /** Clear tapped station state */
    clearTapped() {
        document.querySelectorAll('.station-dot.tapped').forEach(el => {
            el.classList.remove('tapped');
            el.setAttribute('r', 6);
        });
        this.tapped = null;
        this.hideLabel();
    },

    /**
     * Handle tap on a station (mobile two-tap selection).
     * First tap highlights, second tap on same station selects.
     * @param {string} stationName
     */
    handleTap(stationName) {
        this.hideTooltip();
        if (this.tapped === stationName) {
            this.selectStation(stationName);
        } else {
            this.clearTapped();
            this.tapped = stationName;
            const dot = document.querySelector(`.station-dot[data-station="${stationName}"]`);
            if (dot) {
                dot.classList.add('tapped');
                dot.setAttribute('r', 10);
            }
            this.showLabel(stationName);
        }
    },

    /** Select a station and close the map */
    selectStation(stationName) {
        if (this.isDragging()) return;
        LocationPicker.select(stationName);
        this.closeModal();
    },

    // --- UI Helpers ---
    /**
     * Show tooltip near the cursor/touch position.
     * @param {MouseEvent|TouchEvent} event
     * @param {string} stationName
     */
    showTooltip(event, stationName) {
        const tooltip = document.getElementById('map-tooltip');
        const container = document.querySelector('.map-container');
        const rect = container.getBoundingClientRect();
        const clientX = event.touches ? event.touches[0].clientX : event.clientX;
        const clientY = event.touches ? event.touches[0].clientY : event.clientY;

        tooltip.textContent = stationName;
        tooltip.hidden = false;
        tooltip.style.left = `${clientX - rect.left + 10}px`;
        tooltip.style.top = `${clientY - rect.top - 30}px`;
    },

    /** Hide tooltip */
    hideTooltip() {
        document.getElementById('map-tooltip').hidden = true;
    },

    /**
     * Show station label above the station dot.
     * @param {string} stationName
     */
    showLabel(stationName) {
        const label = document.getElementById('station-label');
        const dot = document.querySelector(`.station-dot[data-station="${stationName}"]`);
        if (!label || !dot) return;

        const svg = document.getElementById('station-map');
        const svgRect = svg.getBoundingClientRect();
        const container = document.querySelector('.map-container');
        const containerRect = container.getBoundingClientRect();

        const cx = parseFloat(dot.getAttribute('cx'));
        const cy = parseFloat(dot.getAttribute('cy'));

        const x = (cx / this.config.viewBox.width) * svgRect.width + (svgRect.left - containerRect.left);
        const y = (cy / this.config.viewBox.height) * svgRect.height + (svgRect.top - containerRect.top);

        label.textContent = stationName;
        label.hidden = false;
        label.style.left = `${x}px`;
        label.style.top = `${y - 35}px`;
    },

    /** Hide station label */
    hideLabel() {
        const label = document.getElementById('station-label');
        if (label) label.hidden = true;
    },

    /** Check if map modal is open */
    isOpen() {
        return !document.getElementById('map-modal').hidden;
    },

    /**
     * Open the map modal.
     * @param {boolean} [replaceState=false] - If true, replace current history state
     *        instead of pushing. Used when transitioning from dropdown to map.
     */
    openModal(replaceState = false) {
        this.resetZoom();
        this.renderStations();
        document.getElementById('map-modal').hidden = false;
        // Push/replace state so Android back button closes modal instead of exiting app
        if (replaceState) {
            history.replaceState({ mapModal: true }, '');
        } else {
            history.pushState({ mapModal: true }, '');
        }
    },

    /**
     * Close the map modal.
     * @param {boolean} [popHistory=true] - Whether to pop the history state.
     *        Set to false when closing in response to popstate (back button).
     */
    closeModal(popHistory = true) {
        if (!this.isOpen()) return;
        document.getElementById('map-modal').hidden = true;
        this.hideTooltip();
        this.clearHighlight();
        this.clearTapped();
        this.resetZoom();
        if (popHistory) history.back();
    },

    // --- Mouse Input Handlers ---
    mouse: {
        onDown(event) {
            const map = StationMap;
            if (map.isZoomed()) {
                event.preventDefault();
                map.drag = {
                    startX: event.clientX,
                    startY: event.clientY,
                    initialX: map.zoom.x,
                    initialY: map.zoom.y,
                    moved: false
                };
                document.addEventListener('mouseup', map.mouse.onDocumentUp);
            }
        },

        onDocumentUp(event) {
            const map = StationMap;
            document.removeEventListener('mouseup', map.mouse.onDocumentUp);
            // IMPORTANT: Delay clearing drag state so click handlers can check isDragging().
            // The click event fires synchronously after mouseup, before this callback runs.
            // Without this delay, isDragging() would return false and clicks after drag
            // would incorrectly select stations or close the modal.
            setTimeout(() => { map.drag = null; }, 0);
        },

        onMove(event) {
            const map = StationMap;

            if (map.drag) {
                const svg = document.getElementById('station-map');
                const rect = svg.getBoundingClientRect();

                const deltaX = (event.clientX - map.drag.startX) / rect.width * map.config.viewBox.width / map.zoom.scale;
                const deltaY = (event.clientY - map.drag.startY) / rect.height * map.config.viewBox.height / map.zoom.scale;

                if (Math.abs(event.clientX - map.drag.startX) > 5 || Math.abs(event.clientY - map.drag.startY) > 5) {
                    map.drag.moved = true;
                }

                map.zoom.x = map.drag.initialX - deltaX;
                map.zoom.y = map.drag.initialY - deltaY;

                map.clampPan();
                map.updatePositions();
                map.hideTooltip();
                return;
            }

            const { x, y } = map.eventToSvg(event);
            const nearest = map.updateHighlight(x, y);

            if (nearest) {
                map.showTooltip(event, nearest);
            } else {
                map.hideTooltip();
            }
        },

        onClick(event) {
            const map = StationMap;
            if (map.isDragging()) return;
            if (map.highlight) {
                map.selectStation(map.highlight);
            }
        },

        onLeave() {
            const map = StationMap;
            map.clearHighlight();
            map.hideTooltip();
        },

        onWheel(event) {
            event.preventDefault();
            const map = StationMap;

            const zoomFactor = 1.05;
            const direction = event.deltaY < 0 ? 1 : -1;
            const newScale = direction > 0
                ? map.zoom.scale * zoomFactor
                : map.zoom.scale / zoomFactor;

            const { x, y } = map.eventToSvg(event);
            map.zoomTo(newScale, x, y);
        }
    },

    // --- Touch Input Handlers ---
    touch: {
        /** Get distance between two touch points */
        getDistance(touches) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            return Math.sqrt(dx * dx + dy * dy);
        },

        /** Get center point between two touches */
        getCenter(touches) {
            return {
                clientX: (touches[0].clientX + touches[1].clientX) / 2,
                clientY: (touches[0].clientY + touches[1].clientY) / 2
            };
        },

        onStart(event) {
            const map = StationMap;

            if (event.touches.length === 2) {
                event.preventDefault();
                map.drag = null; // Cancel any pan in progress
                map.pinch = {
                    initialDistance: this.getDistance(event.touches),
                    initialScale: map.zoom.scale,
                    initialX: map.zoom.x,
                    initialY: map.zoom.y,
                    initialCenter: this.getCenter(event.touches)
                };
            } else if (event.touches.length === 1 && map.isZoomed()) {
                event.preventDefault();
                const touch = event.touches[0];
                map.drag = {
                    startX: touch.clientX,
                    startY: touch.clientY,
                    initialX: map.zoom.x,
                    initialY: map.zoom.y,
                    moved: false
                };
            }
        },

        onMove(event) {
            const map = StationMap;

            if (event.touches.length === 2 && map.pinch) {
                event.preventDefault();

                const currentDistance = this.getDistance(event.touches);
                const scaleChange = currentDistance / map.pinch.initialDistance;
                const newScale = Math.max(map.config.minZoom,
                    Math.min(map.config.maxZoom, map.pinch.initialScale * scaleChange));

                const center = this.getCenter(event.touches);
                const svg = document.getElementById('station-map');
                const rect = svg.getBoundingClientRect();

                const centerDeltaX = (center.clientX - map.pinch.initialCenter.clientX) / rect.width * map.config.viewBox.width;
                const centerDeltaY = (center.clientY - map.pinch.initialCenter.clientY) / rect.height * map.config.viewBox.height;

                const initialCenterX = (map.pinch.initialCenter.clientX - rect.left) / rect.width * map.config.viewBox.width;
                const initialCenterY = (map.pinch.initialCenter.clientY - rect.top) / rect.height * map.config.viewBox.height;

                const baseCenterX = initialCenterX / map.pinch.initialScale + map.pinch.initialX;
                const baseCenterY = initialCenterY / map.pinch.initialScale + map.pinch.initialY;

                map.zoom.scale = newScale;

                const newScreenX = initialCenterX + centerDeltaX;
                const newScreenY = initialCenterY + centerDeltaY;
                map.zoom.x = baseCenterX - newScreenX / newScale;
                map.zoom.y = baseCenterY - newScreenY / newScale;

                map.clampPan();
                map.updatePositions();
            } else if (event.touches.length === 1 && map.drag) {
                event.preventDefault();

                const touch = event.touches[0];
                const svg = document.getElementById('station-map');
                const rect = svg.getBoundingClientRect();

                const deltaX = (touch.clientX - map.drag.startX) / rect.width * map.config.viewBox.width / map.zoom.scale;
                const deltaY = (touch.clientY - map.drag.startY) / rect.height * map.config.viewBox.height / map.zoom.scale;

                if (Math.abs(touch.clientX - map.drag.startX) > 10 || Math.abs(touch.clientY - map.drag.startY) > 10) {
                    map.drag.moved = true;
                }

                map.zoom.x = map.drag.initialX - deltaX;
                map.zoom.y = map.drag.initialY - deltaY;

                map.clampPan();
                map.updatePositions();
            }
        },

        onEnd(event) {
            const map = StationMap;

            // Track if a gesture occurred
            if (map.isPinching() || map.isDragging()) {
                map.gestureOccurred = true;
            }

            if (event.touches.length < 2) {
                map.pinch = null;
            }
            if (event.touches.length === 0) {
                map.drag = null;
                const wasGesture = map.gestureOccurred;
                map.gestureOccurred = false;

                // Handle tap if not a gesture
                if (!wasGesture) {
                    event.preventDefault();
                    const touch = event.changedTouches[0];
                    if (touch) {
                        const svg = document.getElementById('station-map');
                        const rect = svg.getBoundingClientRect();
                        const x = (touch.clientX - rect.left) / rect.width * map.config.viewBox.width;
                        const y = (touch.clientY - rect.top) / rect.height * map.config.viewBox.height;
                        const { lat, lon } = map.svgToLatLon(x, y);
                        const tappedNear = map.findNearestWithinSnap(lat, lon);

                        if (tappedNear) {
                            map.handleTap(tappedNear);
                        } else {
                            map.clearTapped();
                        }
                    }
                }
            }
        }
    },

    // --- Initialization ---
    init() {
        const svg = document.getElementById('station-map');
        const modal = document.getElementById('map-modal');
        const closeBtn = document.getElementById('map-close');
        const self = this;

        // Mouse events
        svg.addEventListener('mousedown', (e) => self.mouse.onDown(e));
        svg.addEventListener('mousemove', (e) => self.mouse.onMove(e));
        svg.addEventListener('click', (e) => self.mouse.onClick(e));
        svg.addEventListener('mouseleave', () => self.mouse.onLeave());
        svg.addEventListener('wheel', (e) => self.mouse.onWheel(e), { passive: false });

        // Touch events
        svg.addEventListener('touchstart', (e) => self.touch.onStart(e), { passive: false });
        svg.addEventListener('touchmove', (e) => {
            if (e.touches.length === 2 || (e.touches.length === 1 && self.drag)) {
                self.touch.onMove(e);
            } else {
                e.preventDefault();
            }
        }, { passive: false });
        svg.addEventListener('touchend', (e) => self.touch.onEnd(e));

        // Modal events
        closeBtn.addEventListener('click', () => self.closeModal());
        modal.addEventListener('click', (e) => {
            if (self.isDragging()) return;
            if (e.target.id === 'map-modal') self.closeModal();
        });

        // Source switcher in map
        const sourceBtn = document.getElementById('map-source');
        if (sourceBtn) {
            sourceBtn.addEventListener('click', async () => {
                await SourceSwitcher.toggle();
                self.renderStations();
            });
        }

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.hidden) {
                self.closeModal();
            }
        });
    }
};

// Initialize the map
StationMap.init();

/**
 * History Management for Android Back Button
 *
 * On Android PWAs, the back button triggers a popstate event. We use the
 * History API to intercept this and close modals/dropdowns instead of
 * exiting the app.
 *
 * How it works:
 * - open()/openModal() push a history state
 * - close()/closeModal() pop history by default (popHistory=true)
 * - The popstate handler closes whatever is open (with popHistory=false
 *   since the browser already popped the state)
 *
 * Special case - dropdown → map transition:
 * - close(false) skips history.back() to avoid triggering popstate
 * - openModal(true) uses replaceState instead of pushState
 * - This keeps a single history entry, so back closes the map cleanly
 */
window.addEventListener('popstate', () => {
    if (StationMap.isOpen()) {
        StationMap.closeModal(false);
    } else if (LocationPicker.isOpen()) {
        LocationPicker.close(false);
    }
});
