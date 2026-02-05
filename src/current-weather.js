/**
 * Weather Widget - Current Weather Conditions
 *
 * Fetches current weather conditions and returns them in a categorized format.
 * Uses Open-Meteo API internally, but exports a service-agnostic interface.
 * Uses 15-minute cache to avoid excessive API calls.
 *
 * API Documentation: https://open-meteo.com/en/docs
 */

import { log, warn } from './log.js';

// =============================================================================
// CACHE
// =============================================================================

/**
 * Cache for weather conditions, keyed by "lat,lon" with 15-minute expiry.
 * @type {Map<string, {conditions: WeatherConditions, timestamp: number}>}
 */
const conditionsCache = new Map();

/** Cache duration: 15 minutes */
const CACHE_DURATION_MS = 15 * 60 * 1000;

// =============================================================================
// WMO WEATHER CODE PARSING
// =============================================================================

/**
 * WMO Weather interpretation codes (WW):
 * https://open-meteo.com/en/docs
 *
 * 0: Clear sky
 * 1: Mainly clear → 'clear'
 * 2: Partly cloudy → 'partly_cloudy'
 * 3: Overcast → 'cloudy'
 * 45, 48: Fog, depositing rime fog
 * 51, 53, 55: Drizzle (light, moderate, dense)
 * 56, 57: Freezing drizzle (light, dense)
 * 61, 63, 65: Rain (slight, moderate, heavy)
 * 66, 67: Freezing rain (light, heavy)
 * 71, 73, 75: Snow fall (slight, moderate, heavy)
 * 77: Snow grains
 * 80, 81, 82: Rain showers (slight, moderate, violent)
 * 85, 86: Snow showers (slight, heavy)
 * 95: Thunderstorm (slight or moderate)
 * 96, 99: Thunderstorm with hail (slight, heavy)
 */

/**
 * Parses WMO weather code into categorized weather conditions.
 * @param {number} code - WMO weather code
 * @returns {WeatherConditions}
 */
function parseWeatherCode(code) {
    let category = null;
    let intensity = null;
    let freezing = false;
    let hail = false;

    // Clear sky
    if (code === 0) {
        category = 'clear';
    }
    // Mainly clear
    else if (code === 1) {
        category = 'clear';
    }
    // Partly cloudy
    else if (code === 2) {
        category = 'partly_cloudy';
    }
    // Overcast
    else if (code === 3) {
        category = 'cloudy';
    }
    // Fog
    else if (code === 45 || code === 48) {
        category = 'fog';
    }
    // Drizzle
    else if (code >= 51 && code <= 57) {
        category = 'drizzle';
        if (code === 51 || code === 56) intensity = 'light';
        else if (code === 53) intensity = 'moderate';
        else intensity = 'heavy';
        freezing = code >= 56;
    }
    // Rain
    else if (code >= 61 && code <= 67) {
        category = 'rain';
        if (code === 61 || code === 66) intensity = 'light';
        else if (code === 63) intensity = 'moderate';
        else intensity = 'heavy';
        freezing = code >= 66;
    }
    // Snow
    else if (code >= 71 && code <= 77) {
        category = 'snow';
        if (code === 71) intensity = 'light';
        else if (code === 73 || code === 77) intensity = 'moderate';
        else intensity = 'heavy';
    }
    // Rain showers
    else if (code >= 80 && code <= 82) {
        category = 'rain';
        if (code === 80) intensity = 'light';
        else if (code === 81) intensity = 'moderate';
        else intensity = 'heavy';
    }
    // Snow showers
    else if (code === 85 || code === 86) {
        category = 'snow';
        intensity = code === 85 ? 'light' : 'heavy';
    }
    // Thunderstorm
    else if (code >= 95 && code <= 99) {
        category = 'thunderstorm';
        hail = code === 96 || code === 99;
    }

    return { category, intensity, freezing, hail };
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * @typedef {Object} WeatherConditions
 * @property {'clear'|'partly_cloudy'|'cloudy'|'fog'|'drizzle'|'rain'|'snow'|'thunderstorm'|null} category
 * @property {'light'|'moderate'|'heavy'|null} intensity
 * @property {boolean} freezing - True if freezing precipitation
 * @property {boolean} hail - True if hail
 */

/**
 * Fetches current weather conditions for a location.
 * Returns categorized conditions ready for NLG use.
 * Uses 15-minute cache to minimize API calls.
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<WeatherConditions|null>} Weather conditions or null on error
 */
export async function fetchCurrentWeather(lat, lon) {
    if (!isFinite(lat) || !isFinite(lon)) {
        return null;
    }

    // Round coordinates to reduce cache fragmentation (4 decimal places ≈ 11m precision)
    const roundedLat = Math.round(lat * 10000) / 10000;
    const roundedLon = Math.round(lon * 10000) / 10000;
    const cacheKey = `${roundedLat},${roundedLon}`;

    // Check cache
    const cached = conditionsCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION_MS) {
        return cached.conditions;
    }

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${roundedLat}&longitude=${roundedLon}&current=weather_code`;
        const response = await fetch(url);

        if (!response.ok) {
            warn('Open-Meteo API error:', response.status);
            return null;
        }

        const data = await response.json();
        const code = data?.current?.weather_code;

        if (typeof code !== 'number') {
            return null;
        }

        const conditions = parseWeatherCode(code);
        log('Weather: WMO', code, '→', conditions.category);

        conditionsCache.set(cacheKey, { conditions, timestamp: Date.now() });
        return conditions;
    } catch (error) {
        warn('Failed to fetch weather:', error.message);
        return null;
    }
}

