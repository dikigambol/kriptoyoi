# Dokumen Kebutuhan (Requirements)

## Introduction

Friction Cost Engine adalah modul kalkulasi biaya transaksi riil untuk pasar kripto Indonesia (Tokocrypto/Bappebti). Modul ini mengimplementasikan Seksi 2 dari ROADMAP_ADDENDUM.md: menghitung total gesekan biaya (friction) per ronde-trip, memvalidasi setup scalping menggunakan Net Risk-to-Reward (Net R:R), dan menampilkan status `NO TRADE (FEE_UNVIABLE)` apabila Net R:R di bawah ambang batas minimum.

Fitur ini diintegrasikan ke dalam backend Python/FastAPI (`analyzer/p0_engine.py`) dan frontend Vanilla JS (`static/app.js`), sehingga panel **Scalper Radar** menampilkan data Net R:R secara real-time bersama analisis P0 yang sudah ada.

---

## Glosarium

- **Friction_Engine**: Komponen backend yang menghitung biaya transaksi total dan memvalidasi Net R:R.
- **Fee_Calculator**: Fungsi `calculate_friction_cost()` di dalam `analyzer/p0_engine.py`.
- **Net_RR_Validator**: Fungsi `validate_net_rr()` di dalam `analyzer/p0_engine.py`.
- **P0_Engine**: Fungsi `run_full_p0_analysis()` yang sudah ada di `analyzer/p0_engine.py`.
- **Scalper_Radar**: Panel UI di frontend (`static/app.js`) yang menampilkan sinyal scalping secara real-time.
- **Round_Trip_Friction**: Total biaya transaksi untuk satu siklus beli + jual, dinyatakan dalam persen maupun satuan harga.
- **Net_RR**: Rasio risiko-ke-reward bersih setelah dikurangi biaya transaksi (Round_Trip_Friction).
- **Gross_RR**: Rasio risiko-ke-reward kotor tanpa memperhitungkan biaya transaksi (TIDAK digunakan sebagai dasar validasi).
- **TP_Price**: Harga Take Profit yang ditentukan dari level resistance terdekat atau target ATR.
- **SL_Price**: Harga Stop Loss yang ditentukan dari level support terdekat atau batas swing low.
- **Entry_Price**: Harga entry saat ini (harga penutupan candle terakhir).
- **PPh_Final**: Pajak Penghasilan Final atas transaksi kripto sesuai PMK 68/2022 (0,10% per sisi).
- **PPN**: Pajak Pertambahan Nilai atas transaksi kripto (0,11% per sisi).
- **Trading_Fee**: Biaya trading platform Tokocrypto (0,10% atau 0,075% dengan diskon BNB).
- **Slippage**: Estimasi perbedaan harga antara order placement dan eksekusi aktual.
- **FEE_UNVIABLE**: Status yang menandakan setup tidak layak diperdagangkan karena Net R:R terlalu rendah akibat biaya transaksi.

---

## Requirements

### Requirement 1: Kalkulasi Komponen Biaya Transaksi

**User Story:** Sebagai trader kripto di Tokocrypto, saya ingin sistem secara otomatis menghitung total biaya transaksi riil (termasuk fee, pajak, dan slippage) untuk setiap setup scalping, sehingga saya dapat memahami berapa sebenarnya biaya yang harus saya bayar sebelum masuk posisi.

#### Kriteria Penerimaan

1. THE Fee_Calculator SHALL menerima parameter konfigurasi fee yang mencakup `trading_fee_pct` (default: 0,10%), `pph_final_pct` (default: 0,10%), `ppn_pct` (default: 0,11%), `slippage_pct` (default: 0,075%), dan `use_bnb_discount` (default: `False`).
2. WHEN `use_bnb_discount` adalah `True`, THE Fee_Calculator SHALL menggunakan nilai `trading_fee_pct` sebesar 0,075%.
3. THE Fee_Calculator SHALL menghitung `total_friction_pct` sebagai jumlah dari biaya beli satu sisi (trading_fee + PPh_Final + PPN) ditambah biaya jual satu sisi (trading_fee + PPh_Final + PPN) ditambah `slippage_pct`, menghasilkan nilai antara 0,35% dan 0,45% pada konfigurasi default.
4. THE Fee_Calculator SHALL mengonversi `total_friction_pct` menjadi `total_friction_price` dalam satuan harga dengan formula: `Entry_Price × (total_friction_pct / 100)`.
5. THE Fee_Calculator SHALL mengembalikan objek yang memuat `total_friction_pct`, `total_friction_price`, `fee_breakdown` (rincian setiap komponen), dan `use_bnb_discount`.

---

### Requirement 2: Validasi Net Risk-to-Reward

**User Story:** Sebagai trader kripto, saya ingin sistem memvalidasi setiap setup scalping menggunakan Net R:R (bukan Gross R:R), sehingga saya hanya menerima sinyal masuk pada peluang yang benar-benar menguntungkan setelah biaya transaksi diperhitungkan.

#### Kriteria Penerimaan

1. THE Net_RR_Validator SHALL menghitung `net_profit_target` dengan formula: `(TP_Price − Entry_Price) − total_friction_price`.
2. THE Net_RR_Validator SHALL menghitung `net_stop_loss` dengan formula: `(Entry_Price − SL_Price) + total_friction_price`.
3. THE Net_RR_Validator SHALL menghitung `net_rr` dengan formula: `net_profit_target / net_stop_loss`.
4. WHEN `net_rr` kurang dari 1,2, THE Net_RR_Validator SHALL menetapkan `is_viable` sebagai `False` dan `status` sebagai `"NO TRADE (FEE_UNVIABLE)"`.
5. WHEN `net_rr` lebih dari atau sama dengan 1,2, THE Net_RR_Validator SHALL menetapkan `is_viable` sebagai `True` dan `status` sebagai `"VIABLE"`.
6. THE Net_RR_Validator SHALL memvalidasi jarak TP1 minimum: jarak antara `TP_Price` dan `Entry_Price` harus lebih besar atau sama dengan 2,5 kali `total_friction_price`.
7. WHEN jarak TP1 kurang dari 2,5 kali `total_friction_price`, THE Net_RR_Validator SHALL menetapkan `tp_distance_ok` sebagai `False` dan menambahkan keterangan `"TP terlalu dekat (< 2.5x friction)"` pada `status`.
8. THE Net_RR_Validator SHALL mengembalikan objek yang memuat `net_profit_target`, `net_stop_loss`, `net_rr`, `is_viable`, `tp_distance_ok`, dan `status`.

---

### Requirement 3: Integrasi ke P0 Engine

**User Story:** Sebagai pengembang sistem, saya ingin Friction Cost Engine diintegrasikan secara seamless ke dalam `run_full_p0_analysis()`, sehingga setiap respons analisis P0 secara otomatis menyertakan data friction dan status Net R:R tanpa memerlukan endpoint API terpisah.

#### Kriteria Penerimaan

1. THE P0_Engine SHALL memanggil `calculate_friction_cost()` menggunakan `Entry_Price` dari harga penutupan candle terakhir.
2. THE P0_Engine SHALL menentukan `TP_Price` dari `nearest_resistance.price` dan `SL_Price` dari `nearest_support.price` yang dihasilkan oleh Support & Resistance Engine yang sudah ada.
3. WHEN `nearest_resistance` atau `nearest_support` tidak tersedia, THE P0_Engine SHALL menggunakan nilai fallback: `TP_Price = Entry_Price × 1,005` dan `SL_Price = Entry_Price × 0,997`.
4. THE P0_Engine SHALL memanggil `validate_net_rr()` menggunakan `Entry_Price`, `TP_Price`, `SL_Price`, dan hasil `calculate_friction_cost()`.
5. THE P0_Engine SHALL menyertakan objek `friction` dalam respons `run_full_p0_analysis()`, yang memuat semua nilai dari `calculate_friction_cost()` dan `validate_net_rr()`.
6. THE P0_Engine SHALL memastikan penambahan objek `friction` tidak mengubah struktur atau nilai kunci respons P0 yang sudah ada (backward-compatible).

---

### Requirement 4: Pembaruan Respons API `/api/analysis/p0`

**User Story:** Sebagai pengembang frontend, saya ingin endpoint `/api/analysis/p0` mengembalikan objek `friction` yang lengkap, sehingga frontend dapat menampilkan informasi Net R:R dan status viabilitas tanpa memodifikasi logika pemanggilan API.

#### Kriteria Penerimaan

1. THE `/api/analysis/p0` endpoint SHALL menyertakan objek `friction` dalam JSON respons dengan struktur berikut: `total_friction_pct`, `total_friction_price`, `net_rr`, `is_viable`, `status`, `tp_price`, `sl_price`, `net_profit_target`, `net_stop_loss`, `tp_distance_ok`, dan `fee_breakdown`.
2. WHEN kalkulasi friction gagal karena data tidak mencukupi, THE `/api/analysis/p0` endpoint SHALL mengembalikan objek `friction` dengan nilai `null` untuk field numerik dan `status` berisi `"DATA_INSUFFICIENT"`, tanpa menggagalkan seluruh respons analisis.
3. THE `/api/analysis/p0` endpoint SHALL mempertahankan semua field respons yang sudah ada (`volatility`, `volume`, `structure`, `momentum`, `support_resistance`, `mtf`) tanpa perubahan.

---

### Requirement 5: Tampilan Net R:R dan Status Friction di Scalper Radar

**User Story:** Sebagai trader yang menggunakan dashboard KriptoYoi, saya ingin panel Scalper Radar menampilkan nilai Net R:R dan status viabilitas setup secara jelas, sehingga saya dapat langsung mengetahui apakah sebuah setup layak dieksekusi setelah memperhitungkan biaya transaksi.

#### Kriteria Penerimaan

1. THE Scalper_Radar SHALL menampilkan nilai `net_rr` dalam format `"Net R:R: 1 : X.XX"` di dalam panel Scalper Radar setiap kali data P0 diperbarui.
2. WHEN `is_viable` adalah `False` (Net R:R < 1,2), THE Scalper_Radar SHALL menampilkan badge `NO TRADE (FEE_UNVIABLE)` dengan warna merah/oranye yang kontras dan menggantikan badge sinyal utama.
3. WHEN `is_viable` adalah `True`, THE Scalper_Radar SHALL mempertahankan tampilan badge sinyal utama (BUY SETUP, BEARISH, dll.) tanpa modifikasi tampilan.
4. THE Scalper_Radar SHALL menampilkan nilai `total_friction_pct` dalam format `"Friction: X.XX%"` sebagai informasi tambahan di bawah Net R:R.
5. WHEN `tp_distance_ok` adalah `False`, THE Scalper_Radar SHALL menampilkan peringatan `"⚠️ TP Terlalu Dekat"` di samping atau di bawah nilai Net R:R.
6. THE Scalper_Radar SHALL memperbarui tampilan friction setiap kali fungsi `renderP0Analysis()` dipanggil dengan data baru dari `/api/analysis/p0`.

---

### Requirement 6: Konfigurasi Fee yang Dapat Disesuaikan

**User Story:** Sebagai trader, saya ingin dapat mengonfigurasi parameter biaya transaksi (misalnya mengaktifkan diskon BNB), sehingga kalkulasi friction mencerminkan biaya aktual yang saya bayarkan sesuai akun saya.

#### Kriteria Penerimaan

1. THE Fee_Calculator SHALL mendukung konfigurasi `use_bnb_discount` sebagai parameter opsional dengan nilai default `False`.
2. WHEN `use_bnb_discount` adalah `True`, THE Fee_Calculator SHALL mengurangi `trading_fee_pct` dari 0,10% menjadi 0,075% untuk kalkulasi `total_friction_pct`.
3. THE Fee_Calculator SHALL mencantumkan nilai `use_bnb_discount` yang digunakan dalam objek `fee_breakdown` pada respons output, sehingga pengguna dapat memverifikasi parameter yang aktif.
4. IF nilai `trading_fee_pct`, `pph_final_pct`, atau `ppn_pct` yang diberikan kurang dari 0 atau lebih dari 5, THEN THE Fee_Calculator SHALL mengembalikan error dengan pesan `"Parameter biaya tidak valid"` dan tidak melanjutkan kalkulasi.
