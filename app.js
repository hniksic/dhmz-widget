/**
 * DHMZ Weather Widget
 *
 * Fetches current weather data from DHMZ (Croatian Meteorological Service)
 * and displays temperature for any station in Croatia.
 * Supports geolocation to auto-select the nearest station.
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
 */

/** DHMZ XML endpoint for current weather data (by region) */
const DHMZ_XML_URL = 'https://vrijeme.hr/hrvatska1_n.xml';

/** CORS proxy (vrijeme.hr doesn't send CORS headers) */
const PROXY_URL = 'https://corsproxy.io/?';

/** Special location that uses geolocation to find nearest station */
const DETECTED_LOCATION = 'Najbliže';

/** LocalStorage key for selected location */
const LOCATION_KEY = 'dhmz-location';

/** Cached station data from last fetch */
let cachedStations = null;

/** Cached user coordinates from geolocation */
let userCoords = null;

/** Refresh interval in milliseconds (15 minutes) */
const REFRESH_INTERVAL = 15 * 60 * 1000;

/** Data older than this is considered stale (1 hour) */
const STALE_THRESHOLD_MS = 60 * 60 * 1000;

/** Data older than this should show date, not just hour (23 hours) */
const SHOW_DATE_THRESHOLD_MS = 23 * 60 * 60 * 1000;

/**
 * @typedef {Object} StationData
 * @property {string} name - Station name
 * @property {number} lat - Latitude
 * @property {number} lon - Longitude
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
            console.error('[DHMZ] XML tail (last 500 chars):\n', xmlText.slice(-500));
            throw new Error('XML parse error');
        }

        const measurementTime = extractMeasurementTime(xmlDoc);
        cachedStations = extractAllStations(xmlDoc, measurementTime);
        const collator = new Intl.Collator('hr');
        const stationNames = Object.keys(cachedStations).sort(collator.compare);
        console.log('[DHMZ] Found stations:', stationNames.join(', ') || 'none');

        updateLocationPicker(stationNames);
        requestGeolocation();
        renderSelectedStation();

    } catch (error) {
        console.error('[DHMZ] Error:', error);
        // If we have cached data, keep showing it instead of an error
        if (cachedStations) {
            console.log('[DHMZ] Using cached data due to fetch error');
        } else {
            renderError('Greška: ' + error.message);
        }
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
 * Extracts all stations from XML.
 * @param {Document} xmlDoc
 * @param {string} measurementTime
 * @returns {Object<string, StationData>}
 */
function extractAllStations(xmlDoc, measurementTime) {
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
            humidity: getTextOrNull(data, 'Vlaga'),
            pressure: getTextOrNull(data, 'Tlak'),
            pressureTrend: getTextOrNull(data, 'TlakTend'),
            windDirection: getTextOrNull(data, 'VjetarSmjer'),
            windSpeed: getTextOrNull(data, 'VjetarBrzina'),
            condition: getTextOrNull(data, 'Vrijeme'),
            measurementTime
        };
    });

    return result;
}

/**
 * Gets station data for the selected location.
 * @param {Object<string, StationData>} allStations
 * @param {string} location
 * @returns {{station: StationData, distance: number|null}|null}
 */
function getStationForLocation(allStations, location) {
    if (location === DETECTED_LOCATION) {
        // Use geolocation to find nearest station
        if (userCoords) {
            const nearest = findNearestStation(allStations, userCoords.lat, userCoords.lon);
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

    console.log('[DHMZ] Nearest station:', nearest, `(${minDist.toFixed(1)} km)`);
    return nearest ? { name: nearest, distance: minDist } : null;
}

/** Check if user has explicitly chosen a location */
function hasSelectedLocation() {
    return localStorage.getItem(LOCATION_KEY) !== null;
}

/** Get selected location from localStorage */
function getSelectedLocation() {
    return localStorage.getItem(LOCATION_KEY) || DETECTED_LOCATION;
}

/** Save selected location to localStorage */
function setSelectedLocation(location) {
    localStorage.setItem(LOCATION_KEY, location);
}

/**
 * Request user's geolocation and cache coordinates.
 * On first visit, auto-selects "Najbliže" location.
 */
function requestGeolocation() {
    if (!('geolocation' in navigator)) {
        console.log('[DHMZ] Geolocation not available');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        (position) => {
            userCoords = {
                lat: position.coords.latitude,
                lon: position.coords.longitude
            };
            console.log('[DHMZ] User location:', userCoords.lat.toFixed(4), userCoords.lon.toFixed(4));

            // On first visit, auto-select "Najbliže"
            if (!hasSelectedLocation()) {
                setSelectedLocation(DETECTED_LOCATION);
            }

            // Update dropdown and re-render if "Najbliže" is selected
            updateDetectedDropdownOption();
            if (getSelectedLocation() === DETECTED_LOCATION) {
                updateDropdownSelection(DETECTED_LOCATION);
                renderSelectedStation();
            }
        },
        (error) => {
            console.log('[DHMZ] Geolocation denied or failed:', error.message);
        },
        { timeout: 10000, maximumAge: 300000 }
    );
}

/**
 * Updates the location picker dropdown with available stations.
 * @param {string[]} stationNames
 */
function updateLocationPicker(stationNames) {
    const dropdown = document.getElementById('location-dropdown');
    const currentValue = getSelectedLocation();

    // Clear and rebuild options
    dropdown.innerHTML = '';

    // Add "Najbliže" (nearest) option first, then all stations
    const allLocations = [DETECTED_LOCATION, ...stationNames];

    allLocations.forEach(name => {
        const opt = document.createElement('div');
        opt.className = 'location-option' + (name === currentValue ? ' selected' : '');
        opt.dataset.value = name;
        opt.textContent = getDropdownLabel(name);
        opt.addEventListener('click', () => onLocationSelect(name));
        dropdown.appendChild(opt);
    });
}

/**
 * Gets the display label for a dropdown option.
 * @param {string} location
 * @returns {string}
 */
function getDropdownLabel(location) {
    if (location === DETECTED_LOCATION) {
        if (userCoords && cachedStations) {
            const nearest = findNearestStation(cachedStations, userCoords.lat, userCoords.lon);
            if (nearest) return `Najbliže (${nearest.name})`;
        }
        return 'Najbliže';
    }
    return location;
}

/** Update the "Najbliže" dropdown option text after geolocation resolves */
function updateDetectedDropdownOption() {
    const dropdown = document.getElementById('location-dropdown');
    const opt = dropdown.querySelector(`[data-value="${DETECTED_LOCATION}"]`);
    if (opt) {
        opt.textContent = getDropdownLabel(DETECTED_LOCATION);
    }
}

/** Handle location selection from custom dropdown */
function onLocationSelect(value) {
    setSelectedLocation(value);
    closeLocationDropdown();
    updateDropdownSelection(value);
    renderSelectedStation();
}

/** Toggle the location dropdown */
function toggleLocationDropdown() {
    const dropdown = document.getElementById('location-dropdown');
    dropdown.hidden = !dropdown.hidden;
}

/** Close the location dropdown */
function closeLocationDropdown() {
    document.getElementById('location-dropdown').hidden = true;
}

/** Update visual selection state in dropdown */
function updateDropdownSelection(value) {
    document.querySelectorAll('.location-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === value);
    });
}

// Set up dropdown toggle
document.getElementById('location-trigger').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLocationDropdown();
});

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.location-picker')) {
        closeLocationDropdown();
    }
});

// Keyboard navigation for dropdown
(function() {
    let searchBuffer = '';
    let searchTimeout = null;

    function focusOption(options, index) {
        options.forEach((opt, i) => {
            opt.classList.toggle('focused', i === index);
        });
        if (index >= 0 && options[index]) {
            options[index].scrollIntoView({ block: 'nearest' });
        }
    }

    document.addEventListener('keydown', (e) => {
        const dropdown = document.getElementById('location-dropdown');
        if (dropdown.hidden) return;

        const options = [...dropdown.querySelectorAll('.location-option')];
        const currentIndex = options.findIndex(opt => opt.classList.contains('focused'));

        switch (e.key) {
            case 'Escape':
                closeLocationDropdown();
                e.preventDefault();
                break;

            case 'ArrowDown':
                e.preventDefault();
                focusOption(options, currentIndex < options.length - 1 ? currentIndex + 1 : 0);
                break;

            case 'ArrowUp':
                e.preventDefault();
                focusOption(options, currentIndex > 0 ? currentIndex - 1 : options.length - 1);
                break;

            case 'Enter':
                e.preventDefault();
                if (currentIndex >= 0) {
                    onLocationSelect(options[currentIndex].dataset.value);
                }
                break;

            default:
                // Type-ahead search
                if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
                    e.preventDefault();
                    searchBuffer += e.key.toLowerCase();
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(() => { searchBuffer = ''; }, 500);

                    const match = options.findIndex(opt =>
                        opt.textContent.toLowerCase().startsWith(searchBuffer)
                    );
                    if (match >= 0) {
                        focusOption(options, match);
                    }
                }
                break;
        }
    });
})();

/** Render the currently selected station from cached data */
function renderSelectedStation() {
    if (!cachedStations) return;

    const stationNames = Object.keys(cachedStations);
    if (stationNames.length === 0) {
        renderError('Nema podataka o postajama');
        return;
    }

    let selectedLocation = getSelectedLocation();
    let result = getStationForLocation(cachedStations, selectedLocation);

    // If DETECTED_LOCATION selected but no coords yet, wait for geolocation
    if (!result && selectedLocation === DETECTED_LOCATION) {
        return;
    }

    // Fall back to DETECTED_LOCATION if selected station no longer exists
    if (!result) {
        console.warn('[DHMZ] Station not found, falling back to detected:', selectedLocation);
        selectedLocation = DETECTED_LOCATION;
        setSelectedLocation(selectedLocation);
        updateDropdownSelection(selectedLocation);
        // If still no station (no coords), just return and wait
        result = getStationForLocation(cachedStations, selectedLocation);
        if (!result) return;
    }

    console.log('[DHMZ] Displaying:', result.station.name, result.station.temperature + '°C');
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

/** Helper to show/hide an element */
function show(id) { document.getElementById(id).hidden = false; }
function hide(id) { document.getElementById(id).hidden = true; }
function setText(id, text) { document.getElementById(id).textContent = text; }

/** Threshold for showing distance warning (in km) */
const DISTANCE_WARNING_THRESHOLD = 20;

/**
 * Renders weather data to the widget.
 * @param {StationData} station
 * @param {number|null} distance - Distance to station in km (only for "nearest" mode)
 */
function render(station, distance) {
    hide('error');

    // Reset optional containers
    document.getElementById('humidity-container').classList.add('empty');
    document.getElementById('pressure-container').classList.add('empty');
    document.getElementById('wind-container').classList.add('empty');

    setText('title', station.name);
    setText('temperature', station.temperature.toFixed(1));

    // Format and display measurement time, with stale color if needed
    const { formattedTime, isStale } = formatMeasurementTime(station.measurementTime);
    const timeEl = document.getElementById('time');

    timeEl.textContent = formattedTime;
    timeEl.classList.toggle('stale', isStale);
    timeEl.hidden = !formattedTime;

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

    if (station.humidity) {
        setText('humidity', station.humidity);
        document.getElementById('humidity-container').classList.remove('empty');
    }

    if (station.pressure) {
        setText('pressure', Math.round(parseFloat(station.pressure)));
        const trend = station.pressureTrend;
        const arrow = trend?.startsWith('+') ? '▲' : trend?.startsWith('-') ? '▼' : '';
        setText('pressure-trend', arrow);
        document.getElementById('pressure-container').classList.remove('empty');
    }

    if (station.windSpeed && parseFloat(station.windSpeed) > 0) {
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

    // Omit time entirely if very old, otherwise show as "19h"
    const formattedTime = ageMs > SHOW_DATE_THRESHOLD_MS
        ? ''
        : `${measurementDate.getHours()}h`;

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
    navigator.serviceWorker.register('sw.js')
        .catch(err => console.warn('[SW] Registration failed:', err));
}

// Tap on conditions to refresh (always fetches, no throttle)
document.getElementById('condition-container').addEventListener('click', fetchWeatherData);
