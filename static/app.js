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
    lastCandle: null,
    candlesCache: [],
    lastPrice: 0,
    candleCloseTime: 0,
    timerInterval: null,
    showEma9: true,
    showEma21: true,
    showStoch: true,
    showSignals: true,
    showVolume: true,
    recentTrades: [],
    recentTradesBuffer: [],
    scalperMarkers: [],
    currentEma9: null,
    currentEma21: null,
    currentStochK: null,
    currentStochD: null,
    showZones: true,
    currentZones: null,
    buyZoneUpperLine: null,
    buyZoneLowerLine: null,
    sellZoneUpperLine: null,
    sellZoneLowerLine: null,
  };

  // --- DOM Elements ---
  const el = {
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
    // Scalper Radar Elements
    radarSignalBadge: document.getElementById('radarSignalBadge'),
    radarSignalText: document.getElementById('radarSignalText'),
    cfTrend: document.getElementById('cfTrend'),
    cfStoch: document.getElementById('cfStoch'),
    pressureFillBuy: document.getElementById('pressureFillBuy'),
    pressureText: document.getElementById('pressureText'),
    radarTpVal: document.getElementById('radarTpVal'),
    radarSlVal: document.getElementById('radarSlVal'),
    radarBuyZoneBadge: document.getElementById('radarBuyZoneBadge'),
    radarBuyZoneVal: document.getElementById('radarBuyZoneVal'),
    radarSellZoneBadge: document.getElementById('radarSellZoneBadge'),
    radarSellZoneVal: document.getElementById('radarSellZoneVal'),
    radarZoneStatusPill: document.getElementById('radarZoneStatusPill'),
    radarZoneStatusText: document.getElementById('radarZoneStatusText'),
    toggleZones: document.getElementById('toggleZones'),
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
    legendStochK: document.getElementById('legendStochK'),
    legendStochD: document.getElementById('legendStochD'),
    stochKBadgeVal: document.getElementById('stochKBadgeVal'),
    stochDBadgeVal: document.getElementById('stochDBadgeVal'),
    stochHoverTime: document.getElementById('stochHoverTime'),
    // Toggles
    toggleEma9: document.getElementById('toggleEma9'),
    toggleEma21: document.getElementById('toggleEma21'),
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
    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    let seedRsi = 100 - (100 / (1 + rs));

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
      rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsiValues.push({ time: candles[i].time, rsi: 100 - (100 / (1 + rs)) });
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

  // --- Scalper Signal Generator (Metode 1: Trend & Momentum) ---
  function generateScalperSignals(candles, ema9Data, ema21Data, stochKData, stochDData) {
    const markers = [];
    if (!candles || candles.length < 5) return markers;

    const ema9Map = new Map(ema9Data.map(d => [d.time, d.value]));
    const ema21Map = new Map(ema21Data.map(d => [d.time, d.value]));
    const stochKMap = new Map(stochKData.map(d => [d.time, d.value]));
    const stochDMap = new Map(stochDData.map(d => [d.time, d.value]));

    for (let i = 2; i < candles.length; i++) {
      const c = candles[i];
      const prevC = candles[i - 1];
      const e9 = ema9Map.get(c.time);
      const e21 = ema21Map.get(c.time);
      const k = stochKMap.get(c.time);
      const d = stochDMap.get(c.time);
      const prevK = stochKMap.get(prevC.time);
      const prevD = stochDMap.get(prevC.time);

      if (!e9 || !e21 || k === undefined || d === undefined || prevK === undefined || prevD === undefined) {
        continue;
      }

      // BUY SIGNAL CONDITION:
      // 1. Tren Mikro Bullish: EMA 9 >= EMA 21 & Candle Close >= EMA 9
      // 2. Momentum Trigger: StochRSI K cross up D dari area oversold/rebound (< 40)
      const isBullTrend = e9 >= e21 && c.close >= e9;
      const isStochCrossUp = prevK <= prevD && k > d && (prevK <= 35 || k <= 42);

      if (isBullTrend && isStochCrossUp) {
        markers.push({
          time: c.time,
          position: 'belowBar',
          color: '#10b981',
          shape: 'arrowUp',
          text: 'BUY',
          size: 1.2,
        });
        continue;
      }

      // EXIT / SELL CONDITION:
      // 1. StochRSI overbought (> 78) dan cross down D
      // 2. ATAU Candle tembus ke bawah EMA 9 setelah sebelumnya di atas
      const isStochCrossDown = prevK >= prevD && k < d && prevK >= 78;
      const isTrendBreak = c.close < e9 && prevC.close >= e9;

      if (isStochCrossDown || isTrendBreak) {
        markers.push({
          time: c.time,
          position: 'aboveBar',
          color: '#f43f5e',
          shape: 'arrowDown',
          text: isStochCrossDown ? 'TP/EXIT' : 'CUT',
          size: 1.1,
        });
      }
    }
    return markers;
  }

  // --- Scalper Radar Analysis Display ---
  function updateScalperRadar(candle, e9, e21, k, d) {
    if (!candle) return;
    const price = candle.close;

    // 1. Evaluasi Tren (EMA 9 vs EMA 21)
    let isBull = false;
    if (e9 && e21) {
      isBull = e9 >= e21 && price >= e9;
      if (el.cfTrend) {
        el.cfTrend.textContent = isBull ? 'Bullish (EMA 9 > 21)' : 'Bearish / Melemah';
        el.cfTrend.className = `cf-value ${isBull ? 'bull' : 'bear'}`;
      }
    }

    // 2. Evaluasi Stoch RSI
    let isStochOversold = false;
    let isStochOverbought = false;
    if (k !== undefined && d !== undefined) {
      isStochOversold = k <= 30;
      isStochOverbought = k >= 78;
      if (el.cfStoch) {
        let stochStatus = 'Netral';
        if (isStochOversold) stochStatus = 'Oversold (Jenuh Jual)';
        else if (isStochOverbought) stochStatus = 'Overbought (Jenuh Beli)';
        el.cfStoch.textContent = `K: ${k.toFixed(1)} | D: ${d.toFixed(1)} (${stochStatus})`;
        el.cfStoch.className = `cf-value ${isStochOversold ? 'bull' : (isStochOverbought ? 'bear' : '')}`;
      }
    }

    // 3. Evaluasi Status Sinyal Radar
    if (el.radarSignalBadge && el.radarSignalText) {
      if (isBull && (isStochOversold || (k && d && k > d && k < 45))) {
        el.radarSignalBadge.className = 'radar-signal-badge buy';
        el.radarSignalText.textContent = '🟢 BUY SETUP AKTIF (Scalp Entry)';
      } else if (isStochOverbought || (e9 && price < e9)) {
        el.radarSignalBadge.className = 'radar-signal-badge sell';
        el.radarSignalText.textContent = isStochOverbought ? '🔴 Jenuh Beli (Pertimbangkan TP)' : '🔴 Tren Melemah / Exit';
      } else {
        el.radarSignalBadge.className = 'radar-signal-badge neutral';
        el.radarSignalText.textContent = '⚪ TUNGGU KONFIRMASI (Wait / Neutral)';
      }
    }

    // 4. Kalkulasi Estimasi Target TP (+0.5%) & SL (-0.3%)
    if (price > 0) {
      const tpPrice = price * 1.005; // +0.5%
      const slPrice = e21 && e21 < price ? e21 * 0.998 : price * 0.997; // -0.3% atau di bawah EMA 21
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

  // --- Calculation of Dynamic Buy (Demand) & Sell (Supply) Zones ---
  function calculateBuySellZones(candles) {
    if (!candles || candles.length < 15) return null;

    const lookback = Math.min(candles.length, 50);
    const slice = candles.slice(-lookback);
    const currentPrice = slice[slice.length - 1].close;

    // 1. Calculate ATR (14 period)
    let trSum = 0;
    const atrPeriod = Math.min(14, slice.length - 1);
    for (let i = slice.length - atrPeriod; i < slice.length; i++) {
      const prevClose = slice[i - 1].close;
      const c = slice[i];
      const tr = Math.max(c.high - c.low, Math.abs(c.high - prevClose), Math.abs(c.low - prevClose));
      trSum += tr;
    }
    const atr = trSum / atrPeriod;

    // 2. Identify Swing Lows below currentPrice
    const swingLows = [];
    for (let i = 2; i < slice.length - 1; i++) {
      const bar = slice[i];
      if (bar.low <= slice[i - 1].low && bar.low <= slice[i + 1].low && bar.low < currentPrice) {
        swingLows.push(bar.low);
      }
    }

    // 3. Identify Swing Highs above currentPrice
    const swingHighs = [];
    for (let i = 2; i < slice.length - 1; i++) {
      const bar = slice[i];
      if (bar.high >= slice[i - 1].high && bar.high >= slice[i + 1].high && bar.high > currentPrice) {
        swingHighs.push(bar.high);
      }
    }

    // Pick closest relevant swing low/high
    let baseBuy = swingLows.length > 0 ? swingLows[swingLows.length - 1] : Math.min(...slice.map(s => s.low));
    let baseSell = swingHighs.length > 0 ? swingHighs[swingHighs.length - 1] : Math.max(...slice.map(s => s.high));

    // Fallback if baseBuy is at or above currentPrice
    if (baseBuy >= currentPrice) {
      baseBuy = currentPrice - (1.2 * atr);
    }
    // Fallback if baseSell is at or below currentPrice
    if (baseSell <= currentPrice) {
      baseSell = currentPrice + (1.2 * atr);
    }

    const buyMin = Math.max(0, baseBuy - (0.3 * atr));
    const buyMax = Math.min(currentPrice * 0.9995, baseBuy + (0.35 * atr));

    const sellMin = Math.max(currentPrice * 1.0005, baseSell - (0.35 * atr));
    const sellMax = baseSell + (0.3 * atr);

    return {
      buyMin: parseFloat(buyMin.toFixed(getPrecision(currentPrice))),
      buyMax: parseFloat(buyMax.toFixed(getPrecision(currentPrice))),
      sellMin: parseFloat(sellMin.toFixed(getPrecision(currentPrice))),
      sellMax: parseFloat(sellMax.toFixed(getPrecision(currentPrice))),
      atr: atr
    };
  }

  // --- Render & Update Dynamic Buy & Sell Zones on Chart and Radar ---
  function updateBuySellZones(zones, currentPrice) {
    if (!zones) return;
    state.currentZones = zones;

    // 1. Remove old price lines if existing
    clearZonePriceLines();

    // 2. Draw price lines on candleSeries if showZones is true
    if (state.showZones && state.candleSeries) {
      // Sell Area (Supply)
      state.sellZoneUpperLine = state.candleSeries.createPriceLine({
        price: zones.sellMax,
        color: 'rgba(244, 63, 94, 0.65)',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        axisLabelVisible: true,
        title: 'SELL TOP',
      });

      state.sellZoneLowerLine = state.candleSeries.createPriceLine({
        price: zones.sellMin,
        color: '#f43f5e',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: '🔴 AREA JUAL',
      });

      // Buy Area (Demand)
      state.buyZoneUpperLine = state.candleSeries.createPriceLine({
        price: zones.buyMax,
        color: '#10b981',
        lineWidth: 1.5,
        lineStyle: LightweightCharts.LineStyle.Dashed,
        axisLabelVisible: true,
        title: '🟢 AREA BELI',
      });

      state.buyZoneLowerLine = state.candleSeries.createPriceLine({
        price: zones.buyMin,
        color: 'rgba(16, 185, 129, 0.65)',
        lineWidth: 1,
        lineStyle: LightweightCharts.LineStyle.Dotted,
        axisLabelVisible: true,
        title: 'BUY BOTTOM',
      });
    }

    // 3. Update Scalper Radar Ribbon Zones Widget
    if (el.radarBuyZoneVal) {
      el.radarBuyZoneVal.textContent = `${formatPrice(zones.buyMin, state.symbol)} - ${formatPrice(zones.buyMax, state.symbol)}`;
    }
    if (el.radarSellZoneVal) {
      el.radarSellZoneVal.textContent = `${formatPrice(zones.sellMin, state.symbol)} - ${formatPrice(zones.sellMax, state.symbol)}`;
    }

    updateZoneStatusBadge(currentPrice);
  }

  function updateZoneStatusBadge(currentPrice) {
    const zones = state.currentZones;
    if (!zones || !el.radarZoneStatusPill || !el.radarZoneStatusText || !currentPrice) return;

    if (currentPrice <= zones.buyMax && currentPrice >= zones.buyMin) {
      el.radarZoneStatusPill.className = 'zone-status-pill in-buy';
      el.radarZoneStatusText.textContent = '⚡ DALAM AREA BELI (DEMAND)';
    } else if (currentPrice >= zones.sellMin && currentPrice <= zones.sellMax) {
      el.radarZoneStatusPill.className = 'zone-status-pill in-sell';
      el.radarZoneStatusText.textContent = '🚀 DALAM AREA JUAL (SUPPLY)';
    } else if (currentPrice < zones.buyMin) {
      el.radarZoneStatusPill.className = 'zone-status-pill in-buy';
      el.radarZoneStatusText.textContent = '⚠️ DI BAWAH AREA BELI (DISCOUNT)';
    } else if (currentPrice > zones.sellMax) {
      el.radarZoneStatusPill.className = 'zone-status-pill in-sell';
      el.radarZoneStatusText.textContent = '🔥 DI ATAS AREA JUAL (BREAKOUT)';
    } else {
      const distToBuy = (((currentPrice - zones.buyMax) / currentPrice) * 100).toFixed(2);
      const distToSell = (((zones.sellMin - currentPrice) / currentPrice) * 100).toFixed(2);
      el.radarZoneStatusPill.className = 'zone-status-pill neutral';
      el.radarZoneStatusText.textContent = `⚖️ -${distToBuy}% ke Beli | +${distToSell}% ke Jual`;
    }
  }

  function clearZonePriceLines() {
    if (state.candleSeries) {
      if (state.buyZoneUpperLine) {
        try { state.candleSeries.removePriceLine(state.buyZoneUpperLine); } catch(e) {}
        state.buyZoneUpperLine = null;
      }
      if (state.buyZoneLowerLine) {
        try { state.candleSeries.removePriceLine(state.buyZoneLowerLine); } catch(e) {}
        state.buyZoneLowerLine = null;
      }
      if (state.sellZoneUpperLine) {
        try { state.candleSeries.removePriceLine(state.sellZoneUpperLine); } catch(e) {}
        state.sellZoneUpperLine = null;
      }
      if (state.sellZoneLowerLine) {
        try { state.candleSeries.removePriceLine(state.sellZoneLowerLine); } catch(e) {}
        state.sellZoneLowerLine = null;
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
        minimumWidth: 72,
        scaleMargins: {
          top: 0.12,
          bottom: 0.22,
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
          minimumWidth: 72,
          scaleMargins: { top: 0.1, bottom: 0.1 },
        },
        timeScale: {
          visible: false,
          barSpacing: 10,
          minBarSpacing: 4,
          rightOffset: 12,
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

      // Synchronize time scales
      state.chart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (state.stochChart && range) {
          state.stochChart.timeScale().setVisibleLogicalRange(range);
        }
      });
      state.stochChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
        if (state.chart && range) {
          state.chart.timeScale().setVisibleLogicalRange(range);
        }
      });

      // Crosshair handler for stochChart
      state.stochChart.subscribeCrosshairMove((param) => {
        if (!param.time) {
          updateLegendWithLatest();
          return;
        }
        if (el.stochHoverTime) {
          el.stochHoverTime.textContent = formatTime(param.time, true);
        }
        const kVal = param.seriesData && state.stochKSeries ? param.seriesData.get(state.stochKSeries) : null;
        const dVal = param.seriesData && state.stochDSeries ? param.seriesData.get(state.stochDSeries) : null;
        if (el.stochKBadgeVal && kVal) el.stochKBadgeVal.textContent = kVal.value.toFixed(1);
        if (el.stochDBadgeVal && dVal) el.stochDBadgeVal.textContent = dVal.value.toFixed(1);

        if (el.legendTime) el.legendTime.textContent = formatDate(param.time);
      });
    }

    // Crosshair legend handler
    state.chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData || !param.seriesData.get(state.candleSeries)) {
        updateLegendWithLatest();
        return;
      }

      const candle = param.seriesData.get(state.candleSeries);
      const volume = param.seriesData.get(state.volumeSeries);
      const ema9 = param.seriesData.get(state.ema9Series);
      const ema21 = param.seriesData.get(state.ema21Series);
      const stochK = state.stochKSeries ? param.seriesData.get(state.stochKSeries) : null;
      const stochD = state.stochDSeries ? param.seriesData.get(state.stochDSeries) : null;

      if (el.stochHoverTime) {
        el.stochHoverTime.textContent = formatTime(param.time, true);
      }
      if (el.stochKBadgeVal && stochK) {
        el.stochKBadgeVal.textContent = stochK.value.toFixed(1);
      }
      if (el.stochDBadgeVal && stochD) {
        el.stochDBadgeVal.textContent = stochD.value.toFixed(1);
      }

      renderLegendData(param.time, candle, volume, ema9, ema21, stochK, stochD);
    });

    // Auto-resize on window change
    window.addEventListener('resize', resizeCharts);
    resizeCharts();
  }

  function resizeCharts() {
    if (state.chart && el.chartContainer) {
      state.chart.applyOptions({
        width: el.chartContainer.clientWidth,
        height: el.chartContainer.clientHeight,
      });
    }
    if (state.stochChart && el.stochRsiContainer && state.showStoch) {
      state.stochChart.applyOptions({
        width: el.stochRsiContainer.clientWidth,
        height: el.stochRsiContainer.clientHeight,
      });
    }
  }

  function renderLegendData(time, candle, volume, ema9, ema21, stochK, stochD) {
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
    for (let i = 0; i < rawKlines.length; i++) {
      const item = rawKlines[i];
      const timeSec = Math.floor(item[0] / 1000);
      const o = parseFloat(item[1]);
      const h = parseFloat(item[2]);
      const l = parseFloat(item[3]);
      const c = parseFloat(item[4]);
      const vol = parseFloat(item[5]);

      candles.push({ time: timeSec, open: o, high: h, low: l, close: c });
      volumes.push({
        time: timeSec,
        value: vol,
        color: c >= o ? 'rgba(16, 185, 129, 0.45)' : 'rgba(244, 63, 94, 0.45)',
      });
    }
    return { candles, volumes };
  }

  // --- REST: Fetch Historical Klines ---
  async function loadHistoricalData() {
    el.chartLoading.classList.remove('hidden');
    const cleanSym = state.symbol.toUpperCase().replace('_', '');
    let candles = [];
    let volumes = [];

    // 1. Direct fetch from Tokocrypto (uses client's Indonesian IP, avoids Vercel US geo-blocking)
    try {
      const directUrl = `https://www.tokocrypto.site/api/v3/klines?symbol=${cleanSym}&interval=${state.interval}&limit=500`;
      const directRes = await fetch(directUrl);
      if (directRes.ok) {
        const raw = await directRes.json();
        if (Array.isArray(raw) && raw.length > 0) {
          const parsed = parseTokocryptoRawKlines(raw);
          candles = parsed.candles;
          volumes = parsed.volumes;
        }
      }
    } catch (e) {
      console.warn('Direct fetch from Tokocrypto failed, trying backend proxy:', e);
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

    try {
      if (candles.length === 0) {
        throw new Error('Data candle kosong dari Tokocrypto');
      }

      state.candlesCache = candles;
      const last = candles[candles.length - 1];
      state.lastCandle = { ...last, volume: volumes[volumes.length - 1]?.value || 0 };
      state.lastPrice = last.close;

      // Update price scale precision
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

      // Compute & Populate EMA 9 & EMA 21 (Metode 1: Trend Ribbon)
      const ema9Data = calculateEMA(candles, 9);
      const ema21Data = calculateEMA(candles, 21);
      if (state.ema9Series) state.ema9Series.setData(ema9Data);
      if (state.ema21Series) state.ema21Series.setData(ema21Data);

      // Compute & Populate Stochastic RSI (14, 14, 3, 3)
      const stochData = calculateStochRSI(candles, 14, 14, 3, 3);
      if (state.stochKSeries && state.stochDSeries) {
        state.stochKSeries.setData(stochData.kData);
        state.stochDSeries.setData(stochData.dData);
      }

      // Generate Scalper Signals (Buy/Exit Markers on Candlestick Chart)
      state.scalperMarkers = generateScalperSignals(candles, ema9Data, ema21Data, stochData.kData, stochData.dData);
      if (state.candleSeries) {
        state.candleSeries.setMarkers(state.showSignals ? state.scalperMarkers : []);
      }

      // Track latest indicator values
      const lastE9 = ema9Data.length > 0 ? ema9Data[ema9Data.length - 1].value : null;
      const lastE21 = ema21Data.length > 0 ? ema21Data[ema21Data.length - 1].value : null;
      const lastK = stochData.kData.length > 0 ? stochData.kData[stochData.kData.length - 1].value : null;
      const lastD = stochData.dData.length > 0 ? stochData.dData[stochData.dData.length - 1].value : null;

      state.currentEma9 = lastE9;
      state.currentEma21 = lastE21;
      state.currentStochK = lastK;
      state.currentStochD = lastD;

      // Update Scalper Radar Ribbon (Metode 1)
      updateScalperRadar(last, lastE9, lastE21, lastK, lastD);
      if (el.stochKBadgeVal && lastK !== null) el.stochKBadgeVal.textContent = lastK.toFixed(1);
      if (el.stochDBadgeVal && lastD !== null) el.stochDBadgeVal.textContent = lastD.toFixed(1);
      if (el.stochHoverTime && last) el.stochHoverTime.textContent = formatTime(last.time, true);

      // Compute & Render Dynamic Buy & Sell Zones
      const initialZones = calculateBuySellZones(candles);
      if (initialZones) {
        updateBuySellZones(initialZones, last.close);
      }

      // Fit content for both main chart and stoch chart
      state.chart.timeScale().fitContent();
      if (state.stochChart) {
        state.stochChart.timeScale().fitContent();
      }

      updatePriceDisplay(last.close, null);
      updateLegendWithLatest();
    } catch (err) {
      console.error('Gagal memuat klines historis:', err);
    } finally {
      el.chartLoading.classList.add('hidden');
    }
  }

  // --- WebSocket Connection & Real-time Stream ---
  function connectWebSocket() {
    // Increment connection sequence ID to invalidate any callbacks from previous sockets
    state.wsConnectionId = (state.wsConnectionId || 0) + 1;
    const currentConnId = state.wsConnectionId;

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
      } catch (e) {}
      state.ws = null;
    }

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
          const streamName = message.stream || '';
          const d = message.data || message;

          if (streamName.includes('@kline')) {
            handleKlineUpdate(d);
          } else if (streamName.includes('@miniTicker')) {
            handleMiniTickerUpdate(d);
          } else if (streamName.includes('@trade')) {
            handleTradeUpdate(d);
          } else if (d.e === 'kline') {
            handleKlineUpdate(d);
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
    el.wsStatusPill.className = `connection-status ${statusClass}`;
    el.wsStatusText.textContent = label;
  }

  // --- Real-time Kline Updates Handler ---
  function handleKlineUpdate(payload) {
    const k = payload.k;
    if (!k || !state.candleSeries) return;

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

    // Maintain running candles cache
    if (state.candlesCache && state.candlesCache.length > 0) {
      const lastIdx = state.candlesCache.length - 1;
      if (state.candlesCache[lastIdx].time === candleTime) {
        state.candlesCache[lastIdx] = candleBar;
      } else {
        state.candlesCache.push(candleBar);
        if (state.candlesCache.length > 500) state.candlesCache.shift();
      }
    }

    // Dynamic Live Recalculation of EMA 9 & EMA 21
    if (state.currentEma9 !== null) {
      const k9 = 2 / (9 + 1);
      const liveEma9 = (c - state.currentEma9) * k9 + state.currentEma9;
      if (state.ema9Series) state.ema9Series.update({ time: candleTime, value: liveEma9 });
      state.currentEma9 = liveEma9;
    }

    if (state.currentEma21 !== null) {
      const k21 = 2 / (21 + 1);
      const liveEma21 = (c - state.currentEma21) * k21 + state.currentEma21;
      if (state.ema21Series) state.ema21Series.update({ time: candleTime, value: liveEma21 });
      state.currentEma21 = liveEma21;
    }

    // Dynamic Live Recalculation of StochRSI on every price tick
    if (state.candlesCache && state.candlesCache.length >= 32) {
      const liveStoch = calculateStochRSI(state.candlesCache, 14, 14, 3, 3);
      if (liveStoch.kData.length > 0) {
        const lastK = liveStoch.kData[liveStoch.kData.length - 1];
        if (state.stochKSeries) state.stochKSeries.update(lastK);
        state.currentStochK = lastK.value;
        if (el.stochKBadgeVal) el.stochKBadgeVal.textContent = lastK.value.toFixed(1);
      }
      if (liveStoch.dData.length > 0) {
        const lastD = liveStoch.dData[liveStoch.dData.length - 1];
        if (state.stochDSeries) state.stochDSeries.update(lastD);
        state.currentStochD = lastD.value;
        if (el.stochDBadgeVal) el.stochDBadgeVal.textContent = lastD.value.toFixed(1);
      }
      if (el.stochHoverTime) {
        el.stochHoverTime.textContent = formatTime(candleTime, true);
      }
    }

    // Jika candle close: sinkronisasi penuh indikator & perbarui sinyal marker
    if (isClosed && state.candlesCache && state.candlesCache.length >= 25) {
      const ema9Data = calculateEMA(state.candlesCache, 9);
      const ema21Data = calculateEMA(state.candlesCache, 21);
      if (state.ema9Series) state.ema9Series.setData(ema9Data);
      if (state.ema21Series) state.ema21Series.setData(ema21Data);

      const stochData = calculateStochRSI(state.candlesCache, 14, 14, 3, 3);
      if (state.stochKSeries && state.stochDSeries) {
        state.stochKSeries.setData(stochData.kData);
        state.stochDSeries.setData(stochData.dData);
      }

      state.scalperMarkers = generateScalperSignals(state.candlesCache, ema9Data, ema21Data, stochData.kData, stochData.dData);
      if (state.candleSeries) {
        state.candleSeries.setMarkers(state.showSignals ? state.scalperMarkers : []);
      }

      if (ema9Data.length > 0) state.currentEma9 = ema9Data[ema9Data.length - 1].value;
      if (ema21Data.length > 0) state.currentEma21 = ema21Data[ema21Data.length - 1].value;
      if (stochData.kData.length > 0) state.currentStochK = stochData.kData[stochData.kData.length - 1].value;
      if (stochData.dData.length > 0) state.currentStochD = stochData.dData[stochData.dData.length - 1].value;

      // Recalculate dynamic buy & sell zones on candle close
      const refreshedZones = calculateBuySellZones(state.candlesCache);
      if (refreshedZones) {
        updateBuySellZones(refreshedZones, c);
      }
    }

    // Perbarui Radar Scalper (Metode 1) secara real-time
    updateScalperRadar(candleBar, state.currentEma9, state.currentEma21, state.currentStochK, state.currentStochD);
    updateZoneStatusBadge(c);

    updatePriceDisplay(c, state.lastPrice);
    state.lastPrice = c;
    updateLegendWithLatest();
  }

  // --- Real-time Mini Ticker (24h Stats) ---
  function handleMiniTickerUpdate(payload) {
    if (!payload) return;
    const high = parseFloat(payload.h);
    const low = parseFloat(payload.l);
    const vol = parseFloat(payload.q); // Quote asset volume
    const curPrice = parseFloat(payload.c);
    const openPrice = parseFloat(payload.o);

    if (high) el.statHigh.textContent = formatPrice(high, state.symbol);
    if (low) el.statLow.textContent = formatPrice(low, state.symbol);
    if (vol) el.statVolume.textContent = formatVolume(vol);

    if (curPrice && openPrice) {
      const changePct = ((curPrice - openPrice) / openPrice) * 100;
      el.displayChange.textContent = `${changePct >= 0 ? '+' : ''}${changePct.toFixed(2)}%`;
      el.displayChange.className = `price-change-badge ${changePct >= 0 ? 'positive' : 'negative'}`;
    }
  }

  // --- Real-time Trade Tape Handler ---
  function handleTradeUpdate(payload) {
    if (!payload || !payload.p) return;
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
  function startCandleTimer() {
    if (state.timerInterval) clearInterval(state.timerInterval);
    state.timerInterval = setInterval(() => {
      if (!state.candleCloseTime) {
        el.candleTimer.textContent = '--:--';
        return;
      }
      const now = Date.now();
      const diffMs = state.candleCloseTime - now;
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
    if (newSymbol === state.symbol) return;
    state.symbol = newSymbol.toUpperCase().replace('_', '');
    updateSymbolUI();
    el.tradesList.innerHTML = '';
    clearZonePriceLines();
    await loadHistoricalData();
    connectWebSocket();
  }

  async function switchInterval(newInterval) {
    if (newInterval === state.interval) return;
    state.interval = newInterval;
    updateIntervalUI();
    clearZonePriceLines();
    await loadHistoricalData();
    connectWebSocket();
  }

  function updateSymbolUI() {
    const isIdr = state.symbol.endsWith('BIDR') || state.symbol.endsWith('IDR');
    const base = isIdr ? state.symbol.replace(/BIDR|IDR/, '') : state.symbol.replace('USDT', '');
    const quote = isIdr ? (state.symbol.endsWith('BIDR') ? 'BIDR' : 'IDR') : 'USDT';

    el.displaySymbol.textContent = `${base}/${quote}`;
    el.displayBaseQuote.textContent = `${quote} Market`;

    if (el.selectorCurrentCoin) {
      el.selectorCurrentCoin.textContent = `${base} / ${quote}`;
    }

    if (el.totalCoinsBadge && state.allSymbols.length > 0) {
      el.totalCoinsBadge.textContent = `${state.allSymbols.length} Koin`;
    }

    // Update active quick pills
    document.querySelectorAll('.pair-pill').forEach((pill) => {
      if (pill.dataset.symbol === state.symbol) {
        pill.classList.add('active');
      } else {
        pill.classList.remove('active');
      }
    });
  }

  function updateIntervalUI() {
    document.querySelectorAll('.interval-btn').forEach((btn) => {
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
          <div style="font-size: 2rem; margin-bottom: 8px;">🔍</div>
          <div>Tidak ada koin yang cocok dengan pencarian "<b>${query}</b>"</div>
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
      const btn = e.target.closest('.interval-btn');
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
        state.chart.timeScale().fitContent();
      }
    });

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
    loadSymbols();
    await loadHistoricalData();
    connectWebSocket();
  }

  // Start on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
