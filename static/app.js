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
    ema20Series: null,
    ema50Series: null,
    ws: null,
    wsReconnectTimeout: null,
    pingInterval: null,
    wsConnectionId: 0,
    lastCandle: null,
    candlesCache: [],
    lastPrice: 0,
    candleCloseTime: 0,
    timerInterval: null,
    showEma20: true,
    showEma50: true,
    showVolume: true,
    recentTrades: [],
  };

  // --- DOM Elements ---
  const el = {
    chartContainer: document.getElementById('chartContainer'),
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
    legendEma20: document.getElementById('legendEma20'),
    legendEma50: document.getElementById('legendEma50'),
    // Toggles
    toggleEma20: document.getElementById('toggleEma20'),
    toggleEma50: document.getElementById('toggleEma50'),
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

  function formatTime(timestampSec) {
    const d = new Date(timestampSec * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  function formatDate(timestampSec) {
    const d = new Date(timestampSec * 1000);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' ' +
           d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // --- Technical Indicator Calculations (EMA) ---
  function calculateEMA(data, period) {
    const results = [];
    if (!data || data.length === 0) return results;

    const k = 2 / (period + 1);
    let ema = 0;

    // First EMA starts with Simple Moving Average of initial 'period' bars
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

  // --- TradingView Chart Initialization ---
  function initChart() {
    if (!window.LightweightCharts) {
      console.error('TradingView LightweightCharts library not found!');
      return;
    }

    // Clean previous chart if any
    if (state.chart) {
      state.chart.remove();
      state.chart = null;
    }

    const chartOptions = {
      layout: {
        background: { type: 'solid', color: '#0a0d14' },
        textColor: '#94a3b8',
        fontSize: 11,
        fontFamily: "'JetBrains Mono', 'Inter', monospace",
      },
      grid: {
        vertLines: { color: 'rgba(255, 255, 255, 0.04)' },
        horzLines: { color: 'rgba(255, 255, 255, 0.04)' },
      },
      crosshair: {
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
      },
      rightPriceScale: {
        borderColor: '#1e283d',
        autoScale: true,
        scaleMargins: {
          top: 0.12,
          bottom: 0.22, // Space for volume bars
        },
        alignLabels: true,
      },
      timeScale: {
        borderColor: '#1e283d',
        timeVisible: true,
        secondsVisible: false,
        barSpacing: 10,
        minBarSpacing: 4,
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

    // 1. Candlestick Series
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

    // 2. Volume Series (Histogram at bottom)
    state.volumeSeries = state.chart.addHistogramSeries({
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '', // Overlay over same chart
      scaleMargins: {
        top: 0.78,
        bottom: 0,
      },
    });

    // 3. EMA 20 Series (Cyan)
    state.ema20Series = state.chart.addLineSeries({
      color: '#06b6d4',
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
    });

    // 4. EMA 50 Series (Purple)
    state.ema50Series = state.chart.addLineSeries({
      color: '#a855f7',
      lineWidth: 1.5,
      priceLineVisible: false,
      lastValueVisible: true,
      crosshairMarkerVisible: true,
    });

    // Crosshair legend handler
    state.chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData || !param.seriesData.get(state.candleSeries)) {
        updateLegendWithLatest();
        return;
      }

      const candle = param.seriesData.get(state.candleSeries);
      const volume = param.seriesData.get(state.volumeSeries);
      const ema20 = param.seriesData.get(state.ema20Series);
      const ema50 = param.seriesData.get(state.ema50Series);

      renderLegendData(param.time, candle, volume, ema20, ema50);
    });

    // Auto-resize on window change
    window.addEventListener('resize', () => {
      if (state.chart && el.chartContainer) {
        state.chart.applyOptions({
          width: el.chartContainer.clientWidth,
          height: el.chartContainer.clientHeight,
        });
      }
    });

    // Initial size
    state.chart.applyOptions({
      width: el.chartContainer.clientWidth,
      height: el.chartContainer.clientHeight,
    });
  }

  function renderLegendData(time, candle, volume, ema20, ema50) {
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

    el.legendEma20.textContent = ema20 ? formatPrice(ema20.value, state.symbol) : '--';
    el.legendEma50.textContent = ema50 ? formatPrice(ema50.value, state.symbol) : '--';
  }

  function updateLegendWithLatest() {
    if (!state.lastCandle) return;
    renderLegendData(
      state.lastCandle.time,
      state.lastCandle,
      { value: state.lastCandle.volume },
      null,
      null
    );
  }

  // --- REST: Fetch Historical Klines ---
  async function loadHistoricalData() {
    el.chartLoading.classList.remove('hidden');
    try {
      const url = `/api/klines?symbol=${encodeURIComponent(state.symbol)}&interval=${state.interval}&limit=500`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      if (!data.candles || data.candles.length === 0) {
        throw new Error('Data candle kosong dari Tokocrypto');
      }

      state.candlesCache = data.candles;
      const last = data.candles[data.candles.length - 1];
      state.lastCandle = { ...last, volume: data.volumes[data.volumes.length - 1]?.value || 0 };
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
      state.candleSeries.setData(data.candles);
      state.volumeSeries.setData(data.volumes);

      // Compute & Populate EMAs
      const ema20Data = calculateEMA(data.candles, 20);
      const ema50Data = calculateEMA(data.candles, 50);
      state.ema20Series.setData(ema20Data);
      state.ema50Series.setData(ema50Data);

      // Fit content
      state.chart.timeScale().fitContent();

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

    // Update current running bar in TradingView Series
    state.candleSeries.update(candleBar);
    state.volumeSeries.update(volumeBar);

    state.lastCandle = { ...candleBar, volume: vol };
    state.candleCloseTime = k.T; // Ms

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
    const isBuyerMaker = payload.m; // true => sell order, false => buy order
    const side = isBuyerMaker ? 'sell' : 'buy';
    const time = payload.T ? formatTime(Math.floor(payload.T / 1000)) : formatTime(Date.now() / 1000);

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
    await loadHistoricalData();
    connectWebSocket();
  }

  async function switchInterval(newInterval) {
    if (newInterval === state.interval) return;
    state.interval = newInterval;
    updateIntervalUI();
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
    try {
      const res = await fetch('/api/symbols');
      if (!res.ok) return;
      state.allSymbols = await res.json();

      if (el.totalCoinsBadge) {
        el.totalCoinsBadge.textContent = `${state.allSymbols.length} Koin`;
      }

      renderWatchlist();
    } catch (err) {
      console.warn('Gagal memuat list symbols:', err);
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

    // Indicator Toggles
    el.toggleEma20.addEventListener('click', () => {
      state.showEma20 = !state.showEma20;
      el.toggleEma20.classList.toggle('active', state.showEma20);
      state.ema20Series.applyOptions({ visible: state.showEma20 });
    });

    el.toggleEma50.addEventListener('click', () => {
      state.showEma50 = !state.showEma50;
      el.toggleEma50.classList.toggle('active', state.showEma50);
      state.ema50Series.applyOptions({ visible: state.showEma50 });
    });

    el.toggleVolume.addEventListener('click', () => {
      state.showVolume = !state.showVolume;
      el.toggleVolume.classList.toggle('active', state.showVolume);
      state.volumeSeries.applyOptions({ visible: state.showVolume });
    });

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
