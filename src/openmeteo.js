/**
 * Weather Widget - Open-Meteo Integration
 *
 * Fetches weather codes from Open-Meteo API for enhanced NLG descriptions.
 * Uses 15-minute cache to avoid excessive API calls.
 */

// =============================================================================
// WEATHER CODE CACHE
// =============================================================================

/**
 * Cache for weather codes, keyed by "lat,lon" with 15-minute expiry.
 * @type {Map<string, {code: number, timestamp: number}>}
 */
const weatherCodeCache = new Map();

/** Cache duration: 15 minutes */
const CACHE_DURATION_MS = 15 * 60 * 1000;

// =============================================================================
// WEATHER CODE CATEGORIES
// =============================================================================

/**
 * WMO Weather Code ranges mapped to categories.
 * https://open-meteo.com/en/docs - Weather codes follow WMO standard.
 *
 * 0-1: Clear sky / Mainly clear
 * 2-3: Partly cloudy / Overcast
 * 45,48: Fog / Rime fog
 * 51-57: Drizzle (light to freezing)
 * 61-67: Rain (light to freezing)
 * 71-77: Snow (light to heavy)
 * 80-82: Rain showers
 * 85-86: Snow showers
 * 95-99: Thunderstorm (with/without hail)
 */

/**
 * Gets weather category from WMO weather code.
 * @param {number} code - WMO weather code (0-99)
 * @returns {'clear'|'cloudy'|'fog'|'drizzle'|'rain'|'snow'|'thunderstorm'|null}
 */
export function getWeatherCategory(code) {
    if (code === null || code === undefined) return null;

    if (code <= 1) return 'clear';
    if (code <= 3) return 'cloudy';
    if (code === 45 || code === 48) return 'fog';
    if (code >= 51 && code <= 57) return 'drizzle';
    if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'rain';
    if ((code >= 71 && code <= 77) || (code >= 85 && code <= 86)) return 'snow';
    if (code >= 95 && code <= 99) return 'thunderstorm';

    return null;
}

/**
 * Checks if weather code indicates freezing precipitation.
 * @param {number} code - WMO weather code
 * @returns {boolean}
 */
export function isFreezingPrecipitation(code) {
    // 56-57: Freezing drizzle, 66-67: Freezing rain
    return code === 56 || code === 57 || code === 66 || code === 67;
}

/**
 * Gets intensity level from weather code.
 * @param {number} code - WMO weather code
 * @returns {'light'|'moderate'|'heavy'|null}
 */
export function getIntensity(code) {
    // Drizzle: 51=light, 53=moderate, 55=dense
    if (code === 51) return 'light';
    if (code === 53) return 'moderate';
    if (code === 55) return 'heavy';

    // Rain: 61=slight, 63=moderate, 65=heavy
    if (code === 61 || code === 80) return 'light';
    if (code === 63 || code === 81) return 'moderate';
    if (code === 65 || code === 82) return 'heavy';

    // Snow: 71=slight, 73=moderate, 75=heavy
    if (code === 71 || code === 85) return 'light';
    if (code === 73) return 'moderate';
    if (code === 75 || code === 77 || code === 86) return 'heavy';

    // Thunderstorm: 95=slight/moderate, 96/99=with hail
    if (code === 95) return 'moderate';
    if (code === 96 || code === 99) return 'heavy';

    return null;
}

/**
 * Checks if weather code indicates hail.
 * @param {number} code - WMO weather code
 * @returns {boolean}
 */
export function hasHail(code) {
    return code === 96 || code === 99;
}

// =============================================================================
// API FETCHING
// =============================================================================

/**
 * Fetches current weather code from Open-Meteo API.
 * Uses 15-minute cache to minimize API calls.
 *
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {Promise<number|null>} Weather code or null on error
 */
export async function fetchWeatherCode(lat, lon) {
    if (!isFinite(lat) || !isFinite(lon)) {
        return null;
    }

    // Round coordinates to reduce cache fragmentation (4 decimal places ≈ 11m precision)
    const roundedLat = Math.round(lat * 10000) / 10000;
    const roundedLon = Math.round(lon * 10000) / 10000;
    const cacheKey = `${roundedLat},${roundedLon}`;

    // Check cache
    const cached = weatherCodeCache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION_MS) {
        return cached.code;
    }

    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${roundedLat}&longitude=${roundedLon}&current=weather_code&timezone=auto`;
        const response = await fetch(url);

        if (!response.ok) {
            console.warn('[vrijeme] Open-Meteo API error:', response.status);
            return null;
        }

        const data = await response.json();
        const code = data?.current?.weather_code;

        if (typeof code === 'number') {
            weatherCodeCache.set(cacheKey, { code, timestamp: Date.now() });
            return code;
        }

        return null;
    } catch (error) {
        console.warn('[vrijeme] Failed to fetch weather code:', error.message);
        return null;
    }
}

/**
 * Clears the weather code cache (for testing).
 */
export function clearWeatherCodeCache() {
    weatherCodeCache.clear();
}
