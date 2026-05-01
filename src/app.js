/**
 * Weather Widget - Main Entry Point
 *
 * Wires together all modules and handles initialization.
 */

import {
    DATA_SOURCE, DATA_SOURCES, fetchViaProxy, cachedStations, setCachedStations,
    fetchingSource, setFetchingSource, setLastRefresh, lastRefresh, REFRESH_INTERVAL
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
    // Dedupe: if a fetch for the current source is already running, skip.
    // A fetch for a *different* source (i.e. one started before a toggle)
    // is allowed to coexist - it will discard its own result on completion.
    if (fetchingSource === DATA_SOURCE) {
        return;
    }
    const source = DATA_SOURCE;
    const config = DATA_SOURCES[source];
    setFetchingSource(source);
    setLastRefresh(Date.now());

    const cacheBuster = `?_=${Date.now()}`;
    const widget = document.getElementById('widget');

    widget.classList.add('refreshing');
    log(`Fetching from ${source}...`);

    try {
        const response = await fetchViaProxy(
            config.url + cacheBuster, {}, config.parser.validate
        );
        const responseText = await response.text();

        // If the user switched sources while we were fetching, drop the
        // stale response - the parser would mismatch and the new source's
        // fetch will commit instead.
        if (source !== DATA_SOURCE) {
            log(`Source changed during fetch (${source} -> ${DATA_SOURCE}), discarding`);
            return;
        }

        setCachedStations(config.parser.parse(responseText));

        const collator = new Intl.Collator('hr');
        const stationNames = Object.keys(cachedStations).sort(collator.compare);
        log(`Loaded ${stationNames.length} stations from ${source}`);

        // Clear any previous error toast on successful fetch
        hideToast();

        LocationPicker.populate(stationNames);
        Geolocation.request();
        if (!skipRender) {
            renderSelectedStation(forceRender);
        }

    } catch (e) {
        warn('Fetch error:', e.message);
        // Don't show errors for results that would have been discarded anyway
        if (source !== DATA_SOURCE) return;
        // If we have cached data, show toast and keep displaying old data
        if (cachedStations) {
            showToast('Učitavanje nije uspjelo');
        } else {
            renderError('Greška: ' + e.message);
        }
    } finally {
        // Only clear the guard if it's still ours - a parallel toggle fetch
        // for a different source may have taken ownership.
        if (fetchingSource === source) {
            setFetchingSource(null);
        }
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
