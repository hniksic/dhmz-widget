# Pljusak Weather Widget

A PWA that displays current measured weather data from pljusak.com (amateur weather station network in Croatia and surrounding regions).

## Data Source

- **Data endpoint**: `https://pljusak.com/karta.php`
- Contains a JavaScript array `var podaci = [...]` with all station data
- Includes stations from Croatia, Slovenia, Bosnia, and surrounding regions
- Auto-selects nearest station using GPS, or manual selection
- Data is actual measured values from amateur weather stations, not forecast
- Most stations update every 5-15 minutes

## Architecture

Single-page app hosted on GitHub Pages:
- `index.html` - minimal HTML shell
- `style.css` - all styling
- `app.js` - data fetching and rendering (with JSDoc types, data structure documented at top)
- `manifest.json` - PWA manifest
- `sw.js` - service worker (caches static assets)
- `icon.svg`, `icon-*.png` - app icons

## CORS Issue

Pljusak.com doesn't send CORS headers, so browser fetch is blocked. Current workaround uses `https://corsproxy.io/?` as a proxy.

## Deployment

- GitHub Pages: `https://hniksic.github.io/dhmz-widget/`
- Installable as PWA on mobile (tested on Android/Pixel)

## Code Documentation

Some complex flows are documented in comments near the relevant code. When modifying these flows, **update the comments too**:

- `Geolocation` object in `app.js` - documents the geolocation flow and all its states
- `CITY_STATION_PREFIXES` - documents which stations display as "City" + subtitle
- `PODACI` object - documents the array indices for the pljusak.com data format

## Potential Improvements

- Custom CORS proxy for faster/more reliable data loading
