/**
 * Weather Widget - Station Map
 *
 * Interactive map for selecting weather stations.
 */

import {
    cachedStations, getSelectedLocation, setSelectedLocation, NEAREST_LOCATION
} from './config.js';
import { Geolocation, findNearestStation, haversineDistance } from './geo.js';
import { LocationPicker, SourceSwitcher } from './ui.js';

// =============================================================================
// SVG MAP OUTLINE
// =============================================================================

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Croatia outline path data (610×476 coordinate system, latitude correction applied via transform) */
const CROATIA_OUTLINE_PATH = `
M36.0 125.1L39.6 129.4L64.7 134.5L70.1 132.2L73.4 128.8L73.4 126.6L75.6 125.9
L84.4 129.3L91.6 128.5L103.2 128.3L111.5 128.9L117.0 126.3L124.4 116.9L127.1 111.6
L130.5 110.3L132.7 110.9L134.3 115.3L138.2 119.4L146.2 126.0L151.8 129.2L157.0 130.4
L162.0 127.7L167.2 126.9L182.1 132.1L194.6 133.1L203.9 130.4L202.7 126.7L199.3 122.5
L198.6 118.5L199.2 115.0L205.6 111.5L205.3 110.0L197.6 103.9L198.0 102.3L214.8 95.5
L231.1 91.6L233.7 88.6L235.2 84.2L236.0 75.8L235.1 68.9L228.5 62.5L228.0 59.2
L229.6 55.9L232.2 52.8L238.7 51.5L246.3 49.3L252.3 46.8L260.5 44.7L266.9 41.7
L273.2 34.8L277.0 33.6L288.6 34.6L291.0 32.9L289.4 22.9L291.5 20.3L295.6 18.9
L297.5 17.5L307.6 18.6L316.1 21.2L321.2 22.7L338.2 30.0L349.9 38.2L356.5 47.2
L365.3 54.2L376.4 59.2L385.3 65.9L391.8 74.5L400.9 79.2L412.6 80.3L420.0 83.2
L423.2 88.0L429.5 92.3L439.1 96.2L454.1 98.3L482.7 98.9L485.2 99.0L491.7 100.2
L499.2 98.7L508.4 95.6L511.3 93.8L521.0 83.8L526.3 84.7L536.9 83.5L543.3 81.3
L543.8 81.3L543.4 83.8L542.7 88.3L537.5 91.4L542.8 98.7L547.8 110.5L545.0 116.3
L548.4 120.8L558.1 124.1L558.9 125.3L556.0 126.7L553.5 130.5L553.3 137.6L561.7 144.2
L578.8 150.4L584.3 151.5L586.4 153.9L589.3 155.4L590.9 157.3L591.0 159.8L589.8 161.5
L581.7 162.1L572.4 162.1L565.9 159.1L565.3 161.3L565.2 163.8L558.8 165.3L562.3 182.6
L560.9 187.6L558.6 189.2L556.4 188.5L553.7 188.3L552.4 190.0L553.5 193.7L547.2 194.1
L537.2 192.2L532.6 188.8L531.9 185.4L531.8 182.2L528.6 177.0L520.7 171.6L504.0 170.7
L497.9 169.0L491.6 167.1L484.7 165.6L478.3 165.8L470.6 167.2L457.1 164.8L452.6 168.0
L445.5 171.7L439.7 171.6L428.0 163.1L424.5 162.5L414.3 166.9L410.1 167.1L406.9 165.7
L393.1 162.5L386.8 161.8L382.3 163.3L374.1 161.7L354.4 150.6L342.3 159.0L317.5 156.9
L310.1 162.7L301.7 173.7L294.8 178.9L288.9 177.0L281.9 172.2L269.6 159.8L263.4 157.5
L256.2 157.0L250.0 158.4L246.7 160.9L244.1 179.0L241.9 195.0L241.8 204.6L255.4 213.5
L271.5 228.7L276.7 230.5L279.3 235.5L283.1 248.4L287.3 262.8L295.5 272.4L302.9 279.3
L311.9 285.3L323.2 294.8L332.4 305.2L334.9 309.0L352.8 322.7L370.2 336.7L385.8 341.6
L388.3 344.2L388.4 355.0L390.1 359.1L400.5 370.3L421.7 386.9L424.2 390.7L424.9 393.5
L423.5 395.6L418.0 397.9L413.4 395.4L393.6 379.2L374.5 369.0L353.0 349.9L324.1 342.3
L304.4 333.9L292.5 335.2L279.4 337.8L271.3 337.9L265.5 336.4L261.4 331.2L262.0 327.2
L261.3 321.9L249.8 313.5L234.1 305.6L219.2 295.2L189.3 267.4L183.3 258.4L189.2 256.7
L193.6 256.9L198.7 255.0L206.8 255.0L216.5 256.8L207.9 250.9L197.3 245.0L169.8 221.8
L161.6 210.9L160.6 199.0L162.7 182.8L157.7 171.3L136.5 156.2L128.7 148.3L113.1 143.6
L106.1 144.1L101.8 149.9L98.8 162.9L84.9 180.1L80.3 187.5L73.0 197.2L66.7 197.9
L63.0 197.0L51.7 180.7L40.9 168.4L39.4 162.5L38.4 155.3L30.2 128.9L36.0 125.1Z
M328.9 391.7L346.5 394.7L359.4 393.3L371.1 395.1L378.4 398.5L380.1 400.2L370.7 400.4
L360.0 399.0L348.0 402.4L337.3 400.6L333.2 398.4L330.4 395.6L328.9 391.7Z
M380.7 378.1L374.0 379.2L331.6 378.4L319.3 376.2L305.6 370.5L302.8 368.8L316.6 367.1
L329.4 368.8L333.3 372.9L368.0 376.2L380.7 378.1Z
M341.7 362.7L326.7 363.0L313.6 361.1L307.2 357.8L307.7 355.1L309.7 350.4L324.2 351.0
L346.4 354.3L351.8 358.1L350.1 359.9L341.7 362.7Z
M153.5 182.2L141.7 184.5L136.1 180.5L134.7 177.1L125.0 176.1L119.2 171.4L118.0 169.4
L126.3 164.3L130.7 156.0L136.3 161.0L143.1 170.3L146.7 172.9L153.5 182.2Z
M155.5 205.3L157.9 210.0L148.9 205.8L140.9 204.2L139.2 201.0L140.3 198.4L142.1 195.9
L148.1 196.2L149.0 198.7L155.5 205.3Z
M189.5 250.1L187.1 252.9L180.9 247.7L175.2 244.0L171.2 239.7L163.3 234.2L160.6 228.0
L148.7 215.3L147.0 211.8L152.9 217.0L157.8 220.2L161.8 221.0L172.2 229.1L182.3 239.5
L194.4 248.6L191.9 248.8L189.5 250.1Z
M189.6 293.8L190.9 295.4L190.8 296.4L185.8 294.9L184.5 295.4L161.2 272.3L158.7 267.8
L167.0 273.2L189.6 293.8Z
M122.8 215.8L122.0 219.9L116.2 214.7L113.3 205.4L106.0 190.4L105.1 186.1L108.9 181.9
L108.7 177.7L103.5 164.5L107.8 162.4L110.4 162.1L111.4 171.3L113.8 176.5L120.8 183.0
L119.4 193.7L120.8 208.9L122.2 212.3L122.8 215.8Z
M499.1 437.9L499.3 441.8L502.9 446.3L506.8 451.4L489.2 441.3L472.8 430.1L440.7 412.8
L417.9 408.6L386.8 394.7L366.5 389.8L374.2 388.7L383.1 388.6L431.2 407.2L425.8 402.3
L432.7 400.3L438.6 401.7L442.4 407.8L449.8 411.7L461.7 418.7L469.3 424.1L486.5 433.8
L490.5 435.1L499.1 437.9Z
`.trim();

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
    createSvg() {
        const container = document.getElementById('map-content');

        // Create main SVG element
        const { width, height } = this.config.viewBox;
        const svg = createSvgElement('svg', {
            id: 'station-map',
            viewBox: `0 0 ${width} ${height}`,
            preserveAspectRatio: 'xMidYMid meet'
        });

        // Croatia outline group with path
        const outlineGroup = createSvgElement('g', { id: 'croatia-outline' });
        const outlinePath = createSvgElement('path', { d: CROATIA_OUTLINE_PATH });
        outlineGroup.appendChild(outlinePath);
        svg.appendChild(outlineGroup);

        // Empty groups for dynamic content
        svg.appendChild(createSvgElement('g', { id: 'station-dots' }));
        svg.appendChild(createSvgElement('g', { id: 'user-location' }));

        container.appendChild(svg);

        return svg;
    },

    init() {
        const svg = this.createSvg();
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
