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

/** Special value for "show map" option */
const SHOW_MAP_OPTION = '__show_map__';

/**
 * Updates the location picker dropdown with available stations.
 * @param {string[]} stationNames
 */
function updateLocationPicker(stationNames) {
    const dropdown = document.getElementById('location-dropdown');
    const currentValue = getSelectedLocation();

    // Clear and rebuild options
    dropdown.innerHTML = '';

    // Add "Najbliže" first
    const nearestOpt = document.createElement('div');
    nearestOpt.className = 'location-option' + (DETECTED_LOCATION === currentValue ? ' selected' : '');
    nearestOpt.setAttribute('role', 'option');
    nearestOpt.dataset.value = DETECTED_LOCATION;
    nearestOpt.textContent = getDropdownLabel(DETECTED_LOCATION);
    nearestOpt.addEventListener('click', () => onLocationSelect(DETECTED_LOCATION));
    dropdown.appendChild(nearestOpt);

    // Add "Show map" option second
    const mapOpt = document.createElement('div');
    mapOpt.className = 'location-option map-option';
    mapOpt.setAttribute('role', 'option');
    mapOpt.dataset.value = SHOW_MAP_OPTION;
    mapOpt.textContent = 'Izaberi na karti...';
    mapOpt.addEventListener('click', () => {
        closeLocationDropdown();
        openMapModal();
    });
    dropdown.appendChild(mapOpt);

    // Add all station options
    stationNames.forEach(name => {
        const opt = document.createElement('div');
        opt.className = 'location-option' + (name === currentValue ? ' selected' : '');
        opt.setAttribute('role', 'option');
        opt.dataset.value = name;
        opt.textContent = name;
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
                    const value = options[currentIndex].dataset.value;
                    if (value === SHOW_MAP_OPTION) {
                        closeLocationDropdown();
                        openMapModal();
                    } else {
                        onLocationSelect(value);
                    }
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

// --- Station Map ---

/** SVG dimensions and Croatia bounding box for coordinate mapping */
const MAP_CONFIG = {
    viewBox: { width: 610, height: 476 },
    // Croatia lat/lon bounding box (with padding)
    bounds: {
        minLon: 13.2,
        maxLon: 19.6,
        minLat: 42.2,
        maxLat: 46.7
    },
    // Snap distance for station selection (km)
    snapDistance: 20
};

/** Currently prehighlighted station name */
let prehighlightedStation = null;

/** Current map zoom state */
let mapZoom = {
    scale: 1,
    // Pan offset in base (unzoomed) coordinates
    x: 0,
    y: 0
};

/** Zoom limits */
const MIN_ZOOM = 1;
const MAX_ZOOM = 6;

/**
 * Converts lat/lon to base SVG coordinates (without zoom).
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {{x: number, y: number}}
 */
function latLonToBaseSvg(lat, lon) {
    const { bounds, viewBox } = MAP_CONFIG;
    const x = (lon - bounds.minLon) / (bounds.maxLon - bounds.minLon) * viewBox.width;
    const y = (bounds.maxLat - lat) / (bounds.maxLat - bounds.minLat) * viewBox.height;
    return { x, y };
}

/**
 * Converts lat/lon to SVG coordinates (with zoom applied).
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @returns {{x: number, y: number}}
 */
function latLonToSvg(lat, lon) {
    const base = latLonToBaseSvg(lat, lon);
    return {
        x: (base.x - mapZoom.x) * mapZoom.scale,
        y: (base.y - mapZoom.y) * mapZoom.scale
    };
}

/**
 * Converts SVG coordinates back to lat/lon (accounting for zoom).
 * @param {number} x - SVG x coordinate (in zoomed space)
 * @param {number} y - SVG y coordinate (in zoomed space)
 * @returns {{lat: number, lon: number}}
 */
function svgToLatLon(x, y) {
    const { bounds, viewBox } = MAP_CONFIG;
    // Convert from zoomed coordinates to base coordinates
    const baseX = x / mapZoom.scale + mapZoom.x;
    const baseY = y / mapZoom.scale + mapZoom.y;
    const lon = (baseX / viewBox.width) * (bounds.maxLon - bounds.minLon) + bounds.minLon;
    const lat = bounds.maxLat - (baseY / viewBox.height) * (bounds.maxLat - bounds.minLat);
    return { lat, lon };
}

/** Render station dots on the map */
function renderMapStations() {
    const dotsGroup = document.getElementById('station-dots');
    const userGroup = document.getElementById('user-location');
    if (!dotsGroup || !cachedStations) return;

    // Clear existing dots
    dotsGroup.innerHTML = '';
    userGroup.innerHTML = '';

    const selectedLocation = getSelectedLocation();
    const selectedStation = selectedLocation === DETECTED_LOCATION
        ? (userCoords ? findNearestStation(cachedStations, userCoords.lat, userCoords.lon)?.name : null)
        : selectedLocation;

    // Add station dots (fixed radius, positioned in zoomed coordinates)
    for (const [name, station] of Object.entries(cachedStations)) {
        if (!isFinite(station.lat) || !isFinite(station.lon)) continue;

        const { x, y } = latLonToSvg(station.lat, station.lon);
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', x);
        circle.setAttribute('cy', y);
        circle.setAttribute('r', 6);
        circle.setAttribute('class', 'station-dot' + (name === selectedStation ? ' selected' : ''));
        circle.setAttribute('data-station', name);
        circle.setAttribute('data-lat', station.lat);
        circle.setAttribute('data-lon', station.lon);
        circle.addEventListener('click', () => selectStationFromMap(name));
        circle.addEventListener('mouseenter', (e) => showMapTooltipAt(e, name));
        circle.addEventListener('mouseleave', hideMapTooltip);
        dotsGroup.appendChild(circle);
    }

    // Add user location marker if available (fixed radius)
    if (userCoords) {
        const { x, y } = latLonToSvg(userCoords.lat, userCoords.lon);

        // Pulse animation circle
        const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        pulse.setAttribute('cx', x);
        pulse.setAttribute('cy', y);
        pulse.setAttribute('r', 6);
        pulse.setAttribute('class', 'user-dot-pulse');
        pulse.setAttribute('data-lat', userCoords.lat);
        pulse.setAttribute('data-lon', userCoords.lon);
        userGroup.appendChild(pulse);

        // Solid center dot
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
        dot.setAttribute('r', 5);
        dot.setAttribute('class', 'user-dot');
        dot.setAttribute('data-lat', userCoords.lat);
        dot.setAttribute('data-lon', userCoords.lon);
        userGroup.appendChild(dot);
    }

    // Update the Croatia outline transform
    updateOutlineTransform();
}

/** Update the Croatia outline transform based on zoom */
function updateOutlineTransform() {
    const outline = document.getElementById('croatia-outline');
    if (outline) {
        outline.setAttribute('transform',
            `scale(${mapZoom.scale}) translate(${-mapZoom.x}, ${-mapZoom.y})`);
    }
}

/** Update circle positions based on current zoom (without recreating them) */
function updateCirclePositions() {
    // Update station dots
    document.querySelectorAll('.station-dot').forEach(dot => {
        const lat = parseFloat(dot.getAttribute('data-lat'));
        const lon = parseFloat(dot.getAttribute('data-lon'));
        const { x, y } = latLonToSvg(lat, lon);
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
    });

    // Update user location dots
    document.querySelectorAll('.user-dot, .user-dot-pulse').forEach(dot => {
        const lat = parseFloat(dot.getAttribute('data-lat'));
        const lon = parseFloat(dot.getAttribute('data-lon'));
        if (isFinite(lat) && isFinite(lon)) {
            const { x, y } = latLonToSvg(lat, lon);
            dot.setAttribute('cx', x);
            dot.setAttribute('cy', y);
        }
    });

    // Update outline transform
    updateOutlineTransform();
}

/** Handle station selection from map */
function selectStationFromMap(stationName) {
    onLocationSelect(stationName);
    closeMapModal();
}

/**
 * Find the nearest station to given lat/lon within snap distance.
 * @param {number} lat
 * @param {number} lon
 * @returns {string|null} Station name or null if none within range
 */
function findNearestStationWithinSnap(lat, lon) {
    if (!cachedStations) return null;

    let nearest = null;
    let minDist = MAP_CONFIG.snapDistance;

    for (const [name, station] of Object.entries(cachedStations)) {
        if (!isFinite(station.lat) || !isFinite(station.lon)) continue;
        const dist = haversineDistance(lat, lon, station.lat, station.lon);
        if (dist < minDist) {
            minDist = dist;
            nearest = name;
        }
    }
    return nearest;
}

/** Update prehighlight based on pointer position */
function updatePrehighlight(svgX, svgY) {
    const { lat, lon } = svgToLatLon(svgX, svgY);
    const nearest = findNearestStationWithinSnap(lat, lon);

    if (nearest !== prehighlightedStation) {
        // Remove old prehighlight
        document.querySelectorAll('.station-dot.prehighlight').forEach(el => {
            el.classList.remove('prehighlight');
            el.setAttribute('r', 6);
        });

        // Add new prehighlight (larger radius)
        if (nearest) {
            const dot = document.querySelector(`.station-dot[data-station="${nearest}"]`);
            if (dot) {
                dot.classList.add('prehighlight');
                dot.setAttribute('r', 10);
            }
        }

        prehighlightedStation = nearest;
    }

    return nearest;
}

/** Convert mouse/touch event to SVG coordinates */
function eventToSvgCoords(event) {
    const svg = document.getElementById('station-map');
    const rect = svg.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;

    // ViewBox is fixed, so just map screen coords to SVG coords
    const x = (clientX - rect.left) / rect.width * MAP_CONFIG.viewBox.width;
    const y = (clientY - rect.top) / rect.height * MAP_CONFIG.viewBox.height;
    return { x, y };
}

/** Reset map zoom to default */
function resetMapZoom() {
    mapZoom = { scale: 1, x: 0, y: 0 };
}

/** Pinch-to-zoom state */
let pinchState = null;

/** Get distance between two touch points */
function getTouchDistance(touches) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
}

/** Get center point between two touches */
function getTouchCenter(touches) {
    return {
        clientX: (touches[0].clientX + touches[1].clientX) / 2,
        clientY: (touches[0].clientY + touches[1].clientY) / 2
    };
}

/** Handle touch start for pinch zoom */
function onMapTouchStart(event) {
    if (event.touches.length === 2) {
        event.preventDefault();
        pinchState = {
            initialDistance: getTouchDistance(event.touches),
            initialScale: mapZoom.scale
        };
    }
}

/** Handle touch move for pinch zoom */
function onMapTouchMove(event) {
    if (event.touches.length === 2 && pinchState) {
        event.preventDefault();

        const currentDistance = getTouchDistance(event.touches);
        const scaleChange = currentDistance / pinchState.initialDistance;
        const newScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, pinchState.initialScale * scaleChange));

        if (newScale === mapZoom.scale) return;

        // Get pinch center in SVG coordinates
        const center = getTouchCenter(event.touches);
        const svg = document.getElementById('station-map');
        const rect = svg.getBoundingClientRect();
        const centerX = (center.clientX - rect.left) / rect.width * MAP_CONFIG.viewBox.width;
        const centerY = (center.clientY - rect.top) / rect.height * MAP_CONFIG.viewBox.height;

        // Convert center to base coordinates
        const baseCenterX = centerX / mapZoom.scale + mapZoom.x;
        const baseCenterY = centerY / mapZoom.scale + mapZoom.y;

        // Update scale
        mapZoom.scale = newScale;

        // Adjust pan to keep pinch center fixed
        mapZoom.x = baseCenterX - centerX / newScale;
        mapZoom.y = baseCenterY - centerY / newScale;

        // Clamp pan
        const visibleWidth = MAP_CONFIG.viewBox.width / newScale;
        const visibleHeight = MAP_CONFIG.viewBox.height / newScale;
        mapZoom.x = Math.max(0, Math.min(mapZoom.x, MAP_CONFIG.viewBox.width - visibleWidth));
        mapZoom.y = Math.max(0, Math.min(mapZoom.y, MAP_CONFIG.viewBox.height - visibleHeight));

        updateCirclePositions();
    }
}

/** Handle touch end for pinch zoom */
function onMapTouchEnd(event) {
    if (event.touches.length < 2) {
        // Remember if we were pinching (to prevent station selection)
        const wasPinching = pinchState !== null;
        pinchState = null;
        return wasPinching;
    }
    return false;
}

/** Handle mouse wheel zoom */
function onMapWheel(event) {
    event.preventDefault();

    const zoomFactor = 1.05;
    const oldScale = mapZoom.scale;
    let newScale;

    if (event.deltaY < 0) {
        // Zoom in
        newScale = Math.min(oldScale * zoomFactor, MAX_ZOOM);
    } else {
        // Zoom out
        newScale = Math.max(oldScale / zoomFactor, MIN_ZOOM);
    }

    if (newScale === oldScale) return;

    // Get mouse position in SVG coordinates (screen space)
    const { x: mouseX, y: mouseY } = eventToSvgCoords(event);

    // Convert mouse position to base (unzoomed) coordinates
    const baseMouseX = mouseX / oldScale + mapZoom.x;
    const baseMouseY = mouseY / oldScale + mapZoom.y;

    // Update scale
    mapZoom.scale = newScale;

    // Adjust pan to keep the mouse position fixed on screen
    // New screen position should equal old screen position:
    // (baseMouseX - newPanX) * newScale = mouseX
    // newPanX = baseMouseX - mouseX / newScale
    mapZoom.x = baseMouseX - mouseX / newScale;
    mapZoom.y = baseMouseY - mouseY / newScale;

    // Calculate visible area in base coordinates
    const visibleWidth = MAP_CONFIG.viewBox.width / newScale;
    const visibleHeight = MAP_CONFIG.viewBox.height / newScale;

    // Clamp pan to keep content visible
    mapZoom.x = Math.max(0, Math.min(mapZoom.x, MAP_CONFIG.viewBox.width - visibleWidth));
    mapZoom.y = Math.max(0, Math.min(mapZoom.y, MAP_CONFIG.viewBox.height - visibleHeight));

    // Redraw at new positions
    updateCirclePositions();
}

/** Handle pointer move on map */
function onMapPointerMove(event) {
    const { x, y } = eventToSvgCoords(event);
    const nearest = updatePrehighlight(x, y);

    // Update tooltip
    if (nearest) {
        showMapTooltipAt(event, nearest);
    } else {
        hideMapTooltip();
    }
}

/** Handle click/tap on map */
function onMapClick(event) {
    // If we have a prehighlighted station, select it
    if (prehighlightedStation) {
        selectStationFromMap(prehighlightedStation);
    }
}

/** Show tooltip near cursor/touch */
function showMapTooltipAt(event, stationName) {
    const tooltip = document.getElementById('map-tooltip');
    const container = document.querySelector('.map-container');
    const rect = container.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;

    tooltip.textContent = stationName;
    tooltip.hidden = false;

    // Position tooltip near the cursor
    const x = clientX - rect.left + 10;
    const y = clientY - rect.top - 30;
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
}


/** Hide tooltip */
function hideMapTooltip() {
    document.getElementById('map-tooltip').hidden = true;
}

/** Clear prehighlight state */
function clearPrehighlight() {
    document.querySelectorAll('.station-dot.prehighlight').forEach(el => {
        el.classList.remove('prehighlight');
        el.setAttribute('r', 6);
    });
    prehighlightedStation = null;
}

/** Open map modal */
function openMapModal() {
    resetMapZoom();
    renderMapStations();
    document.getElementById('map-modal').hidden = false;
}

/** Close map modal */
function closeMapModal() {
    document.getElementById('map-modal').hidden = true;
    hideMapTooltip();
    clearPrehighlight();
    resetMapZoom();
}

// Map modal event listeners
document.getElementById('map-close').addEventListener('click', closeMapModal);

// SVG map interaction - snap to nearest station
const stationMap = document.getElementById('station-map');
stationMap.addEventListener('mousemove', onMapPointerMove);
stationMap.addEventListener('touchmove', (e) => {
    // Handle pinch zoom with two fingers
    if (e.touches.length === 2) {
        onMapTouchMove(e);
        return;
    }
    // Single finger - prehighlight
    e.preventDefault();
    onMapPointerMove(e);
}, { passive: false });
stationMap.addEventListener('touchstart', onMapTouchStart, { passive: false });
stationMap.addEventListener('touchend', (e) => {
    const wasPinching = onMapTouchEnd(e);
    // Select station on single tap if prehighlighted (but not after pinch)
    if (e.touches.length === 0 && prehighlightedStation && !wasPinching) {
        e.preventDefault();
        selectStationFromMap(prehighlightedStation);
    }
});
stationMap.addEventListener('click', onMapClick);
stationMap.addEventListener('mouseleave', () => {
    clearPrehighlight();
    hideMapTooltip();
});
stationMap.addEventListener('wheel', onMapWheel, { passive: false });
document.getElementById('map-modal').addEventListener('click', (e) => {
    if (e.target.id === 'map-modal') closeMapModal();
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !document.getElementById('map-modal').hidden) {
        closeMapModal();
    }
});
