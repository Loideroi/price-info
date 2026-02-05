// Configuration
const COINGECKO_API = 'https://api.coingecko.com/api/v3';
const CRYPTOCOMPARE_API = 'https://min-api.cryptocompare.com';
const COIN_IDS = {
    bitcoin: 'bitcoin',
    chiliz: 'chiliz',
    pepper: 'pepper'
};
// Coins that use CryptoCompare for full history (BTC, CHZ)
const CRYPTOCOMPARE_COINS = {
    bitcoin: 'BTC',
    chiliz: 'CHZ'
};

// Chart instances
let chzBtcChart = null;
let pepperChzChart = null;
let chzBtcSeries = null;
let pepperChzSeries = null;

// Current timeframe
let currentDays = 365;

// DOM elements
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const errorMessageEl = document.getElementById('error-message');
const chzBtcLegendEl = document.getElementById('legend-chz-btc');
const pepperChzLegendEl = document.getElementById('legend-pepper-chz');

// Utility: delay for rate limiting
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Utility: format number with appropriate precision
function formatNumber(num) {
    if (num === null || num === undefined) return '-';
    return Math.round(num).toLocaleString('en-US');
}

// Utility: format date
function formatDate(timestamp) {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Fetch historical market data from CoinGecko
async function fetchMarketData(coinId, days) {
    const daysParam = days === 'max' ? 'max' : days;
    const url = `${COINGECKO_API}/coins/${coinId}/market_chart?vs_currency=usd&days=${daysParam}`;

    const response = await fetch(url);

    if (response.status === 429) {
        throw new Error('Rate limit exceeded. Please wait a moment and try again.');
    }

    if (!response.ok) {
        throw new Error(`Failed to fetch ${coinId} data: ${response.statusText}`);
    }

    const data = await response.json();
    return data.prices; // Array of [timestamp, price]
}

// Fetch historical market data from CryptoCompare (full history for BTC/CHZ)
async function fetchCryptoCompareData(fsym, days) {
    const limit = days === 'max' ? 2000 : Math.min(days, 2000);
    const url = `${CRYPTOCOMPARE_API}/data/v2/histoday?fsym=${fsym}&tsym=USD&limit=${limit}`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to fetch ${fsym} data from CryptoCompare: ${response.statusText}`);
    }

    const json = await response.json();

    if (json.Response === 'Error') {
        throw new Error(`CryptoCompare error for ${fsym}: ${json.Message}`);
    }

    const dataPoints = json.Data.Data;

    // Convert to CoinGecko-compatible format: [[timestamp_ms, price]]
    return dataPoints
        .filter(d => d.close > 0)
        .map(d => [d.time * 1000, d.close]);
}

// Calculate ratio between two price series
function calculateRatio(numeratorPrices, denominatorPrices) {
    // Create a map of denominator prices by day
    const denomMap = new Map();
    denominatorPrices.forEach(([timestamp, price]) => {
        const dayKey = Math.floor(timestamp / 86400000); // Group by day
        denomMap.set(dayKey, price);
    });

    // Calculate ratios
    const ratios = [];
    const seenDays = new Set();

    numeratorPrices.forEach(([timestamp, numPrice]) => {
        const dayKey = Math.floor(timestamp / 86400000);

        // Only take one data point per day
        if (seenDays.has(dayKey)) return;

        const denomPrice = denomMap.get(dayKey);
        if (denomPrice && denomPrice > 0) {
            seenDays.add(dayKey);
            ratios.push({
                time: Math.floor(timestamp / 1000), // Convert to seconds for chart
                value: numPrice / denomPrice
            });
        }
    });

    // Sort by time
    ratios.sort((a, b) => a.time - b.time);

    return ratios;
}

// Create chart with common options
function createChart(containerId, lineColor, topColor) {
    const container = document.getElementById(containerId);

    const chart = LightweightCharts.createChart(container, {
        localization: {
            priceFormatter: (price) => Math.round(price).toLocaleString('en-US')
        },
        layout: {
            background: { type: 'solid', color: 'transparent' },
            textColor: '#888'
        },
        grid: {
            vertLines: { color: '#2a2a4a' },
            horzLines: { color: '#2a2a4a' }
        },
        crosshair: {
            mode: LightweightCharts.CrosshairMode.Normal
        },
        rightPriceScale: {
            borderColor: '#3a3a5a'
        },
        timeScale: {
            borderColor: '#3a3a5a',
            timeVisible: true,
            secondsVisible: false
        },
        handleScroll: true,
        handleScale: true
    });

    const series = chart.addAreaSeries({
        lineColor: lineColor,
        topColor: topColor,
        bottomColor: 'rgba(0, 0, 0, 0)',
        lineWidth: 2
    });

    // Make chart responsive
    const resizeObserver = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        chart.applyOptions({ width, height });
    });
    resizeObserver.observe(container);

    return { chart, series };
}

// Update legend on crosshair move
function setupLegend(chart, series, legendEl, label) {
    chart.subscribeCrosshairMove((param) => {
        if (param.time) {
            const data = param.seriesData.get(series);
            if (data) {
                const value = data.value !== undefined ? data.value : data.close;
                legendEl.innerHTML = `
                    <span class="value">${label}: ${formatNumber(value, 4)}</span>
                    <span class="date">${formatDate(param.time)}</span>
                `;
            }
        } else {
            legendEl.innerHTML = '';
        }
    });
}

// Initialize charts
function initCharts() {
    // CHZ/BTC chart (blue theme)
    const chzBtc = createChart('chart-chz-btc', '#2962ff', 'rgba(41, 98, 255, 0.3)');
    chzBtcChart = chzBtc.chart;
    chzBtcSeries = chzBtc.series;
    setupLegend(chzBtcChart, chzBtcSeries, chzBtcLegendEl, 'CHZ/BTC');

    // PEPPER/CHZ chart (green theme)
    const pepperChz = createChart('chart-pepper-chz', '#26a69a', 'rgba(38, 166, 154, 0.3)');
    pepperChzChart = pepperChz.chart;
    pepperChzSeries = pepperChz.series;
    setupLegend(pepperChzChart, pepperChzSeries, pepperChzLegendEl, 'PEPPER/CHZ');
}

// Load and display data
async function loadData(days) {
    loadingEl.classList.remove('hidden');
    errorEl.style.display = 'none';

    try {
        // Fetch BTC and CHZ from CryptoCompare (full history support)
        // Fetch them in parallel since CryptoCompare has generous rate limits
        const [btcPrices, chzPrices] = await Promise.all([
            fetchCryptoCompareData(CRYPTOCOMPARE_COINS.bitcoin, days),
            fetchCryptoCompareData(CRYPTOCOMPARE_COINS.chiliz, days)
        ]);

        // Fetch PEPPER from CoinGecko (only free source available)
        // Cap CoinGecko days at 365 since free tier doesn't support more
        const geckoMaxDays = days === 'max' ? 365 : Math.min(days, 365);
        let pepperPrices;
        try {
            pepperPrices = await fetchMarketData(COIN_IDS.pepper, geckoMaxDays);
        } catch (e) {
            console.warn('PEPPER data may be limited:', e.message);
            pepperPrices = [];
        }

        // Calculate ratios
        // CHZ/BTC = BTC price / CHZ price (how many CHZ per 1 BTC)
        const chzBtcRatios = calculateRatio(btcPrices, chzPrices);

        // PEPPER/CHZ = CHZ price / PEPPER price (how many PEPPER per 1 CHZ)
        let pepperChzRatios = [];
        if (pepperPrices.length > 0) {
            pepperChzRatios = calculateRatio(chzPrices, pepperPrices);
        }

        // Update charts
        chzBtcSeries.setData(chzBtcRatios);
        chzBtcChart.timeScale().fitContent();

        if (pepperChzRatios.length > 0) {
            pepperChzSeries.setData(pepperChzRatios);
            pepperChzChart.timeScale().fitContent();
        } else {
            pepperChzSeries.setData([]);
            pepperChzLegendEl.innerHTML = '<span style="color: #f44">Limited PEPPER data available</span>';
        }

        loadingEl.classList.add('hidden');

    } catch (error) {
        console.error('Error loading data:', error);
        loadingEl.classList.add('hidden');
        errorEl.style.display = 'block';
        errorMessageEl.textContent = error.message;
    }
}

// Handle timeframe button clicks
function setupTimeframeButtons() {
    const buttons = document.querySelectorAll('.timeframe-btn');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Load new data
            const days = btn.dataset.days;
            currentDays = days === 'max' ? 'max' : parseInt(days);
            loadData(currentDays);
        });
    });
}

// Initialize application
async function init() {
    initCharts();
    setupTimeframeButtons();
    await loadData(currentDays);
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
