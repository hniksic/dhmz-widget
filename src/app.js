/**
 * Weather Widget - Main Entry Point
 *
 * Wires together all modules and handles initialization.
 */

import {
    DATA_SOURCE, fetchViaProxy, getSourceConfig, cachedStations, setCachedStations,
    fetchInProgress, setFetchInProgress, setLastRefresh, lastRefresh, REFRESH_INTERVAL
} from './config.js';
import { log, warn, error } from './log.js';
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
 * @param {Object} [options={}]
 * @param {boolean} [options.skipRender=false] - If true, skip rendering after fetch.
 *        Used by SourceSwitcher.toggle() which handles rendering itself after
 *        mapping the station to the new source.
 * @param {boolean} [options.forceRender=false] - If true, render even if data unchanged.
 *        Used for user-initiated refreshes to regenerate condition descriptions.
 */
async function fetchWeatherData({ skipRender = false, forceRender = false } = {}) {
    // Prevent concurrent fetches (e.g., click + focus firing together)
    if (fetchInProgress) {
        return;
    }
    setFetchInProgress(true);
    setLastRefresh(Date.now());

    const cacheBuster = `?_=${Date.now()}`;
    const widget = document.getElementById('widget');

    widget.classList.add('refreshing');
    log(`Fetching from ${DATA_SOURCE}...`);

    try {
        const response = await fetchViaProxy(getSourceConfig().url + cacheBuster);

        const responseText = await response.text();

        // Parse using source-specific parser
        setCachedStations(getSourceConfig().parser.parse(responseText));

        const collator = new Intl.Collator('hr');
        const stationNames = Object.keys(cachedStations).sort(collator.compare);
        log(`Loaded ${stationNames.length} stations from ${DATA_SOURCE}`);

        // Clear any previous error toast on successful fetch
        hideToast();

        LocationPicker.populate(stationNames);
        Geolocation.request();
        if (!skipRender) {
            renderSelectedStation(forceRender);
        }

    } catch (error) {
        warn('Fetch error:', error.message);
        // If we have cached data, show toast and keep displaying old data
        if (cachedStations) {
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
// Pass skipRender=true because toggle() handles rendering after mapping the station
SourceSwitcher.onToggle = () => fetchWeatherData({ skipRender: true });
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
    if (Date.now() - lastRefresh > 60000) {
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
        .catch(err => error('SW registration failed:', err.message));
}

// Tap on conditions to refresh (always fetches, no throttle)
document.getElementById('condition-container').addEventListener('click', () => {
    fetchWeatherData({ forceRender: true });
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
