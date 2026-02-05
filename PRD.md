# Product Requirements Document
## Historical Exchange-Rate Charts: CHZ/BTC & PEPPER/CHZ

**Author:** Mark Verdegaal
**Date:** 2026-02-04
**Status:** Draft

---

## Overview

A static web page displaying two historical price ratio charts using TradingView's Lightweight Charts library:

1. **CHZ/BTC** — Number of CHZ tokens needed to purchase 1 BTC
2. **PEPPER/CHZ** — Number of PEPPER tokens needed to purchase 1 CHZ

---

## Goals

| Goal | Description |
|------|-------------|
| Visualize CHZ/BTC ratio | Show how many CHZ tokens are required to buy 1 BTC over time |
| Visualize PEPPER/CHZ ratio | Show how many PEPPER tokens are required to buy 1 CHZ over time |
| Maximum historical data | Display the longest available timeframe for each pair |

**Target audience:** Crypto analysts, trading strategists, fan token market watchers

---

## Chart Specifications

### Chart 1: CHZ/BTC Ratio

**Metric:**
```
CHZ per BTC = BTC_USD_price / CHZ_USD_price
```

**Example:** If BTC = $60,000 and CHZ = $0.06, then 1 BTC = 1,000,000 CHZ

**Data source priority:**
1. Direct BTC/CHZ pair (if available on exchange APIs)
2. Derived: Fetch BTC/USD and CHZ/USD, compute ratio

---

### Chart 2: PEPPER/CHZ Ratio

**Metric:**
```
PEPPER per CHZ = CHZ_USD_price / PEPPER_USD_price
```

**Data source priority:**
1. Direct CHZ/PEPPER pair (unlikely to exist)
2. Derived: Fetch CHZ/USD and PEPPER/USD, compute ratio

---

## Technical Requirements

### Stack
- **Frontend:** Plain HTML + JavaScript (no framework)
- **Charting:** TradingView Lightweight Charts (free, open-source)
- **Data:** CoinGecko API (free tier) or similar crypto price API

### Data API Requirements
| Requirement | Specification |
|-------------|---------------|
| Historical OHLCV data | Daily candles, maximum available history |
| Tokens supported | BTC, CHZ, PEPPER |
| Rate limits | Must work within free API tier limits |
| Update frequency | Daily (not real-time) |

### Display Requirements

| Feature | Specification |
|---------|---------------|
| Chart type | Line chart |
| X-axis | Date/time (full available range) |
| Y-axis | Token ratio (auto-scaled) |
| Tooltip | Date + exact ratio value |
| Colors | CHZ/BTC: Blue (#2962FF), PEPPER/CHZ: Red (#FF5252) |
| Grid | Light grid lines |
| Legend | Clear labels for each chart |

### Interactivity
- Zoom via mouse scroll/drag
- Pan across timeline
- Crosshair with value display
- Timeframe selector buttons: 1W, 1M, 3M, 6M, 1Y, 3Y, ALL

---

## Page Layout

```
+------------------------------------------+
|  Historical Exchange Rate Charts         |
+------------------------------------------+
|                                          |
|  [CHZ/BTC Chart]                         |
|  "CHZ tokens per 1 BTC"                  |
|                                          |
+------------------------------------------+
|                                          |
|  [PEPPER/CHZ Chart]                      |
|  "PEPPER tokens per 1 CHZ"               |
|                                          |
+------------------------------------------+
|  Data source: CoinGecko | Last updated   |
+------------------------------------------+
```

---

## Acceptance Criteria

- [ ] Both charts render correctly with historical data
- [ ] Ratio calculations are accurate (verified against manual calculation)
- [ ] Charts display maximum available historical data
- [ ] Y-axis scales appropriately for large numbers
- [ ] Tooltips show date and precise ratio value
- [ ] Works in modern browsers (Chrome, Firefox, Safari, Edge)
- [ ] Page loads within 3 seconds on standard connection
- [ ] Graceful error handling if API is unavailable

---

## Out of Scope

- Real-time price updates (daily snapshots sufficient)
- Pine Script / TradingView platform integration
- User authentication
- Price alerts or notifications
- Mobile-specific responsive design (basic responsiveness only)

---

## Data Availability Notes

| Token | CoinGecko ID | Historical Data |
|-------|--------------|-----------------|
| BTC | bitcoin | Full history available |
| CHZ | chiliz | Available since 2019 |
| PEPPER | pepper | Verify availability - may have limited history |

**Risk:** PEPPER may have limited historical data or not be listed on major APIs. Fallback: Display only available data range with clear indication.

---

## Deliverables

1. `index.html` — Main page with both charts
2. `styles.css` — Styling (optional, can be inline)
3. `app.js` — Chart initialization and data fetching logic
4. `README.md` — Setup and deployment instructions
