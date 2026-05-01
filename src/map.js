/**
 * Weather Widget - Station Map
 *
 * Interactive map for selecting weather stations.
 */

import {
    cachedStations, getSelectedLocation, setSelectedLocation, NEAREST_LOCATION,
    getSelectedLocationCoords
} from './config.js';
import { Geolocation, findNearestStation, haversineDistance } from './geo.js';
import { LocationPicker, SourceSwitcher } from './ui.js';

// =============================================================================
// SVG MAP OUTLINE
// =============================================================================

const SVG_NS = 'http://www.w3.org/2000/svg';

import { outlinePaths } from './outlines.js';


/** Helper to create SVG elements with attributes */
function createSvgElement(tag, attrs = {}) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) {
        el.setAttribute(key, value);
    }
    return el;
}

// =============================================================================
// STATION MAP
// =============================================================================

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
export const StationMap = {
    // --- Configuration ---
    config: {
        /** SVG viewBox dimensions (matches path coordinate system) */
        viewBox: { width: 100, height: 100 },
        /** Croatia lat/lon bounding box (with padding) */
        bounds: { minLon: 13.2, maxLon: 19.6, minLat: 42.2, maxLat: 46.7 },
        /** Snap distance for station selection (km) at zoom level 1 */
        snapDistance: 20,
        /** Zoom limits (minZoom is recalculated based on station positions) */
        minZoom: 0.5,
        maxZoom: 100
    },

    // --- State ---
    /** Current zoom/pan state: scale and pan offset in base (unzoomed) coordinates */
    zoom: { scale: 1, x: 0, y: 0 },
    /** Pan bounds calculated from station positions (in base coordinates) */
    panBounds: null,
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
    /** Last station selection the map has "acknowledged" (to detect
     * dropdown changes since last open) */
    acknowledgedSelection: null,

    // --- State Queries ---
    isZoomed() { return this.zoom.scale > 1; },
    isDragging() { return this.drag?.moved === true; },
    isPinching() { return this.pinch !== null; },
    /** Check if panning is possible (content extends beyond viewport) */
    canPan() {
        if (this.zoom.scale > 1) return true;
        if (!this.panBounds) return false;
        const { viewBox } = this.config;
        const visibleWidth = viewBox.width / this.zoom.scale;
        const visibleHeight = viewBox.height / this.zoom.scale;
        const contentWidth = this.panBounds.maxX - this.panBounds.minX;
        const contentHeight = this.panBounds.maxY - this.panBounds.minY;
        return contentWidth > visibleWidth || contentHeight > visibleHeight;
    },

    // --- Coordinate Conversion ---
    /**
     * Converts lat/lon to base SVG coordinates (without zoom).
     * Uses equirectangular projection matching the path data.
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
    /** Clamp pan to keep stations reachable (center when zoomed out beyond content) */
    clampPan() {
        const { viewBox } = this.config;
        const bounds = this.panBounds || { minX: 0, minY: 0, maxX: viewBox.width, maxY: viewBox.height };

        const visibleWidth = viewBox.width / this.zoom.scale;
        const visibleHeight = viewBox.height / this.zoom.scale;
        const contentWidth = bounds.maxX - bounds.minX;
        const contentHeight = bounds.maxY - bounds.minY;

        if (visibleWidth >= contentWidth) {
            // Zoomed out - center horizontally on content
            this.zoom.x = bounds.minX + (contentWidth - visibleWidth) / 2;
        } else {
            this.zoom.x = Math.max(bounds.minX, Math.min(this.zoom.x, bounds.maxX - visibleWidth));
        }

        if (visibleHeight >= contentHeight) {
            // Zoomed out - center vertically on content
            this.zoom.y = bounds.minY + (contentHeight - visibleHeight) / 2;
        } else {
            this.zoom.y = Math.max(bounds.minY, Math.min(this.zoom.y, bounds.maxY - visibleHeight));
        }
    },

    /** Reset zoom to default (scale 1, no pan) */
    resetZoom() {
        this.zoom = { scale: 1, x: 0, y: 0 };
    },

    /**
     * Center and zoom the map on the currently selected station.
     * Used when the selection changed via dropdown since the map was
     * last open.
     */
    centerOnSelected() {
        const sel = getSelectedLocation();
        let coords;
        if (sel === NEAREST_LOCATION) {
            coords = Geolocation.coords;
        } else if (cachedStations?.[sel]) {
            coords = cachedStations[sel];
        } else {
            coords = getSelectedLocationCoords();
        }
        if (!coords || !isFinite(coords.lat) || !isFinite(coords.lon)) return;

        const { viewBox } = this.config;
        this.zoom.scale = 3;
        const base = this.latLonToBase(coords.lat, coords.lon);
        // Pan so the station is at the center of the viewport
        this.zoom.x = base.x - viewBox.width / this.zoom.scale / 2;
        this.zoom.y = base.y - viewBox.height / this.zoom.scale / 2;
        this.clampPan();
    },

    /**
     * Calculate zoom and pan limits based on station positions.
     * Updates config.minZoom and stores station bounds for pan clamping.
     */
    calculateBoundsFromStations() {
        if (!cachedStations) return;

        const { viewBox } = this.config;
        let minLat = Infinity, maxLat = -Infinity;
        let minLon = Infinity, maxLon = -Infinity;

        // Find bounding box of all stations
        for (const station of Object.values(cachedStations)) {
            if (!isFinite(station.lat) || !isFinite(station.lon)) continue;
            minLat = Math.min(minLat, station.lat);
            maxLat = Math.max(maxLat, station.lat);
            minLon = Math.min(minLon, station.lon);
            maxLon = Math.max(maxLon, station.lon);
        }

        if (!isFinite(minLat)) return;

        // Add some padding (5%)
        const latPadding = (maxLat - minLat) * 0.05;
        const lonPadding = (maxLon - minLon) * 0.05;
        minLat -= latPadding;
        maxLat += latPadding;
        minLon -= lonPadding;
        maxLon += lonPadding;

        // Convert station bounds to base SVG coordinates
        const topLeft = this.latLonToBase(maxLat, minLon);
        const bottomRight = this.latLonToBase(minLat, maxLon);

        // Store pan bounds (in base coordinates)
        this.panBounds = {
            minX: Math.min(0, topLeft.x),
            minY: Math.min(0, topLeft.y),
            maxX: Math.max(viewBox.width, bottomRight.x),
            maxY: Math.max(viewBox.height, bottomRight.y)
        };

        // Calculate required zoom to fit all stations
        const stationWidth = bottomRight.x - topLeft.x;
        const stationHeight = bottomRight.y - topLeft.y;
        const zoomX = viewBox.width / stationWidth;
        const zoomY = viewBox.height / stationHeight;

        // Use the smaller zoom to ensure everything fits
        this.config.minZoom = Math.min(zoomX, zoomY, 1);
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
    /** Update the Croatia and neighbor outline transforms based on current zoom */
    updateOutlineTransform() {
        const transform = `scale(${this.zoom.scale}) translate(${-this.zoom.x}, ${-this.zoom.y})`;

        const outline = document.getElementById('croatia-outline');
        if (outline) {
            outline.setAttribute('transform', transform);
        }

        const neighbors = document.getElementById('neighbor-outlines');
        if (neighbors) {
            neighbors.setAttribute('transform', transform);
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

        // Calculate zoom/pan bounds based on station positions
        this.calculateBoundsFromStations();

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
            circle.setAttribute('r', 0.5);
            circle.setAttribute('class', 'station-dot' + (name === selectedStation ? ' selected' : ''));
            circle.setAttribute('data-station', name);
            circle.setAttribute('data-lat', station.lat);
            circle.setAttribute('data-lon', station.lon);
            circle.addEventListener('click', () => self.selectStation(name));
            circle.addEventListener('mouseenter', (e) => self.showTooltip(e, name));
            circle.addEventListener('mouseleave', () => self.hideTooltip());
            dotsGroup.appendChild(circle);
        }

        // Add ghost dot for selected station not in current source
        if (selectedLocation !== NEAREST_LOCATION && !cachedStations[selectedLocation]) {
            const ghostCoords = getSelectedLocationCoords();
            if (ghostCoords) {
                const { x, y } = this.latLonToSvg(ghostCoords.lat, ghostCoords.lon);
                const ghost = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                ghost.setAttribute('cx', x);
                ghost.setAttribute('cy', y);
                ghost.setAttribute('r', 0.5);
                ghost.setAttribute('class', 'station-dot ghost selected');
                ghost.setAttribute('data-station', selectedLocation);
                ghost.setAttribute('data-lat', ghostCoords.lat);
                ghost.setAttribute('data-lon', ghostCoords.lon);
                ghost.addEventListener('mouseenter', (e) => self.showTooltip(e, selectedLocation));
                ghost.addEventListener('mouseleave', () => self.hideTooltip());
                dotsGroup.appendChild(ghost);
            }
        }

        // Add user location marker if available (also acts as "Najbliža" selector)
        if (coords) {
            const { x, y } = this.latLonToSvg(coords.lat, coords.lon);
            const isSelected = selectedLocation === NEAREST_LOCATION;

            const pulse = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            pulse.setAttribute('cx', x);
            pulse.setAttribute('cy', y);
            pulse.setAttribute('r', 0.5);
            pulse.setAttribute('class', 'user-dot-pulse');
            pulse.setAttribute('data-lat', coords.lat);
            pulse.setAttribute('data-lon', coords.lon);
            userGroup.appendChild(pulse);

            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', x);
            dot.setAttribute('cy', y);
            dot.setAttribute('r', 0.5);
            dot.setAttribute('class', 'user-dot' + (isSelected ? ' selected' : ''));
            dot.setAttribute('data-lat', coords.lat);
            dot.setAttribute('data-lon', coords.lon);
            dot.setAttribute('data-station', NEAREST_LOCATION);
            dot.addEventListener('click', () => self.selectStation(NEAREST_LOCATION));
            dot.addEventListener('mouseenter', (e) => {
                self.showTooltip(e, self.getNearestLabel());
                self.highlightNearestStation(true);
            });
            dot.addEventListener('mouseleave', () => {
                self.hideTooltip();
                self.highlightNearestStation(false);
            });
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

        // Also consider the user's GPS location as the "Najbliža" candidate
        const coords = Geolocation.coords;
        if (coords) {
            const dist = haversineDistance(lat, lon, coords.lat, coords.lon);
            if (dist < minDist) {
                nearest = NEAREST_LOCATION;
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
            document.querySelectorAll('.station-dot.prehighlight, .user-dot.prehighlight').forEach(el => {
                el.classList.remove('prehighlight');
                el.setAttribute('r', 0.5);
            });

            // Add new highlight
            if (nearest) {
                const sel = CSS.escape(nearest);
                const dot = document.querySelector(`.station-dot[data-station="${sel}"]`)
                    || document.querySelector(`.user-dot[data-station="${sel}"]`);
                if (dot) {
                    dot.classList.add('prehighlight');
                    dot.setAttribute('r', 0.8);
                }
            }
            // Highlight the nearest station when hovering near user dot
            this.highlightNearestStation(nearest === NEAREST_LOCATION);
            this.highlight = nearest;
        }
        return nearest;
    },

    /** Clear prehighlight state */
    clearHighlight() {
        document.querySelectorAll('.station-dot.prehighlight, .user-dot.prehighlight').forEach(el => {
            el.classList.remove('prehighlight');
            el.setAttribute('r', 0.5);
        });
        this.highlight = null;
    },

    /** Clear tapped station state */
    clearTapped() {
        document.querySelectorAll('.station-dot.tapped, .user-dot.tapped').forEach(el => {
            el.classList.remove('tapped');
            el.setAttribute('r', 0.5);
        });
        this.tapped = null;
        this.hideLabel();
        this.highlightNearestStation(false);
    },

    /**
     * Get tooltip/label text for the user location dot.
     * @returns {string} e.g. "Prati najbližu (Krapina)" or "Prati najbližu"
     */
    getNearestLabel() {
        const coords = Geolocation.coords;
        if (coords && cachedStations) {
            const nearest = findNearestStation(cachedStations, coords.lat, coords.lon);
            if (nearest) return `Prati najbližu (${nearest.name})`;
        }
        return 'Prati najbližu';
    },

    /**
     * Add or remove nearest-highlight class on the nearest station dot.
     * Creates a visual link between the user dot and the nearest station.
     * @param {boolean} show - Whether to add or remove the highlight
     */
    highlightNearestStation(show) {
        // Always clear existing highlights first
        document.querySelectorAll('.station-dot.nearest-highlight').forEach(el => {
            el.classList.remove('nearest-highlight');
        });
        if (show) {
            const coords = Geolocation.coords;
            if (coords && cachedStations) {
                const nearest = findNearestStation(cachedStations, coords.lat, coords.lon);
                if (nearest) {
                    const dot = document.querySelector(`.station-dot[data-station="${CSS.escape(nearest.name)}"]`);
                    if (dot) dot.classList.add('nearest-highlight');
                }
            }
        }
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
            const sel = CSS.escape(stationName);
            const dot = document.querySelector(`.station-dot[data-station="${sel}"]`)
                || document.querySelector(`.user-dot[data-station="${sel}"]`);
            if (dot) {
                dot.classList.add('tapped');
                dot.setAttribute('r', 0.8);
            }
            // Highlight nearest station when tapping user dot
            this.highlightNearestStation(stationName === NEAREST_LOCATION);
            this.showLabel(stationName);
        }
    },

    /** Select a station and close the map */
    selectStation(stationName) {
        if (this.isDragging()) return;
        this.acknowledgedSelection = stationName;
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
        const sel = CSS.escape(stationName);
        const dot = document.querySelector(`.station-dot[data-station="${sel}"]`)
            || document.querySelector(`.user-dot[data-station="${sel}"]`);
        if (!label || !dot) return;

        const svg = document.getElementById('station-map');
        const svgRect = svg.getBoundingClientRect();
        const container = document.querySelector('.map-container');
        const containerRect = container.getBoundingClientRect();

        const cx = parseFloat(dot.getAttribute('cx'));
        const cy = parseFloat(dot.getAttribute('cy'));

        const x = (cx / this.config.viewBox.width) * svgRect.width + (svgRect.left - containerRect.left);
        const y = (cy / this.config.viewBox.height) * svgRect.height + (svgRect.top - containerRect.top);

        label.textContent = stationName === NEAREST_LOCATION ? this.getNearestLabel() : stationName;
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
        this.renderStations();
        const currentSelection = getSelectedLocation();
        if (this.acknowledgedSelection !== null &&
            currentSelection !== this.acknowledgedSelection) {
            // Station changed via dropdown since last open — center on it
            this.centerOnSelected();
        } else {
            // Preserve existing zoom/pan, just clamp to current bounds
            this.zoom.scale = Math.max(this.config.minZoom,
                Math.min(this.config.maxZoom, this.zoom.scale));
            this.clampPan();
        }
        this.acknowledgedSelection = currentSelection;
        this.updatePositions();
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
        if (popHistory) history.back();
    },

    // --- Mouse Input Handlers ---
    mouse: {
        onDown(event) {
            const map = StationMap;
            if (map.canPan()) {
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
                const label = nearest === NEAREST_LOCATION ? map.getNearestLabel() : nearest;
                map.showTooltip(event, label);
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

            // Use actual deltaY - mouse wheels have large values (~100), touchpads have small ones
            const zoomFactor = Math.pow(1.002, -event.deltaY);
            const newScale = map.zoom.scale * zoomFactor;

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
            } else if (event.touches.length === 1 && map.canPan()) {
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
    /** Create the SVG element and its structure */
    createSvg(outlinePaths) {
        const container = document.getElementById('map-content');

        // Create main SVG element
        const { width, height } = this.config.viewBox;
        const svg = createSvgElement('svg', {
            id: 'station-map',
            viewBox: `0 0 ${width} ${height}`,
            preserveAspectRatio: 'xMidYMid meet'
        });

        // Neighbor country outlines group (rendered first, so Croatia appears on top)
        const neighborGroup = createSvgElement('g', { id: 'neighbor-outlines' });
        // Croatia outline group with path
        const outlineGroup = createSvgElement('g', { id: 'croatia-outline' });

        // Add all country outlines from flat structure
        for (const [country, pathData] of Object.entries(outlinePaths)) {
            if (country === 'croatia') {
                const pathEl = createSvgElement('path', { d: pathData });
                outlineGroup.appendChild(pathEl);
            } else {
                const pathEl = createSvgElement('path', {
                    d: pathData,
                    'data-country': country
                });
                neighborGroup.appendChild(pathEl);
            }
        }

        // Add neighbor group first so Croatia appears on top
        svg.appendChild(neighborGroup);
        svg.appendChild(outlineGroup);

        // Empty groups for dynamic content
        svg.appendChild(createSvgElement('g', { id: 'station-dots' }));
        svg.appendChild(createSvgElement('g', { id: 'user-location' }));

        container.appendChild(svg);

        return svg;
    },

    init() {
        this.acknowledgedSelection = getSelectedLocation();
        const svg = this.createSvg(outlinePaths);
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

        // Source switcher in map
        const sourceBtn = document.getElementById('map-source');
        if (sourceBtn) {
            sourceBtn.addEventListener('click', async () => {
                await SourceSwitcher.toggle();
                self.renderStations();
                // Clamp zoom to new source bounds
                self.zoom.scale = Math.max(self.config.minZoom,
                    Math.min(self.config.maxZoom, self.zoom.scale));
                self.clampPan();
                self.updatePositions();
                // Acknowledge the (possibly changed) selection so
                // in-map source switches don't trigger re-centering
                // on next open.
                self.acknowledgedSelection = getSelectedLocation();
            });
        }

        // Keyboard
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && !modal.hidden) {
                self.closeModal();
            }
        });
    }
};
