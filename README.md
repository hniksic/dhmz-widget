# DHMZ Weather Widget

A PWA that displays current measured weather data from Croatian weather stations.

**Live app: https://hniksic.github.io/dhmz-widget/index.html**

## Features

- Current temperature, humidity, pressure, and wind from weather stations
- Two switchable data sources (toggle in the top-left corner):
  - **DHMZ** — official Croatian Meteorological Service stations
  - **pljusak.com** — amateur weather station network covering Croatia, Slovenia,
    Bosnia, and surrounding regions
- Auto-selects nearest station using GPS
- Manual station selection from dropdown or interactive map
- Displays actual measured values, not forecasts
- Installable as a PWA on mobile devices

## Data Sources

**DHMZ** data is fetched from [DHMZ](https://meteo.hr/) via their public XML endpoint
at vrijeme.hr. It updates hourly.

**pljusak.com** data is fetched from [pljusak.com](https://pljusak.com/), a community
network of amateur weather stations. It updates every 5–15 minutes.

## Installation

Visit the [live app](https://hniksic.github.io/dhmz-widget/index.html) and use your
browser's "Add to Home Screen" or "Install" option to install as a standalone app.

## License

MIT
