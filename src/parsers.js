/**
 * Weather Widget - Data Parsers
 *
 * Parsers for DHMZ (vrijeme.hr) and pljusak.com data formats.
 */

import { DATA_SOURCES } from './config.js';
import { warn } from './log.js';
import { generateWeatherDescription } from './nlg.js';

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

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
 * Gets numeric content from an element, or null if missing/invalid.
 * @param {Element} parent
 * @param {string} selector
 * @returns {number|null}
 */
function getNumberOrNull(parent, selector) {
    const text = getTextOrNull(parent, selector);
    if (text === null) return null;
    const num = parseFloat(text);
    return isNaN(num) ? null : num;
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
 * DhmzParser - Parses weather data from DHMZ (vrijeme.hr) XML format.
 */
export const DhmzParser = {
    /**
     * Validates that a proxy response looks like DHMZ XML.
     * @param {Response} response
     */
    async validate(response) {
        const text = await response.text();
        if (!text.startsWith('<?xml')) {
            throw new Error('not XML');
        }
    },

    /**
     * Parses DHMZ XML response and returns station data.
     * @param {string} xmlText - Raw XML response
     * @returns {Object<string, StationData>}
     */
    parse(xmlText) {
        // Verify we got XML, not an error page
        if (!xmlText.startsWith('<?xml')) {
            warn('Invalid response (not XML)');
            throw new Error('Invalid response from proxy');
        }

        const xmlDoc = new DOMParser().parseFromString(xmlText, 'text/xml');

        // Check for XML parse errors
        const parseError = xmlDoc.querySelector('parsererror');
        if (parseError) {
            warn('XML parse error');
            throw new Error('XML parse error');
        }

        const measurementTime = this.extractMeasurementTime(xmlDoc);
        return this.extractStations(xmlDoc, measurementTime);
    },

    /**
     * Extracts measurement timestamp from DHMZ XML.
     * @param {Document} xmlDoc
     * @returns {Date|null}
     */
    extractMeasurementTime(xmlDoc) {
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
    },

    /**
     * Extracts all stations from DHMZ XML.
     * @param {Document} xmlDoc
     * @param {Date|null} measurementTime
     * @returns {Object<string, StationData>}
     */
    extractStations(xmlDoc, measurementTime) {
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
    },

    /**
     * Formats measurement time for display (hour precision).
     * @param {Date} date
     * @returns {string} e.g., "19h"
     */
    formatTime(date) {
        return `${date.getHours()}h`;
    }
};

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

/**
 * PljusakParser - Parses weather data from pljusak.com JavaScript array format.
 */
export const PljusakParser = {
    /**
     * Validates that a proxy response looks like pljusak.com data.
     * @param {Response} response
     */
    async validate(response) {
        const text = await response.text();
        if (!text.includes('var podaci')) {
            throw new Error('missing podaci data');
        }
    },

    /** Data array indices */
    INDICES: {
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
        // Pljusak does not reliably expose dewpoint. Column 24 looks like a
        // candidate but tracks air temperature within ~1 °C regardless of
        // humidity (mean 9.5 °C deviation from Magnus across 596 stations);
        // no other column is consistent across networks. If dewpoint is ever
        // needed, source it from Open-Meteo.
    },

    /** Maximum age for readings - older stations are filtered out (12 hours) */
    MAX_AGE_MS: 12 * 60 * 60 * 1000,

    /**
     * Parses pljusak.com HTML response and returns station data.
     * @param {string} htmlText - Raw HTML response containing JavaScript
     * @returns {Object<string, StationData>}
     */
    parse(htmlText) {
        // Extract the podaci array from the JavaScript
        const podaciMatch = htmlText.match(/var\s+podaci\s*=\s*(\[[\s\S]*?\]);/);
        if (!podaciMatch) {
            warn('Could not find podaci array in response');
            throw new Error('Invalid response format');
        }

        let podaci;
        try {
            podaci = JSON.parse(podaciMatch[1]);
        } catch (e) {
            warn('Failed to parse podaci array');
            throw new Error('Failed to parse weather data');
        }

        return this.extractStations(podaci);
    },

    /**
     * Parses measurement time from pljusak.com format (HH:MM:SS).
     * @param {string|null} timeStr - Time string like "18:10:00"
     * @returns {Date|null}
     */
    parseTime(timeStr) {
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
    },

    /**
     * Extracts all stations from pljusak.com podaci array.
     * Filters out stations with readings older than 12 hours.
     * @param {Array[]} podaci - Array of station data arrays
     * @returns {Object<string, StationData>}
     */
    extractStations(podaci) {
        const I = this.INDICES;
        /** @type {Object<string, StationData>} */
        const result = {};
        const now = Date.now();

        for (const entry of podaci) {
            const name = entry[I.NAME];
            if (!name) continue;

            const tempStr = entry[I.TEMPERATURE];
            // Skip if no valid temperature
            if (tempStr === null || tempStr === undefined || tempStr === '-' || tempStr === '') continue;

            const temperature = parseFloat(tempStr);
            if (isNaN(temperature)) continue;

            const lat = parseFloat(entry[I.LAT]);
            const lon = parseFloat(entry[I.LON]);
            if (!isFinite(lat) || !isFinite(lon)) continue;

            const measurementTime = this.parseTime(entry[I.TIME]);

            // Filter out stations with stale readings (older than 12 hours)
            if (!measurementTime || (now - measurementTime) > this.MAX_AGE_MS) {
                continue;
            }

            const humidity = parseNumberOrNull(entry[I.HUMIDITY]);
            const windSpeed = parseNumberOrNull(entry[I.WIND_SPEED]);

            result[name] = {
                name,
                lat,
                lon,
                temperature,
                humidity,
                pressure: parseNumberOrNull(entry[I.PRESSURE]),
                pressureTrend: parseNumberOrNull(entry[I.PRESSURE_TREND]),
                windDirection: entry[I.WIND_DIR] || null,
                windSpeed,
                condition: this.generateDescription(temperature, humidity, windSpeed, null),
                measurementTime
            };
        }

        return result;
    },

    /**
     * Generates a weather description based on measured values.
     * Used because pljusak.com doesn't provide condition text.
     *
     * @param {number} temp - Temperature in °C
     * @param {number|null} humidity - Relative humidity in %
     * @param {number|null} windSpeed - Wind speed in m/s
     * @param {number|null} dewpoint - Dewpoint temperature in °C
     * @param {number|null} [weatherCode=null] - WMO weather code (optional, for enhanced descriptions)
     * @returns {string} Weather description in Croatian
     */
    generateDescription(temp, humidity, windSpeed, dewpoint, weatherCode = null) {
        return generateWeatherDescription(temp, humidity, windSpeed, dewpoint, weatherCode);
    },

    /**
     * Formats measurement time for display (minute precision).
     * @param {Date} date
     * @returns {string} e.g., "19:05"
     */
    formatTime(date) {
        const hours = date.getHours().toString().padStart(2, '0');
        const minutes = date.getMinutes().toString().padStart(2, '0');
        return `${hours}:${minutes}`;
    }
};

// =============================================================================
// PARSER REGISTRATION
// =============================================================================

// Register parsers with data sources
DATA_SOURCES.dhmz.parser = DhmzParser;
DATA_SOURCES.pljusak.parser = PljusakParser;
