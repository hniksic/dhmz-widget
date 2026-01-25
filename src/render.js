/**
 * Weather Widget - Rendering Functions
 *
 * Functions for rendering weather data, errors, and status messages.
 */

import {
    getSourceConfig, cachedStations, STALE_THRESHOLD_MS, OLD_THRESHOLD_MS,
    DISTANCE_WARNING_THRESHOLD, NEAREST_LOCATION, DATA_SOURCE,
    getSelectedLocation, setSelectedLocation
} from './config.js';
import { log, warn } from './log.js';
import { Geolocation, getStationForLocation, getYrnoForecastUrl } from './geo.js';
import { hide, show, setText, LocationPicker } from './ui.js';
import { fetchCurrentWeather } from './current-weather.js';
import { generateWeatherDescription } from './nlg.js';

/** Counter to track render operations for race condition prevention */
let renderGeneration = 0;

// =============================================================================
// STATION NAME PARSING
// =============================================================================

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

// =============================================================================
// TIME FORMATTING
// =============================================================================

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

    // Use source-specific time formatting, or "staro" if too old
    const formattedTime = ageMs > OLD_THRESHOLD_MS
        ? 'staro'
        : getSourceConfig().parser.formatTime(measurementTime);

    return {
        formattedTime,
        isStale: ageMs > STALE_THRESHOLD_MS
    };
}

// =============================================================================
// RENDERING FUNCTIONS
// =============================================================================

/**
 * Renders weather data to the widget.
 * Fetches weather conditions for enhanced condition descriptions.
 * @param {StationData} station
 * @param {number|null} distance - Distance to station in km (only for "nearest" mode)
 */
async function render(station, distance) {
    // Increment render generation to invalidate any pending async operations
    const thisRender = ++renderGeneration;

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

    // Display initial condition (may be updated later with weather conditions)
    let condition = station.condition;
    if (condition) {
        setText('condition', condition.charAt(0).toUpperCase() + condition.slice(1));
    } else {
        setText('condition', '—');
    }
    show('condition-container');

    // For pljusak.com stations, fetch weather conditions for enhanced NLG descriptions.
    // The weather API is fetched in the background and only used for the condition text.
    // The numbers (temperature, humidity, etc.) are solely from pljusak.com/DHMZ.
    // This is done after initial render to avoid delaying the UI.
    if (DATA_SOURCE === 'pljusak' && isFinite(station.lat) && isFinite(station.lon)) {
        const weather = await fetchCurrentWeather(station.lat, station.lon);
        // Guard against race condition: only update if this is still the active render
        if (weather !== null && thisRender === renderGeneration) {
            condition = generateWeatherDescription(
                station.temperature,
                station.humidity,
                station.windSpeed,
                null,
                weather
            );
            setText('condition', condition.charAt(0).toUpperCase() + condition.slice(1));
        }
    }

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

    // Update yr.no forecast link (reverse geocode coordinates, search yr.no)
    const forecastLink = document.getElementById('forecast-link');
    if (forecastLink) {
        forecastLink.style.visibility = 'hidden';
        const lat = station.lat;
        const lon = station.lon;
        if (isFinite(lat) && isFinite(lon)) {
            getYrnoForecastUrl(lat, lon, station.name).then(url => {
                // Check if we're still showing the same station (user may have switched)
                if (forecastLink.dataset.lat === String(lat) && forecastLink.dataset.lon === String(lon)) {
                    forecastLink.href = url;
                    forecastLink.style.visibility = 'visible';
                }
            });
            // Store the coordinates we're fetching for
            forecastLink.dataset.lat = String(lat);
            forecastLink.dataset.lon = String(lon);
        }
    }

    show('weather');
}

/**
 * Renders an error message to the widget.
 * @param {string} message
 */
export function renderError(message) {
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
 * Renders the currently selected station from cached data.
 * Async to support weather conditions fetching for pljusak.com stations.
 */
export async function renderSelectedStation() {
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
            warn(`Station "${notFoundStation}" not found, using nearest`);
        }
        if (!result) return;
    }

    log('Displaying:', result.station.name, result.station.temperature + '°C');
    await render(result.station, result.distance);
}
