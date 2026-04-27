# Maps Lead Collector (Chrome Extension)

Extract business leads from Google Maps search results and export them to CSV/JSON.

Author: Muhammad Sujon (muhammad.sujon.cse@gmail.com)

## Features

- Collect business leads from Google Maps search results
- Export to CSV and JSON
- Built-in dedupe and lead list search
- Optional email extraction
- Start a Google Maps search directly from the extension popup

## Install (Developer Mode)

1. Open Chrome → `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select this project folder (the folder that contains `manifest.json`)

## How to Use

1. Click the extension icon
2. In the popup, type a keyword (example: `restaurants in Dhaka`)
3. Click **Search on Google Maps** (or press Enter) to open Google Maps search results
4. Go back to the popup and click **Start** to begin collecting leads
5. Use **Stop**, **Export CSV**, **Export JSON**, and **Dedupe** as needed

## Permissions

This extension needs access to Google Maps pages to extract lead information from search results.

## Project Structure

- `manifest.json` — extension configuration (Manifest V3)
- `src/background/` — background service worker
- `src/content/` — content script for Google Maps extraction
- `src/popup/` — popup UI (HTML/CSS/JS)
- `assets/icons/` — extension icons
