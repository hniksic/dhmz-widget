/**
 * Weather Widget - UI Components
 *
 * Location picker dropdown, source switcher, and toast notifications.
 */

import {
    getSourceConfig, DATA_SOURCE, setDataSource, saveSource, NEAREST_LOCATION,
    TYPEAHEAD_TIMEOUT_MS, cachedStations, setCachedStations,
    getSelectedLocation, setSelectedLocation
} from './config.js';
import { Geolocation, findNearestStation } from './geo.js';

// =============================================================================
// DOM HELPERS
// =============================================================================

/** Show an element by id */
export function show(id) {
    document.getElementById(id).hidden = false;
}

/** Hide an element by id */
export function hide(id) {
    document.getElementById(id).hidden = true;
}

/** Set text content of an element by id */
export function setText(id, text) {
    document.getElementById(id).textContent = text;
}

// =============================================================================
// TOAST NOTIFICATIONS
// =============================================================================

/** Timer for auto-hiding toast */
let toastTimeout = null;

/**
 * Shows a toast notification with the given message.
 * Auto-hides after 5 seconds, or can be manually dismissed.
 * @param {string} message
 */
export function showToast(message) {
    // Clear any existing timeout
    if (toastTimeout) {
        clearTimeout(toastTimeout);
    }
    setText('toast-message', message);
    show('toast');
    toastTimeout = setTimeout(hideToast, 5000);
}

/** Hides the toast notification */
export function hideToast() {
    hide('toast');
    if (toastTimeout) {
        clearTimeout(toastTimeout);
        toastTimeout = null;
    }
}

// =============================================================================
// SPECIAL VALUES
// =============================================================================

/** Special value for "show map" option in dropdown */
const SHOW_MAP_OPTION = '__show_map__';

// =============================================================================
// LOCATION PICKER
// =============================================================================

/**
 * LocationPicker - Handles the station selection dropdown.
 */
export const LocationPicker = {
    // --- State ---
    /** Type-ahead search buffer */
    searchBuffer: '',
    /** Timer for clearing search buffer */
    searchTimeout: null,

    // --- Callbacks (set by app.js) ---
    onSelect: null,
    getStationMap: null,

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
        // Scroll selected station into view
        const selected = this.getDropdown().querySelector('.location-option.selected');
        if (selected) {
            selected.scrollIntoView({ block: 'nearest' });
        }
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
        const collator = new Intl.Collator('hr');

        // Build entry list, inserting grayed-out entry for selected station
        // if it's not in the current source's station list (e.g. came from other source)
        const entries = stationNames.map(name => ({
            name, label: name, clickable: true, selected: name === currentValue,
        }));
        if (currentValue !== NEAREST_LOCATION && !stationNames.includes(currentValue)) {
            // Insert at correct alphabetical position
            let lo = 0, hi = entries.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                if (collator.compare(entries[mid].name, currentValue) < 0) lo = mid + 1;
                else hi = mid;
            }
            entries.splice(lo, 0, {
                name: currentValue,
                label: currentValue,
                clickable: false,
                selected: true,
            });
        }

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
            if (self.getStationMap) {
                self.getStationMap().openModal(true);  // Replace dropdown's history entry
            }
        });
        dropdown.appendChild(mapOpt);

        // Add all station options (including unavailable entries)
        entries.forEach(entry => {
            const opt = document.createElement('div');
            let cls = 'location-option';
            if (entry.selected) cls += ' selected';
            if (!entry.clickable) cls += ' unavailable';
            opt.className = cls;
            opt.setAttribute('role', 'option');
            opt.dataset.value = entry.name;
            opt.textContent = entry.label;
            if (entry.clickable) {
                opt.addEventListener('click', () => self.select(entry.name));
            }
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

        if (this.onSelect) {
            this.onSelect();
        }
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
                document.activeElement?.blur();
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
                        if (this.getStationMap) {
                            this.getStationMap().openModal(true);  // Replace dropdown's history entry
                        }
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

        // Map trigger opens the map modal
        document.getElementById('map-trigger').addEventListener('click', (e) => {
            e.stopPropagation();
            e.currentTarget.blur();
            if (self.getStationMap) {
                self.getStationMap().openModal();
            }
        });

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

// =============================================================================
// SOURCE SWITCHER
// =============================================================================

/**
 * SourceSwitcher - Handles toggling between data sources (DHMZ/pljusak).
 *
 * When switching sources, finds the nearest station in the new source:
 * - If "Najbliža" was selected: uses user's GPS to find nearest
 * - Otherwise: uses old station's coordinates to find nearest in new source
 */
export const SourceSwitcher = {
    // --- Callbacks (set by app.js) ---
    onToggle: null,
    onRender: null,

    /** Update button labels to show current source (widget and map) */
    updateLabel() {
        const label = getSourceConfig().label;
        const btn = document.getElementById('source-trigger');
        if (btn) btn.textContent = label;
        const mapBtn = document.getElementById('map-source');
        if (mapBtn) mapBtn.textContent = label;
    },

    /** Update URL to reflect current source (without page reload) */
    updateUrl() {
        const url = new URL(window.location.href);
        if (DATA_SOURCE === 'dhmz') {
            url.searchParams.delete('source');
        } else {
            url.searchParams.set('source', DATA_SOURCE);
        }
        history.replaceState(null, '', url);
    },

    /** Toggle to the other source and reload data */
    async toggle() {
        // Capture old station info before switching
        const oldLocation = getSelectedLocation();
        const oldStation = cachedStations?.[oldLocation] ?? null;
        const wasNearest = oldLocation === NEAREST_LOCATION;

        // Switch source
        const newSource = DATA_SOURCE === 'dhmz' ? 'pljusak' : 'dhmz';
        setDataSource(newSource);
        saveSource(newSource);
        this.updateLabel();
        this.updateUrl();

        // Clear cached data
        setCachedStations(null);

        // Fetch new data
        if (this.onToggle) {
            await this.onToggle();
        }

        // Map to nearest station in new source
        if (cachedStations) {
            let newLocation = oldLocation;
            if (wasNearest) {
                // "Najbliža" was selected - keep it (nearest logic uses GPS automatically)
                newLocation = NEAREST_LOCATION;
            } else if (oldStation && isFinite(oldStation.lat) && isFinite(oldStation.lon)) {
                // Find station nearest to old station's coordinates
                const nearest = findNearestStation(cachedStations, oldStation.lat, oldStation.lon);
                if (nearest) newLocation = nearest.name;
            }
            if (newLocation !== oldLocation) {
                setSelectedLocation(newLocation);
            }

            // Repopulate so the dropdown reflects the new selection without
            // carrying the previous source's station name as a ghost entry.
            // (fetchWeatherData populated with the old selection because the
            // location is updated only after the fetch resolves.)
            const stationNames = Object.keys(cachedStations).sort(new Intl.Collator('hr').compare);
            LocationPicker.populate(stationNames);

            if (this.onRender) {
                this.onRender();
            }
        }
    },

    init() {
        const self = this;
        const btn = document.getElementById('source-trigger');

        if (btn) {
            this.updateLabel();
            btn.addEventListener('click', () => self.toggle());
        }
    }
};
