/**
 * Weather Widget - Geolocation and Distance Utilities
 *
 * Handles user geolocation, distance calculations, station finding,
 * and yr.no forecast URL resolution.
 */

import {
    NEAREST_LOCATION, getSourceConfig, fetchViaProxy, cachedStations,
    hasSelectedLocation, getSelectedLocation, setSelectedLocation
} from './config.js';
import { getCurrentlyDisplayedStation } from './render.js';
import { log, warn } from './log.js';

// =============================================================================
// DISTANCE CALCULATIONS
// =============================================================================

/**
 * Calculates distance between two coordinates using Haversine formula.
 * @param {number} lat1
 * @param {number} lon1
 * @param {number} lat2
 * @param {number} lon2
 * @returns {number} Distance in kilometers
 */
export function haversineDistance(lat1, lon1, lat2, lon2) {
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
export function findNearestStation(stations, lat, lon) {
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

    return nearest ? { name: nearest, distance: minDist } : null;
}

/**
 * Gets station data for the selected location.
 * @param {Object<string, StationData>} allStations
 * @param {string} location
 * @returns {{station: StationData, distance: number|null}|null}
 */
export function getStationForLocation(allStations, location) {
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

// =============================================================================
// GEOLOCATION
// =============================================================================

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
export const Geolocation = {
    /** Status: 'unknown' | 'granted' | 'denied' | 'unavailable' */
    status: 'unknown',
    /** Cached coordinates from last successful geolocation */
    coords: null,
    /** Set to true when user cancels geolocation prompt to prevent UI updates */
    cancelledByUser: false,

    /** Callbacks set by UI components */
    onUpdate: null,
    onRender: null,

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
            this.status = 'unavailable';
            if (this.onUpdate) this.onUpdate();
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
                log('User location:', self.coords.lat.toFixed(4), self.coords.lon.toFixed(4));

                // On first visit, auto-select "Najbliža"
                if (!hasSelectedLocation()) {
                    setSelectedLocation(NEAREST_LOCATION);
                }

                // Update dropdown and re-render if "Najbliža" is selected
                if (self.onUpdate) self.onUpdate();
                if (getSelectedLocation() === NEAREST_LOCATION && self.onRender) {
                    // Only re-render if the nearest station is different from what's displayed
                    const nearest = findNearestStation(cachedStations, self.coords.lat, self.coords.lon);
                    if (!nearest || nearest.name !== getCurrentlyDisplayedStation()) {
                        self.onRender();
                    }
                }
            },
            (error) => {
                // error.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
                self.status = error.code === 1 ? 'denied' : 'unavailable';
                if (self.onUpdate) self.onUpdate();

                // If "Najbliža" is currently selected and we can't get location, render error
                // (unless user cancelled and is manually selecting a station)
                if (getSelectedLocation() === NEAREST_LOCATION && !self.cancelledByUser && self.onRender) {
                    self.onRender();
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
        if (this.onUpdate) this.onUpdate();
        this.request();
    }
};

// =============================================================================
// YR.NO FORECAST LINK
// =============================================================================

/** Cache for yr.no location URLs (coordinate key -> URL) */
const yrnoUrlCache = new Map();

/** Maximum distance in km to accept a yr.no location match */
const YRNO_MAX_DISTANCE_KM = 5;

/**
 * Searches yr.no for a location name and returns the closest match to given coordinates.
 * @param {string} query - Search query
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<{id: string, dist: number} | null>}
 */
async function searchYrnoLocation(query, lat, lon) {
    try {
        const apiUrl = `https://www.yr.no/api/v0/locations/Search?q=${encodeURIComponent(query)}&language=en`;
        const response = await fetchViaProxy(apiUrl);
        // fetchViaProxy throws on HTTP error, so we don't need to check response.ok
        const data = await response.json();
        const locations = data?._embedded?.location;
        if (!locations?.length) return null;
        let closest = null;
        let minDist = Infinity;
        for (const loc of locations) {
            if (loc.id && loc.position) {
                const dist = haversineDistance(lat, lon, loc.position.lat, loc.position.lon);
                if (dist < minDist) {
                    minDist = dist;
                    closest = loc;
                }
            }
        }
        if (closest) return { id: closest.id, dist: minDist };
    } catch (e) {
        warn(`yr.no search "${query}": ${e.message}`);
    }
    return null;
}

/**
 * Reverse geocodes coordinates using Nominatim to get a place name.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<string[] | null>} Array of progressively shorter location queries, or null
 */
async function reverseGeocode(lat, lon) {
    try {
        const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18`;
        const response = await fetch(url, {
            headers: { 'User-Agent': 'dhmz-widget/1.0' }
        });
        if (response.ok) {
            const data = await response.json();
            const addr = data.address;
            if (!addr) return null;

            // Nominatim returns different fields for cities vs towns:
            // - Cities (e.g., Zagreb): quarter, suburb, city_district, city
            // - Towns (e.g., Daruvar): neighbourhood, quarter, town, municipality
            // We collect all fields that might be present, from most specific to most general.
            // See: https://nominatim.org/release-docs/latest/api/Output/
            const parts = [
                addr.neighbourhood,
                addr.quarter,
                addr.suburb,
                addr.city_district,
                addr.city || addr.town || addr.village,
                addr.municipality,
            ].filter(Boolean);

            if (parts.length < 2) return null;

            // Generate queries from full to minimal, dropping the most specific part each time.
            // Stop at 2 parts - single-part queries rarely succeed if 2-part ones failed.
            // Example: ["Kantari, Daruvar, Grad Daruvar", "Daruvar, Grad Daruvar"]
            const queries = [];
            for (let i = 0; i < parts.length - 1; i++) {
                queries.push(parts.slice(i).join(', '));
            }
            return queries.length > 0 ? queries : null;
        }
    } catch (e) {
        warn(`Nominatim reverse geocode: ${e.message}`);
    }
    return null;
}

/**
 * Fetches the yr.no forecast URL for given coordinates.
 *
 * yr.no doesn't support reverse geocoding (search by coordinates), so we use
 * two parallel search strategies and pick the closer result:
 * 1. Nominatim reverse geocoding → try queries on yr.no until first match
 * 2. Direct yr.no search using the station name
 *
 * This ensures we link to a named location page (clean layout) rather than a
 * coordinate-based page (shows a large map). We only use the search result if
 * it's very close (~5km) to avoid linking to a wrong location.
 *
 * @param {number} lat
 * @param {number} lon
 * @param {string | null} [stationName] - Station name for parallel search
 * @returns {Promise<string>}
 */
export async function getYrnoForecastUrl(lat, lon, stationName = null) {
    const cacheKey = `${lat.toFixed(4)},${lon.toFixed(4)}`;
    if (yrnoUrlCache.has(cacheKey)) {
        return yrnoUrlCache.get(cacheKey);
    }

    // Fallback: coordinate-based URL works but shows a large map at the top
    const fallbackUrl = `https://www.yr.no/en/forecast/daily-table/${cacheKey}`;

    // Helper: search Nominatim then try yr.no queries until first match
    async function searchViaNominatim() {
        const queries = await reverseGeocode(lat, lon);
        if (!queries) return null;
        for (const query of queries) {
            const result = await searchYrnoLocation(query, lat, lon);
            if (result) {
                return { ...result, query };
            }
        }
        return null;
    }

    // Helper: search yr.no directly with station name
    // Try full name first, then just the part before comma (e.g. "Golubić, brana" → "Golubić")
    async function searchViaStationName() {
        if (!stationName) return null;
        const result = await searchYrnoLocation(stationName, lat, lon);
        if (result) {
            return { ...result, query: stationName };
        }
        // Try the part before comma (handles "Golubić, brana", "Grmeč, Crni vrh", etc.)
        const commaIdx = stationName.indexOf(',');
        if (commaIdx > 0) {
            const shortName = stationName.substring(0, commaIdx).trim();
            const shortResult = await searchYrnoLocation(shortName, lat, lon);
            if (shortResult) {
                return { ...shortResult, query: shortName };
            }
        }
        return null;
    }

    // Run both searches in parallel, pick closer result
    const [nominatimResult, stationResult] = await Promise.all([
        searchViaNominatim(),
        searchViaStationName(),
    ]);

    const best = [nominatimResult, stationResult]
        .filter(Boolean)
        .sort((a, b) => a.dist - b.dist)[0];

    if (best && best.dist < YRNO_MAX_DISTANCE_KM) {
        const url = `https://www.yr.no/en/forecast/daily-table/${best.id}`;
        log(`yr.no: ${best.id} (${best.dist.toFixed(1)}km)`);
        yrnoUrlCache.set(cacheKey, url);
        return url;
    }

    warn(`yr.no: no close match (best: ${best ? best.dist.toFixed(1) + 'km' : 'none'}), using coordinate fallback`);
    yrnoUrlCache.set(cacheKey, fallbackUrl);
    return fallbackUrl;
}
