# KriptoYoi — Scalping Analyzer Development Specification

**Status:** Draft / Development Roadmap  
**Target:** Cryptocurrency scalping  
**Goal:** Mengembangkan KriptoYoi dari realtime crypto dashboard menjadi **Real-Time Cryptocurrency Scalping Analysis & Decision Support System**.

---

## 1. Visi Produk

KriptoYoi tidak diposisikan sebagai mesin peramal harga atau auto-trading bot. Fokusnya adalah **decision support berbasis data**.

Sistem harus mampu menjawab:

1. Bagaimana kondisi market sekarang?
2. Market trending atau ranging?
3. Struktur harga bullish atau bearish?
4. Apakah ada setup scalping?
5. Mengapa setup valid?
6. Di mana entry?
7. Di mana invalidation / stop loss?
8. Di mana target profit?
9. Berapa Risk/Reward?
10. Bagaimana performa kondisi serupa secara historis?

Target pipeline:

```text
DATA
  ↓
MARKET CONTEXT
  ↓
MARKET STRUCTURE
  ↓
MARKET REGIME
  ↓
SETUP DETECTION
  ↓
CONFLUENCE
  ↓
RISK ANALYSIS
  ↓
SIGNAL
  ↓
HISTORICAL VALIDATION
```

---

# 2. Kondisi Saat Ini

Fondasi yang sudah tersedia:

- Realtime market data
- WebSocket
- Multi-timeframe
- Chart
- EMA 9/21
- Stoch RSI
- Tape / buy pressure
- Volume
- Area beli / area jual
- TP / SL
- Realtime trades

Masalah utama: sistem masih cenderung berupa kumpulan indikator. Targetnya adalah membangun **analysis engine** yang menggabungkan indikator, struktur, market regime, order flow, risk, dan statistik.

---

# 3. Arsitektur Target

```text
                         EXCHANGE API
                              │
             ┌────────────────┼────────────────┐
             ↓                ↓                ↓
           OHLCV            TRADES         ORDER BOOK
             │                │                │
             └────────────────┼────────────────┘
                              ↓
                       DATA PROCESSING
                              │
                 ┌────────────┼────────────┐
                 ↓            ↓            ↓
             INDICATORS    STRUCTURE    ORDER FLOW
                 │            │            │
                 └────────────┼────────────┘
                              ↓
                       MARKET REGIME
                              │
                              ↓
                    MULTI-TIMEFRAME
                              │
                              ↓
                       SETUP ENGINE
                              │
                              ↓
                       SCORE ENGINE
                              │
                              ↓
                       RISK ENGINE
                              │
                    ┌─────────┴─────────┐
                    ↓                   ↓
                 ENTRY               SL / TP
                    └─────────┬─────────┘
                              ↓
                         RISK / REWARD
                              │
                              ↓
                         BACKTESTING
                              │
                              ↓
                    HISTORICAL EDGE
```

---

# 4. Market Structure Engine

### Fitur

- Swing High
- Swing Low
- Higher High (HH)
- Higher Low (HL)
- Lower High (LH)
- Lower Low (LL)
- Break of Structure (BOS)
- Change of Character (CHoCH)
- Trend direction
- Structure strength

### Multi-Timeframe

| Timeframe | Fungsi |
|---|---|
| 1D | Macro context |
| 4H | Major trend |
| 1H | Market direction |
| 15M | Primary structure |
| 5M | Scalping structure |
| 1M | Entry trigger |

Prinsip: **timeframe tinggi menentukan konteks; timeframe rendah menentukan entry.**

### Output

```json
{
  "trend": "bullish",
  "structure": "HH_HL",
  "bos": true,
  "choch": false,
  "strength": 82
}
```

---

# 5. Support & Resistance Engine

Deteksi:

- Previous High / Low
- Swing levels
- Local support / resistance
- Breakout level
- Retest level

Metadata:

```text
price
strength
touches
timeframe
distance_to_price
```

Digunakan untuk entry, invalidation, TP, breakout, retest, dan R:R.

---

# 6. Volume Analysis

## Relative Volume / RVOL

```text
RVOL = Current Volume / Average Volume
```

Threshold awal:

```text
< 0.7       LOW
0.7–1.5     NORMAL
1.5–2.5     HIGH
> 2.5       EXTREME
```

Threshold harus divalidasi dengan backtesting.

RVOL digunakan untuk breakout confirmation, momentum confirmation, liquidity event, dan market activity filtering.

---

# 7. Volatility Engine

Tambahkan **ATR(14)**.

Gunakan ATR untuk:

- Dynamic Stop Loss
- Dynamic Take Profit
- Volatility classification
- Setup filtering

Regime:

```text
LOW
NORMAL
HIGH
EXTREME
```

Hindari fixed TP/SL untuk semua kondisi market.

---

# 8. Momentum Engine

Pertahankan:

- EMA 9
- EMA 21
- Stoch RSI

Tambahkan:

- EMA 50
- RSI
- EMA slope
- Momentum slope

Contoh bullish alignment:

```text
EMA9 > EMA21 > EMA50
```

Indikator momentum berfungsi sebagai **confirmation**, bukan sinyal tunggal.

---

# 9. Market Regime Engine

Sistem harus menentukan kondisi market sebelum mencari setup.

Regime:

```text
TRENDING UP
TRENDING DOWN
RANGING
BREAKOUT
HIGH VOLATILITY
LOW VOLATILITY
```

Indikator pendukung:

- CHOP / Choppiness Index
- ADX
- ATR
- Market Structure
- EMA alignment

Contoh:

```text
CHOP = 68
ADX  = 12

→ RANGING / CHOPPY
→ Hindari trend-following setup
```

```text
CHOP = 34
ADX  = 27
Structure = Bullish

→ TRENDING
→ Pullback / continuation lebih menarik
```

CHOP dan ADX adalah **market-regime filters**, bukan BUY/SELL indicators.

---

# 10. Order Flow Engine

Data:

- Buy trades
- Sell trades
- Trade volume
- Bid volume
- Ask volume
- Spread
- Order book depth

### Buy/Sell Ratio

```text
Buy Volume / Total Volume
```

### Order Book Imbalance

```text
(Bid Volume - Ask Volume)
/
(Bid Volume + Ask Volume)
```

Output contoh:

```text
Buy Pressure: 64%
Order Imbalance: +28%
Spread: 0.012%
```

---

# 11. Liquidity Analysis

Deteksi:

- Equal High
- Equal Low
- Previous High
- Previous Low
- Liquidity zones
- Liquidity sweep
- Potential stop clusters

Liquidity sweep harus dikonfirmasi dengan structure, volume, dan price action.

---

# 12. Multi-Timeframe Confluence

Buat matrix:

```text
TIMEFRAME    TREND       STRUCTURE

1D           🟢          🟢
4H           🟢          🟢
1H           🟢          🟢
15M          🟢          🟢
5M           🟢          🟢
1M           🟡          PULLBACK
```

Contoh:

```text
MTF Confluence: 5/6 bullish
Bias: LONG
```

Jika timeframe bertentangan, output **WAIT**.

---

# 13. Scalping Setup Engine

Setup awal:

## Breakout

```text
Resistance broken
+
RVOL high
+
Momentum strong
+
Order flow supportive
```

## Breakout Retest

```text
Breakout
↓
Pullback
↓
Retest
↓
Confirmation
↓
Entry
```

## Liquidity Sweep

```text
Liquidity taken
+
Rejection
+
Volume confirmation
+
Structure reversal
```

## Trend Pullback

```text
Trend clear
+
Pullback
+
Support
+
Momentum recovery
```

---

# 14. Signal Scoring Engine

Sistem tidak langsung mengeluarkan BUY/SELL. Setiap setup mendapat score.

### Bobot awal

| Komponen | Bobot |
|---|---:|
| Market Structure | 25 |
| Trend / MTF Alignment | 15 |
| Price Action | 20 |
| Volume | 15 |
| Momentum | 10 |
| Order Flow | 10 |
| Volatility | 5 |
| **Total** | **100** |

Bobot di atas adalah **starting point** dan wajib divalidasi dengan backtesting.

### Kategori

```text
0–39     NO TRADE
40–59    WEAK
60–74    WATCH
75–89    STRONG
90–100   VERY STRONG
```

Contoh:

```text
Structure       23/25
MTF             14/15
Price Action    17/20
Volume          12/15
Momentum         7/10
Order Flow       5/10
Volatility       4/5

TOTAL           82/100
```

---

# 15. Signal State

Harus tersedia:

```text
LONG
WAIT
SHORT
```

**WAIT adalah output yang valid.**

Contoh:

```text
Score = 58
Market = Bullish
Resistance terlalu dekat
R:R = 0.8

→ WAIT
```

---

# 16. Entry Engine

Gunakan **entry zone**, bukan selalu satu harga.

Contoh:

```text
ENTRY ZONE
136,200 – 136,350
```

Tambahkan:

- Entry zone
- Confirmation trigger
- Invalidation level

---

# 17. Dynamic Stop Loss

SL dihitung berdasarkan kombinasi:

```text
Market Structure
+
ATR
+
Support/Resistance
```

Contoh:

```text
Entry: 136,300
Structure SL: 135,950
ATR-based SL: 135,880

Final SL: 135,880
```

---

# 18. Dynamic Take Profit

Gunakan:

- Resistance
- Liquidity
- ATR
- Risk/Reward

Contoh:

```text
Entry: 136,300
SL: 135,880

TP1: 136,720
TP2: 137,150
```

---

# 19. Risk / Reward Engine

Setiap setup harus menghitung:

```text
Risk
Reward
R:R
```

Contoh:

```text
Risk = 0.31%
Reward = 0.72%

R:R = 1 : 2.32
```

Setup dengan R:R buruk dapat difilter.

---

# 20. Historical Edge

Fitur pembeda utama KriptoYoi.

Contoh setup:

```text
Bullish Pullback
+
RVOL > 1.5
+
EMA Alignment
+
Buy Pressure > 60%
+
CHOP < threshold
+
R:R > 1.5
```

Cari kondisi historis serupa:

```text
SIMILAR SETUPS

Occurrences: 1,842
TP First: 63.4%
SL First: 36.6%
Average Return: +0.42%
```

Jangan menampilkan probabilitas yang tidak berasal dari data.

Istilah yang disarankan:

- Historical Edge
- Setup Quality
- Historical Performance

---

# 21. Backtesting Engine

Parameter:

- Symbol
- Timeframe
- Period
- Strategy
- Entry
- SL
- TP
- Fee
- Slippage

Metrics:

- Total Trades
- Win Rate
- Loss Rate
- Average Win
- Average Loss
- Profit Factor
- Expectancy
- Maximum Drawdown
- Sharpe Ratio
- Net PnL

Alur:

```text
Historical Data
      ↓
Signal Engine
      ↓
Simulate Entry
      ↓
SL / TP
      ↓
Fee + Slippage
      ↓
Trade Result
      ↓
Performance Metrics
```

---

# 22. Trading Fee & Slippage

Wajib diperhitungkan:

```text
Gross PnL
- Trading Fee
- Slippage
= Net PnL
```

Scalping memiliki target profit kecil sehingga biaya transaksi dapat mengubah hasil strategi secara signifikan.

---

# 23. Trade Journal

Simpan:

```text
timestamp
symbol
timeframe
direction
setup
score
market_regime
entry
stop_loss
take_profit
risk_reward
result
pnl
```

Contoh statistik:

```text
SETUP PERFORMANCE

Pullback       Win Rate: 63%
Breakout       Win Rate: 51%
Liquidity      Win Rate: 68%
Reversal       Win Rate: 44%
```

Tujuannya menemukan setup yang benar-benar mempunyai edge.

---

# 24. Alert System

Alert untuk:

- BOS
- CHoCH
- Liquidity sweep
- Volume spike
- Order imbalance change
- Breakout
- Retest
- Entry zone touched
- Score threshold reached

---

# 25. Dashboard Target

```text
┌─────────────────────────────────────┐
│ BTC/USDT       $136,xxx             │
│ BULLISH          SCORE 78/100       │
├─────────────────────────────────────┤
│              CHART                  │
├──────────────┬──────────────────────┤
│ STRUCTURE    │ ORDER FLOW           │
│ HH / HL      │ Buy 64%              │
│ Bullish      │ Imbalance +28%       │
├──────────────┼──────────────────────┤
│ VOLUME       │ VOLATILITY           │
│ RVOL 1.8x    │ ATR 0.34%            │
├──────────────┴──────────────────────┤
│ MARKET REGIME: TRENDING / BULLISH   │
├─────────────────────────────────────┤
│ SCALP SETUP: LONG                   │
│ Entry 136,200–136,350               │
│ SL    135,880                       │
│ TP1   136,720                       │
│ TP2   137,150                       │
│ R:R   1:2.1                         │
├─────────────────────────────────────┤
│ HISTORICAL EDGE                     │
│ Similar setups: 1,842              │
│ TP First: 63.4%                     │
└─────────────────────────────────────┘
```

---

# 26. Market Scanner

Setelah engine stabil, tambahkan scanner:

```text
PAIR       REGIME       SETUP       SCORE

BTC/USDT   TRENDING     PULLBACK    82
ETH/USDT   RANGING      NONE        41
SOL/USDT   TRENDING     BREAKOUT    88
XRP/USDT   CHOPPY       NONE        35
```

Tujuan: menemukan pair dengan kondisi scalping terbaik.

---

# 27. Data Architecture

### Raw Data

```text
OHLCV
Trades
Order Book
Ticker
```

### Indicator Data

```text
EMA
RSI
Stoch RSI
ATR
RVOL
ADX
CHOP
```

### Structure Data

```text
Swing High
Swing Low
HH
HL
LH
LL
BOS
CHoCH
```

### Market Context

```text
Support
Resistance
Liquidity
Market Regime
MTF Bias
```

### Signal Data

```text
Setup
Score
Direction
Entry
SL
TP
R:R
```

### Analytics

```text
Backtest
Historical Edge
Expectancy
Profit Factor
Drawdown
Trade Journal
```

---

# 28. Database / Storage

### Market Data

```text
candles
trades
orderbook_snapshots
```

### Analysis

```text
indicators
market_structures
support_resistance
market_regimes
liquidity_events
```

### Signals

```text
scalp_setups
signal_scores
entry_levels
risk_levels
```

### Backtesting

```text
backtest_runs
backtest_trades
strategy_metrics
```

### Journal

```text
trade_journal
```

---

# 29. Roadmap Implementasi

## Phase 0 — Data Foundation

- [ ] Validasi OHLCV
- [ ] Validasi realtime trades
- [ ] Normalisasi timeframe
- [ ] Historical candle storage
- [ ] Timestamp consistency
- [ ] Fee configuration
- [ ] Slippage configuration

## Phase 1 — Core Analysis

- [ ] Market Structure
- [ ] Swing detection
- [ ] BOS
- [ ] CHoCH
- [ ] Support/Resistance
- [ ] ATR
- [ ] RVOL
- [ ] EMA 50
- [ ] RSI
- [ ] CHOP
- [ ] ADX
- [ ] MTF Confluence

## Phase 2 — Scalping Engine

- [ ] Breakout detection
- [ ] Breakout Retest
- [ ] Liquidity Sweep
- [ ] Trend Pullback
- [ ] Setup classification
- [ ] Signal scoring
- [ ] LONG / WAIT / SHORT
- [ ] Dynamic Entry
- [ ] Dynamic SL
- [ ] Dynamic TP
- [ ] R:R

## Phase 3 — Order Flow

- [ ] Order Book
- [ ] Bid/Ask volume
- [ ] Imbalance
- [ ] Spread
- [ ] Buy/Sell ratio
- [ ] Liquidity detection
- [ ] Liquidity sweep confirmation

## Phase 4 — Backtesting

- [ ] Historical data engine
- [ ] Strategy simulator
- [ ] Fee calculation
- [ ] Slippage
- [ ] Win rate
- [ ] Profit factor
- [ ] Expectancy
- [ ] Maximum drawdown
- [ ] Sharpe ratio

## Phase 5 — Statistical Engine

- [ ] Similar setup detection
- [ ] Historical probability
- [ ] Historical edge
- [ ] Setup ranking
- [ ] Parameter validation
- [ ] Walk-forward testing

## Phase 6 — Product Features

- [ ] Alerts
- [ ] Trade Journal
- [ ] Strategy performance
- [ ] Market Scanner
- [ ] Setup history
- [ ] Performance dashboard

## Phase 7 — Machine Learning (Optional)

ML hanya dilakukan setelah:

- [ ] Baseline strategy tersedia
- [ ] Backtesting stabil
- [ ] Data historis cukup
- [ ] Feature engineering selesai
- [ ] Train/validation/test split tersedia
- [ ] Out-of-sample test dilakukan
- [ ] Overfitting dikontrol

---

# 30. Prioritas Fitur

```text
P0  Market Structure
P0  Multi-Timeframe
P0  ATR / Volatility
P0  RVOL
P0  Support / Resistance

P1  Market Regime
P1  CHOP
P1  ADX
P1  Setup Engine
P1  Dynamic SL/TP
P1  Risk/Reward
P1  Signal Scoring

P2  Order Book
P2  Order Imbalance
P2  Liquidity
P2  Liquidity Sweep

P3  Backtesting
P3  Fee + Slippage
P3  Historical Edge
P3  Expectancy

P4  Trade Journal
P4  Alerts
P4  Market Scanner

P5  Machine Learning
```

---

# 31. Prinsip Desain Sistem

### Jangan menambah indikator secara acak

Setiap feature harus memiliki fungsi:

```text
Structure → Direction
Regime → Market Condition
Volume → Participation
Momentum → Strength
Order Flow → Immediate Pressure
Liquidity → Potential Target / Trap
ATR → Volatility
R:R → Risk Quality
Backtest → Evidence
```

### WAIT harus menjadi hasil yang sah

Sistem tidak perlu selalu menghasilkan trade.

### Explainability

Setiap signal harus dapat menjawab:

> Mengapa signal ini muncul?

### Evidence over prediction

Hindari:

```text
Harga PASTI naik.
```

Gunakan:

```text
Setup serupa secara historis menghasilkan TP-first 63.4%.
```

### Backtest sebelum ML

ML bukan pengganti strategy design.

---

# 32. Target Akhir

Contoh output:

```text
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
BTC/USDT — SCALPING ANALYSIS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Market Regime       TRENDING ↑
Structure           BULLISH
MTF Alignment       5/6
RVOL                1.84x
ATR                 0.34%
CHOP                34
ADX                 27
Buy Pressure        64%
Order Imbalance     +28%

SETUP               PULLBACK LONG
SCORE               78 / 100

ENTRY               136,200–136,350
STOP LOSS           135,880
TAKE PROFIT 1       136,720
TAKE PROFIT 2       137,150

RISK / REWARD       1 : 2.1

HISTORICAL EDGE
Similar setups      1,842
TP First            63.4%
SL First            36.6%

STATUS              VALID SETUP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

---

# 33. Definition of Done — Scalping Analyzer MVP

- [ ] Market structure terdeteksi otomatis
- [ ] Market regime terdeteksi
- [ ] Multi-timeframe dapat dikombinasikan
- [ ] RVOL tersedia
- [ ] ATR tersedia
- [ ] Support/resistance tersedia
- [ ] Minimal 3–4 setup scalping dapat dideteksi
- [ ] Signal mempunyai score yang dapat dijelaskan
- [ ] LONG / WAIT / SHORT tersedia
- [ ] Entry, SL, TP dinamis
- [ ] R:R dihitung
- [ ] Fee dan slippage diperhitungkan
- [ ] Backtest dapat dijalankan
- [ ] Historical performance dapat ditampilkan

---

# 34. Catatan Risiko

Dokumen ini adalah spesifikasi teknis pengembangan software, bukan rekomendasi investasi.

Historical performance tidak menjamin performa masa depan.

Semua threshold, bobot score, setup, dan strategi harus divalidasi menggunakan data historis, out-of-sample testing, fee, slippage, dan kondisi market yang realistis.

---

# 35. Ringkasan

Transformasi utama:

```text
REALTIME DASHBOARD
        ↓
TECHNICAL ANALYZER
        ↓
SCALPING ENGINE
        ↓
RISK ENGINE
        ↓
BACKTESTING
        ↓
STATISTICAL EDGE
```

**Prioritas utama:**

> Market Structure → Market Regime → Setup Engine → Dynamic Risk → Backtesting → Historical Edge

Jangan mengejar AI/ML terlebih dahulu. Bangun sistem deterministik yang dapat dijelaskan dan dibacktest sampai terbukti memiliki edge, baru kemudian pertimbangkan machine learning.
