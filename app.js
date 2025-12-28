/**
 * DHMZ Zagreb Temperature Widget
 *
 * Fetches current weather data from DHMZ (Croatian Meteorological Service)
 * and displays temperature for Zagreb.
 */

/*
 * VRIJEME.HR XML STRUCTURE (https://vrijeme.hr/hrvatska_n.xml)
 * ============================================================
 *
 * The XML contains current weather observations for stations across Croatia.
 * Data is typically updated hourly.
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
 * Zagreb stations we look for:
 * - "Zagreb-Maksimir" (primary, always present)
 * - "Zagreb-Grič" (historic station, not currently in this feed)
 *
 * Note: "Zagreb-aerodrom" also exists but is intentionally ignored
 * as we want city center measurements.
 */

/** DHMZ XML endpoint for current weather data */
const DHMZ_XML_URL = 'https://vrijeme.hr/hrvatska_n.xml';

/** CORS proxy (vrijeme.hr doesn't send CORS headers) */
const PROXY_URL = 'https://api.allorigins.win/raw?url=';

/** Stations to look for, in priority order */
const TARGET_STATIONS = ['Zagreb-Grič', 'Zagreb-Maksimir'];

/** Refresh interval in milliseconds (15 minutes) */
const REFRESH_INTERVAL = 15 * 60 * 1000;

/**
 * @typedef {Object} StationData
 * @property {string} name - Station name
 * @property {number} temperature - Temperature in °C
 * @property {string|null} humidity - Relative humidity %
 * @property {string|null} pressure - Atmospheric pressure in hPa
 * @property {string|null} windDirection - Wind direction
 * @property {string|null} windSpeed - Wind speed in m/s
 * @property {string|null} condition - Weather condition description
 * @property {string} measurementTime - When the measurement was taken
 */

/**
 * Fetches weather data from DHMZ via CORS proxy and updates the display.
 */
async function fetchWeatherData() {
    const fetchUrl = PROXY_URL + encodeURIComponent(DHMZ_XML_URL);

    try {
        const response = await fetch(fetchUrl);
        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const xmlText = await response.text();

        // Verify we got XML, not an error page
        if (!xmlText.startsWith('<?xml')) {
            throw new Error('Invalid response from proxy');
        }

        const xmlDoc = new DOMParser().parseFromString(xmlText, 'text/xml');

        // Check for XML parse errors
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
            throw new Error('XML parse error');
        }

        const measurementTime = extractMeasurementTime(xmlDoc);
        const stations = extractStations(xmlDoc, measurementTime);

        if (stations.length === 0) {
            throw new Error('Zagreb station not found');
        }

        const displayData = prepareDisplayData(stations, measurementTime);
        render(displayData);

    } catch (error) {
        renderError('Greška: ' + error.message);
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
            windDirection: getTextOrNull(data, 'VjetarSmjer'),
            windSpeed: getTextOrNull(data, 'VjetarBrzina'),
            condition: getTextOrNull(data, 'Vrijeme'),
            measurementTime
        };
    });

    return Object.values(found);
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

/**
 * Prepares data for display. If both stations available, averages temperature.
 * @param {StationData[]} stations
 * @param {string} measurementTime
 * @returns {StationData}
 */
function prepareDisplayData(stations, measurementTime) {
    // Short display names for the stations
    const shortName = name => name.replace('Zagreb-', '');

    if (stations.length === 2) {
        const avgTemp = (stations[0].temperature + stations[1].temperature) / 2;
        return {
            ...stations[0],
            name: 'Grič / Maksimir',
            displayName: 'Grič + Maksimir',
            temperature: avgTemp,
            measurementTime
        };
    }
    return {
        ...stations[0],
        displayName: shortName(stations[0].name)
    };
}

/**
 * Renders weather data to the widget.
 * @param {StationData} station
 */
function render(station) {
    const widget = document.getElementById('widget');
    const tempDisplay = station.temperature.toFixed(1);

    widget.innerHTML = `
        <div class="header">
            <h1>Zagreb</h1>
            <div class="subtitle">Trenutna temperatura</div>
        </div>

        <div class="temperature-display">
            <div class="temperature-value">
                ${tempDisplay}<span class="unit">°C</span>
            </div>
        </div>

        <div class="station-info">
            <div class="measurement-time">${station.measurementTime ? `${station.measurementTime}` : ''} · ${station.displayName}</div>
        </div>

        ${station.condition ? `
        <div class="weather-condition">
            ${station.condition.charAt(0).toUpperCase() + station.condition.slice(1)}
        </div>
        ` : ''}

        <div class="details">
            ${station.humidity ? `
            <div class="detail-item">
                <div class="detail-label">Vlažnost</div>
                <div class="detail-value">${station.humidity}%</div>
            </div>
            ` : ''}
            ${station.pressure ? `
            <div class="detail-item">
                <div class="detail-label">Tlak</div>
                <div class="detail-value">${station.pressure} hPa</div>
            </div>
            ` : ''}
            ${station.windSpeed ? `
            <div class="detail-item">
                <div class="detail-label">Vjetar</div>
                <div class="detail-value">${station.windSpeed} m/s ${station.windDirection || ''}</div>
            </div>
            ` : ''}
        </div>

    `;
}

/**
 * Renders an error message to the widget.
 * @param {string} message
 */
function renderError(message) {
    const widget = document.getElementById('widget');
    widget.innerHTML = `
        <div class="error">
            <div class="error-icon">⚠️</div>
            <p>${message}</p>
            <button class="retry-btn" onclick="location.reload()">Pokušaj ponovo</button>
        </div>
    `;
}

// --- Initialization ---

fetchWeatherData();
setInterval(fetchWeatherData, REFRESH_INTERVAL);

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js');
}
