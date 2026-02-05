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
let chzBtcVolumeSeries = null;
let pepperChzVolumeSeries = null;
let chzBtcSma20Series = null;
let chzBtcSma50Series = null;
let pepperChzSma20Series = null;
let pepperChzSma50Series = null;

// Current state
let currentDays = 365;
let currentInterval = '1D'; // 1H, 4H, 1D, 1W

// User preferences (loaded from localStorage)
let preferences = {
    chartType: 'area', // 'area' or 'candlestick'
    showVolume: true,
    showSma20: false,
    showSma50: false,
    interval: '1D'
};

// Raw OHLCV data storage for recalculations
let chzBtcOhlcvData = [];
let pepperChzOhlcvData = [];

// DOM elements
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const errorMessageEl = document.getElementById('error-message');
const chzBtcLegendEl = document.getElementById('legend-chz-btc');
const pepperChzLegendEl = document.getElementById('legend-pepper-chz');

// Load preferences from localStorage
function loadPreferences() {
    const saved = localStorage.getItem('priceInfoPreferences');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            preferences = { ...preferences, ...parsed };
        } catch (e) {
            console.warn('Failed to parse saved preferences');
        }
    }
}

// Save preferences to localStorage
function savePreferences() {
    localStorage.setItem('priceInfoPreferences', JSON.stringify(preferences));
}

// Calculate Simple Moving Average
function calculateSMA(data, period) {
    const result = [];
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].value;
        }
        result.push({
            time: data[i].time,
            value: sum / period
        });
    }
    return result;
}

// Calculate Exponential Moving Average
function calculateEMA(data, period) {
    const result = [];
    const multiplier = 2 / (period + 1);

    // Start with SMA for first value
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += data[i].value;
    }
    let ema = sum / period;
    result.push({ time: data[period - 1].time, value: ema });

    // Calculate EMA for rest
    for (let i = period; i < data.length; i++) {
        ema = (data[i].value - ema) * multiplier + ema;
        result.push({ time: data[i].time, value: ema });
    }
    return result;
}

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

// Fetch historical OHLCV data from CryptoCompare
async function fetchCryptoCompareOHLCV(fsym, days, interval = '1D') {
    let endpoint, limit;

    // Determine endpoint and limit based on interval
    switch (interval) {
        case '1H':
            endpoint = 'histohour';
            limit = days === 'max' ? 2000 : Math.min(days * 24, 2000);
            break;
        case '4H':
            endpoint = 'histohour';
            limit = days === 'max' ? 2000 : Math.min(days * 6, 2000); // 24/4 = 6 bars per day
            break;
        case '1W':
            endpoint = 'histoday';
            limit = days === 'max' ? 2000 : Math.min(Math.ceil(days / 7), 2000);
            break;
        case '1D':
        default:
            endpoint = 'histoday';
            limit = days === 'max' ? 2000 : Math.min(days, 2000);
            break;
    }

    const url = `${CRYPTOCOMPARE_API}/data/v2/${endpoint}?fsym=${fsym}&tsym=USD&limit=${limit}`;
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`Failed to fetch ${fsym} data from CryptoCompare: ${response.statusText}`);
    }

    const json = await response.json();

    if (json.Response === 'Error') {
        throw new Error(`CryptoCompare error for ${fsym}: ${json.Message}`);
    }

    const dataPoints = json.Data.Data;

    // For 4H interval, aggregate hourly data into 4-hour bars
    if (interval === '4H') {
        return aggregateToInterval(dataPoints, 4);
    }

    // For 1W interval, aggregate daily data into weekly bars
    if (interval === '1W') {
        return aggregateDailyToWeekly(dataPoints);
    }

    // Return OHLCV format
    return dataPoints
        .filter(d => d.close > 0)
        .map(d => ({
            time: d.time,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            volume: d.volumeto || 0
        }));
}

// Aggregate hourly data to N-hour intervals
function aggregateToInterval(dataPoints, hours) {
    const aggregated = [];
    const filtered = dataPoints.filter(d => d.close > 0);

    for (let i = 0; i < filtered.length; i += hours) {
        const slice = filtered.slice(i, i + hours);
        if (slice.length === 0) continue;

        aggregated.push({
            time: slice[0].time,
            open: slice[0].open,
            high: Math.max(...slice.map(d => d.high)),
            low: Math.min(...slice.map(d => d.low)),
            close: slice[slice.length - 1].close,
            volume: slice.reduce((sum, d) => sum + (d.volumeto || 0), 0)
        });
    }

    return aggregated;
}

// Aggregate daily data to weekly bars
function aggregateDailyToWeekly(dataPoints) {
    const aggregated = [];
    const filtered = dataPoints.filter(d => d.close > 0);

    for (let i = 0; i < filtered.length; i += 7) {
        const slice = filtered.slice(i, i + 7);
        if (slice.length === 0) continue;

        aggregated.push({
            time: slice[0].time,
            open: slice[0].open,
            high: Math.max(...slice.map(d => d.high)),
            low: Math.min(...slice.map(d => d.low)),
            close: slice[slice.length - 1].close,
            volume: slice.reduce((sum, d) => sum + (d.volumeto || 0), 0)
        });
    }

    return aggregated;
}

// Legacy function for backward compatibility
async function fetchCryptoCompareData(fsym, days) {
    const ohlcv = await fetchCryptoCompareOHLCV(fsym, days, '1D');
    return ohlcv.map(d => [d.time * 1000, d.close]);
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

    // Create area series (default)
    const areaSeries = chart.addAreaSeries({
        lineColor: lineColor,
        topColor: topColor,
        bottomColor: 'rgba(0, 0, 0, 0)',
        lineWidth: 2
    });

    // Create candlestick series (hidden by default)
    const candlestickSeries = chart.addCandlestickSeries({
        upColor: '#26a69a',
        downColor: '#ef5350',
        borderUpColor: '#26a69a',
        borderDownColor: '#ef5350',
        wickUpColor: '#26a69a',
        wickDownColor: '#ef5350',
        visible: preferences.chartType === 'candlestick'
    });

    // Create volume histogram series
    const volumeSeries = chart.addHistogramSeries({
        color: lineColor,
        priceFormat: {
            type: 'volume'
        },
        priceScaleId: 'volume',
        visible: preferences.showVolume
    });

    // Configure volume scale to be at bottom
    chart.priceScale('volume').applyOptions({
        scaleMargins: {
            top: 0.85,
            bottom: 0
        }
    });

    // Create SMA series
    const sma20Series = chart.addLineSeries({
        color: '#ff9800',
        lineWidth: 1,
        visible: preferences.showSma20,
        priceLineVisible: false
    });

    const sma50Series = chart.addLineSeries({
        color: '#e91e63',
        lineWidth: 1,
        visible: preferences.showSma50,
        priceLineVisible: false
    });

    // Hide area if candlestick is active
    if (preferences.chartType === 'candlestick') {
        areaSeries.applyOptions({ visible: false });
    }

    // Make chart responsive
    const resizeObserver = new ResizeObserver(entries => {
        const { width, height } = entries[0].contentRect;
        chart.applyOptions({ width, height });
    });
    resizeObserver.observe(container);

    return {
        chart,
        series: areaSeries,
        areaSeries,
        candlestickSeries,
        volumeSeries,
        sma20Series,
        sma50Series
    };
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

// Store chart objects
let chzBtcChartObj = null;
let pepperChzChartObj = null;

// Initialize charts
function initCharts() {
    // CHZ/BTC chart (blue theme)
    chzBtcChartObj = createChart('chart-chz-btc', '#2962ff', 'rgba(41, 98, 255, 0.3)');
    chzBtcChart = chzBtcChartObj.chart;
    chzBtcSeries = chzBtcChartObj.areaSeries;
    chzBtcVolumeSeries = chzBtcChartObj.volumeSeries;
    chzBtcSma20Series = chzBtcChartObj.sma20Series;
    chzBtcSma50Series = chzBtcChartObj.sma50Series;
    setupLegend(chzBtcChart, chzBtcSeries, chzBtcLegendEl, 'CHZ/BTC');

    // PEPPER/CHZ chart (green theme)
    pepperChzChartObj = createChart('chart-pepper-chz', '#26a69a', 'rgba(38, 166, 154, 0.3)');
    pepperChzChart = pepperChzChartObj.chart;
    pepperChzSeries = pepperChzChartObj.areaSeries;
    pepperChzVolumeSeries = pepperChzChartObj.volumeSeries;
    pepperChzSma20Series = pepperChzChartObj.sma20Series;
    pepperChzSma50Series = pepperChzChartObj.sma50Series;
    setupLegend(pepperChzChart, pepperChzSeries, pepperChzLegendEl, 'PEPPER/CHZ');
}

// Calculate OHLCV ratio between two OHLCV series
function calculateOHLCVRatio(numeratorOHLCV, denominatorOHLCV) {
    // Create a map of denominator data by day
    const denomMap = new Map();
    denominatorOHLCV.forEach(d => {
        const dayKey = Math.floor(d.time / 86400); // Group by day
        denomMap.set(dayKey, d);
    });

    const ratios = [];
    const seenDays = new Set();

    numeratorOHLCV.forEach(num => {
        const dayKey = Math.floor(num.time / 86400);

        if (seenDays.has(dayKey)) return;

        const denom = denomMap.get(dayKey);
        if (denom && denom.close > 0) {
            seenDays.add(dayKey);
            ratios.push({
                time: num.time,
                open: num.open / denom.open,
                high: num.high / denom.low, // Max ratio when num is high and denom is low
                low: num.low / denom.high, // Min ratio when num is low and denom is high
                close: num.close / denom.close,
                value: num.close / denom.close, // For area chart
                volume: (num.volume + denom.volume) / 2 // Average volume (simplified)
            });
        }
    });

    ratios.sort((a, b) => a.time - b.time);
    return ratios;
}

// Update chart series with OHLCV data
function updateChartSeries(chartObj, ohlcvData, volumeColor) {
    // Area series data (value format)
    const areaData = ohlcvData.map(d => ({ time: d.time, value: d.value || d.close }));

    // Candlestick data
    const candleData = ohlcvData.map(d => ({
        time: d.time,
        open: d.open,
        high: d.high,
        low: d.low,
        close: d.close
    }));

    // Volume data
    const volumeData = ohlcvData.map(d => ({
        time: d.time,
        value: d.volume || 0,
        color: d.close >= d.open ? 'rgba(38, 166, 154, 0.5)' : 'rgba(239, 83, 80, 0.5)'
    }));

    // Update all series
    chartObj.areaSeries.setData(areaData);
    chartObj.candlestickSeries.setData(candleData);
    chartObj.volumeSeries.setData(volumeData);

    // Calculate and set SMAs
    if (areaData.length >= 20) {
        const sma20 = calculateSMA(areaData, 20);
        chartObj.sma20Series.setData(sma20);
    }
    if (areaData.length >= 50) {
        const sma50 = calculateSMA(areaData, 50);
        chartObj.sma50Series.setData(sma50);
    }

    return areaData;
}

// Load and display data
async function loadData(days) {
    loadingEl.classList.remove('hidden');
    errorEl.style.display = 'none';

    try {
        // Fetch BTC and CHZ OHLCV from CryptoCompare
        const [btcOHLCV, chzOHLCV] = await Promise.all([
            fetchCryptoCompareOHLCV(CRYPTOCOMPARE_COINS.bitcoin, days, currentInterval),
            fetchCryptoCompareOHLCV(CRYPTOCOMPARE_COINS.chiliz, days, currentInterval)
        ]);

        // Fetch PEPPER from CoinGecko (only close prices available)
        const geckoMaxDays = days === 'max' ? 365 : Math.min(days, 365);
        let pepperPrices;
        try {
            pepperPrices = await fetchMarketData(COIN_IDS.pepper, geckoMaxDays);
        } catch (e) {
            console.warn('PEPPER data may be limited:', e.message);
            pepperPrices = [];
        }

        // Convert PEPPER prices to OHLCV-like format (only close available from CoinGecko)
        const pepperOHLCV = pepperPrices.map(([timestamp, price]) => ({
            time: Math.floor(timestamp / 1000),
            open: price,
            high: price,
            low: price,
            close: price,
            volume: 0
        }));

        // Calculate CHZ/BTC ratio (how many CHZ per 1 BTC)
        chzBtcOhlcvData = calculateOHLCVRatio(btcOHLCV, chzOHLCV);

        // Calculate PEPPER/CHZ ratio (how many PEPPER per 1 CHZ)
        pepperChzOhlcvData = [];
        if (pepperOHLCV.length > 0) {
            pepperChzOhlcvData = calculateOHLCVRatio(chzOHLCV, pepperOHLCV);
        }

        // Update CHZ/BTC chart
        updateChartSeries(chzBtcChartObj, chzBtcOhlcvData, '#2962ff');
        chzBtcChart.timeScale().fitContent();

        // Update PEPPER/CHZ chart
        if (pepperChzOhlcvData.length > 0) {
            updateChartSeries(pepperChzChartObj, pepperChzOhlcvData, '#26a69a');
            pepperChzChart.timeScale().fitContent();
        } else {
            pepperChzChartObj.areaSeries.setData([]);
            pepperChzChartObj.candlestickSeries.setData([]);
            pepperChzChartObj.volumeSeries.setData([]);
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

// Toggle chart type between area and candlestick
function setChartType(type) {
    preferences.chartType = type;
    savePreferences();

    const isCandle = type === 'candlestick';

    // Update CHZ/BTC chart
    chzBtcChartObj.areaSeries.applyOptions({ visible: !isCandle });
    chzBtcChartObj.candlestickSeries.applyOptions({ visible: isCandle });

    // Update PEPPER/CHZ chart
    pepperChzChartObj.areaSeries.applyOptions({ visible: !isCandle });
    pepperChzChartObj.candlestickSeries.applyOptions({ visible: isCandle });
}

// Toggle volume visibility
function setVolumeVisible(visible) {
    preferences.showVolume = visible;
    savePreferences();

    chzBtcChartObj.volumeSeries.applyOptions({ visible });
    pepperChzChartObj.volumeSeries.applyOptions({ visible });
}

// Toggle SMA visibility
function setSmaVisible(period, visible) {
    if (period === 20) {
        preferences.showSma20 = visible;
        chzBtcChartObj.sma20Series.applyOptions({ visible });
        pepperChzChartObj.sma20Series.applyOptions({ visible });
    } else if (period === 50) {
        preferences.showSma50 = visible;
        chzBtcChartObj.sma50Series.applyOptions({ visible });
        pepperChzChartObj.sma50Series.applyOptions({ visible });
    }
    savePreferences();
}

// Set chart interval and reload data
function setChartInterval(interval) {
    currentInterval = interval;
    preferences.interval = interval;
    savePreferences();
    loadData(currentDays);
}

// Setup control panel event handlers
function setupControlPanel() {
    // Chart type toggle
    const chartTypeButtons = document.querySelectorAll('#chart-type-toggle .toggle-btn');
    chartTypeButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            chartTypeButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setChartType(btn.dataset.type);
        });
    });

    // Interval toggle
    const intervalButtons = document.querySelectorAll('#interval-toggle .toggle-btn');
    intervalButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            intervalButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            setChartInterval(btn.dataset.interval);
        });
    });

    // Volume checkbox
    const volumeCheckbox = document.getElementById('toggle-volume');
    volumeCheckbox.addEventListener('change', () => {
        setVolumeVisible(volumeCheckbox.checked);
    });

    // SMA checkboxes
    const sma20Checkbox = document.getElementById('toggle-sma20');
    sma20Checkbox.addEventListener('change', () => {
        setSmaVisible(20, sma20Checkbox.checked);
    });

    const sma50Checkbox = document.getElementById('toggle-sma50');
    sma50Checkbox.addEventListener('change', () => {
        setSmaVisible(50, sma50Checkbox.checked);
    });
}

// Apply saved preferences to UI
function applyPreferencesToUI() {
    // Chart type
    document.querySelectorAll('#chart-type-toggle .toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === preferences.chartType);
    });

    // Interval
    document.querySelectorAll('#interval-toggle .toggle-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.interval === preferences.interval);
    });

    // Checkboxes
    document.getElementById('toggle-volume').checked = preferences.showVolume;
    document.getElementById('toggle-sma20').checked = preferences.showSma20;
    document.getElementById('toggle-sma50').checked = preferences.showSma50;

    // Set current interval
    currentInterval = preferences.interval;
}

// Initialize application
async function init() {
    loadPreferences();
    applyPreferencesToUI();
    initCharts();
    setupTimeframeButtons();
    setupControlPanel();
    await loadData(currentDays);
}

// Start when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
