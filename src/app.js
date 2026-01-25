/**
 * Weather Widget - Main Entry Point
 *
 * Wires together all modules and handles initialization.
 */

import {
    DATA_SOURCE, PROXY_URL, getSourceConfig, cachedStations, setCachedStations,
    fetchInProgress, setFetchInProgress, setLastRefresh, lastRefresh, REFRESH_INTERVAL
} from './config.js';
import { bumpDescriptionGeneration } from './nlg.js';
import './parsers.js';  // Side-effect: registers parsers
import { Geolocation } from './geo.js';
import { LocationPicker, SourceSwitcher, hideToast, showToast } from './ui.js';
import { renderSelectedStation, renderError } from './render.js';
import { StationMap } from './map.js';

// =============================================================================
// DATA FETCHING
// =============================================================================

/**
 * Fetches weather data from the configured source via CORS proxy and updates the display.
 */
async function fetchWeatherData() {
    // Prevent concurrent fetches (e.g., click + focus firing together)
    if (fetchInProgress) {
        console.log('[vrijeme] Fetch already in progress, skipping');
        return;
    }
    setFetchInProgress(true);
    setLastRefresh(Date.now());

    const cacheBuster = `?_=${Date.now()}`;
    const fetchUrl = PROXY_URL + encodeURIComponent(getSourceConfig().url + cacheBuster);
    const widget = document.getElementById('widget');

    widget.classList.add('refreshing');
    console.log('[vrijeme] Fetching weather data from', DATA_SOURCE);

    try {
        const response = await fetch(fetchUrl);
        console.log('[vrijeme] Response status:', response.status);

        if (!response.ok) {
            throw new Error(`HTTP error: ${response.status}`);
        }

        const responseText = await response.text();
        console.log('[vrijeme] Response length:', responseText.length, 'chars');

        // Parse using source-specific parser
        setCachedStations(getSourceConfig().parser.parse(responseText));

        const collator = new Intl.Collator('hr');
        const stationNames = Object.keys(cachedStations).sort(collator.compare);
        console.log('[vrijeme] Found stations:', stationNames.length);

        // Clear any previous error toast on successful fetch
        hideToast();

        LocationPicker.populate(stationNames);
        Geolocation.request();
        renderSelectedStation();

    } catch (error) {
        console.error('[vrijeme] Error:', error);
        // If we have cached data, show toast and keep displaying old data
        if (cachedStations) {
            console.log('[vrijeme] Using cached data due to fetch error');
            showToast('Učitavanje nije uspjelo');
        } else {
            renderError('Greška: ' + error.message);
        }
    } finally {
        setFetchInProgress(false);
        widget.classList.remove('refreshing');
    }
}

// =============================================================================
// MODULE WIRING
// =============================================================================

// Wire Geolocation callbacks
Geolocation.onUpdate = () => LocationPicker.updateDetectedLabel();
Geolocation.onRender = renderSelectedStation;

// Wire LocationPicker callbacks
LocationPicker.onSelect = renderSelectedStation;
LocationPicker.getStationMap = () => StationMap;

// Wire SourceSwitcher callbacks
SourceSwitcher.onToggle = fetchWeatherData;
SourceSwitcher.onRender = renderSelectedStation;

// =============================================================================
// INITIALIZATION
// =============================================================================

// Initialize UI components
LocationPicker.init();
SourceSwitcher.init();
StationMap.init();

// Initial data fetch
fetchWeatherData();

// Auto-refresh on interval
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

// Register service worker
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .catch(err => console.warn('[SW] Registration failed:', err));
}

// Tap on conditions to refresh (always fetches, no throttle)
// Also bumps description generation to produce variety on each click
document.getElementById('condition-container').addEventListener('click', () => {
    bumpDescriptionGeneration();
    fetchWeatherData();
});

// Toast dismiss button
document.getElementById('toast-dismiss').addEventListener('click', hideToast);

// =============================================================================
// HISTORY MANAGEMENT (Android Back Button)
// =============================================================================

/**
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
