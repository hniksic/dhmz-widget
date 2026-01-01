/**
 * Pljusak Weather Widget
 *
 * Fetches current weather data from pljusak.com (amateur weather station network)
 * and displays temperature for any station in Croatia and surrounding regions.
 * Supports geolocation to auto-select the nearest station.
 */

/*
 * PLJUSAK.COM DATA STRUCTURE (https://pljusak.com/karta.php)
 * ==========================================================
 *
 * The page contains a JavaScript array `var podaci = [...]` with weather observations
 * from amateur stations across Croatia, Slovenia, Bosnia, and surrounding regions.
 * Data is typically updated every 5-15 minutes depending on the station.
 *
 * Each station entry is an array with the following indices:
 *   [0]  Type (lokalna, wu_05, wu_15, dhmz, arso, etc.)
 *   [1]  Station name
 *   [2]  Latitude (string, e.g., "45.8991")
 *   [3]  Longitude (string, e.g., "15.9475")
 *   [4]  Elevation in meters (string)
 *   [5]  Priority/order number (string)
 *   [6]  Station URL
 *   [7]  Device type (e.g., "Davis Vantage Pro2")
 *   [8]  Software (e.g., "WeatherLink")
 *   [9]  Notes (e.g., "sumnjiv zaklon")
 *   [10] Measurement time (HH:MM:SS)
 *   [11] Webcam URL (optional)
 *   [12] Temperature in °C (string, e.g., "5.2")
 *   [13] Temperature trend (string)
 *   [14] Pressure in hPa (string, e.g., "1010.5")
 *   [15] Pressure trend (string)
 *   [16] Humidity % (string, e.g., "68")
 *   [17] Wind direction (string, e.g., "SSW", "N", null)
 *   [18] Wind speed in m/s (string, e.g., "3.6")
 *   ... additional fields for precipitation, min/max temps, etc.
 *   [30] Station ID (string, e.g., "sljeme")
 */

/** Pljusak.com map page containing weather data */
const DATA_URL = 'https://pljusak.com/karta.php';

/** CORS proxy (pljusak.com doesn't send CORS headers) */
const PROXY_URL = 'https://corsproxy.io/?';

/** Special location that uses geolocation to find nearest station */
const NEAREST_LOCATION = 'Najbliža';

/**
 * City prefixes for stations that should display as "City" in title
 * with sub-location (e.g., "Podsused", "Vrapče") shown next to the time.
 * Pattern: "City, Location" where City is in this list.
 * Note: pljusak.com uses ", " (comma space) as separator, not "-".
 */
const CITY_STATION_PREFIXES = [
    'Bjelovar',
    'Čakovec',
    'Dubrovnik',
    'Koprivnica',
    'Makarska',
    'Osijek',
    'Rijeka',
    'Samobor',
    'Sesvete',
    'Sljeme',
    'Split',
    'Šolta',
    'Varaždin',
    'Zabok',
    'Zagreb',
];

/** LocalStorage key for selected location */
const LOCATION_KEY = 'pljusak-location';

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
            console.log('[Pljusak] Geolocation not available');
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
                console.log('[Pljusak] User location:', self.coords.lat.toFixed(4), self.coords.lon.toFixed(4));

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
                console.log('[Pljusak] Geolocation denied or failed:', error.message, 'code:', error.code);
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
 * Fetches weather data from pljusak.com via CORS proxy and updates the display.
 */
async function fetchWeatherData() {
    // Prevent concurrent fetches (e.g., click + focus firing together)
    if (fetchInProgress) {
        console.log('[Pljusak] Fetch already in progress, skipping');
        return;
    }
    fetchInProgress = true;
    lastRefresh = Date.now();

    const cacheBuster = `?_=${Date.now()}`;
    const fetchUrl = PROXY_URL + encodeURIComponent(DATA_URL + cacheBuster);
    const widget = document.getElementById('widget');

    widget.classList.add('refreshing');
    console.log('[Pljusak] Fetching weather data...');

    try {
        const response = await fetch(fetchUrl);
        console.log('[Pljusak] Response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const htmlText = await response.text();
        console.log('[Pljusak] Response length:', htmlText.length, 'chars');

        // Extract the podaci array from the JavaScript
        const podaciMatch = htmlText.match(/var\s+podaci\s*=\s*(\[[\s\S]*?\]);/);
        if (!podaciMatch) {
            console.error('[Pljusak] Could not find podaci array in response');
            throw new Error('Invalid response format');
        }

        let podaci;
        try {
            podaci = JSON.parse(podaciMatch[1]);
        } catch (e) {
            console.error('[Pljusak] Failed to parse podaci array:', e);
            throw new Error('Failed to parse weather data');
        }

        console.log('[Pljusak] Parsed', podaci.length, 'station entries');

        cachedStations = extractAllStations(podaci);
        const collator = new Intl.Collator('hr');
        const stationNames = Object.keys(cachedStations).sort(collator.compare);
        console.log('[Pljusak] Found stations:', stationNames.length);

        // Clear any previous error toast on successful fetch
        hideToast();

        LocationPicker.populate(stationNames);
        Geolocation.request();
        renderSelectedStation();

    } catch (error) {
        console.error('[Pljusak] Error:', error);
        // If we have cached data, show toast and keep displaying old data
        if (cachedStations) {
            console.log('[Pljusak] Using cached data due to fetch error');
            showToast('Učitavanje nije uspjelo');
        } else {
            renderError('Greška: ' + error.message);
        }
    } finally {
        fetchInProgress = false;
        widget.classList.remove('refreshing');
    }
}

/**
 * Parses measurement time from pljusak.com format (HH:MM:SS).
 * Returns a Date object for today with that time.
 * @param {string|null} timeStr - Time string like "18:10:00"
 * @returns {Date|null}
 */
function parseMeasurementTime(timeStr) {
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

/**
 * Pljusak.com data array indices (see header comment for full documentation)
 */
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
    WIND_SPEED: 18
};

/**
 * Extracts all stations from pljusak.com podaci array.
 * @param {Array[]} podaci - Array of station data arrays
 * @returns {Object<string, StationData>}
 */
function extractAllStations(podaci) {
    /** @type {Object<string, StationData>} */
    const result = {};

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

        const measurementTime = parseMeasurementTime(entry[PODACI.TIME]);

        result[name] = {
            name,
            lat,
            lon,
            temperature,
            humidity: parseNumberOrNull(entry[PODACI.HUMIDITY]),
            pressure: parseNumberOrNull(entry[PODACI.PRESSURE]),
            pressureTrend: parseNumberOrNull(entry[PODACI.PRESSURE_TREND]),
            windDirection: entry[PODACI.WIND_DIR] || null,
            windSpeed: parseNumberOrNull(entry[PODACI.WIND_SPEED]),
            condition: null, // pljusak.com doesn't provide weather condition text
            measurementTime
        };
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

    console.log('[Pljusak] Nearest station:', nearest, `(${minDist.toFixed(1)} km)`);
    return nearest ? { name: nearest, distance: minDist } : null;
}

/** Check if user has explicitly chosen a location */
function hasSelectedLocation() {
    return localStorage.getItem(LOCATION_KEY) !== null;
}

/** Get selected location from localStorage */
function getSelectedLocation() {
    return localStorage.getItem(LOCATION_KEY) || NEAREST_LOCATION;
}

/** Save selected location to localStorage */
function setSelectedLocation(location) {
    localStorage.setItem(LOCATION_KEY, location);
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
            console.warn(`[Pljusak] Station "${notFoundStation}" not found, falling back to nearest (${result.station.name})`);
        } else {
            console.warn(`[Pljusak] Station "${notFoundStation}" not found, cannot determine nearest (no location)`);
        }
        if (!result) return;
    }

    console.log('[Pljusak] Displaying:', result.station.name, result.station.temperature + '°C');
    render(result.station, result.distance);
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
 * For city stations (e.g., "Zagreb, Podsused"), returns city as title and location as subtitle.
 * For other stations, returns full name as title with no subtitle.
 * @param {string} name - Station name
 * @returns {{title: string, subtitle: string|null}}
 */
function parseStationName(name) {
    const commaIndex = name.indexOf(', ');
    if (commaIndex > 0) {
        const prefix = name.substring(0, commaIndex);
        if (CITY_STATION_PREFIXES.includes(prefix)) {
            return {
                title: prefix,
                subtitle: name.substring(commaIndex + 2)
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

    // Show "staro" if very old, otherwise show as "HH:MM"
    const hours = measurementTime.getHours().toString().padStart(2, '0');
    const minutes = measurementTime.getMinutes().toString().padStart(2, '0');
    const formattedTime = ageMs > OLD_THRESHOLD_MS
        ? 'staro'
        : `${hours}:${minutes}`;

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
        maxZoom: 6
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
