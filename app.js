/**
 * DHMZ Zagreb Temperature Widget
 *
 * Fetches current weather data from DHMZ (Croatian Meteorological Service)
 * and displays temperature for Zagreb.
 */

/*
 * VRIJEME.HR XML STRUCTURE (https://vrijeme.hr/hrvatska1_n.xml)
 * =============================================================
 *
 * The XML contains current weather observations for stations across Croatia,
 * organized by region. Data is typically updated hourly.
 *
 * Expected structure:
 *
 * <?xml version="1.0" encoding="UTF-8"?>
 * <Hrvatska>
 *   <DatumTermin>
 *     <Datum>DD.MM.YYYY</Datum>    <!-- Measurement date -->
 *     <Termin>HH</Termin>          <!-- Hour (0-23) -->
 *   </DatumTermin>
 *   <Grad autom="0|1">             <!-- autom: 0=manual, 1=automatic station -->
 *     <GradIme>Station Name</GradIme>
 *     <Lat>45.xxx</Lat>
 *     <Lon>16.xxx</Lon>
 *     <Podatci>
 *       <Temp>XX.X</Temp>          <!-- Temperature in °C, may have leading spaces -->
 *       <Vlaga>XX</Vlaga>          <!-- Relative humidity %, or "-" if unavailable -->
 *       <Tlak>XXXX.X</Tlak>        <!-- Pressure in hPa, may have "*" suffix -->
 *       <TlakTend>+X.X</TlakTend>  <!-- Pressure tendency -->
 *       <VjetarSmjer>XX</VjetarSmjer>  <!-- Wind direction (N, NE, E, SE, S, SW, W, NW, C) -->
 *       <VjetarBrzina>X.X</VjetarBrzina>  <!-- Wind speed in m/s -->
 *       <Vrijeme>description</Vrijeme>    <!-- Weather description in Croatian -->
 *       <VrijemeZnak>X</VrijemeZnak>      <!-- Weather symbol code -->
 *     </Podatci>
 *   </Grad>
 *   <!-- More <Grad> elements... -->
 * </Hrvatska>
 *
 * Zagreb stations we look for (in priority order):
 * - "Zagreb-Grič" (preferred, historic city center station)
 * - "Zagreb-Maksimir" (fallback, in a large park)
 *
 * Note: "Zagreb-aerodrom" also exists but is intentionally ignored
 * as we want city center measurements.
 */

/** DHMZ XML endpoint for current weather data (by region, includes both Grič and Maksimir) */
const DHMZ_XML_URL = 'https://vrijeme.hr/hrvatska1_n.xml';

/** CORS proxy (vrijeme.hr doesn't send CORS headers) */
const PROXY_URL = 'https://corsproxy.io/?';

/** Stations to look for, in priority order */
const TARGET_STATIONS = ['Zagreb-Grič', 'Zagreb-Maksimir'];

/** Refresh interval in milliseconds (15 minutes) */
const REFRESH_INTERVAL = 15 * 60 * 1000;

/** Data older than this is considered stale (1 hour) */
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

/** Data older than this should show date, not just hour (23 hours) */
const SHOW_DATE_THRESHOLD_MS = 23 * 60 * 60 * 1000;

/**
 * @typedef {Object} StationData
 * @property {string} name - Station name
 * @property {number} temperature - Temperature in °C
 * @property {string|null} humidity - Relative humidity %
 * @property {string|null} pressure - Atmospheric pressure in hPa
 * @property {string|null} pressureTrend - Pressure tendency (+/- value)
 * @property {string|null} windDirection - Wind direction
 * @property {string|null} windSpeed - Wind speed in m/s
 * @property {string|null} condition - Weather condition description
 * @property {string} measurementTime - When the measurement was taken
 */

/**
 * Fetches weather data from DHMZ via CORS proxy and updates the display.
 */
async function fetchWeatherData() {
    const cacheBuster = `?_=${Date.now()}`;
    const fetchUrl = PROXY_URL + encodeURIComponent(DHMZ_XML_URL + cacheBuster);
    const widget = document.getElementById('widget');

    widget.classList.add('refreshing');
    console.log('[DHMZ] Fetching weather data...');

    try {
        const response = await fetch(fetchUrl);
        console.log('[DHMZ] Response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const xmlText = await response.text();
        console.log('[DHMZ] Response length:', xmlText.length, 'chars');

        // Verify we got XML, not an error page
        if (!xmlText.startsWith('<?xml')) {
            console.error('[DHMZ] Invalid response (not XML):', xmlText.substring(0, 200));
            throw new Error('Invalid response from proxy');
        }

        const xmlDoc = new DOMParser().parseFromString(xmlText, 'text/xml');

        // Check for XML parse errors
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
            console.error('[DHMZ] XML parse error:', parseError.textContent);
            throw new Error('XML parse error');
        }

        const measurementTime = extractMeasurementTime(xmlDoc);
        const stations = extractStations(xmlDoc, measurementTime);
        console.log('[DHMZ] Found stations:', stations.map(s => s.name).join(', ') || 'none');

        if (stations.length === 0) {
            throw new Error('Zagreb station not found');
        }

        const station = stations[0];
        console.log('[DHMZ] Displaying:', station.name, station.temperature + '°C', measurementTime);
        render(station);

    } catch (error) {
        console.error('[DHMZ] Error:', error);
        renderError('Greška: ' + error.message);
    } finally {
        widget.classList.remove('refreshing');
    }
}

/**
 * Extracts measurement timestamp from XML.
 * @param {Document} xmlDoc
 * @returns {string} Formatted timestamp like "27.12.2025 14:00"
 */
function extractMeasurementTime(xmlDoc) {
    const datumTermin = xmlDoc.querySelector('DatumTermin');
    if (!datumTermin) return '';

    const datum = datumTermin.querySelector('Datum');
    const termin = datumTermin.querySelector('Termin');

    if (datum && termin) {
        return `${datum.textContent.trim()} ${termin.textContent.trim()}:00`;
    }
    return '';
}

/**
 * Extracts target Zagreb stations from XML.
 * @param {Document} xmlDoc
 * @param {string} measurementTime
 * @returns {StationData[]}
 */
function extractStations(xmlDoc, measurementTime) {
    const stations = xmlDoc.querySelectorAll('Grad');
    /** @type {Object<string, StationData>} */
    const found = {};

    stations.forEach(station => {
        const nameEl = station.querySelector('GradIme');
        if (!nameEl) return;

        const name = nameEl.textContent.trim();
        if (!TARGET_STATIONS.includes(name)) return;

        const data = station.querySelector('Podatci');
        if (!data) return;

        const temp = data.querySelector('Temp');
        const tempValue = temp?.textContent.trim();

        // Skip if no valid temperature
        if (!tempValue || tempValue === '-') return;

        found[name] = {
            name,
            temperature: parseFloat(tempValue),
            humidity: getTextOrNull(data, 'Vlaga'),
            pressure: getTextOrNull(data, 'Tlak'),
            pressureTrend: getTextOrNull(data, 'TlakTend'),
            windDirection: getTextOrNull(data, 'VjetarSmjer'),
            windSpeed: getTextOrNull(data, 'VjetarBrzina'),
            condition: getTextOrNull(data, 'Vrijeme'),
            measurementTime
        };
    });

    // Return stations sorted by TARGET_STATIONS priority order
    return TARGET_STATIONS
        .filter(name => found[name])
        .map(name => found[name]);
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

/** Helper to show/hide an element */
function show(id) { document.getElementById(id).hidden = false; }
function hide(id) { document.getElementById(id).hidden = true; }
function setText(id, text) { document.getElementById(id).textContent = text; }

/**
 * Renders weather data to the widget.
 * @param {StationData} station
 */
function render(station) {
    hide('loading');
    hide('error');

    // Reset optional containers (they may have been shown by previous render)
    hide('condition-container');
    hide('humidity-container');
    hide('pressure-container');
    hide('wind-container');

    setText('temperature', station.temperature.toFixed(1));
    setText('station', station.name.replace('Zagreb-', ''));

    // Format and display measurement time, with stale indicator if needed
    const { formattedTime, isStale } = formatMeasurementTime(station.measurementTime);
    const timeEl = document.getElementById('time');
    timeEl.textContent = formattedTime;
    timeEl.classList.toggle('stale', isStale);

    if (station.condition) {
        setText('condition', station.condition.charAt(0).toUpperCase() + station.condition.slice(1));
        show('condition-container');
    }

    if (station.humidity) {
        setText('humidity', station.humidity);
        show('humidity-container');
    }

    if (station.pressure) {
        setText('pressure', station.pressure);
        const trend = station.pressureTrend;
        const arrow = trend?.startsWith('+') ? '▲' : trend?.startsWith('-') ? '▼' : '';
        setText('pressure-trend', arrow);
        show('pressure-container');
    }

    if (station.windSpeed && parseFloat(station.windSpeed) > 0) {
        const dir = (station.windDirection && station.windDirection !== 'C') ? ` ${station.windDirection}` : '';
        setText('wind', `${station.windSpeed} m/s${dir}`);
        show('wind-container');
    }

    show('weather');
}

/**
 * Renders an error message to the widget.
 * @param {string} message
 */
function renderError(message) {
    hide('loading');
    hide('weather');
    setText('error-message', message);
    show('error');
}

/**
 * Formats measurement time for display and checks if data is stale.
 * Parses the time once and returns both formatted string and stale status.
 * @param {string} measurementTime - Format "DD.MM.YYYY HH:00"
 * @returns {{formattedTime: string, isStale: boolean}}
 */
function formatMeasurementTime(measurementTime) {
    if (!measurementTime) {
        return { formattedTime: '', isStale: false };
    }

    const match = measurementTime.match(/(\d{2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):00/);
    if (!match) {
        return { formattedTime: measurementTime, isStale: false };
    }

    const [, day, month, year, hour] = match;
    const measurementDate = new Date(year, month - 1, day, hour);
    const ageMs = Date.now() - measurementDate;

    const hourStr = measurementDate.getHours().toString().padStart(2, '0');
    const formattedTime = ageMs > SHOW_DATE_THRESHOLD_MS
        ? `${day}.${month}. ${hourStr}:00`
        : `${hourStr}:00`;

    return {
        formattedTime,
        isStale: ageMs > STALE_THRESHOLD_MS
    };
}

// --- Initialization ---

fetchWeatherData();
setInterval(fetchWeatherData, REFRESH_INTERVAL);

// Auto-refresh when returning to the app (mobile PWA)
// Multiple events for reliability; throttled because they can fire together
let lastRefresh = 0;
function refreshIfStale() {
    const now = Date.now();
    if (now - lastRefresh > 5000) {
        lastRefresh = now;
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
    navigator.serviceWorker.register('sw.js');
}

// Tap anywhere on widget to refresh (always fetches, no throttle)
document.getElementById('widget').addEventListener('click', fetchWeatherData);
