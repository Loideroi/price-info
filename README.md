# Historical Exchange Rate Charts

A static web page displaying historical CHZ/BTC and PEPPER/CHZ exchange rate ratios using TradingView Lightweight Charts.

## Features

- **CHZ/BTC Chart**: Shows how many CHZ equal 1 BTC over time
- **PEPPER/CHZ Chart**: Shows how many PEPPER equal 1 CHZ over time
- **Timeframe Selector**: 1W, 1M, 3M, 6M, 1Y, and ALL options
- **Interactive Charts**: Zoom, pan, and crosshair with tooltips
- **Responsive Layout**: Works on desktop and mobile

## Quick Start

Open `index.html` in a web browser. No build tools or server required.

For local development with live reload, you can use any static file server:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js (npx)
npx serve .

# Using PHP
php -S localhost:8000
```

Then open `http://localhost:8000` in your browser.

## Technical Details

### Data Source
- **API**: [CoinGecko](https://www.coingecko.com/en/api) (free tier, no authentication required)
- **Endpoints**: `/coins/{id}/market_chart`
- **Rate Limits**: ~30 requests/minute (free tier)

### Coin IDs
- Bitcoin: `bitcoin`
- Chiliz: `chiliz`
- Pepper: `pepper`

### Charting Library
- [TradingView Lightweight Charts v4](https://tradingview.github.io/lightweight-charts/) via CDN

### Limitations
- Free CoinGecko tier limited to 365 days of historical data
- PEPPER data may be limited due to token age
- Rate limiting may cause delays when switching timeframes rapidly

## File Structure

```
├── index.html      # Main HTML page
├── styles.css      # Styling
├── app.js          # Data fetching and chart logic
├── PRD.md          # Product requirements
└── README.md       # This file
```

## Browser Support

Works in all modern browsers (Chrome, Firefox, Safari, Edge).
