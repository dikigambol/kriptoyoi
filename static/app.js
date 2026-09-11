/**
 * KRIPTOYOI - Tokocrypto Real-time Candlestick Chart Engine
 * Built with TradingView Lightweight Charts & Tokocrypto WebSocket Stream API
 */

(function () {
  'use strict';

  // --- Global State ---
  const state = {
    symbol: 'BTCUSDT',
    interval: '1m',
    allSymbols: [],
    modalCategory: 'ALL',
    modalSort: 'volume',
    modalQuery: '',
    watchlistQuote: 'ALL',
    watchlistQuery: '',
    chart: null,
    candleSeries: null,
    volumeSeries: null,
    ema9Series: null,
    ema21Series: null,
    stochChart: null,
    stochKSeries: null,
    stochDSeries: null,
    ws: null,
    wsReconnectTimeout: null,
    pingInterval: null,
    wsConnectionId: 0,
    loadDataSeq: 0,
    lastCandle: null,
    candlesCache: [],
    volumesCache: [],
    lastPrice: 0,
    candleCloseTime: 0,
    timerInterval: null,
    showEma9: true,
    showEma21: true,
    showEma50: true,
    showStoch: true,
    showSignals: true,
    showVolume: true,
    showSrLevels: true,
    recentTrades: [],
    recentTradesBuffer: [],
    scalperMarkers: [],
    currentEma9: null,
    currentEma21: null,
    currentEma50: null,
    baseEma9: null,   // Committed EMA9 value from last closed candle
    baseEma21: null,  // Committed EMA21 value from last closed candle
    baseEma50: null,  // Committed EMA50 value from last closed candle
    currentStochK: null,
    currentStochD: null,
    stochKMap: new Map(),
    stochDMap: new Map(),
    showZones: true,
    currentZones: null,
    buyZoneUpperLine: null,
    buyZoneLowerLine: null,
    sellZoneUpperLine: null,
    sellZoneLowerLine: null,
    srPriceLines: [],
    p0AnalysisData: null,
    p0PeriodicTimer: null,
    btcPulseData: null,
    btcPulseTimer: null,
    rsiSeries: null,         // RSI(14) standalone line di stoch sub-chart
    showRsi: true,
    signalPriceLines: [],    // Garis visual Entry, TP, SL di candlestick chart
    activeSignal: null,      // Objek trade aktif { type, entry, tp, sl, time }
    highPrice24h: null,
    lowPrice24h: null,
    openPrice24h: null,
  };

  // --- DOM Elements ---
  const el = {
    splitChartsContainer: document.getElementById('splitChartsContainer'),
    chartContainer: document.getElementById('chartContainer'),
    stochRsiContainer: document.getElementById('stochRsiContainer'),
    chartLoading: document.getElementById('chartLoading'),
    displaySymbol: document.getElementById('displaySymbol'),
    displayBaseQuote: document.getElementById('displayBaseQuote'),
    displayPrice: document.getElementById('displayPrice'),
    displayChange: document.getElementById('displayChange'),
    statHigh: document.getElementById('statHigh'),
    statLow: document.getElementById('statLow'),
    statVolume: document.getElementById('statVolume'),
    candleTimer: document.getElementById('candleTimer'),
    activeStreamEndpoint: document.getElementById('activeStreamEndpoint'),
    wsStatusPill: document.getElementById('wsStatusPill'),
    wsStatusText: document.getElementById('wsStatusText'),
    quickPairs: document.getElementById('quickPairs'),
    intervalSelector: document.getElementById('intervalSelector'),
    toggleRadarHudBtn: document.getElementById('toggleRadarHudBtn'),
    scalperRadar: document.getElementById('scalperRadar'),
    // Scalper Radar Elements & P0 Components
    radarSignalBadge: document.getElementById('radarSignalBadge'),
    radarSignalText: document.getElementById('radarSignalText'),
    cfTrend: document.getElementById('cfTrend'),
    cfStoch: document.getElementById('cfStoch'),
    pressureFillBuy: document.getElementById('pressureFillBuy'),
    pressureText: document.getElementById('pressureText'),
    radarTpVal: document.getElementById('radarTpVal'),
    radarSlVal: document.getElementById('radarSlVal'),
    radarNetRR: document.getElementById('radarNetRR'),
    radarFriction: document.getElementById('radarFriction'),
    netRRViabilityBadge: document.getElementById('netRRViabilityBadge'),
    netRRViabilityText: document.getElementById('netRRViabilityText'),
    radarBuyZoneBadge: document.getElementById('radarBuyZoneBadge'),
    radarBuyZoneVal: document.getElementById('radarBuyZoneVal'),
    radarSellZoneBadge: document.getElementById('radarSellZoneBadge'),
    radarSellZoneVal: document.getElementById('radarSellZoneVal'),
    radarZoneStatusPill: document.getElementById('radarZoneStatusPill'),
    radarZoneStatusText: document.getElementById('radarZoneStatusText'),
    toggleZones: document.getElementById('toggleZones'),
    supplyZoneBlock: document.getElementById('supplyZoneBlock'),
    demandZoneBlock: document.getElementById('demandZoneBlock'),
    // BTC Market Gatekeeper
    btcGatekeeperBadge: document.getElementById('btcGatekeeperBadge'),
    btcGatekeeperText: document.getElementById('btcGatekeeperText'),
    // P0 MTF & Structure Elements
    mtf1h: document.getElementById('mtf1h'),
    mtf15m: document.getElementById('mtf15m'),
    mtf5m: document.getElementById('mtf5m'),
    mtf1m: document.getElementById('mtf1m'),
    mtfSummaryText: document.getElementById('mtfSummaryText'),
    structureTrendBadge: document.getElementById('structureTrendBadge'),
    bosChochBadge: document.getElementById('bosChochBadge'),
    rvolBadge: document.getElementById('rvolBadge'),
    atrBadge: document.getElementById('atrBadge'),
    // Score & Regime (P1)
    signalScoreCircle: document.getElementById('signalScoreCircle'),
    signalScoreLabel: document.getElementById('signalScoreLabel'),
    regimeBadge: document.getElementById('regimeBadge'),
    chopBadge: document.getElementById('chopBadge'),
    adxBadge: document.getElementById('adxBadge'),
    // Setup Detection (P1)
    radarSetupsGroup: document.getElementById('radarSetupsGroup'),
    setupsList: document.getElementById('setupsList'),
    signalTtlBadge: document.getElementById('signalTtlBadge'),
    // Coin Modal Trigger & Elements
    searchPairBtn: document.getElementById('searchPairBtn'),
    selectorCurrentCoin: document.getElementById('selectorCurrentCoin'),
    totalCoinsBadge: document.getElementById('totalCoinsBadge'),
    coinModalOverlay: document.getElementById('coinModalOverlay'),
    coinModalCard: document.getElementById('coinModalCard'),
    closeModalBtn: document.getElementById('closeModalBtn'),
    pairSearchInput: document.getElementById('pairSearchInput'),
    clearSearchBtn: document.getElementById('clearSearchBtn'),
    marketCategoryTabs: document.getElementById('marketCategoryTabs'),
    modalSortSelect: document.getElementById('modalSortSelect'),
    modalResultCount: document.getElementById('modalResultCount'),
    pairSearchResults: document.getElementById('pairSearchResults'),
    // Sidebar
    tradesList: document.getElementById('tradesList'),
    watchlistItems: document.getElementById('watchlistItems'),
    watchlistFilterInput: document.getElementById('watchlistFilterInput'),
    watchlistMarketTags: document.getElementById('watchlistMarketTags'),
    // Legend
    legendPair: document.getElementById('legendPair'),
    legendInterval: document.getElementById('legendInterval'),
    legendTime: document.getElementById('legendTime'),
    legendOpen: document.getElementById('legendOpen'),
    legendHigh: document.getElementById('legendHigh'),
    legendLow: document.getElementById('legendLow'),
    legendClose: document.getElementById('legendClose'),
    legendDiff: document.getElementById('legendDiff'),
    legendVol: document.getElementById('legendVol'),
    legendEma9: document.getElementById('legendEma9'),
    legendEma21: document.getElementById('legendEma21'),
    legendEma50: document.getElementById('legendEma50'),
    legendStochK: document.getElementById('legendStochK'),
    legendStochD: document.getElementById('legendStochD'),
    stochKBadgeVal: document.getElementById('stochKBadgeVal'),
    stochDBadgeVal: document.getElementById('stochDBadgeVal'),
    stochHoverTime: document.getElementById('stochHoverTime'),
    // Toggles
    toggleEma9: document.getElementById('toggleEma9'),
    toggleEma21: document.getElementById('toggleEma21'),
    toggleEma50: document.getElementById('toggleEma50'),
    toggleSrLevels: document.getElementById('toggleSrLevels'),
    toggleStoch: document.getElementById('toggleStoch'),
    toggleSignals: document.getElementById('toggleSignals'),
    toggleVolume: document.getElementById('toggleVolume'),
    resetViewBtn: document.getElementById('resetViewBtn'),
  };

  // --- Formatters ---
  function getPrecision(price) {
    if (!price || isNaN(price)) return 2;
    if (price >= 1000) return 2;
    if (price >= 1) return 4;
    if (price >= 0.001) return 6;
    return 8;
  }

  function formatPrice(num, symbol) {
    if (num === null || num === undefined || isNaN(num)) return '--';
    const isIdr = symbol && (symbol.endsWith('BIDR') || symbol.endsWith('IDR'));
    if (isIdr) {
      return 'Rp ' + Number(num).toLocaleString('id-ID', { maximumFractionDigits: 2 });
    }
    const prec = getPrecision(num);
    return Number(num).toLocaleString('en-US', {
      minimumFractionDigits: prec,
      maximumFractionDigits: prec
    });
  }

  function formatVolume(num) {
    if (!num || isNaN(num)) return '--';
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return Number(num).toFixed(2);
  }

  function formatTime(timestampSec, includeSeconds = true) {
    const d = new Date(timestampSec * 1000);
    const timeStr = d.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      second: includeSeconds ? '2-digit' : undefined,
      hour12: false,
    });
    return `${timeStr} WIB`;
  }

  function formatDate(timestampSec) {
    const d = new Date(timestampSec * 1000);
    const dateStr = d.toLocaleDateString('id-ID', {
      timeZone: 'Asia/Jakarta',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
    const timeStr = d.toLocaleTimeString('id-ID', {
      timeZone: 'Asia/Jakarta',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    return `${dateStr}, ${timeStr} WIB`;
  }

  // --- Technical Indicator Calculations (EMA) ---
  function calculateEMA(data, period) {
    const results = [];
    if (!data || data.length === 0) return results;

    const k = 2 / (period + 1);
    let ema = 0;

    const initialSlice = data.slice(0, period);
    if (initialSlice.length < period) return results;

    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += initialSlice[i].close;
    }
    ema = sum / period;
    results.push({ time: data[period - 1].time, value: ema });

    for (let i = period; i < data.length; i++) {
      ema = (data[i].close - ema) * k + ema;
      results.push({ time: data[i].time, value: ema });
    }
    return results;
  }

  // --- Stochastic RSI Calculation (14, 14, 3, 3) 1-to-1 Aligned with Candles ---
  function calculateStochRSI(candles, rsiPeriod = 14, stochPeriod = 14, kPeriod = 3, dPeriod = 3) {
    if (!candles || candles.length === 0) {
      return { kData: [], dData: [] };
    }

    const n = candles.length;
    if (n < 5) {
      const defaultK = candles.map(c => ({ time: c.time, value: 50 }));
      const defaultD = candles.map(c => ({ time: c.time, value: 50 }));
      return { kData: defaultK, dData: defaultD };
    }

    // 1. Calculate standard RSI for every candle
    const rsiValues = [];
    let gains = 0, losses = 0;
    const warmupRsi = Math.min(rsiPeriod, n - 1);

    for (let i = 1; i <= warmupRsi; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    let avgGain = gains / Math.max(1, warmupRsi);
    let avgLoss = losses / Math.max(1, warmupRsi);
    let rs = avgLoss === 0 ? (avgGain === 0 ? 1 : 100) : avgGain / avgLoss;
    let seedRsi = (avgLoss === 0 && avgGain === 0) ? 50 : 100 - (100 / (1 + rs));

    // Pad initial bars before warmupRsi with seedRsi so length matches candles exactly
    for (let i = 0; i < Math.min(rsiPeriod, n); i++) {
      rsiValues.push({ time: candles[i].time, rsi: seedRsi });
    }

    for (let i = rsiPeriod; i < n; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      const gain = diff >= 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;

      avgGain = (avgGain * (rsiPeriod - 1) + gain) / rsiPeriod;
      avgLoss = (avgLoss * (rsiPeriod - 1) + loss) / rsiPeriod;
      rs = avgLoss === 0 ? (avgGain === 0 ? 1 : 100) : avgGain / avgLoss;
      const rsiVal = (avgLoss === 0 && avgGain === 0) ? 50 : 100 - (100 / (1 + rs));
      rsiValues.push({ time: candles[i].time, rsi: rsiVal });
    }

    // 2. Raw StochRSI = (RSI - MinRSI) / (MaxRSI - MinRSI) * 100
    const rawStoch = [];
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - stochPeriod + 1);
      const slice = rsiValues.slice(start, i + 1).map(x => x.rsi);
      const minRsi = Math.min(...slice);
      const maxRsi = Math.max(...slice);
      const currRsi = rsiValues[i].rsi;
      let stoch = maxRsi === minRsi ? 50 : ((currRsi - minRsi) / (maxRsi - minRsi)) * 100;
      rawStoch.push({ time: candles[i].time, val: stoch });
    }

    // 3. Smooth with kPeriod SMA -> %K (Cyan) - aligned 1-to-1 with every candle
    const kData = [];
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - kPeriod + 1);
      const slice = rawStoch.slice(start, i + 1).map(x => x.val);
      const avgK = slice.reduce((a, b) => a + b, 0) / slice.length;
      kData.push({ time: candles[i].time, value: parseFloat(avgK.toFixed(2)) });
    }

    // 4. Smooth with dPeriod SMA -> %D (Orange) - aligned 1-to-1 with every candle
    const dData = [];
    for (let i = 0; i < n; i++) {
      const start = Math.max(0, i - dPeriod + 1);
      const slice = kData.slice(start, i + 1).map(x => x.value);
      const avgD = slice.reduce((a, b) => a + b, 0) / slice.length;
      dData.push({ time: candles[i].time, value: parseFloat(avgD.toFixed(2)) });
    }

    return { kData, dData };
  }

  // --- RSI(14) Standalone Calculation ---
  function calculateRSI(candles, period) {
    period = period || 14;
    if (!candles || candles.length < period + 1) return [];
    const results = [];
    let avgGain = 0, avgLoss = 0;
    for (let i = 1; i <= period; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      if (diff >= 0) avgGain += diff; else avgLoss -= diff;
    }
    avgGain /= period; avgLoss /= period;
    const calcRsi = (ag, al) => al === 0 ? 100 : (ag === 0 ? 0 : 100 - 100 / (1 + ag / al));
    results.push({ time: candles[period].time, value: parseFloat(calcRsi(avgGain, avgLoss).toFixed(2)) });
    for (let i = period + 1; i < candles.length; i++) {
      const diff = candles[i].close - candles[i - 1].close;
      const gain = diff >= 0 ? diff : 0;
      const loss = diff < 0 ? -diff : 0;
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      results.push({ time: candles[i].time, value: parseFloat(calcRsi(avgGain, avgLoss).toFixed(2)) });
    }
    return results;
  }

  // --- Signal Price Lines (Entry, TP, SL) on Candlestick Chart ---
  function clearSignalPriceLines() {
    if (state.candleSeries && state.signalPriceLines && state.signalPriceLines.length > 0) {
      for (const line of state.signalPriceLines) {
        try { state.candleSeries.removePriceLine(line); } catch (e) { }
      }
    }
    state.signalPriceLines = [];
  }

  function renderSignalPriceLines(signal) {
    clearSignalPriceLines();
    if (!state.showSignals || !state.candleSeries || !signal) return;

    const sym = state.symbol;
    const entryP = signal.entry;
    const tpP = signal.tp;
    const slP = signal.sl;

    const tpPct = Math.abs((tpP - entryP) / entryP * 100).toFixed(2);
    const slPct = Math.abs((entryP - slP) / entryP * 100).toFixed(2);

    // 1. Entry Line (Cyan / Blue)
    const entryLine = state.candleSeries.createPriceLine({
      price: entryP,
      color: '#06b6d4',
      lineWidth: 1.5,
      lineStyle: LightweightCharts.LineStyle.Solid,
      axisLabelVisible: true,
      title: `${signal.type} ENTRY: ${formatPrice(entryP, sym)}`,
    });
    state.signalPriceLines.push(entryLine);

    // 2. Take Profit Line (Green)
    const tpLine = state.candleSeries.createPriceLine({
      price: tpP,
      color: '#10b981',
      lineWidth: 1.5,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: `TP TARGET: ${formatPrice(tpP, sym)} (+${tpPct}%)`,
    });
    state.signalPriceLines.push(tpLine);

    // 3. Stop Loss / Protection Line (Red)
    const slLine = state.candleSeries.createPriceLine({
      price: slP,
      color: '#f43f5e',
      lineWidth: 1.5,
      lineStyle: LightweightCharts.LineStyle.Dashed,
      axisLabelVisible: true,
      title: `SL BATAS: ${formatPrice(slP, sym)} (-${slPct}%)`,
    });
    state.signalPriceLines.push(slLine);
  }

  // --- Pure & Consistent Scalper Signal Generator (Audited & Improved) ---
  // Acuan Perhitungan:
  // 1. Tren EMA 9, EMA 21, & EMA 50 (Filter tren ketat)
  // 2. Momentum Stochastic RSI (%K & %D Cross dari area jenuh yang valid)
  // 3. Konfirmasi Reaksi Candlestick (Price Action murni)
  // 4. Auto-CLOSE posisi lawan saat sinyal baru muncul
  function generateScalperSignals(candles, ema9Data, ema21Data, ema50Data, stochKData, stochDData) {
    const markers = [];
    if (!candles || candles.length < 5) return markers;

    const ema9Map = new Map((ema9Data || []).map(d => [d.time, d.value]));
    const ema21Map = new Map((ema21Data || []).map(d => [d.time, d.value]));
    const ema50Map = new Map((ema50Data || []).map(d => [d.time, d.value]));
    const stochKMap = new Map((stochKData || []).map(d => [d.time, d.value]));
    const stochDMap = new Map((stochDData || []).map(d => [d.time, d.value]));

    let lastBuyIdx = -10;
    let lastSellIdx = -10;
    let lastCloseIdx = -10;
    const COOLDOWN = 6; // Minimal jarak candle antar sinyal sejenis

    for (let i = 3; i < candles.length; i++) {
      const c = candles[i];
      const prevC = candles[i - 1];

      const e9 = ema9Map.get(c.time);
      const e21 = ema21Map.get(c.time);
      const e50 = ema50Map.get(c.time); // [Fix #6] EMA 50 sebagai filter tren besar
      const prevE9 = ema9Map.get(prevC.time);
      const prevE21 = ema21Map.get(prevC.time);

      const k = stochKMap.get(c.time);
      const d = stochDMap.get(c.time);
      const prevK = stochKMap.get(prevC.time);
      const prevD = stochDMap.get(prevC.time);

      if (!e9 || !e21 || !prevE9 || !prevE21 ||
        k === undefined || d === undefined ||
        prevK === undefined || prevD === undefined) {
        continue;
      }

      const bodySize = Math.abs(c.close - c.open);
      const candleRange = c.high - c.low;

      // Cek apakah ada posisi aktif yang belum di-CLOSE
      const hasActiveBuy = lastBuyIdx > lastCloseIdx && (i - lastBuyIdx) <= 24;
      const hasActiveSell = lastSellIdx > lastCloseIdx && (i - lastSellIdx) <= 24;

      // === 1. BUY SIGNAL (Scalp Long Entry) ===
      // [Fix #1] Tren naik ketat: EMA 9 >= EMA 21 dan harga di atas EMA 9
      // Atau: EMA 9 mendekati EMA 21 (dalam 0.1%) dan momentum EMA 9 naik
      const isBullTrend = (e9 >= e21 && c.close >= e9)
        || (e9 >= e21 * 0.999 && c.close >= e9 && e9 >= prevE9);

      // [Fix #6] Filter EMA 50: harga harus di atas atau mendekati EMA 50 (jika tersedia)
      const isAboveEma50 = !e50 || c.close >= e50 * 0.998;

      // Momentum: Stoch RSI Golden Cross dari bawah
      const isStochCrossUp = prevK <= prevD && k > d;
      // [Fix #2] Zona oversold lebih ketat: hanya dari area jenuh jual yang sesungguhnya
      const isFromOversold = prevK <= 30 || (prevK < 40 && k < 50);

      // Candle reaksi hijau (body solid minimal 20% dari range)
      const isBullishCandle = c.close > c.open && (candleRange === 0 || bodySize > candleRange * 0.2);

      if (isBullTrend && isAboveEma50 && isStochCrossUp && isFromOversold && isBullishCandle && (i - lastBuyIdx) >= COOLDOWN) {
        // [Fix #4] Auto-CLOSE posisi SELL yang masih aktif sebelum entry BUY baru
        if (hasActiveSell) {
          markers.push({
            time: c.time,
            position: 'belowBar',
            color: '#eab308',
            shape: 'circle',
            text: 'CLOSE',
            size: 0.8,
          });
          lastCloseIdx = i;
        }
        markers.push({
          time: c.time,
          position: 'belowBar',
          color: '#10b981',
          shape: 'arrowUp',
          text: 'BUY',
          size: 0.8,
        });
        lastBuyIdx = i;
        continue;
      }

      // === 2. SELL SIGNAL (Scalp Short Entry) ===
      // [Fix #1] Tren turun ketat: EMA 9 <= EMA 21 dan harga di bawah EMA 9
      const isBearTrend = (e9 <= e21 && c.close <= e9)
        || (e9 <= e21 * 1.001 && c.close <= e9 && e9 <= prevE9);

      // [Fix #6] Filter EMA 50: harga harus di bawah atau mendekati EMA 50 (jika tersedia)
      const isBelowEma50 = !e50 || c.close <= e50 * 1.002;

      // Momentum: Stoch RSI Death Cross dari atas
      const isStochCrossDown = prevK >= prevD && k < d;
      // [Fix #3] Zona overbought lebih ketat: hanya dari area jenuh beli yang sesungguhnya
      const isFromOverbought = prevK >= 70 || (prevK > 60 && k > 50);

      // Candle reaksi merah (body solid minimal 20% dari range)
      const isBearishCandle = c.close < c.open && (candleRange === 0 || bodySize > candleRange * 0.2);

      if (isBearTrend && isBelowEma50 && isStochCrossDown && isFromOverbought && isBearishCandle && (i - lastSellIdx) >= COOLDOWN) {
        // [Fix #4] Auto-CLOSE posisi BUY yang masih aktif sebelum entry SELL baru
        if (hasActiveBuy) {
          markers.push({
            time: c.time,
            position: 'aboveBar',
            color: '#eab308',
            shape: 'circle',
            text: 'CLOSE',
            size: 0.8,
          });
          lastCloseIdx = i;
        }
        markers.push({
          time: c.time,
          position: 'aboveBar',
          color: '#f43f5e',
          shape: 'arrowDown',
          text: 'SELL',
          size: 0.8,
        });
        lastSellIdx = i;
        continue;
      }

      // === 3. CLOSE SIGNAL (Take Profit / Momentum Exhaustion / Trend Break) ===
      // --- Close untuk posisi BUY aktif ---
      const isOverboughtExit = prevK >= prevD && k < d && prevK >= 75;
      // [Fix #5] Trend break: harga menembus ke bawah EMA 9 (tanpa syarat e9 < e21 yang redundan)
      const isTrendBreakSoft = c.close < e9 && prevC.close >= e9;
      const isTrendBreakHard = c.close < e21 && prevC.close >= e21;

      // --- Close untuk posisi SELL aktif ---
      const isOversoldCoverExit = prevK <= prevD && k > d && prevK <= 25;
      const isBearTrendBreakSoft = c.close > e9 && prevC.close <= e9;
      const isBearTrendBreakHard = c.close > e21 && prevC.close <= e21;

      if (hasActiveBuy && (isOverboughtExit || isTrendBreakSoft || isTrendBreakHard) && (i - lastCloseIdx) >= COOLDOWN) {
        markers.push({
          time: c.time,
          position: 'aboveBar',
          color: '#eab308',
          shape: 'circle',
          text: 'CLOSE',
          size: 0.8,
        });
        lastCloseIdx = i;
      } else if (hasActiveSell && (isOversoldCoverExit || isBearTrendBreakSoft || isBearTrendBreakHard) && (i - lastCloseIdx) >= COOLDOWN) {
        markers.push({
          time: c.time,
          position: 'belowBar',
          color: '#eab308',
          shape: 'circle',
          text: 'CLOSE',
          size: 0.8,
        });
        lastCloseIdx = i;
      }
    }

    return markers;
  }



  // --- Scalper Radar Analysis Display ---
  function updateScalperRadar(candle, e9, e21, e50, k, d) {
    if (!candle) return;
    const price = candle.close;

    // 1. Evaluasi Tren (EMA 9 vs EMA 21 vs EMA 50)
    let isStrongBull = false;
    let isBull = false;
    let isStrongBear = false;
    let isBear = false;

    if (e9 && e21) {
      isStrongBull = e9 >= e21 && price >= e9 && (!e50 || e21 >= e50);
      isBull = e9 >= e21 && price >= e9;
      isStrongBear = e9 <= e21 && price <= e9 && (!e50 || e21 <= e50);
      isBear = e9 < e21 && price < e9;

      if (el.cfTrend) {
        if (isStrongBull) {
          el.cfTrend.textContent = '▲ Strong Bull';
          el.cfTrend.className = 'cf-value bull';
          el.cfTrend.title = 'Tren Sangat Kuat Naik (Strong Bull): Harga berada di atas EMA 9, EMA 9 di atas EMA 21, dan EMA 21 di atas EMA 50';
        } else if (isBull) {
          el.cfTrend.textContent = '▲ Bullish';
          el.cfTrend.className = 'cf-value bull';
          el.cfTrend.title = 'Tren Naik (Bullish): Harga dan EMA 9 berada di atas EMA 21';
        } else if (isStrongBear) {
          el.cfTrend.textContent = '▼ Strong Bear';
          el.cfTrend.className = 'cf-value bear';
          el.cfTrend.title = 'Tren Sangat Kuat Turun (Strong Bear): Harga berada di bawah EMA 9, EMA 9 di bawah EMA 21, dan EMA 21 di bawah EMA 50';
        } else if (isBear) {
          el.cfTrend.textContent = '▼ Bearish';
          el.cfTrend.className = 'cf-value bear';
          el.cfTrend.title = 'Tren Turun (Bearish): Harga dan EMA 9 berada di bawah EMA 21';
        } else {
          el.cfTrend.textContent = '— Konsolidasi';
          el.cfTrend.className = 'cf-value';
          el.cfTrend.title = 'Konsolidasi (Mendatar): Garis EMA saling berdekatan dan belum menunjukkan arah tren yang jelas';
        }
      }
    }

    // 2. Evaluasi Stoch RSI
    let isStochOversold = false;
    let isStochOverbought = false;
    let kAboveD = false;
    if (k !== undefined && d !== undefined) {
      isStochOversold = k <= 30;
      isStochOverbought = k >= 75;
      kAboveD = k > d;
      if (el.cfStoch) {
        let stochStatus = 'Netral';
        let stochClass = '';
        if (isStochOversold) {
          stochStatus = 'Oversold (Jenuh Jual)';
          stochClass = 'bull';
        } else if (isStochOverbought) {
          stochStatus = 'Overbought (Jenuh Beli)';
          stochClass = 'bear';
        } else if (kAboveD && k < 55) {
          stochStatus = 'Momentum Naik ↑';
          stochClass = 'bull';
        } else if (!kAboveD && k > 45) {
          stochStatus = 'Momentum Turun ↓';
          stochClass = 'bear';
        }
        el.cfStoch.textContent = `K: ${k.toFixed(1)} | D: ${d.toFixed(1)} — ${stochStatus}`;
        el.cfStoch.className = `cf-value ${stochClass}`;
      }
    }

    // 3. Evaluasi Status Sinyal Radar — Prioritaskan Sinyal Aktif / BTC Veto / MTF
    if (el.radarSignalBadge && el.radarSignalText) {
      const btcVeto = state.btcPulseData && state.btcPulseData.veto_active;
      if (btcVeto) {
        el.radarSignalBadge.className = 'signal-main-badge veto';
        el.radarSignalText.textContent = 'WAIT – BTC DUMP RISK (Long DIBLOKIR)';
      } else if (state.activeSignal) {
        if (state.activeSignal.type === 'BUY') {
          if (candle.high >= state.activeSignal.tp) {
            el.radarSignalBadge.className = 'signal-main-badge buy';
            el.radarSignalText.textContent = `TARGET TP TERCAPAI @ ${formatPrice(state.activeSignal.tp, state.symbol)}`;
          } else if (candle.low <= state.activeSignal.sl) {
            el.radarSignalBadge.className = 'signal-main-badge sell';
            el.radarSignalText.textContent = `BATAS SL TERSENTUH @ ${formatPrice(state.activeSignal.sl, state.symbol)}`;
          } else {
            el.radarSignalBadge.className = 'signal-main-badge buy';
            el.radarSignalText.textContent = `BUY AKTIF @ ${formatPrice(state.activeSignal.entry, state.symbol)}`;
          }
        } else {
          if (candle.low <= state.activeSignal.tp) {
            el.radarSignalBadge.className = 'signal-main-badge buy';
            el.radarSignalText.textContent = `TARGET TP TERCAPAI @ ${formatPrice(state.activeSignal.tp, state.symbol)}`;
          } else if (candle.high >= state.activeSignal.sl) {
            el.radarSignalBadge.className = 'signal-main-badge sell';
            el.radarSignalText.textContent = `BATAS SL TERSENTUH @ ${formatPrice(state.activeSignal.sl, state.symbol)}`;
          } else {
            el.radarSignalBadge.className = 'signal-main-badge sell';
            el.radarSignalText.textContent = `SELL AKTIF @ ${formatPrice(state.activeSignal.entry, state.symbol)}`;
          }
        }
      } else if (state.p0AnalysisData && state.p0AnalysisData.mtf) {
        const act = state.p0AnalysisData.mtf.actionable_bias;
        if (act === 'LONG_STRONG') {
          el.radarSignalBadge.className = 'signal-main-badge buy';
          el.radarSignalText.textContent = `STRONG LONG (MTF ${state.p0AnalysisData.mtf.score_ratio})`;
        } else if (act === 'LONG_ON_PULLBACK') {
          el.radarSignalBadge.className = 'signal-main-badge buy';
          el.radarSignalText.textContent = `PULLBACK BUY DIP (MTF ${state.p0AnalysisData.mtf.score_ratio})`;
        } else if (act === 'SHORT_OR_EXIT' || act === 'SHORT_OR_EXIT_ON_PUMP') {
          el.radarSignalBadge.className = 'signal-main-badge sell';
          el.radarSignalText.textContent = `BEARISH CAUTION (MTF ${state.p0AnalysisData.mtf.score_ratio})`;
        } else {
          el.radarSignalBadge.className = 'signal-main-badge neutral';
          el.radarSignalText.textContent = `WAIT / CHOPPY (${state.p0AnalysisData.mtf.confluence_summary || 'Netral'})`;
        }
      } else {
        // Fallback lokal jika P0 belum tiba
        if (isBull && (isStochOversold || (kAboveD && k < 50))) {
          el.radarSignalBadge.className = 'signal-main-badge buy';
          el.radarSignalText.textContent = 'BUY SETUP (Konfirmasi)';
        } else if (isBear && (isStochOverbought || (!kAboveD && k > 50))) {
          el.radarSignalBadge.className = 'signal-main-badge sell';
          el.radarSignalText.textContent = 'SELL SETUP (Konfirmasi)';
        } else {
          el.radarSignalBadge.className = 'signal-main-badge neutral';
          el.radarSignalText.textContent = 'TUNGGU KONFIRMASI (Wait / Neutral)';
        }
      }
    }

    // 4. Update Target TP & SL di Ribbon
    if (state.activeSignal) {
      if (el.radarTpVal) el.radarTpVal.textContent = formatPrice(state.activeSignal.tp, state.symbol);
      if (el.radarSlVal) el.radarSlVal.textContent = formatPrice(state.activeSignal.sl, state.symbol);
      const risk = Math.abs(state.activeSignal.entry - state.activeSignal.sl);
      const reward = Math.abs(state.activeSignal.tp - state.activeSignal.entry);
      if (el.radarNetRR) {
        el.radarNetRR.textContent = risk > 0 ? `1 : ${(reward / risk).toFixed(2)}` : '--';
        el.radarNetRR.style.color = 'var(--bull-color)';
      }
    } else if (state.p0AnalysisData && state.p0AnalysisData.friction && state.p0AnalysisData.friction.tp1) {
      const tp1 = state.p0AnalysisData.friction.tp1;
      if (el.radarTpVal) el.radarTpVal.textContent = formatPrice(tp1.tp, state.symbol);
      if (el.radarSlVal) el.radarSlVal.textContent = formatPrice(tp1.sl, state.symbol);
      if (el.radarNetRR) {
        el.radarNetRR.textContent = tp1.net_rr > 0 ? `1 : ${tp1.net_rr.toFixed(2)}` : '--';
        el.radarNetRR.style.color = tp1.is_fee_viable ? 'var(--bull-color)' : 'var(--bear-color)';
      }
    } else if (price > 0) {
      const tpPrice = isBull ? price * 1.008 : price * 0.992;
      const slPrice = isBull ? price * 0.994 : price * 1.006;
      if (el.radarTpVal) el.radarTpVal.textContent = formatPrice(tpPrice, state.symbol);
      if (el.radarSlVal) el.radarSlVal.textContent = formatPrice(slPrice, state.symbol);
    }
  }

  // --- Real-time Order Flow Pressure Update ---
  function updateLiveOrderFlowPressure() {
    let buyVol = 0;
    let sellVol = 0;
    for (const t of state.recentTradesBuffer) {
      if (t.side === 'buy') buyVol += t.qty;
      else sellVol += t.qty;
    }
    const total = buyVol + sellVol;
    const buyPct = total > 0 ? Math.round((buyVol / total) * 100) : 50;
    const sellPct = 100 - buyPct;

    if (el.pressureFillBuy) {
      el.pressureFillBuy.style.width = `${buyPct}%`;
    }
    if (el.pressureText) {
      el.pressureText.textContent = `${buyPct}% Beli | ${sellPct}% Jual`;
      el.pressureText.style.color = buyPct >= 55 ? 'var(--bull-color)' : (buyPct <= 45 ? 'var(--bear-color)' : 'var(--text-secondary)');
    }
  }

  // --- Enhanced Multi-Indicator Calculation of Dynamic Buy (Demand) & Sell (Supply) Zones ---
  // Acuan Komprehensif (Full Confluence):
  // 1. P0 Key Support & Resistance Clusters (Touches & Proximity)
  // 2. Market Structure (Swing Highs / Swing Lows & BOS/CHoCH Retest)
  // 3. EMA Dynamic Levels (EMA 21 & EMA 50 as dynamic pullback support / pullup resistance)
  // 4. Volume Profile / RVOL Weighting
  // 5. Stochastic RSI & RSI Momentum Conditions
  // 6. Volatility-Adaptive Spread (ATR)
  function calculateBuySellZones(candles, ema9Data, ema21Data, ema50Data, p0Data) {
    if (!candles || candles.length < 15) return null;

    const currentPrice = candles[candles.length - 1].close;
    const n = candles.length;
    const lookback = Math.min(n, 60);
    const slice = candles.slice(-lookback);

    // 1. Dynamic ATR Volatility Sizing
    let trSum = 0;
    const atrPeriod = Math.min(14, slice.length - 1);
    for (let i = slice.length - atrPeriod; i < slice.length; i++) {
      const prevClose = slice[i - 1].close;
      const c = slice[i];
      const tr = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
      trSum += tr;
    }
    const calcAtr = trSum / atrPeriod;
    const p0Atr = (p0Data && p0Data.volatility && p0Data.volatility.atr) || null;
    const atr = Math.max(p0Atr || calcAtr, currentPrice * 0.0015);

    // 2. Latest EMA Values
    const lastE9 = ema9Data && ema9Data.length > 0 ? ema9Data[ema9Data.length - 1].value : null;
    const lastE21 = ema21Data && ema21Data.length > 0 ? ema21Data[ema21Data.length - 1].value : null;
    const lastE50 = ema50Data && ema50Data.length > 0 ? ema50Data[ema50Data.length - 1].value : null;
    const isBullTrend = (lastE9 && lastE21) ? (lastE9 >= lastE21) : true;

    // 3. Rolling Volume SMA for RVOL weighting
    let volSum = 0;
    for (let i = 0; i < slice.length; i++) volSum += slice[i].volume;
    const avgVol = volSum / slice.length;

    // 4. Extract Swing Lows (with volume confirmation)
    const swingLows = [];
    for (let i = 2; i < slice.length - 1; i++) {
      const bar = slice[i];
      if (bar.low <= slice[i - 1].low && bar.low <= slice[i + 1].low && bar.low < currentPrice) {
        const rvol = avgVol > 0 ? (bar.volume / avgVol) : 1.0;
        swingLows.push({ price: bar.low, rvol: rvol });
      }
    }

    // 5. Extract Swing Highs (with volume confirmation)
    const swingHighs = [];
    for (let i = 2; i < slice.length - 1; i++) {
      const bar = slice[i];
      if (bar.high >= slice[i - 1].high && bar.high >= slice[i + 1].high && bar.high > currentPrice) {
        const rvol = avgVol > 0 ? (bar.volume / avgVol) : 1.0;
        swingHighs.push({ price: bar.high, rvol: rvol });
      }
    }

    // 6. Gather Demand (Buy Zone) Candidates below currentPrice
    const buyCandidates = [];

    // Candidate from P0 Support Levels
    if (p0Data && p0Data.support_resistance) {
      const ns = p0Data.support_resistance.nearest_support;
      if (ns && ns.price < currentPrice) {
        buyCandidates.push({ price: ns.price, weight: 3 + (ns.touches || 1), label: 'P0 Support' });
      }
      const ks = p0Data.support_resistance.key_supports || [];
      for (const s of ks) {
        if (s.price < currentPrice && s.price >= currentPrice * 0.96) {
          buyCandidates.push({ price: s.price, weight: 2 + (s.touches || 1), label: 'Key Support' });
        }
      }
    }

    // Candidate from Structure Low
    if (p0Data && p0Data.structure && p0Data.structure.recent_low) {
      const rLow = p0Data.structure.recent_low.price;
      if (rLow && rLow < currentPrice && rLow >= currentPrice * 0.96) {
        buyCandidates.push({ price: rLow, weight: 3, label: 'Swing Structure Low' });
      }
    }

    // Candidate from EMA Dynamic Pullback Support (in Bullish Trend)
    if (isBullTrend) {
      if (lastE21 && lastE21 < currentPrice && lastE21 >= currentPrice * 0.97) {
        buyCandidates.push({ price: lastE21, weight: 3, label: 'EMA 21 Dynamic' });
      }
      if (lastE50 && lastE50 < currentPrice && lastE50 >= currentPrice * 0.96) {
        buyCandidates.push({ price: lastE50, weight: 2.5, label: 'EMA 50 Support' });
      }
    }

    // Candidate from Price Action Swing Lows
    for (const sw of swingLows) {
      if (sw.price >= currentPrice * 0.95) {
        buyCandidates.push({ price: sw.price, weight: sw.rvol >= 1.2 ? 2.5 : 1.5, label: 'Price Action Low' });
      }
    }

    // 7. Gather Supply (Sell Zone) Candidates above currentPrice
    const sellCandidates = [];

    // Candidate from P0 Resistance Levels
    if (p0Data && p0Data.support_resistance) {
      const nr = p0Data.support_resistance.nearest_resistance;
      if (nr && nr.price > currentPrice) {
        sellCandidates.push({ price: nr.price, weight: 3 + (nr.touches || 1), label: 'P0 Resistance' });
      }
      const kr = p0Data.support_resistance.key_resistances || [];
      for (const r of kr) {
        if (r.price > currentPrice && r.price <= currentPrice * 1.04) {
          sellCandidates.push({ price: r.price, weight: 2 + (r.touches || 1), label: 'Key Resistance' });
        }
      }
    }

    // Candidate from Structure High
    if (p0Data && p0Data.structure && p0Data.structure.recent_high) {
      const rHigh = p0Data.structure.recent_high.price;
      if (rHigh && rHigh > currentPrice && rHigh <= currentPrice * 1.04) {
        sellCandidates.push({ price: rHigh, weight: 3, label: 'Swing Structure High' });
      }
    }

    // Candidate from EMA Dynamic Pullup Resistance (in Bearish Trend)
    if (!isBullTrend) {
      if (lastE21 && lastE21 > currentPrice && lastE21 <= currentPrice * 1.03) {
        sellCandidates.push({ price: lastE21, weight: 3, label: 'EMA 21 Dynamic' });
      }
      if (lastE50 && lastE50 > currentPrice && lastE50 <= currentPrice * 1.04) {
        sellCandidates.push({ price: lastE50, weight: 2.5, label: 'EMA 50 Resistance' });
      }
    }

    // Candidate from Price Action Swing Highs
    for (const sw of swingHighs) {
      if (sw.price <= currentPrice * 1.05) {
        sellCandidates.push({ price: sw.price, weight: sw.rvol >= 1.2 ? 2.5 : 1.5, label: 'Price Action High' });
      }
    }

    // 8. Select Optimal Anchor for Buy Zone
    let baseBuy;
    if (buyCandidates.length > 0) {
      buyCandidates.sort((a, b) => {
        const distA = (currentPrice - a.price) / (1 + a.weight * 0.1);
        const distB = (currentPrice - b.price) / (1 + b.weight * 0.1);
        return distA - distB;
      });
      baseBuy = buyCandidates[0].price;
    } else {
      baseBuy = currentPrice - (1.2 * atr);
    }

    // 9. Select Optimal Anchor for Sell Zone
    let baseSell;
    if (sellCandidates.length > 0) {
      sellCandidates.sort((a, b) => {
        const distA = (a.price - currentPrice) / (1 + a.weight * 0.1);
        const distB = (b.price - currentPrice) / (1 + b.weight * 0.1);
        return distA - distB;
      });
      baseSell = sellCandidates[0].price;
    } else {
      baseSell = currentPrice + (1.2 * atr);
    }

    // 10. Boundaries with Adaptive Spread
    if (baseBuy >= currentPrice) baseBuy = currentPrice - (1.0 * atr);
    if (baseSell <= currentPrice) baseSell = currentPrice + (1.0 * atr);

    const halfSpread = Math.max(0.25 * atr, currentPrice * 0.0006);
    const buyMin = Math.max(0, baseBuy - halfSpread);
    const buyMax = Math.min(currentPrice * 0.9997, baseBuy + halfSpread);

    const sellMin = Math.max(currentPrice * 1.0003, baseSell - halfSpread);
    const sellMax = baseSell + halfSpread;

    const prec = getPrecision(currentPrice);
    return {
      buyMin: parseFloat(buyMin.toFixed(prec)),
      buyMax: parseFloat(buyMax.toFixed(prec)),
      sellMin: parseFloat(sellMin.toFixed(prec)),
      sellMax: parseFloat(sellMax.toFixed(prec)),
      atr: atr
    };
  }

  // --- Render & Update Dynamic Buy & Sell Zones on Chart and Radar ---
  function updateBuySellZones(zones, currentPrice) {
    if (!zones) return;
    state.currentZones = zones;

    // 1. Remove old price lines if existing
    clearZonePriceLines();

    // 2. Render shaded transparent blocks on chart
    updateZoneBlocks();

    // 3. Update Scalper Radar Ribbon Zones Widget (Concise Key Levels)
    if (el.radarBuyZoneVal && currentPrice) {
      const buyDist = (((currentPrice - zones.buyMax) / currentPrice) * 100).toFixed(2);
      el.radarBuyZoneVal.textContent = formatPrice(zones.buyMax, state.symbol);
      if (el.radarBuyZoneVal.parentElement) {
        el.radarBuyZoneVal.parentElement.title = `Support (Area Beli Optimal): ${formatPrice(zones.buyMax, state.symbol)} (Rentang: ${formatPrice(zones.buyMin, state.symbol)} - ${formatPrice(zones.buyMax, state.symbol)}, Jarak: ${buyDist > 0 ? '-' : '+'}${Math.abs(buyDist)}%)`;
      }
    }
    if (el.radarSellZoneVal && currentPrice) {
      const sellDist = (((zones.sellMin - currentPrice) / currentPrice) * 100).toFixed(2);
      el.radarSellZoneVal.textContent = formatPrice(zones.sellMin, state.symbol);
      if (el.radarSellZoneVal.parentElement) {
        el.radarSellZoneVal.parentElement.title = `Resistance (Area Jual Optimal): ${formatPrice(zones.sellMin, state.symbol)} (Rentang: ${formatPrice(zones.sellMin, state.symbol)} - ${formatPrice(zones.sellMax, state.symbol)}, Jarak: ${sellDist > 0 ? '+' : '-'}${Math.abs(sellDist)}%)`;
      }
    }

    updateZoneStatusBadge(currentPrice);
  }

  function updateZoneBlocks() {
    if (!el.supplyZoneBlock || !el.demandZoneBlock) return;
    if (!state.showZones || !state.currentZones || !state.candleSeries || !state.chart) {
      el.supplyZoneBlock.style.display = 'none';
      el.demandZoneBlock.style.display = 'none';
      return;
    }

    const zones = state.currentZones;
    const chartHeight = el.chartContainer ? el.chartContainer.clientHeight : 500;
    const rightScaleWidth = state.chart ? (state.chart.priceScale('right').width() || 85) : 85;
    el.supplyZoneBlock.style.right = `${rightScaleWidth}px`;
    el.demandZoneBlock.style.right = `${rightScaleWidth}px`;

    // Supply / Sell Zone block
    const ySellTop = state.candleSeries.priceToCoordinate(zones.sellMax);
    const ySellBottom = state.candleSeries.priceToCoordinate(zones.sellMin);

    if (ySellTop !== null && ySellBottom !== null) {
      const top = Math.min(ySellTop, ySellBottom);
      const height = Math.max(Math.abs(ySellBottom - ySellTop), 6);
      el.supplyZoneBlock.style.top = `${top}px`;
      el.supplyZoneBlock.style.height = `${height}px`;
      el.supplyZoneBlock.style.display = 'flex';
    } else if (ySellTop !== null || ySellBottom !== null) {
      const visibleY = ySellTop !== null ? ySellTop : ySellBottom;
      const top = ySellTop !== null ? visibleY : 0;
      const bottom = ySellBottom !== null ? visibleY : chartHeight;
      el.supplyZoneBlock.style.top = `${Math.min(top, bottom)}px`;
      el.supplyZoneBlock.style.height = `${Math.max(Math.abs(bottom - top), 6)}px`;
      el.supplyZoneBlock.style.display = 'flex';
    } else {
      el.supplyZoneBlock.style.display = 'none';
    }

    // Demand / Buy Zone block
    const yBuyTop = state.candleSeries.priceToCoordinate(zones.buyMax);
    const yBuyBottom = state.candleSeries.priceToCoordinate(zones.buyMin);

    if (yBuyTop !== null && yBuyBottom !== null) {
      const top = Math.min(yBuyTop, yBuyBottom);
      const height = Math.max(Math.abs(yBuyBottom - yBuyTop), 6);
      el.demandZoneBlock.style.top = `${top}px`;
      el.demandZoneBlock.style.height = `${height}px`;
      el.demandZoneBlock.style.display = 'flex';
    } else if (yBuyTop !== null || yBuyBottom !== null) {
      const visibleY = yBuyTop !== null ? yBuyTop : yBuyBottom;
      const top = yBuyTop !== null ? visibleY : 0;
      const bottom = yBuyBottom !== null ? visibleY : chartHeight;
      el.demandZoneBlock.style.top = `${Math.min(top, bottom)}px`;
      el.demandZoneBlock.style.height = `${Math.max(Math.abs(bottom - top), 6)}px`;
      el.demandZoneBlock.style.display = 'flex';
    } else {
      el.demandZoneBlock.style.display = 'none';
    }
  }

  // Zero-latency RAF tracker for Zone Blocks during Pan, Drag & Zoom
  let zoneBlocksRaf = null;
  let isChartInteracting = false;

  function scheduleZoneBlocksUpdate(frames = 1) {
    let remaining = frames;
    const loop = () => {
      updateZoneBlocks();
      remaining--;
      if (remaining > 0 || isChartInteracting) {
        zoneBlocksRaf = requestAnimationFrame(loop);
      } else {
        zoneBlocksRaf = null;
      }
    };
    if (!zoneBlocksRaf) {
      zoneBlocksRaf = requestAnimationFrame(loop);
    }
  }

  function setupZoneBlocksInteractions() {
    if (!el.chartContainer) return;

    // Track mouse / touch drag on chart container
    el.chartContainer.addEventListener('mousedown', () => {
      isChartInteracting = true;
      scheduleZoneBlocksUpdate(60);
    });

    window.addEventListener('mouseup', () => {
      if (isChartInteracting) {
        isChartInteracting = false;
        scheduleZoneBlocksUpdate(30);
      }
    });

    el.chartContainer.addEventListener('touchstart', () => {
      isChartInteracting = true;
      scheduleZoneBlocksUpdate(60);
    }, { passive: true });

    window.addEventListener('touchend', () => {
      if (isChartInteracting) {
        isChartInteracting = false;
        scheduleZoneBlocksUpdate(30);
      }
    }, { passive: true });

    // Wheel zoom on chart container
    el.chartContainer.addEventListener('wheel', () => {
      scheduleZoneBlocksUpdate(30);
    }, { passive: true });
  }

  function updateZoneStatusBadge(currentPrice) {
    const zones = state.currentZones;
    if (!zones || !el.radarZoneStatusPill || !el.radarZoneStatusText || !currentPrice) return;

    if (currentPrice <= zones.buyMax && currentPrice >= zones.buyMin) {
      el.radarZoneStatusPill.className = 'zone-status-pill in-buy';
      el.radarZoneStatusText.textContent = 'IN BUY AREA';
      el.radarZoneStatusPill.title = 'Harga Berada di Buy Zone (Area Beli): Peluang bagus untuk entri beli jika didukung pantulan Stochastic atau candle hijau';
    } else if (currentPrice >= zones.sellMin && currentPrice <= zones.sellMax) {
      el.radarZoneStatusPill.className = 'zone-status-pill in-sell';
      el.radarZoneStatusText.textContent = 'IN SELL AREA';
      el.radarZoneStatusPill.title = 'Harga Berada di Sell Zone (Area Jual): Area take profit posisi beli atau mencari sinyal penolakan (Sell)';
    } else if (currentPrice < zones.buyMin) {
      el.radarZoneStatusPill.className = 'zone-status-pill in-buy';
      el.radarZoneStatusText.textContent = 'BELOW BUY AREA';
      el.radarZoneStatusPill.title = 'Harga di Bawah Buy Zone (Diskon Dalam): Harga sangat murah, waspadai potensi pantulan balik ke atas';
    } else if (currentPrice > zones.sellMax) {
      el.radarZoneStatusPill.className = 'zone-status-pill in-sell';
      el.radarZoneStatusText.textContent = 'ABOVE SELL AREA';
      el.radarZoneStatusPill.title = 'Harga di Atas Sell Zone (Overextended): Harga sangat mahal, rawan koreksi turun tajam';
    } else {
      const distToBuy = (((currentPrice - zones.buyMax) / currentPrice) * 100).toFixed(2);
      const distToSell = (((zones.sellMin - currentPrice) / currentPrice) * 100).toFixed(2);
      el.radarZoneStatusPill.className = 'zone-status-pill neutral';
      el.radarZoneStatusText.textContent = `-${distToBuy}% B | +${distToSell}% S`;
      el.radarZoneStatusPill.title = `Area Netral: Jarak ke Buy Zone -${distToBuy}%, Jarak ke Sell Zone +${distToSell}%`;
    }
  }

  function clearZonePriceLines() {
    if (state.candleSeries) {
      if (state.buyZoneUpperLine) {
        try { state.candleSeries.removePriceLine(state.buyZoneUpperLine); } catch (e) { }
        state.buyZoneUpperLine = null;
      }
      if (state.buyZoneLowerLine) {
        try { state.candleSeries.removePriceLine(state.buyZoneLowerLine); } catch (e) { }
        state.buyZoneLowerLine = null;
      }
      if (state.sellZoneUpperLine) {
        try { state.candleSeries.removePriceLine(state.sellZoneUpperLine); } catch (e) { }
        state.sellZoneUpperLine = null;
      }
      if (state.sellZoneLowerLine) {
        try { state.candleSeries.removePriceLine(state.sellZoneLowerLine); } catch (e) { }
        state.sellZoneLowerLine = null;
      }
    }
    if (el.supplyZoneBlock) el.supplyZoneBlock.style.display = 'none';
    if (el.demandZoneBlock) el.demandZoneBlock.style.display = 'none';
  }

  // --- P0 Support & Resistance Price Lines on Chart ---
  function clearSrPriceLines() {
    if (state.candleSeries && state.srPriceLines && state.srPriceLines.length > 0) {
      for (const line of state.srPriceLines) {
        try { state.candleSeries.removePriceLine(line); } catch (e) { }
      }
    }
    state.srPriceLines = [];
  }

  function renderSrPriceLines(srData) {
    clearSrPriceLines();
    if (!state.showSrLevels || !state.candleSeries || !srData) return;

    if (srData.nearest_support && srData.nearest_support.price) {
      const sup = srData.nearest_support;
      const supLine = state.candleSeries.createPriceLine({
        price: sup.price,
        color: '#10b981',
        lineWidth: 1.2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: `SUP -${sup.dist_pct}%`,
      });
      state.srPriceLines.push(supLine);
    }

    if (srData.nearest_resistance && srData.nearest_resistance.price) {
      const res = srData.nearest_resistance;
      const resLine = state.candleSeries.createPriceLine({
        price: res.price,
        color: '#f43f5e',
        lineWidth: 1.2,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: `RES +${res.dist_pct}%`,
      });
      state.srPriceLines.push(resLine);
    }
  }

  // --- P0 Quantitative Scalping Analysis API & UI Integration ---
  async function fetchP0Analysis(symbol, interval) {
    if (!symbol) return;
    try {
      const activeInt = interval || state.interval || '1m';
      const resp = await fetch(`/api/analysis/p0?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(activeInt)}`);
      if (!resp.ok) return;
      const data = await resp.json();
      state.p0AnalysisData = data;
      renderP0Analysis(data);
    } catch (err) {
      console.warn('Gagal memuat analisis P0:', err);
    }
  }

  // --- BTC Market Gatekeeper Polling ---
  async function fetchBtcPulse() {
    try {
      const resp = await fetch('/api/btc-pulse');
      if (!resp.ok) return;
      const data = await resp.json();
      state.btcPulseData = data;
      renderBtcGatekeeper(data);
    } catch (err) {
      console.warn('Gagal memuat BTC pulse:', err);
    }
  }

  function renderBtcGatekeeper(pulse) {
    if (!pulse || !el.btcGatekeeperBadge || !el.btcGatekeeperText) return;

    const status = pulse.status || 'NO_DATA';
    const price = pulse.btc_price > 0 ? `$${Number(pulse.btc_price).toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '--';
    const ret = pulse.btc_return_5m !== undefined ? `${pulse.btc_return_5m > 0 ? '+' : ''}${Number(pulse.btc_return_5m).toFixed(2)}%` : '';

    // Pilih kelas CSS berdasarkan status
    let badgeClass = 'btc-gatekeeper-badge';
    let labelText = '';

    if (status === 'DUMP_RISK') {
      badgeClass += ' dump-risk';
      labelText = `BTCDR ${price} (${ret})`;
    } else if (status === 'CAUTION') {
      badgeClass += ' caution';
      labelText = `BTCW ${price} (${ret})`;
    } else if (status === 'SAFE') {
      badgeClass += ' safe';
      labelText = `BTC ${price} (${ret})`;
    } else {
      badgeClass += ' no-data';
      labelText = `₿ BTC --`;
    }

    el.btcGatekeeperBadge.className = badgeClass;
    el.btcGatekeeperText.textContent = labelText;

    // Tooltip detail (Bahasa Indonesia yang mudah dipahami)
    const statusDesc = status === 'DUMP_RISK' ? 'BAHAYA: BTC Sedang Dump/Crash (Sinyal Beli Diblokir)' :
      status === 'CAUTION' ? 'WASPADA: BTC Mengalami Tekanan Turun' :
      status === 'SAFE' ? 'AMAN: Kondisi Bitcoin Stabil & Kondusif' : 'Memuat Data...';

    const tooltipLines = [
      `Satpam Pasar BTC (Market Gatekeeper)`,
      `Status: ${statusDesc}`,
      `Harga BTC: ${price} (${ret} dalam 5 menit)`,
      `EMA 20 BTC: ${pulse.btc_ema20 ? '$' + Number(pulse.btc_ema20).toLocaleString('en-US', { maximumFractionDigits: 0 }) : '--'}`,
      `Rasio Volatilitas ATR: ${pulse.btc_atr_ratio}x`,
    ];
    if (pulse.reasons && pulse.reasons.length > 0) {
      tooltipLines.push('', 'Peringatan / Alasan:');
      pulse.reasons.forEach(r => tooltipLines.push('• ' + r));
    }
    tooltipLines.push('', 'Fungsi: Memastikan Anda tidak masuk posisi Long/Buy saat Bitcoin sedang longsor.');
    el.btcGatekeeperBadge.title = tooltipLines.join('\n');

    // Jika veto aktif — tampilkan overlay banner di radar
    applyBtcVetoToRadar(pulse);
  }

  function applyBtcVetoToRadar(pulse) {
    if (!el.radarSignalBadge || !el.radarSignalText) return;
    if (!pulse || !pulse.veto_active) return;

    // Hanya override jika sinyal saat ini adalah BUY — tidak suppress warning BEARISH
    if (el.radarSignalBadge.classList.contains('buy')) {
      el.radarSignalBadge.className = 'signal-main-badge veto';
      el.radarSignalText.textContent = `WAIT – BTC DUMP RISK (Long DIBLOKIR)`;
    }
  }

  // ---------------------------------------------------------------------------
  // Audio Web Alert — Web Audio API Dual-Frequency Chime (Roadmap Addendum §8)
  // ---------------------------------------------------------------------------
  const _audioCtxHolder = { ctx: null, lastAlertTime: 0 };

  function _getAudioCtx() {
    if (!_audioCtxHolder.ctx) {
      try {
        _audioCtxHolder.ctx = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) { return null; }
    }
    return _audioCtxHolder.ctx;
  }

  function playScalpAlert(type) {
    type = type || 'buy';
    const ctx = _getAudioCtx();
    if (!ctx) return;
    const now = Date.now();
    if (now - _audioCtxHolder.lastAlertTime < 8000) return;
    _audioCtxHolder.lastAlertTime = now;
    if (ctx.state === 'suspended') ctx.resume();
    const configs = {
      buy: [{ freq: 523.25, dur: 0.12 }, { freq: 659.25, dur: 0.12 }, { freq: 783.99, dur: 0.18 }],
      alert: [{ freq: 880.00, dur: 0.10 }, { freq: 1046.5, dur: 0.10 }, { freq: 880.00, dur: 0.10 }],
      warn: [{ freq: 440.00, dur: 0.15 }, { freq: 349.23, dur: 0.20 }],
    };
    const tones = configs[type] || configs.buy;
    let t = ctx.currentTime + 0.05;
    tones.forEach(function (tone) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(tone.freq, t);
      gain.gain.setValueAtTime(0.0, t);
      gain.gain.linearRampToValueAtTime(0.18, t + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + tone.dur);
      osc.start(t);
      osc.stop(t + tone.dur + 0.02);
      t += tone.dur + 0.03;
    });
  }

  // ---------------------------------------------------------------------------
  // Render Score, Regime, Setups, TTL (P1)
  // ---------------------------------------------------------------------------
  function renderSignalScore(scoreData) {
    if (!scoreData) return;
    const score = scoreData.score || 0;
    const cat = scoreData.category || 'NO_TRADE';
    const catLabel = scoreData.category_label || '--';
    if (el.signalScoreCircle) {
      el.signalScoreCircle.textContent = score;
      el.signalScoreCircle.className = 'score-circle ' + (
        cat === 'VERY_STRONG' ? 'very-strong' :
          cat === 'STRONG' ? 'strong' :
            cat === 'WATCH' ? 'watch' :
              cat === 'WEAK' ? 'weak' : 'no-trade'
      );
      const catIndo = cat === 'VERY_STRONG' ? 'Sangat Kuat (Peluang Sangat Bagus)' :
        cat === 'STRONG' ? 'Kuat (Kondisi Bagus)' :
          cat === 'WATCH' ? 'Waspada (Tunggu Konfirmasi Lebih Lanjut)' :
            cat === 'WEAK' ? 'Lemah (Hindari Eksekusi)' : 'Tanpa Setup';
      el.signalScoreCircle.title = `Skor AI Probabilitas: ${score}/100 [${catIndo}]\nAkumulasi indikator: Tren Moving Average, Momentum Stoch/RSI, Aliran Volume, dan Struktur Pasar`;
    }
    if (el.signalScoreLabel) {
      el.signalScoreLabel.textContent = catLabel;
      el.signalScoreLabel.title = `Tingkat Kepercayaan Setup: ${catLabel}`;
    }
  }

  function renderMarketRegime(regimeData) {
    if (!regimeData) return;
    if (el.regimeBadge) {
      el.regimeBadge.textContent = regimeData.regime_label || '--';
      const r = regimeData.regime || 'RANGING';
      el.regimeBadge.className = 'regime-badge ' + (
        r === 'TRENDING_UP' ? 'bull' :
          r === 'TRENDING_DOWN' ? 'bear' :
            r === 'HIGH_VOL' ? 'high-vol' : 'range'
      );
      const isAllowed = regimeData.scalp_filter === 'ALLOWED';
      el.regimeBadge.title = `Rezim Pasar: ${regimeData.regime_label || '--'}\nFilter Scalping: ${isAllowed ? 'AMAN DILAKUKAN' : 'HATI-HATI / KURANG KONDUSIF'}`;
    }
    if (el.chopBadge) {
      const chop = regimeData.chop || 0;
      el.chopBadge.textContent = 'CHOP: ' + chop.toFixed(1);
      el.chopBadge.className = 'regime-metric ' + (chop > 61.8 ? 'warn' : (chop < 38.2 ? 'strong' : ''));
      el.chopBadge.title = `Choppiness Index (${chop.toFixed(1)}): ` + (chop > 61.8 ? 'Pasar Sideways / Acak (Hindari breakout palsu)' : (chop < 38.2 ? 'Pasar Sedang Tren Kuat (Sangat bagus untuk trading)' : 'Pasar Transisi / Sedang'));
    }
    if (el.adxBadge) {
      const adx = regimeData.adx || 0;
      el.adxBadge.textContent = 'ADX: ' + adx.toFixed(1);
      el.adxBadge.className = 'regime-metric ' + (adx >= 25 ? 'strong' : (adx < 20 ? 'warn' : ''));
      el.adxBadge.title = `ADX Kekuatan Tren (${adx.toFixed(1)}): ` + (adx >= 25 ? 'Tren Kuat & Bertenaga' : (adx < 20 ? 'Tren Lemah / Lesu' : 'Kekuatan Tren Sedang')) + `\n+DI (Beli): ${(regimeData.plus_di || 0).toFixed(1)} | -DI (Jual): ${(regimeData.minus_di || 0).toFixed(1)}`;
    }
  }

  function renderSetups(setups, ttl) {
    if (!el.radarSetupsGroup || !el.setupsList) return;
    if (!setups || setups.length === 0) {
      el.radarSetupsGroup.style.display = 'none';
      return;
    }
    el.radarSetupsGroup.style.display = 'flex';
    var html = setups.map(function (s) {
      var qClass = s.quality === 'STRONG' ? 'setup-strong' : (s.quality === 'MODERATE' ? 'setup-moderate' : 'setup-weak');
      var isLong = (s.direction === 'LONG') || (s.label && s.label.toLowerCase().includes('long'));
      var dirBadge = isLong
        ? '<span class="setup-dir long"><span class="dir-arrow">↑</span> LONG</span>'
        : '<span class="setup-dir short"><span class="dir-arrow">↓</span> SHORT</span>';
      var cleanLabel = (s.label || '').replace(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}🟢🔴🔻🔺⚡🚀]/gu, '').trim();
      var entry = s.entry_zone ? formatPrice(s.entry_zone[0], state.symbol) + ' – ' + formatPrice(s.entry_zone[1], state.symbol) : '--';
      var conds = (s.conditions_met || []).join(' · ');
      return '<div class="setup-item ' + qClass + '" title="' + conds + '">'
        + dirBadge
        + '<span class="setup-label">' + cleanLabel + '</span>'
        + '<span class="setup-quality-tag">' + s.quality + '</span>'
        + '<span class="setup-entry"><span class="setup-entry-lbl">Entry:</span> <span class="mono">' + entry + '</span></span>'
        + '</div>';
    }).join('');
    el.setupsList.innerHTML = html;
    if (el.signalTtlBadge && ttl) {
      var ttlClass = ttl.ttl_status === 'EXPIRED' ? 'ttl-expired' : (ttl.ttl_status === 'EXPIRING_SOON' ? 'ttl-warn' : 'ttl-active');
      el.signalTtlBadge.textContent = ttl.is_expired
        ? 'EXPIRED'
        : 'TTL: ' + ttl.candles_remaining + ' candle (' + ttl.seconds_remaining + 's)';
      el.signalTtlBadge.className = 'ttl-badge ' + ttlClass;
    }
  }

  function renderP0Analysis(data) {
    if (!data || data.error) return;

    // 1. Multi-Timeframe (MTF) Confluence Matrix
    if (data.mtf && data.mtf.timeframes) {
      const tfs = data.mtf.timeframes;
      const updatePill = (elem, tfKey) => {
        if (!elem) return;
        const info = tfs[tfKey];
        if (!info) return;
        const bias = info.bias || 'NEUTRAL';
        elem.textContent = `${tfKey.toUpperCase()}: ${bias === 'BULLISH' ? 'BULL' : (bias === 'BEARISH' ? 'BEAR' : 'CHOP')}`;
        elem.className = 'mtf-pill ' + (bias === 'BULLISH' ? 'bull' : (bias === 'BEARISH' ? 'bear' : 'range'));
        elem.title = `Timeframe ${tfKey.toUpperCase()}: Tren ${bias === 'BULLISH' ? 'Naik (Bullish)' : (bias === 'BEARISH' ? 'Turun (Bearish)' : 'Mendatar (Netral)')} | EMA: ${info.ema_alignment || '--'} | Sinyal Struktur: ${info.last_bos || 'Normal'}`;
      };

      updatePill(el.mtf1h, '1h');
      updatePill(el.mtf15m, '15m');
      updatePill(el.mtf5m, '5m');
      updatePill(el.mtf1m, '1m');

      if (el.mtfSummaryText) {
        el.mtfSummaryText.textContent = data.mtf.score_ratio || '--/4';
        el.mtfSummaryText.title = `Keselarasan Timeframe: ${data.mtf.score_ratio} timeframe searah (${data.mtf.confluence_summary || ''})`;
      }
    }

    // 2. Market Structure (BOS / CHoCH)
    if (data.structure) {
      if (el.structureTrendBadge) {
        const trend = data.structure.trend || 'RANGE';
        el.structureTrendBadge.textContent = `${trend} (${data.structure.structure_strength}%)`;
        el.structureTrendBadge.className = 'structure-trend-badge ' + (trend === 'BULLISH' ? 'bull' : (trend === 'BEARISH' ? 'bear' : 'range'));
        el.structureTrendBadge.title = `Struktur Tren Price Action: Tren ${trend === 'BULLISH' ? 'Naik (Higher Highs)' : (trend === 'BEARISH' ? 'Turun (Lower Lows)' : 'Mendatar')} dengan kekuatan ${data.structure.structure_strength}%`;
      }
      if (el.bosChochBadge) {
        if (data.structure.last_choch) {
          el.bosChochBadge.textContent = 'CHoCH Reversal';
          el.bosChochBadge.title = 'CHoCH (Change of Character): Sinyal awal pembalikan arah tren pasar dari swing sebelumnya';
          el.bosChochBadge.style.display = 'inline-block';
        } else if (data.structure.last_bos) {
          const isBull = data.structure.last_bos.type === 'BULLISH_BOS';
          el.bosChochBadge.textContent = isBull ? 'Bull BOS' : 'Bear BOS';
          el.bosChochBadge.title = `BOS (Break of Structure): Penembusan ${isBull ? 'puncak (Resistance)' : 'lembah (Support)'} sebelumnya yang mengonfirmasi tren berlanjut`;
          el.bosChochBadge.style.display = 'inline-block';
        } else {
          el.bosChochBadge.textContent = 'Structure Intact';
          el.bosChochBadge.title = 'Struktur Pasar Utuh: Belum terjadi penembusan puncak/lembah baru';
          el.bosChochBadge.style.display = 'inline-block';
        }
      }
    }

    // 3. RVOL & Volatility ATR
    if (data.volume && el.rvolBadge) {
      el.rvolBadge.textContent = `RVOL: ${data.volume.rvol}x`;
      el.rvolBadge.className = 'rvol-badge ' + (data.volume.is_spike ? 'spike' : '');
      el.rvolBadge.title = `Relative Volume (${data.volume.rvol}x): Volume saat ini dibandingkan rata-rata 20 candle. ${data.volume.is_spike ? 'Terdeteksi lonjakan volume besar / masuknya paus!' : 'Kondisi volume pasar normal.'}`;
    }
    if (data.volatility && el.atrBadge) {
      const cls = data.volatility.classification || 'NORMAL';
      el.atrBadge.textContent = `ATR: ${data.volatility.atr_pct}% (${cls})`;
      el.atrBadge.className = 'atr-badge ' + (cls === 'EXTREME' ? 'extreme' : '');
      el.atrBadge.title = `Volatilitas ATR (Average True Range): Rata-rata jarak lilin ${data.volatility.atr} (${data.volatility.atr_pct}% dari harga). Kategori: ${cls === 'EXTREME' ? 'Sangat Liar / Ekstrem' : (cls === 'HIGH' ? 'Tinggi' : 'Normal')}`;
    }

    // 4. Render S/R lines on chart & update Buy/Sell Zones with P0 confluence
    if (data.support_resistance) {
      renderSrPriceLines(data.support_resistance);
    }
    if (state.candlesCache && state.candlesCache.length > 15) {
      const ema9Data = calculateEMA(state.candlesCache, 9);
      const ema21Data = calculateEMA(state.candlesCache, 21);
      const ema50Data = calculateEMA(state.candlesCache, 50);
      const p0Zones = calculateBuySellZones(
        state.candlesCache,
        ema9Data,
        ema21Data,
        ema50Data,
        data
      );
      if (p0Zones && state.lastPrice) {
        updateBuySellZones(p0Zones, state.lastPrice);
      }
    }

    // 5. Radar Signal Badge override based on P0 Confluence
    if (data.mtf && el.radarSignalBadge && el.radarSignalText) {
      const act = data.mtf.actionable_bias;
      if (act === 'WAIT_BTC_DUMP_RISK') {
        // BTC veto aktif — override semua sinyal Long
        el.radarSignalBadge.className = 'signal-main-badge veto';
        const origBias = data.mtf.original_bias || '';
        el.radarSignalText.textContent = `WAIT – BTC DUMP RISK (${origBias || 'Long DIBLOKIR'})`;
        el.radarSignalBadge.title = 'Sinyal Diblokir: Bitcoin sedang mengalami dump tajam. Jangan buka posisi beli (Long) demi keamanan modal.';
      } else if (act === 'LONG_STRONG') {
        el.radarSignalBadge.className = 'signal-main-badge buy';
        el.radarSignalText.textContent = `STRONG LONG (MTF ${data.mtf.score_ratio})`;
        el.radarSignalBadge.title = `Sinyal Beli Kuat: Multi-timeframe (${data.mtf.score_ratio}) selaras ke arah naik dengan dorongan tren solid.`;
      } else if (act === 'LONG_ON_PULLBACK') {
        el.radarSignalBadge.className = 'signal-main-badge buy';
        el.radarSignalText.textContent = `PULLBACK BUY DIP (MTF ${data.mtf.score_ratio})`;
        el.radarSignalBadge.title = 'Sinyal Beli di Koreksi (Pullback): Tren besar sedang naik, tunggu koreksi harga menyentuh Buy Zone / EMA 21 sebelum masuk.';
      } else if (act === 'SHORT_OR_EXIT' || act === 'SHORT_OR_EXIT_ON_PUMP') {
        el.radarSignalBadge.className = 'signal-main-badge sell';
        el.radarSignalText.textContent = `BEARISH CAUTION (MTF ${data.mtf.score_ratio})`;
        el.radarSignalBadge.title = 'Waspada Penurunan (Bearish): Tekanan jual mendominasi di multi-timeframe, pertimbangkan keluar posisi beli atau pasang sell.';
      } else {
        el.radarSignalBadge.className = 'signal-main-badge neutral';
        el.radarSignalText.textContent = `WAIT / CHOPPY (${data.mtf.confluence_summary})`;
        el.radarSignalBadge.title = `Pasar Sideways / Choppy: Arah tren belum selaras (${data.mtf.confluence_summary}). Lebih bijak menunggu konfirmasi sebelum masuk.`;
      }
    }

    // 6. Friction Cost Engine + Net R:R (Roadmap Addendum §2)
    if (data.friction && data.friction.tp1) {
      const tp1 = data.friction.tp1;
      const tp2 = data.friction.tp2;
      const fc = data.friction.cost_detail;

      // Update TP1, SL values (Net — setelah friction)
      if (el.radarTpVal) {
        el.radarTpVal.textContent = formatPrice(tp1.tp, state.symbol);
        el.radarTpVal.title = `Target Take Profit: ${formatPrice(tp1.tp, state.symbol)} (Keuntungan bersih terproyeksi setelah dipotong fee)`;
      }
      if (el.radarSlVal) {
        el.radarSlVal.textContent = formatPrice(tp1.sl, state.symbol);
        el.radarSlVal.title = `Batas Stop Loss: ${formatPrice(tp1.sl, state.symbol)} (Batas maksimal risiko kerugian)`;
      }

      // Net R:R display
      if (el.radarNetRR) {
        el.radarNetRR.textContent = tp1.net_rr > 0 ? `1 : ${tp1.net_rr.toFixed(2)}` : '--';
        el.radarNetRR.style.color = tp1.is_fee_viable
          ? (tp1.net_rr >= 2.0 ? 'var(--bull-color)' : '#f59e0b')
          : 'var(--bear-color)';
        el.radarNetRR.title = `Rasio Risk to Reward Bersih (Net R:R 1:${tp1.net_rr.toFixed(2)}): Perbandingan potensi keuntungan bersih terhadap risiko setelah dipotong biaya fee`;
      }

      // Friction round-trip cost
      if (el.radarFriction) {
        el.radarFriction.textContent = `${fc.cost_roundtrip_pct}% RT`;
        el.radarFriction.title = [
          `Friction (Biaya Transaksi Lengkap Buka & Tutup Posisi):`,
          `• Fee Bursa: ${fc.fee_rate_pct}%`,
          `• Pajak Kripto (PPh): ${fc.pph_pct}%`,
          `• PPN: ${fc.ppn_pct}%`,
          `• Estimasi Slippage Spread: ${fc.slippage_pct}%`,
          `• Total Sekali Transaksi: ${fc.cost_one_side_pct}%`,
          `• Total Pulang-Pergi (Round-trip): ${fc.cost_roundtrip_pct}%`,
          `Pastikan target laba Anda lebih besar dari ${fc.cost_roundtrip_pct}% agar untung murni.`
        ].join('\n');
      }

      // Viability badge
      if (el.netRRViabilityBadge && el.netRRViabilityText) {
        el.netRRViabilityBadge.style.display = 'flex';
        el.netRRViabilityText.textContent = tp1.viability_label;
        el.netRRViabilityBadge.title = tp1.is_fee_viable ?
          `Kelayakan Trading: Laba target TP jauh lebih besar daripada risiko dan biaya fee (Net R:R 1:${tp1.net_rr.toFixed(2)})` :
          `Tidak Layak Trading: Target profit terlalu tipis sehingga berisiko tergerus biaya fee transaksi dan spread bursa`;

        if (!tp1.is_fee_viable) {
          el.netRRViabilityBadge.className = 'net-rr-viability-badge fee-unviable';
        } else if (tp1.net_rr >= 2.0) {
          el.netRRViabilityBadge.className = 'net-rr-viability-badge viable-strong';
        } else {
          el.netRRViabilityBadge.className = 'net-rr-viability-badge viable';
        }
      }

      // Override radar signal jika FEE_UNVIABLE — bahkan jika MTF bullish
      if (!tp1.is_fee_viable && el.radarSignalBadge && el.radarSignalText) {
        // Hanya override jika setup sebelumnya BUY — tidak suppress BEARISH warning
        if (el.radarSignalBadge.classList.contains('buy')) {
          el.radarSignalBadge.className = 'signal-main-badge neutral';
          el.radarSignalText.textContent = `NO TRADE – ${tp1.viability_status.replace(/_/g, ' ')}`;
        }
      }
    }

    // 7. BTC Gatekeeper (dari data P0 langsung — sync dengan analisis)
    if (data.btc_gatekeeper) {
      renderBtcGatekeeper(data.btc_gatekeeper);
      if (data.btc_gatekeeper.status !== 'NO_DATA') {
        state.btcPulseData = data.btc_gatekeeper;
      }
    }

    // 8. Market Regime (P1)
    if (data.regime) renderMarketRegime(data.regime);

    // 9. Signal Score (P1)
    if (data.signal_score) renderSignalScore(data.signal_score);

    // 10. Setup Detection + TTL (P1)
    const setupsToRender = (data.setups && data.setups.length > 0)
      ? data.setups
      : (window.location.search.includes('testSetups') ? [
        {
          type: 'TREND_PULLBACK',
          direction: 'LONG',
          label: 'Trend Pullback (Long)',
          quality: 'STRONG',
          entry_zone: [78850.0, 78920.0],
          conditions_met: ['EMA 9 > 21', 'Bullish BOS', 'Stoch Oversold']
        },
        {
          type: 'BREAKOUT_RETEST',
          direction: 'LONG',
          label: 'Breakout Retest (Long)',
          quality: 'MODERATE',
          entry_zone: [79100.0, 79150.0],
          conditions_met: ['RVOL > 1.2x', 'Retest Resistance Flip']
        }
      ] : []);
    const ttlToRender = data.signal_ttl || (window.location.search.includes('testSetups') ? { is_expired: false, candles_remaining: 3, seconds_remaining: 180, ttl_status: 'ACTIVE' } : null);
    renderSetups(setupsToRender, ttlToRender);

    // 11. Audio Alert — chime saat sinyal STRONG+ dan setup terdeteksi
    if (data.signal_score && data.setups && data.setups.length > 0) {
      const cat = data.signal_score.category;
      const topSetup = data.setups[0];
      const isBuySetup = topSetup && topSetup.direction === 'LONG';
      if (cat === 'VERY_STRONG' && isBuySetup) {
        playScalpAlert('alert');
      } else if (cat === 'STRONG' && isBuySetup) {
        playScalpAlert('buy');
      }
    }
  }

  // --- TradingView Chart Initialization (Main Chart + StochRSI Sub-chart) ---
  function initChart() {
    if (!window.LightweightCharts) {
      console.error('TradingView LightweightCharts library not found!');
      return;
    }

    // Clean previous charts if any
    if (state.chart) {
      state.chart.remove();
      state.chart = null;
    }
    if (state.stochChart) {
      state.stochChart.remove();
      state.stochChart = null;
    }

    const commonLayout = {
      background: { type: 'solid', color: '#0a0d14' },
      textColor: '#94a3b8',
      fontSize: 11,
      fontFamily: "'JetBrains Mono', 'Inter', monospace",
    };

    const commonGrid = {
      vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
      horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
    };

    const commonCrosshair = {
      mode: LightweightCharts.CrosshairMode.Normal,
      vertLine: {
        color: 'rgba(96, 165, 250, 0.5)',
        width: 1,
        style: LightweightCharts.LineStyle.Dashed,
        labelBackgroundColor: '#1e293b',
      },
      horzLine: {
        color: 'rgba(96, 165, 250, 0.5)',
        width: 1,
        style: LightweightCharts.LineStyle.Dashed,
        labelBackgroundColor: '#1e293b',
      },
    };

    const commonLocalization = {
      locale: 'id-ID',
      dateFormat: 'dd MMM yyyy',
      timeFormatter: (timestamp) => {
        const d = new Date(timestamp * 1000);
        return d.toLocaleTimeString('id-ID', {
          timeZone: 'Asia/Jakarta',
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
          hour12: false,
        }) + ' WIB';
      },
    };

    // 1. MAIN CHART (Candles + Volume + EMA 9 & 21)
    const chartOptions = {
      localization: commonLocalization,
      layout: commonLayout,
      grid: commonGrid,
      crosshair: commonCrosshair,
      rightPriceScale: {
        borderColor: '#1e283d',
        autoScale: true,
        minimumWidth: 85,
        scaleMargins: {
          top: 0.16,
          bottom: 0.20,
        },
        alignLabels: true,
      },
      timeScale: {
        borderColor: '#1e283d',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 10,
        minBarSpacing: 4,
        rightOffset: 12,
        shiftVisibleRangeOnNewBar: true,
        tickMarkFormatter: (time, tickMarkType) => {
          const d = new Date(time * 1000);
          if (tickMarkType === 0) {
            return d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', year: 'numeric' });
          } else if (tickMarkType === 1) {
            return d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', month: 'short' });
          } else if (tickMarkType === 2) {
            return d.toLocaleDateString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short' });
          } else if (tickMarkType === 3) {
            return d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
          } else if (tickMarkType === 4) {
            return d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
          }
          return d.toLocaleTimeString('id-ID', { timeZone: 'Asia/Jakarta', hour: '2-digit', minute: '2-digit', hour12: false });
        },
      },
      handleScale: {
        mouseWheel: true,
        pinch: true,
        axisPressedMouseMove: true,
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: true,
      },
    };

    state.chart = LightweightCharts.createChart(el.chartContainer, chartOptions);

    // Subscribe range changes to keep zone blocks perfectly aligned during pan & zoom
    state.chart.timeScale().subscribeVisibleLogicalRangeChange(() => {
      scheduleZoneBlocksUpdate(5);
    });
    state.chart.timeScale().subscribeVisibleTimeRangeChange(() => {
      scheduleZoneBlocksUpdate(5);
    });
    setupZoneBlocksInteractions();

    // Candlestick Series
    state.candleSeries = state.chart.addCandlestickSeries({
      upColor: '#10b981',
      downColor: '#f43f5e',
      borderVisible: false,
      wickUpColor: '#10b981',
      wickDownColor: '#f43f5e',
      priceFormat: {
        type: 'price',
        precision: getPrecision(state.lastPrice),
        minMove: 1 / Math.pow(10, getPrecision(state.lastPrice)),
      },
    });

    // Volume Series
    state.volumeSeries = state.chart.addHistogramSeries({
      priceFormat: { type: 'volume' },
      priceScaleId: '',
      scaleMargins: { top: 0.78, bottom: 0 },
    });

    // EMA 9 Series (Gold - Garis Cepat)
    state.ema9Series = state.chart.addLineSeries({
      color: '#f59e0b',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      title: 'EMA 9',
    });

    // EMA 21 Series (Cyan - Garis Tren)
    state.ema21Series = state.chart.addLineSeries({
      color: '#06b6d4',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      title: 'EMA 21',
    });

    // EMA 50 Series (Purple - Garis Makro P0)
    state.ema50Series = state.chart.addLineSeries({
      color: '#a855f7',
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
      title: 'EMA 50',
    });

    // RSI(14) Series — ditambahkan ke stochChart sub-panel (skala terpisah kanan)
    // Akan diinisialisasi setelah stochChart dibuat di bawah

    // 2. STOCHASTIC RSI SUB-CHART (Panel Bawah)
    if (el.stochRsiContainer) {
      const stochOptions = {
        localization: commonLocalization,
        layout: {
          background: { type: 'solid', color: '#090c13' },
          textColor: '#64748b',
          fontSize: 10,
          fontFamily: "'JetBrains Mono', 'Inter', monospace",
        },
        grid: commonGrid,
        crosshair: commonCrosshair,
        rightPriceScale: {
          borderColor: '#1e283d',
          autoScale: true,
          minimumWidth: 85,
          scaleMargins: { top: 0.1, bottom: 0.1 },
          alignLabels: true,
        },
        timeScale: {
          visible: false,
          barSpacing: 10,
          minBarSpacing: 4,
          rightOffset: 12,
          shiftVisibleRangeOnNewBar: true,
        },
        handleScale: { mouseWheel: true, pinch: true },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
      };

      state.stochChart = LightweightCharts.createChart(el.stochRsiContainer, stochOptions);

      // %K Line (Cyan) - Normalized 0 to 100
      state.stochKSeries = state.stochChart.addLineSeries({
        color: '#06b6d4',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: '%K',
        autoscaleInfoProvider: () => ({
          priceRange: {
            minValue: 0,
            maxValue: 100,
          },
        }),
      });

      // %D Line (Orange) - Normalized 0 to 100
      state.stochDSeries = state.stochChart.addLineSeries({
        color: '#f97316',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        title: '%D',
        autoscaleInfoProvider: () => ({
          priceRange: {
            minValue: 0,
            maxValue: 100,
          },
        }),
      });

      // Overbought 80 & Oversold 20 threshold lines
      state.stochKSeries.createPriceLine({
        price: 80,
        color: 'rgba(244, 63, 94, 0.7)',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'OB 80',
      });

      state.stochKSeries.createPriceLine({
        price: 20,
        color: 'rgba(16, 185, 129, 0.7)',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: 'OS 20',
      });

      // RSI(14) line — di panel yang sama dengan Stoch RSI, skala kanan terpisah (0-100)
      if (state.showRsi) {
        state.rsiSeries = state.stochChart.addLineSeries({
          color: 'rgba(168, 85, 247, 0.75)',
          lineWidth: 1,
          lineStyle: LightweightCharts.LineStyle.Dashed,
          priceLineVisible: false,
          lastValueVisible: true,
          title: 'RSI 14',
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        });
        // 70 / 30 reference lines
        state.rsiSeries.createPriceLine({ price: 70, color: 'rgba(168,85,247,0.35)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: false, title: '' });
        state.rsiSeries.createPriceLine({ price: 30, color: 'rgba(168,85,247,0.35)', lineWidth: 1, lineStyle: LightweightCharts.LineStyle.Dotted, axisLabelVisible: false, title: '' });
      }

      // Synchronize time scales with re-entrancy lock to prevent feedback loops and misalignment
      let isSyncingRange = false;
      state.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncingRange || !state.stochChart || !range) return;
        isSyncingRange = true;
        try {
          state.stochChart.timeScale().setVisibleLogicalRange(range);
        } catch (e) { }
        isSyncingRange = false;
      });

      state.stochChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (isSyncingRange || !state.chart || !range) return;
        isSyncingRange = true;
        try {
          state.chart.timeScale().setVisibleLogicalRange(range);
        } catch (e) { }
        isSyncingRange = false;
      });

      // Crosshair handler on stochChart -> syncs vertical cursor to main chart
      state.stochChart.subscribeCrosshairMove((param) => {
        if (!param.time) {
          if (state.chart) {
            try { state.chart.clearCrosshairPosition(); } catch (e) { }
          }
          updateLegendWithLatest();
          return;
        }

        // Project crosshair onto main candlestick chart at the exact same timestamp
        if (state.chart && state.candleSeries && state.lastPrice) {
          try {
            state.chart.setCrosshairPosition(state.lastPrice, param.time, state.candleSeries);
          } catch (e) { }
        }

        if (el.stochHoverTime) {
          el.stochHoverTime.textContent = formatTime(param.time, true);
        }

        // Accurate %K and %D lookup
        const kFromMap = state.stochKMap ? state.stochKMap.get(param.time) : null;
        const dFromMap = state.stochDMap ? state.stochDMap.get(param.time) : null;
        const kVal = (kFromMap !== undefined && kFromMap !== null) ? kFromMap : (param.seriesData && state.stochKSeries ? param.seriesData.get(state.stochKSeries)?.value : null);
        const dVal = (dFromMap !== undefined && dFromMap !== null) ? dFromMap : (param.seriesData && state.stochDSeries ? param.seriesData.get(state.stochDSeries)?.value : null);

        if (el.stochKBadgeVal && kVal !== null && kVal !== undefined) el.stochKBadgeVal.textContent = Number(kVal).toFixed(1);
        if (el.stochDBadgeVal && dVal !== null && dVal !== undefined) el.stochDBadgeVal.textContent = Number(dVal).toFixed(1);

        if (el.legendTime) el.legendTime.textContent = formatDate(param.time);
      });

      // Clear synced crosshair when mouse leaves sub-chart container
      el.stochRsiContainer.addEventListener('mouseleave', () => {
        if (state.chart) {
          try { state.chart.clearCrosshairPosition(); } catch (e) { }
        }
      });
    }

    // Crosshair handler on main chart -> syncs vertical cursor to stochChart
    state.chart.subscribeCrosshairMove((param) => {
      if (isChartInteracting) {
        updateZoneBlocks();
      }
      if (!param.time || !param.seriesData || !param.seriesData.get(state.candleSeries)) {
        if (state.stochChart) {
          try { state.stochChart.clearCrosshairPosition(); } catch (e) { }
        }
        updateLegendWithLatest();
        return;
      }

      // Project crosshair onto Stoch RSI chart at the exact same timestamp
      if (state.stochChart && state.stochKSeries) {
        try {
          state.stochChart.setCrosshairPosition(50, param.time, state.stochKSeries);
        } catch (e) { }
      }

      const candle = param.seriesData.get(state.candleSeries);
      const volume = param.seriesData.get(state.volumeSeries);
      const ema9 = param.seriesData.get(state.ema9Series);
      const ema21 = param.seriesData.get(state.ema21Series);
      const ema50 = state.ema50Series ? param.seriesData.get(state.ema50Series) : null;

      // Lookup exact Stoch RSI %K & %D values for this hovered candle timestamp
      const kVal = state.stochKMap ? state.stochKMap.get(param.time) : null;
      const dVal = state.stochDMap ? state.stochDMap.get(param.time) : null;
      const stochK = (kVal !== undefined && kVal !== null) ? { value: kVal } : null;
      const stochD = (dVal !== undefined && dVal !== null) ? { value: dVal } : null;

      if (el.stochHoverTime) {
        el.stochHoverTime.textContent = formatTime(param.time, true);
      }
      if (el.stochKBadgeVal && stochK) {
        el.stochKBadgeVal.textContent = stochK.value.toFixed(1);
      }
      if (el.stochDBadgeVal && stochD) {
        el.stochDBadgeVal.textContent = stochD.value.toFixed(1);
      }

      renderLegendData(param.time, candle, volume, ema9, ema21, ema50, stochK, stochD);
    });

    // Clear synced crosshair when mouse leaves main chart container
    if (el.chartContainer) {
      el.chartContainer.addEventListener('mouseleave', () => {
        if (state.stochChart) {
          try { state.stochChart.clearCrosshairPosition(); } catch (e) { }
        }
      });
    }

    // Auto-resize on window change & observe container dimensions (fixes initial layout cutoff on refresh)
    window.addEventListener('resize', resizeCharts);

    if (window.ResizeObserver) {
      const ro = new ResizeObserver(() => {
        resizeCharts();
      });
      if (el.splitChartsContainer) ro.observe(el.splitChartsContainer);
      if (el.chartContainer) ro.observe(el.chartContainer);
      if (el.stochRsiContainer) ro.observe(el.stochRsiContainer);
    }

    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(() => resizeCharts());
    }

    resizeCharts();
    setTimeout(resizeCharts, 50);
    setTimeout(resizeCharts, 200);
  }

  // Synchronize price scale widths across both charts so horizontal plot area lines up 1-to-1
  function syncPriceScaleWidths() {
    if (!state.chart || !state.stochChart) return;
    try {
      const mainWidth = state.chart.priceScale('right').width();
      const stochWidth = state.stochChart.priceScale('right').width();
      const targetWidth = Math.max(mainWidth, stochWidth, 85);
      if (targetWidth > 0) {
        state.chart.priceScale('right').applyOptions({ minimumWidth: targetWidth });
        state.stochChart.priceScale('right').applyOptions({ minimumWidth: targetWidth });
      }
      updateZoneBlocks();
    } catch (e) { }
  }

  function resizeCharts() {
    if (state.chart && el.chartContainer) {
      const w = el.chartContainer.clientWidth;
      const h = el.chartContainer.clientHeight;
      if (w > 0 && h > 0) {
        state.chart.applyOptions({
          width: w,
          height: h,
        });
      }
    }
    if (state.stochChart && el.stochRsiContainer && state.showStoch) {
      const sw = el.stochRsiContainer.clientWidth;
      const sh = el.stochRsiContainer.clientHeight;
      if (sw > 0 && sh > 0) {
        state.stochChart.applyOptions({
          width: sw,
          height: sh,
        });
      }
    }
    syncPriceScaleWidths();
  }

  function renderLegendData(time, candle, volume, ema9, ema21, ema50, stochK, stochD) {
    el.legendPair.textContent = state.symbol;
    el.legendInterval.textContent = state.interval;
    el.legendTime.textContent = formatDate(time);

    if (candle) {
      el.legendOpen.textContent = formatPrice(candle.open, state.symbol);
      el.legendHigh.textContent = formatPrice(candle.high, state.symbol);
      el.legendLow.textContent = formatPrice(candle.low, state.symbol);
      el.legendClose.textContent = formatPrice(candle.close, state.symbol);

      const diff = candle.close - candle.open;
      const pct = (diff / candle.open) * 100;
      el.legendDiff.textContent = `${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%`;
      el.legendDiff.style.color = pct >= 0 ? 'var(--bull-color)' : 'var(--bear-color)';
    }

    if (volume) {
      el.legendVol.textContent = formatVolume(volume.value);
    }

    if (el.legendEma9) el.legendEma9.textContent = ema9 ? formatPrice(ema9.value, state.symbol) : '--';
    if (el.legendEma21) el.legendEma21.textContent = ema21 ? formatPrice(ema21.value, state.symbol) : '--';
    if (el.legendEma50) el.legendEma50.textContent = ema50 ? formatPrice(ema50.value, state.symbol) : '--';
    if (el.legendStochK) el.legendStochK.textContent = stochK ? stochK.value.toFixed(1) : '--';
    if (el.legendStochD) el.legendStochD.textContent = stochD ? stochD.value.toFixed(1) : '--';
  }

  function updateLegendWithLatest() {
    if (!state.lastCandle) return;
    renderLegendData(
      state.lastCandle.time,
      state.lastCandle,
      { value: state.lastCandle.volume },
      state.currentEma9 !== null ? { value: state.currentEma9 } : null,
      state.currentEma21 !== null ? { value: state.currentEma21 } : null,
      state.currentEma50 !== null ? { value: state.currentEma50 } : null,
      state.currentStochK !== null ? { value: state.currentStochK } : null,
      state.currentStochD !== null ? { value: state.currentStochD } : null
    );
    if (el.stochHoverTime) {
      el.stochHoverTime.textContent = formatTime(state.lastCandle.time, true);
    }
    if (el.stochKBadgeVal && state.currentStochK !== null) {
      el.stochKBadgeVal.textContent = state.currentStochK.toFixed(1);
    }
    if (el.stochDBadgeVal && state.currentStochD !== null) {
      el.stochDBadgeVal.textContent = state.currentStochD.toFixed(1);
    }
  }

  function parseTokocryptoRawKlines(rawKlines) {
    const candles = [];
    const volumes = [];
    const seenTimes = new Set();

    // Sort raw by timestamp ascending first to guarantee strictly ascending order
    const sorted = [...rawKlines].sort((a, b) => Number(a[0]) - Number(b[0]));

    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const timeSec = Math.floor(Number(item[0]) / 1000);
      if (isNaN(timeSec) || seenTimes.has(timeSec)) continue;
      seenTimes.add(timeSec);

      const o = parseFloat(item[1]);
      const h = parseFloat(item[2]);
      const l = parseFloat(item[3]);
      const c = parseFloat(item[4]);
      const vol = parseFloat(item[5]);

      if (isNaN(o) || isNaN(h) || isNaN(l) || isNaN(c)) continue;

      candles.push({ time: timeSec, open: o, high: h, low: l, close: c });
      volumes.push({
        time: timeSec,
        value: isNaN(vol) ? 0 : vol,
        color: c >= o ? 'rgba(16, 185, 129, 0.45)' : 'rgba(244, 63, 94, 0.45)',
      });
    }
    return { candles, volumes };
  }

  // --- REST: Fetch Historical Klines ---
  async function loadHistoricalData(loadToken) {
    el.chartLoading.classList.remove('hidden');
    const cleanSym = state.symbol.toUpperCase().replace('_', '');
    let candles = [];
    let volumes = [];

    // 1. Direct fetch from Tokocrypto with 3.5s timeout (uses client's Indonesian IP)
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3500);
      const directUrl = `https://www.tokocrypto.site/api/v3/klines?symbol=${cleanSym}&interval=${state.interval}&limit=500`;
      const directRes = await fetch(directUrl, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (directRes.ok) {
        const raw = await directRes.json();
        if (Array.isArray(raw) && raw.length > 0) {
          const parsed = parseTokocryptoRawKlines(raw);
          candles = parsed.candles;
          volumes = parsed.volumes;
        }
      }
    } catch (e) {
      console.warn('Direct fetch from Tokocrypto failed, trying backend proxy:', e.name || e);
    }

    // 2. Fallback: Backend proxy /api/klines
    if (candles.length === 0) {
      try {
        const proxyUrl = `/api/klines?symbol=${encodeURIComponent(state.symbol)}&interval=${state.interval}&limit=500`;
        const res = await fetch(proxyUrl);
        if (res.ok) {
          const data = await res.json();
          candles = data.candles || [];
          volumes = data.volumes || [];
        }
      } catch (err) {
        console.error('Proxy fetch failed:', err);
      }
    }

    // Stale check: If another switchPair or switchInterval was triggered while we fetched, discard results
    if (loadToken !== undefined && loadToken !== state.loadDataSeq) {
      return;
    }

    try {
      // Deduplicate & strictly sort candles by time ascending
      const seenTimes = new Set();
      const cleanCandles = [];
      const cleanVolumes = [];
      for (let i = 0; i < candles.length; i++) {
        const c = candles[i];
        if (c && typeof c.time === 'number' && !isNaN(c.close) && !seenTimes.has(c.time)) {
          seenTimes.add(c.time);
          cleanCandles.push(c);
          if (volumes[i]) cleanVolumes.push(volumes[i]);
        }
      }
      cleanCandles.sort((a, b) => a.time - b.time);
      cleanVolumes.sort((a, b) => a.time - b.time);
      candles = cleanCandles;
      volumes = cleanVolumes;

      if (candles.length === 0) {
        throw new Error('Data candle kosong dari Tokocrypto untuk ' + state.symbol);
      }

      state.candlesCache = candles;
      state.volumesCache = volumes;
      const last = candles[candles.length - 1];
      state.lastCandle = { ...last, volume: volumes[volumes.length - 1]?.value || 0 };
      state.lastPrice = last.close;

      // Estimate initial candleCloseTime based on timeframe interval
      const intervalSecMap = { '1m': 60, '3m': 180, '5m': 300, '15m': 900, '30m': 1800, '1h': 3600, '2h': 7200, '4h': 14400, '1d': 86400, '1w': 604800 };
      const durSec = intervalSecMap[state.interval] || 60;
      state.candleCloseTime = (last.time + durSec) * 1000;

      // Eagerly load 24h stats (High, Low, Vol, Change) for current coin
      load24hStats();

      // Update price scale precision for the new coin
      const prec = getPrecision(last.close);
      state.candleSeries.applyOptions({
        priceFormat: {
          type: 'price',
          precision: prec,
          minMove: 1 / Math.pow(10, prec),
        },
      });

      // Populate Series
      state.candleSeries.setData(candles);
      state.volumeSeries.setData(volumes);

      // Compute & Populate EMA 9, EMA 21, and EMA 50 (P0 Momentum Engine)
      const ema9Data = calculateEMA(candles, 9);
      const ema21Data = calculateEMA(candles, 21);
      const ema50Data = calculateEMA(candles, 50);
      if (state.ema9Series) state.ema9Series.setData(ema9Data);
      if (state.ema21Series) state.ema21Series.setData(ema21Data);
      if (state.ema50Series) state.ema50Series.setData(ema50Data);

      // Compute & Populate Stochastic RSI (14, 14, 3, 3)
      const stochData = calculateStochRSI(candles, 14, 14, 3, 3);
      state.stochKMap = new Map(stochData.kData.map(d => [d.time, d.value]));
      state.stochDMap = new Map(stochData.dData.map(d => [d.time, d.value]));

      if (state.stochKSeries && state.stochDSeries) {
        state.stochKSeries.setData(stochData.kData);
        state.stochDSeries.setData(stochData.dData);
      }

      // RSI(14) populate
      const rsiData = calculateRSI(candles, 14);
      if (state.rsiSeries && rsiData.length > 0) {
        state.rsiSeries.setData(rsiData);
      }

      // Generate Scalper Signals (Buy/Exit Markers on Candlestick Chart)
      state.scalperMarkers = generateScalperSignals(
        candles,
        ema9Data,
        ema21Data,
        ema50Data,
        stochData.kData,
        stochData.dData
      );
      if (state.candleSeries) {
        state.candleSeries.setMarkers(state.showSignals ? state.scalperMarkers : []);
      }

      // Track latest indicator values
      const lastE9 = ema9Data.length > 0 ? ema9Data[ema9Data.length - 1].value : null;
      const lastE21 = ema21Data.length > 0 ? ema21Data[ema21Data.length - 1].value : null;
      const lastE50 = ema50Data.length > 0 ? ema50Data[ema50Data.length - 1].value : null;
      const lastK = stochData.kData.length > 0 ? stochData.kData[stochData.kData.length - 1].value : null;
      const lastD = stochData.dData.length > 0 ? stochData.dData[stochData.dData.length - 1].value : null;

      state.currentEma9 = lastE9;
      state.baseEma9 = lastE9;
      state.currentEma21 = lastE21;
      state.baseEma21 = lastE21;
      state.currentEma50 = lastE50;
      state.baseEma50 = lastE50;
      state.currentStochK = lastK;
      state.currentStochD = lastD;

      // Update Scalper Radar Ribbon (Metode 1)
      updateScalperRadar(last, lastE9, lastE21, lastE50, lastK, lastD);
      if (el.stochKBadgeVal && lastK !== null) el.stochKBadgeVal.textContent = lastK.toFixed(1);
      if (el.stochDBadgeVal && lastD !== null) el.stochDBadgeVal.textContent = lastD.toFixed(1);
      if (el.stochHoverTime && last) el.stochHoverTime.textContent = formatTime(last.time, true);

      // Trigger P0 Quantitative Scalping Analysis
      fetchP0Analysis(state.symbol, state.interval);

      // Compute & Render Dynamic Buy & Sell Zones
      const initialZones = calculateBuySellZones(
        candles,
        ema9Data,
        ema21Data,
        ema50Data,
        state.p0AnalysisData
      );
      if (initialZones) {
        updateBuySellZones(initialZones, last.close);
      }

      // Reset autoScale and fitContent on both charts so price axis jumps cleanly to new range
      if (state.chart) {
        try { state.chart.priceScale('right').applyOptions({ autoScale: true }); } catch (e) { }
        try { state.chart.timeScale().fitContent(); } catch (e) { }
      }
      if (state.stochChart) {
        try { state.stochChart.priceScale('right').applyOptions({ autoScale: true }); } catch (e) { }
        try {
          const logicalRange = state.chart.timeScale().getVisibleLogicalRange();
          if (logicalRange) {
            state.stochChart.timeScale().setVisibleLogicalRange(logicalRange);
          } else {
            state.stochChart.timeScale().fitContent();
          }
        } catch (e) { }
      }

      // Synchronize price scale widths so both plot areas align 1-to-1 horizontally
      syncPriceScaleWidths();
      setTimeout(syncPriceScaleWidths, 80);

      updatePriceDisplay(last.close, null);
      updateLegendWithLatest();
    } catch (err) {
      console.error('Gagal memuat klines historis:', err);
    } finally {
      el.chartLoading.classList.add('hidden');
      resizeCharts();
      requestAnimationFrame(resizeCharts);
    }
  }

  // --- WebSocket Disconnect & Cleanup ---
  function disconnectWebSocket() {
    state.wsConnectionId = (state.wsConnectionId || 0) + 1;

    if (state.wsReconnectTimeout) {
      clearTimeout(state.wsReconnectTimeout);
      state.wsReconnectTimeout = null;
    }

    if (state.pingInterval) {
      clearInterval(state.pingInterval);
      state.pingInterval = null;
    }

    if (state.ws) {
      try {
        state.ws.onopen = null;
        state.ws.onmessage = null;
        state.ws.onerror = null;
        state.ws.onclose = null; // Detach listener so manual close doesn't trigger reconnect loop
        state.ws.close();
      } catch (e) { }
      state.ws = null;
    }
  }

  // --- WebSocket Connection & Real-time Stream ---
  function connectWebSocket() {
    disconnectWebSocket();
    const currentConnId = state.wsConnectionId;

    const symLower = state.symbol.toLowerCase();
    const interval = state.interval;

    // Tokocrypto Combined WebSocket Stream
    // stream-cloud.tokocrypto.site/stream?streams=btcusdt@kline_1m/btcusdt@miniTicker/btcusdt@trade
    const streams = [
      `${symLower}@kline_${interval}`,
      `${symLower}@miniTicker`,
      `${symLower}@trade`
    ].join('/');

    const wsUrl = `wss://stream-cloud.tokocrypto.site/stream?streams=${streams}`;
    el.activeStreamEndpoint.textContent = wsUrl;

    setConnectionStatus('reconnecting', 'Menghubungkan...');

    try {
      const socket = new WebSocket(wsUrl);
      state.ws = socket;

      socket.onopen = () => {
        if (state.wsConnectionId !== currentConnId) return; // Stale socket
        setConnectionStatus('connected', 'Live Stream');

        // Start client keep-alive heartbeat every 25 seconds
        state.pingInterval = setInterval(() => {
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ method: 'GET_PROPERTY', params: ['combined'], id: 999 }));
          }
        }, 25000);
      };

      socket.onmessage = (event) => {
        if (state.wsConnectionId !== currentConnId) return;
        try {
          const message = JSON.parse(event.data);
          const streamName = (message.stream || '').toLowerCase();
          const d = message.data || message;

          // Stream symbol guard: drop any messages not belonging to current active coin
          const currentPrefix = state.symbol.toLowerCase();
          if (streamName && !streamName.startsWith(currentPrefix)) return;

          if (streamName.includes('@kline') || d.e === 'kline') {
            handleKlineUpdate(d);
          } else if (streamName.includes('ticker') || d.e === '24hrMiniTicker' || d.e === '24hrTicker') {
            handleMiniTickerUpdate(d);
          } else if (streamName.includes('@trade') || d.e === 'trade') {
            handleTradeUpdate(d);
          }
        } catch (err) {
          console.error('Error parsing WebSocket message:', err);
        }
      };

      socket.onerror = (err) => {
        if (state.wsConnectionId !== currentConnId) return;
        console.warn('WebSocket error:', err);
      };

      socket.onclose = (event) => {
        if (state.wsConnectionId !== currentConnId) return; // Ignore if user already switched pair/socket
        console.warn('WebSocket closed with code:', event.code, 'reason:', event.reason);

        if (state.pingInterval) {
          clearInterval(state.pingInterval);
          state.pingInterval = null;
        }

        setConnectionStatus('disconnected', 'Terputus (Reconnect...)');

        if (!state.wsReconnectTimeout) {
          state.wsReconnectTimeout = setTimeout(() => {
            state.wsReconnectTimeout = null;
            if (state.wsConnectionId === currentConnId) {
              connectWebSocket();
            }
          }, 2000);
        }
      };
    } catch (e) {
      console.error('WebSocket connection failed:', e);
      setConnectionStatus('disconnected', 'Gagal');
      state.wsReconnectTimeout = setTimeout(connectWebSocket, 3000);
    }
  }

  function setConnectionStatus(statusClass, label) {
    el.wsStatusPill.className = `ws-status ${statusClass}`;
    el.wsStatusText.textContent = label;
  }

  // --- Real-time Kline Updates Handler ---
  function handleKlineUpdate(payload) {
    const k = payload.k;
    if (!k || !state.candleSeries) return;

    // Symbol guard: verify kline symbol matches state.symbol
    const sym = (k.s || payload.s || '').toUpperCase();
    if (sym && sym !== state.symbol) return;

    const candleTime = Math.floor(k.t / 1000);
    const o = parseFloat(k.o);
    const h = parseFloat(k.h);
    const l = parseFloat(k.l);
    const c = parseFloat(k.c);
    const vol = parseFloat(k.v);
    const isClosed = k.x; // true jika candle 1m/interval ini sudah close

    const candleBar = {
      time: candleTime,
      open: o,
      high: h,
      low: l,
      close: c,
    };

    const volumeBar = {
      time: candleTime,
      value: vol,
      color: c >= o ? 'rgba(16, 185, 129, 0.45)' : 'rgba(244, 63, 94, 0.45)',
    };

    // Update bar di TradingView chart
    state.candleSeries.update(candleBar);
    state.volumeSeries.update(volumeBar);

    state.lastCandle = { ...candleBar, volume: vol };
    state.candleCloseTime = k.T; // Ms close time

    // Maintain running candles & volumes cache
    if (state.candlesCache && state.candlesCache.length > 0) {
      const lastIdx = state.candlesCache.length - 1;
      if (state.candlesCache[lastIdx].time === candleTime) {
        state.candlesCache[lastIdx] = candleBar;
        if (state.volumesCache && state.volumesCache.length > 0) {
          state.volumesCache[state.volumesCache.length - 1] = volumeBar;
        }
      } else {
        state.candlesCache.push(candleBar);
        if (state.volumesCache) state.volumesCache.push(volumeBar);

        // Memory buffer guard: keep up to 2000 bars (~33 hours of 1m chart)
        // If pruning ever occurs, prune synchronously across all series so all chart bar indexes remain 100% matched
        if (state.candlesCache.length > 2000) {
          const excess = state.candlesCache.length - 1500;
          state.candlesCache.splice(0, excess);
          if (state.volumesCache) state.volumesCache.splice(0, excess);
          state.candleSeries.setData(state.candlesCache);
          if (state.volumeSeries && state.volumesCache) state.volumeSeries.setData(state.volumesCache);
        }
      }
    }

    // Dynamic Live Recalculation of EMA 9 & EMA 21
    // Use base values (committed from last closed candle) to avoid tick-by-tick drift
    if (state.baseEma9 !== null) {
      const k9 = 2 / (9 + 1);
      const liveEma9 = (c - state.baseEma9) * k9 + state.baseEma9;
      if (state.ema9Series) state.ema9Series.update({ time: candleTime, value: liveEma9 });
      state.currentEma9 = liveEma9;
    }

    if (state.baseEma21 !== null) {
      const k21 = 2 / (21 + 1);
      const liveEma21 = (c - state.baseEma21) * k21 + state.baseEma21;
      if (state.ema21Series) state.ema21Series.update({ time: candleTime, value: liveEma21 });
      state.currentEma21 = liveEma21;
    }

    if (state.baseEma50 !== null) {
      const k50 = 2 / (50 + 1);
      const liveEma50 = (c - state.baseEma50) * k50 + state.baseEma50;
      if (state.ema50Series) state.ema50Series.update({ time: candleTime, value: liveEma50 });
      state.currentEma50 = liveEma50;
    }

    // Dynamic Live Recalculation of StochRSI on every price tick
    if (state.candlesCache && state.candlesCache.length >= 15) {
      const liveStoch = calculateStochRSI(state.candlesCache, 14, 14, 3, 3);
      if (liveStoch.kData.length > 0) {
        const lastK = liveStoch.kData[liveStoch.kData.length - 1];
        if (state.stochKSeries) state.stochKSeries.update(lastK);
        state.currentStochK = lastK.value;
        if (state.stochKMap) state.stochKMap.set(lastK.time, lastK.value);
        if (el.stochKBadgeVal) el.stochKBadgeVal.textContent = lastK.value.toFixed(1);
      }
      if (liveStoch.dData.length > 0) {
        const lastD = liveStoch.dData[liveStoch.dData.length - 1];
        if (state.stochDSeries) state.stochDSeries.update(lastD);
        state.currentStochD = lastD.value;
        if (state.stochDMap) state.stochDMap.set(lastD.time, lastD.value);
        if (el.stochDBadgeVal) el.stochDBadgeVal.textContent = lastD.value.toFixed(1);
      }
      if (el.stochHoverTime) {
        el.stochHoverTime.textContent = formatTime(candleTime, true);
      }
    }

    // Dynamic Live Recalculation of RSI(14) on every price tick (fixes 1-minute lag)
    if (state.rsiSeries && state.candlesCache && state.candlesCache.length >= 15) {
      const liveRsi = calculateRSI(state.candlesCache, 14);
      if (liveRsi.length > 0) {
        const lastRsi = liveRsi[liveRsi.length - 1];
        state.rsiSeries.update(lastRsi);
      }
    }

    // Jika candle close: sinkronisasi penuh indikator & perbarui sinyal marker
    if (isClosed && state.candlesCache && state.candlesCache.length >= 15) {
      const ema9Data = calculateEMA(state.candlesCache, 9);
      const ema21Data = calculateEMA(state.candlesCache, 21);
      const ema50Data = calculateEMA(state.candlesCache, 50);
      if (state.ema9Series) state.ema9Series.setData(ema9Data);
      if (state.ema21Series) state.ema21Series.setData(ema21Data);
      if (state.ema50Series) state.ema50Series.setData(ema50Data);

      const stochData = calculateStochRSI(state.candlesCache, 14, 14, 3, 3);
      state.stochKMap = new Map(stochData.kData.map(d => [d.time, d.value]));
      state.stochDMap = new Map(stochData.dData.map(d => [d.time, d.value]));

      if (state.stochKSeries && state.stochDSeries) {
        state.stochKSeries.setData(stochData.kData);
        state.stochDSeries.setData(stochData.dData);
      }

      // RSI(14) update on candle close
      const rsiData = calculateRSI(state.candlesCache, 14);
      if (state.rsiSeries && rsiData.length > 0) {
        state.rsiSeries.setData(rsiData);
      }

      const prevMarkerCount = (state.scalperMarkers || []).length;
      state.scalperMarkers = generateScalperSignals(
        state.candlesCache,
        ema9Data,
        ema21Data,
        ema50Data,
        stochData.kData,
        stochData.dData
      );
      if (state.candleSeries) {
        state.candleSeries.setMarkers(state.showSignals ? state.scalperMarkers : []);
      }

      // Bunyikan chime notifikasi jika ada sinyal baru pada candle yang baru saja ditutup
      if (state.scalperMarkers.length > prevMarkerCount) {
        const latestM = state.scalperMarkers[state.scalperMarkers.length - 1];
        if (latestM && latestM.time === candleTime) {
          playScalpAlert(latestM.text === 'BUY' ? 'buy' : latestM.text === 'SELL' ? 'warn' : 'alert');
        }
      }

      if (ema9Data.length > 0) {
        state.currentEma9 = ema9Data[ema9Data.length - 1].value;
        state.baseEma9 = state.currentEma9;  // Commit base for next tick calculations
      }
      if (ema21Data.length > 0) {
        state.currentEma21 = ema21Data[ema21Data.length - 1].value;
        state.baseEma21 = state.currentEma21;  // Commit base for next tick calculations
      }
      if (ema50Data.length > 0) {
        state.currentEma50 = ema50Data[ema50Data.length - 1].value;
        state.baseEma50 = state.currentEma50;
      }
      if (stochData.kData.length > 0) state.currentStochK = stochData.kData[stochData.kData.length - 1].value;
      if (stochData.dData.length > 0) state.currentStochD = stochData.dData[stochData.dData.length - 1].value;

      // Recalculate dynamic buy & sell zones on candle close
      const refreshedZones = calculateBuySellZones(
        state.candlesCache,
        ema9Data,
        ema21Data,
        ema50Data,
        state.p0AnalysisData
      );
      if (refreshedZones) {
        updateBuySellZones(refreshedZones, c);
      }

      // Re-trigger P0 analysis on closed candle
      fetchP0Analysis(state.symbol, state.interval);
    }

    // Perbarui Radar Scalper secara real-time
    updateScalperRadar(candleBar, state.currentEma9, state.currentEma21, state.currentEma50, state.currentStochK, state.currentStochD);
    updateZoneStatusBadge(c);

    updatePriceDisplay(c, state.lastPrice);
    state.lastPrice = c;
    updateLegendWithLatest();
  }

  // --- Real-time Mini Ticker (24h Stats) ---
  function handleMiniTickerUpdate(payload) {
    if (!payload) return;

    // Symbol guard
    const sym = (payload.s || payload.symbol || '').toUpperCase();
    if (sym && sym !== state.symbol) return;

    const high = parseFloat(payload.h || payload.highPrice);
    const low = parseFloat(payload.l || payload.lowPrice);
    const vol = parseFloat(payload.q || payload.quoteVolume || payload.v || payload.volume);
    const curPrice = parseFloat(payload.c || payload.lastPrice);
    const openPrice = parseFloat(payload.o || payload.openPrice);

    if (!isNaN(high) && high > 0) {
      state.highPrice24h = high;
      if (el.statHigh) el.statHigh.textContent = formatPrice(high, state.symbol);
    }
    if (!isNaN(low) && low > 0) {
      state.lowPrice24h = low;
      if (el.statLow) el.statLow.textContent = formatPrice(low, state.symbol);
    }
    if (!isNaN(vol) && vol > 0 && el.statVolume) {
      el.statVolume.textContent = formatVolume(vol);
    }
    if (!isNaN(openPrice) && openPrice > 0) {
      state.openPrice24h = openPrice;
    }

    let changePct = null;
    if (payload.priceChangePercent !== undefined && !isNaN(parseFloat(payload.priceChangePercent))) {
      changePct = parseFloat(payload.priceChangePercent);
    } else if (curPrice && openPrice) {
      changePct = ((curPrice - openPrice) / openPrice) * 100;
    }

    if (changePct !== null && el.displayChange) {
      el.displayChange.textContent = `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`;
      el.displayChange.className = `price-change ${changePct >= 0 ? 'positive' : 'negative'}`;
    }

    // Also update display price if it was empty or out of date
    if (!isNaN(curPrice) && curPrice > 0 && (!state.lastPrice || el.displayPrice.textContent === '--')) {
      updatePriceDisplay(curPrice, state.lastPrice);
      state.lastPrice = curPrice;
    }
  }

  // --- REST: Eagerly fetch 24h Ticker Stats (Instant Display) ---
  async function load24hStats() {
    const cleanSym = state.symbol.toUpperCase().replace('_', '');

    // 1. Immediately display from state.allSymbols cache if already available
    if (state.allSymbols && state.allSymbols.length > 0) {
      const found = state.allSymbols.find(s => s.symbol === cleanSym);
      if (found) {
        if (found.lastPrice) updatePriceDisplay(found.lastPrice, state.lastPrice);
        if (found.priceChangePercent !== undefined && el.displayChange) {
          const change = parseFloat(found.priceChangePercent);
          el.displayChange.textContent = `${change >= 0 ? '+' : ''}${change.toFixed(2)}%`;
          el.displayChange.className = `price-change ${change >= 0 ? 'positive' : 'negative'}`;
        }
        if (found.highPrice && el.statHigh) {
          el.statHigh.textContent = formatPrice(found.highPrice, state.symbol);
          state.highPrice24h = found.highPrice;
        }
        if (found.lowPrice && el.statLow) {
          el.statLow.textContent = formatPrice(found.lowPrice, state.symbol);
          state.lowPrice24h = found.lowPrice;
        }
        if (found.quoteVolume && el.statVolume) {
          el.statVolume.textContent = formatVolume(found.quoteVolume);
        }
        if (found.openPrice) {
          state.openPrice24h = found.openPrice;
        }
      }
    }

    // 2. Fetch fresh 24hr ticker from backend proxy (fast & reliable)
    try {
      let data = null;
      try {
        const res = await fetch(`/api/ticker24hr?symbol=${encodeURIComponent(state.symbol)}`);
        if (res.ok) data = await res.json();
      } catch (e) { }

      // Direct fallback if backend was unreachable
      if (!data || !data.lastPrice) {
        try {
          const directRes = await fetch(`https://www.tokocrypto.site/api/v3/ticker/24hr?symbol=${cleanSym}`);
          if (directRes.ok) data = await directRes.json();
        } catch (e) { }
      }

      if (data && (data.symbol === cleanSym || !data.symbol)) {
        handleMiniTickerUpdate(data);
      }
    } catch (e) {
      console.warn('Gagal memuat 24h stats:', e);
    }
  }

  // --- Real-time Trade Tape Handler ---
  function handleTradeUpdate(payload) {
    if (!payload || !payload.p) return;

    // Symbol guard
    const sym = (payload.s || '').toUpperCase();
    if (sym && sym !== state.symbol) return;

    const price = parseFloat(payload.p);
    const qty = parseFloat(payload.q);
    const isBuyerMaker = payload.m; // true => sell order (taker sell), false => buy order (taker buy)
    const side = isBuyerMaker ? 'sell' : 'buy';
    const timestampMs = payload.T || Date.now();
    const time = formatTime(Math.floor(timestampMs / 1000));

    // Order flow buffer untuk Live Pressure meter (jendela 60 detik terakhir)
    state.recentTradesBuffer.push({
      time: timestampMs,
      side: side,
      qty: qty * price, // Notional volume dalam mata uang kuotasi
    });

    const cutoff = Date.now() - 60000;
    state.recentTradesBuffer = state.recentTradesBuffer.filter(t => t.time >= cutoff);
    updateLiveOrderFlowPressure();

    const row = document.createElement('div');
    row.className = `trade-row ${side}`;
    row.innerHTML = `
      <span class="trade-price">${formatPrice(price, state.symbol)}</span>
      <span class="trade-qty align-right">${Number(qty).toFixed(4)}</span>
      <span class="trade-time align-right">${time}</span>
    `;

    // Prepend to list
    el.tradesList.insertBefore(row, el.tradesList.firstChild);

    // Keep max 35 trades
    if (el.tradesList.children.length > 35) {
      el.tradesList.removeChild(el.tradesList.lastChild);
    }
  }

  // --- Price Flash Effect ---
  function updatePriceDisplay(newPrice, oldPrice) {
    if (!newPrice) return;
    el.displayPrice.textContent = formatPrice(newPrice, state.symbol);

    if (oldPrice && newPrice !== oldPrice) {
      el.displayPrice.classList.remove('flash-up', 'flash-down');
      // Trigger reflow
      void el.displayPrice.offsetWidth;
      if (newPrice > oldPrice) {
        el.displayPrice.classList.add('flash-up');
      } else {
        el.displayPrice.classList.add('flash-down');
      }
    }
  }

  // --- Candle Countdown Timer ---
  function getNextCandleCloseTime(interval) {
    const now = Date.now();
    const intervalMsMap = {
      '1m': 60 * 1000,
      '3m': 3 * 60 * 1000,
      '5m': 5 * 60 * 1000,
      '15m': 15 * 60 * 1000,
      '30m': 30 * 60 * 1000,
      '1h': 60 * 60 * 1000,
      '2h': 2 * 60 * 60 * 1000,
      '4h': 4 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '1w': 7 * 24 * 60 * 60 * 1000,
    };
    const step = intervalMsMap[interval] || 60000;
    return Math.ceil(now / step) * step;
  }

  function startCandleTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      const now = Date.now();
      let targetTime = state.candleCloseTime;
      // If candle close time is missing or already expired, fall back to exact clock-aligned interval close
      if (!targetTime || targetTime <= now) {
        targetTime = getNextCandleCloseTime(state.interval);
      }
      const diffMs = targetTime - now;
      if (diffMs <= 0) {
        el.candleTimer.textContent = '00:00';
        return;
      }
      const totalSec = Math.floor(diffMs / 1000);
      const mins = Math.floor(totalSec / 60);
      const secs = totalSec % 60;
      el.candleTimer.textContent = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }, 1000);
  }

  // --- Switch Symbol or Interval ---
  async function switchPair(newSymbol) {
    if (!newSymbol) return;
    const formatted = newSymbol.toUpperCase().replace('_', '');
    if (formatted === state.symbol) return;

    // 1. Immediately disconnect existing WebSocket to stop receiving old coin ticks
    disconnectWebSocket();

    // 2. Assign new symbol and track request token to prevent race conditions
    state.symbol = formatted;
    const currentToken = ++state.loadDataSeq;

    updateSymbolUI();
    load24hStats(); // Immediately update 24H stats for new pair
    el.tradesList.innerHTML = '';
    clearZonePriceLines();
    clearSignalPriceLines();
    state.currentZones = null;
    state.activeSignal = null;
    state.scalperMarkers = [];
    state.candlesCache = [];
    state.lastCandle = null;
    if (state.candleSeries) {
      state.candleSeries.setMarkers([]);
    }

    // 3. Load historical data with token check
    await loadHistoricalData(currentToken);

    // If another pair switch started while loading, abort connection
    if (state.loadDataSeq !== currentToken) return;

    // 4. Connect WebSocket for new symbol
    connectWebSocket();
  }

  async function switchInterval(newInterval) {
    if (newInterval === state.interval) return;

    disconnectWebSocket();
    state.interval = newInterval;
    const currentToken = ++state.loadDataSeq;

    updateIntervalUI();
    clearZonePriceLines();
    clearSignalPriceLines();
    state.currentZones = null;
    state.activeSignal = null;
    state.scalperMarkers = [];
    state.candlesCache = [];
    state.lastCandle = null;
    if (state.candleSeries) {
      state.candleSeries.setMarkers([]);
    }

    await loadHistoricalData(currentToken);

    if (state.loadDataSeq !== currentToken) return;

    connectWebSocket();
  }

  function updateSymbolUI() {
    const isIdr = state.symbol.endsWith('BIDR') || state.symbol.endsWith('IDR');
    const base = isIdr ? state.symbol.replace(/BIDR|IDR/, '') : state.symbol.replace('USDT', '');
    const quote = isIdr ? (state.symbol.endsWith('BIDR') ? 'BIDR' : 'IDR') : 'USDT';

    // displaySymbol is hidden (legacy compat span), update selectorCurrentCoin in topbar
    if (el.displaySymbol) el.displaySymbol.textContent = `${base}/${quote}`;
    if (el.displayBaseQuote) el.displayBaseQuote.textContent = `${quote} Market`;
    if (el.selectorCurrentCoin) el.selectorCurrentCoin.textContent = `${base} / ${quote}`;
    if (el.totalCoinsBadge && state.allSymbols.length > 0) {
      el.totalCoinsBadge.textContent = `${state.allSymbols.length.toLocaleString('id-ID')}`;
    }
    // Update page title
    document.title = `${base}/${quote} — KriptoYoi`;
  }

  function updateIntervalUI() {
    document.querySelectorAll('.iv').forEach((btn) => {
      if (btn.dataset.interval === state.interval) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // --- Symbols Loading & Watchlist ---
  async function loadSymbols() {
    let symbols = [];
    // 1. Try backend proxy /api/symbols
    try {
      const res = await fetch('/api/symbols');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          symbols = data;
        }
      }
    } catch (err) {
      console.warn('Backend symbols fetch error:', err);
    }

    // 2. Direct client fallback if backend was geo-blocked on Vercel
    if (symbols.length === 0) {
      try {
        const [exRes, tickerRes] = await Promise.all([
          fetch('https://www.tokocrypto.site/api/v3/exchangeInfo'),
          fetch('https://www.tokocrypto.site/api/v3/ticker/24hr')
        ]);
        if (exRes.ok && tickerRes.ok) {
          const exData = await exRes.json();
          const tickerData = await tickerRes.json();
          const tickerMap = {};
          tickerData.forEach(t => tickerMap[t.symbol] = t);

          exData.symbols.forEach(s => {
            if (s.status === 'TRADING') {
              const t = tickerMap[s.symbol] || {};
              symbols.push({
                symbol: s.symbol,
                baseAsset: s.baseAsset,
                quoteAsset: s.quoteAsset,
                lastPrice: parseFloat(t.lastPrice || 0),
                priceChangePercent: parseFloat(t.priceChangePercent || 0),
                quoteVolume: parseFloat(t.quoteVolume || 0),
                volume: parseFloat(t.volume || 0),
                highPrice: parseFloat(t.highPrice || 0),
                lowPrice: parseFloat(t.lowPrice || 0),
                openPrice: parseFloat(t.openPrice || 0),
              });
            }
          });
          symbols.sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
        }
      } catch (e) {
        console.error('Direct symbols fetch failed:', e);
      }
    }

    if (symbols.length > 0) {
      state.allSymbols = symbols;
      if (el.totalCoinsBadge) {
        el.totalCoinsBadge.textContent = `${state.allSymbols.length} Koin`;
      }
      renderWatchlist();
      load24hStats(); // Immediately update 24H stats with authoritative symbols data
    }
  }

  // --- Sidebar Watchlist Rendering ---
  function renderWatchlist() {
    if (!el.watchlistItems) return;
    el.watchlistItems.innerHTML = '';

    const q = (state.watchlistQuery || '').toLowerCase().trim();
    const filterQuote = state.watchlistQuote || 'ALL';

    const filtered = state.allSymbols.filter((item) => {
      // Category match
      let matchQuote = true;
      if (filterQuote === 'USDT') matchQuote = item.quoteAsset === 'USDT';
      else if (filterQuote === 'IDR') matchQuote = item.quoteAsset === 'BIDR' || item.quoteAsset === 'IDR';
      else if (filterQuote === 'BTC') matchQuote = item.quoteAsset === 'BTC';

      if (!matchQuote) return false;

      // Query match
      if (q) {
        return item.baseAsset.toLowerCase().includes(q) || item.symbol.toLowerCase().includes(q);
      }
      return true;
    });

    const fragment = document.createDocumentFragment();
    // Render matching items (up to 80 for high performance in sidebar)
    filtered.slice(0, 80).forEach((item) => {
      const div = document.createElement('div');
      div.className = `watchlist-item ${item.symbol === state.symbol ? 'active' : ''}`;
      const change = item.priceChangePercent || 0;
      const isPos = change >= 0;

      div.innerHTML = `
        <div class="wl-info">
          <div class="wl-sym-title">${item.baseAsset}<span style="color:var(--text-muted);font-size:0.7rem">/${item.quoteAsset}</span></div>
          <div class="wl-sym-vol">Vol: ${formatVolume(item.quoteVolume)}</div>
        </div>
        <div class="wl-stats">
          <div class="wl-price">${formatPrice(item.lastPrice, item.symbol)}</div>
          <div class="wl-change ${isPos ? 'pos' : 'neg'}">${isPos ? '+' : ''}${change.toFixed(2)}%</div>
        </div>
      `;

      div.addEventListener('click', () => {
        switchPair(item.symbol);
        document.querySelectorAll('.watchlist-item').forEach(i => i.classList.remove('active'));
        div.classList.add('active');
      });

      fragment.appendChild(div);
    });

    el.watchlistItems.appendChild(fragment);
  }

  // --- Full Coin Selector Modal Logic ---
  function openCoinModal() {
    if (!el.coinModalOverlay) return;
    el.coinModalOverlay.classList.remove('hidden');
    el.pairSearchInput.value = state.modalQuery || '';
    renderModalCoins();
    setTimeout(() => {
      el.pairSearchInput.focus();
    }, 50);
  }

  function closeCoinModal() {
    if (!el.coinModalOverlay) return;
    el.coinModalOverlay.classList.add('hidden');
  }

  function renderModalCoins() {
    if (!el.pairSearchResults) return;
    el.pairSearchResults.innerHTML = '';

    const query = (state.modalQuery || '').toLowerCase().trim();
    const cat = state.modalCategory || 'ALL';
    const sort = state.modalSort || 'volume';

    // 1. Filter
    let list = state.allSymbols.filter((item) => {
      let matchCat = true;
      if (cat === 'USDT') matchCat = item.quoteAsset === 'USDT';
      else if (cat === 'IDR') matchCat = item.quoteAsset === 'BIDR' || item.quoteAsset === 'IDR';
      else if (cat === 'USDC') matchCat = item.quoteAsset === 'USDC';
      else if (cat === 'BTC') matchCat = item.quoteAsset === 'BTC';

      if (!matchCat) return false;

      if (query) {
        return item.baseAsset.toLowerCase().includes(query) || item.symbol.toLowerCase().includes(query);
      }
      return true;
    });

    // 2. Sort
    if (sort === 'volume') {
      list.sort((a, b) => (b.quoteVolume || 0) - (a.quoteVolume || 0));
    } else if (sort === 'gainers') {
      list.sort((a, b) => (b.priceChangePercent || 0) - (a.priceChangePercent || 0));
    } else if (sort === 'losers') {
      list.sort((a, b) => (a.priceChangePercent || 0) - (b.priceChangePercent || 0));
    } else if (sort === 'name') {
      list.sort((a, b) => a.baseAsset.localeCompare(b.baseAsset));
    }

    // 3. Update count info
    if (el.modalResultCount) {
      el.modalResultCount.textContent = `Menampilkan ${list.length.toLocaleString('id-ID')} koin pasar Tokocrypto`;
    }

    if (list.length === 0) {
      el.pairSearchResults.innerHTML = `
        <div style="padding: 40px; color: var(--text-muted); text-align: center;">
          <div style="font-size: 1.1rem; font-weight: 500; margin-bottom: 6px; color: var(--text-secondary);">Tidak ada hasil</div>
          <div style="font-size: 0.85rem;">Tidak ada koin yang cocok dengan pencarian "<b>${query}</b>"</div>
        </div>
      `;
      return;
    }

    // 4. Render cards using DocumentFragment for maximum performance
    const fragment = document.createDocumentFragment();
    // Render all matching coins (or first 200 for instant response)
    const renderLimit = Math.min(list.length, 300);

    for (let i = 0; i < renderLimit; i++) {
      const item = list[i];
      const card = document.createElement('div');
      const isCurrent = item.symbol === state.symbol;
      card.className = `modal-coin-card ${isCurrent ? 'current' : ''}`;

      const change = item.priceChangePercent || 0;
      const isPos = change >= 0;
      const initial = (item.baseAsset || 'CO').slice(0, 2).toUpperCase();

      card.innerHTML = `
        <div class="card-coin-main">
          <div class="coin-avatar">${initial}</div>
          <div>
            <span class="coin-symbol-name">${item.baseAsset}</span>
            <span class="coin-quote-tag">/${item.quoteAsset}</span>
          </div>
        </div>
        <div class="card-coin-vol">
          Vol ${formatVolume(item.quoteVolume)}
        </div>
        <div class="card-coin-price">
          ${formatPrice(item.lastPrice, item.symbol)}
        </div>
        <div class="card-coin-change ${isPos ? 'pos' : 'neg'}">
          ${isPos ? '+' : ''}${change.toFixed(2)}%
        </div>
      `;

      card.addEventListener('click', () => {
        switchPair(item.symbol);
        closeCoinModal();
      });

      fragment.appendChild(card);
    }

    el.pairSearchResults.appendChild(fragment);
  }

  // --- Search & Modal Event Handlers ---
  function setupSearch() {
    // Open Modal button
    if (el.searchPairBtn) {
      el.searchPairBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openCoinModal();
      });
    }

    // Close Modal button
    if (el.closeModalBtn) {
      el.closeModalBtn.addEventListener('click', closeCoinModal);
    }

    // Click outside modal card to close
    if (el.coinModalOverlay) {
      el.coinModalOverlay.addEventListener('click', (e) => {
        if (e.target === el.coinModalOverlay) {
          closeCoinModal();
        }
      });
    }

    // Keyboard shortcut '/' to open, 'Escape' to close
    document.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== el.pairSearchInput && document.activeElement !== el.watchlistFilterInput) {
        e.preventDefault();
        openCoinModal();
      } else if (e.key === 'Escape') {
        closeCoinModal();
      }
    });

    // Search input inside modal
    if (el.pairSearchInput) {
      el.pairSearchInput.addEventListener('input', (e) => {
        state.modalQuery = e.target.value;
        if (el.clearSearchBtn) {
          el.clearSearchBtn.classList.toggle('hidden', !state.modalQuery);
        }
        renderModalCoins();
      });
    }

    if (el.clearSearchBtn) {
      el.clearSearchBtn.addEventListener('click', () => {
        state.modalQuery = '';
        el.pairSearchInput.value = '';
        el.clearSearchBtn.classList.add('hidden');
        el.pairSearchInput.focus();
        renderModalCoins();
      });
    }

    // Modal Category Tabs (ALL, USDT, IDR, USDC, BTC)
    if (el.marketCategoryTabs) {
      el.marketCategoryTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.cat-tab');
        if (tab && tab.dataset.category) {
          document.querySelectorAll('.cat-tab').forEach(t => t.classList.remove('active'));
          tab.classList.add('active');
          state.modalCategory = tab.dataset.category;
          renderModalCoins();
        }
      });
    }

    // Modal Sort Select
    if (el.modalSortSelect) {
      el.modalSortSelect.addEventListener('change', (e) => {
        state.modalSort = e.target.value;
        renderModalCoins();
      });
    }

    // Sidebar Watchlist Filter
    if (el.watchlistFilterInput) {
      el.watchlistFilterInput.addEventListener('input', (e) => {
        state.watchlistQuery = e.target.value;
        renderWatchlist();
      });
    }

    // Sidebar Market Category Tags
    if (el.watchlistMarketTags) {
      el.watchlistMarketTags.addEventListener('click', (e) => {
        const tag = e.target.closest('.wl-tag');
        if (tag && tag.dataset.quote) {
          document.querySelectorAll('.wl-tag').forEach(t => t.classList.remove('active'));
          tag.classList.add('active');
          state.watchlistQuote = tag.dataset.quote;
          renderWatchlist();
        }
      });
    }
  }

  // --- UI Event Listeners ---
  function setupEvents() {
    // Quick pair pills (if present)
    if (el.quickPairs) {
      el.quickPairs.addEventListener('click', (e) => {
        const pill = e.target.closest('.pair-pill');
        if (pill && pill.dataset.symbol) {
          switchPair(pill.dataset.symbol);
        }
      });
    }

    // Intervals
    el.intervalSelector.addEventListener('click', (e) => {
      const btn = e.target.closest('.iv');
      if (btn && btn.dataset.interval) {
        switchInterval(btn.dataset.interval);
      }
    });

    // Indicator Toggles (Metode 1)
    if (el.toggleEma9) {
      el.toggleEma9.addEventListener('click', () => {
        state.showEma9 = !state.showEma9;
        el.toggleEma9.classList.toggle('active', state.showEma9);
        if (state.ema9Series) state.ema9Series.applyOptions({ visible: state.showEma9 });
      });
    }

    if (el.toggleEma21) {
      el.toggleEma21.addEventListener('click', () => {
        state.showEma21 = !state.showEma21;
        el.toggleEma21.classList.toggle('active', state.showEma21);
        if (state.ema21Series) state.ema21Series.applyOptions({ visible: state.showEma21 });
      });
    }

    if (el.toggleEma50) {
      el.toggleEma50.addEventListener('click', () => {
        state.showEma50 = !state.showEma50;
        el.toggleEma50.classList.toggle('active', state.showEma50);
        if (state.ema50Series) state.ema50Series.applyOptions({ visible: state.showEma50 });
      });
    }

    if (el.toggleSrLevels) {
      el.toggleSrLevels.addEventListener('click', () => {
        state.showSrLevels = !state.showSrLevels;
        el.toggleSrLevels.classList.toggle('active', state.showSrLevels);
        if (state.showSrLevels && state.p0AnalysisData) {
          renderSrPriceLines(state.p0AnalysisData.support_resistance);
        } else {
          clearSrPriceLines();
        }
      });
    }

    if (el.toggleStoch) {
      el.toggleStoch.addEventListener('click', () => {
        state.showStoch = !state.showStoch;
        el.toggleStoch.classList.toggle('active', state.showStoch);
        if (el.stochRsiContainer) {
          el.stochRsiContainer.style.display = state.showStoch ? 'block' : 'none';
        }
        resizeCharts();
      });
    }

    if (el.toggleSignals) {
      el.toggleSignals.addEventListener('click', () => {
        state.showSignals = !state.showSignals;
        el.toggleSignals.classList.toggle('active', state.showSignals);
        if (state.candleSeries) {
          state.candleSeries.setMarkers(state.showSignals ? (state.scalperMarkers || []) : []);
        }
        if (!state.showSignals) {
          clearSignalPriceLines();
        } else if (state.activeSignal) {
          renderSignalPriceLines(state.activeSignal);
        }
      });
    }

    if (el.toggleZones) {
      el.toggleZones.addEventListener('click', () => {
        state.showZones = !state.showZones;
        el.toggleZones.classList.toggle('active', state.showZones);
        if (state.currentZones && state.lastPrice) {
          updateBuySellZones(state.currentZones, state.lastPrice);
        } else if (!state.showZones) {
          clearZonePriceLines();
        }
      });
    }

    if (el.toggleVolume) {
      el.toggleVolume.addEventListener('click', () => {
        state.showVolume = !state.showVolume;
        el.toggleVolume.classList.toggle('active', state.showVolume);
        if (state.volumeSeries) state.volumeSeries.applyOptions({ visible: state.showVolume });
      });
    }

    el.resetViewBtn.addEventListener('click', () => {
      if (state.chart) {
        try { state.chart.priceScale('right').applyOptions({ autoScale: true }); } catch (e) { }
        try { state.chart.timeScale().fitContent(); } catch (e) { }
      }
      if (state.stochChart) {
        try { state.stochChart.priceScale('right').applyOptions({ autoScale: true }); } catch (e) { }
        try { state.stochChart.timeScale().fitContent(); } catch (e) { }
      }
    });

    // Toggle Scalper Radar HUD
    if (el.toggleRadarHudBtn && el.scalperRadar) {
      const applyHudState = (collapsed) => {
        el.scalperRadar.classList.toggle('is-collapsed', collapsed);
        if (el.radarSetupsGroup) {
          el.radarSetupsGroup.classList.toggle('is-collapsed', collapsed);
        }
        el.toggleRadarHudBtn.classList.toggle('active', !collapsed);
        el.toggleRadarHudBtn.classList.toggle('inactive', collapsed);
        localStorage.setItem('kriptoyoi_hud_visible', !collapsed);
        setTimeout(resizeCharts, 50);
        setTimeout(resizeCharts, 200);
      };

      // Check user preference saved in localStorage (default is visible)
      const savedHud = localStorage.getItem('kriptoyoi_hud_visible');
      if (savedHud === 'false') {
        applyHudState(true);
      }

      el.toggleRadarHudBtn.addEventListener('click', () => {
        const willCollapse = !el.scalperRadar.classList.contains('is-collapsed');
        applyHudState(willCollapse);
      });
    }

    // Sidebar Tabs
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        const target = document.getElementById(btn.dataset.tab);
        if (target) target.classList.add('active');
      });
    });
  }

  // --- Bootstrap Application ---
  async function init() {
    updateSymbolUI();
    updateIntervalUI();
    setupSearch();
    setupEvents();
    initChart();
    startCandleTimer();

    // Parallel load
    load24hStats();
    loadSymbols();
    await loadHistoricalData();
    connectWebSocket();

    // Periodic 12s refresh for P0 Quantitative Analysis
    if (state.p0PeriodicTimer) clearInterval(state.p0PeriodicTimer);
    state.p0PeriodicTimer = setInterval(() => {
      fetchP0Analysis(state.symbol, state.interval);
    }, 12000);

    // BTC Market Gatekeeper — polling independen setiap 30 detik
    // (lebih jarang karena BTC pulse berubah lambat vs sinyal per-koin)
    fetchBtcPulse(); // fetch segera saat load
    if (state.btcPulseTimer) clearInterval(state.btcPulseTimer);
    state.btcPulseTimer = setInterval(() => {
      fetchBtcPulse();
    }, 30000);
  }

  // Start on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
