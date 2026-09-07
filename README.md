# ⚡ KriptoYoi - Realtime Tokocrypto Candlestick Chart

Aplikasi grafik candlestick kripto interaktif secara real-time yang terhubung langsung ke **WebSocket API** dan **REST API** resmi dari [Tokocrypto](https://www.tokocrypto.com/apidocs/#websocket-api).

Dilengkapi dengan tampilan modern bergaya fintech dark terminal, indikator teknikal (EMA 20 & EMA 50), volume histogram, aliran transaksi live (*Live Trade Tape*), serta multi-pair selector untuk pasar USDT dan BIDR/IDR.

---

## 🛠️ Tech Stack

### Frontend:
- **TradingView Lightweight Charts (v4.2)**: Library canvas performa tinggi (60 FPS) standar industri untuk grafik candlestick finansial.
- **Vanilla JavaScript (ES6+) & WebSocket Client**: Terhubung langsung dari browser ke Tokocrypto Combined WebSocket Stream (`stream-cloud.tokocrypto.site`) dengan latensi terendah.
- **Vanilla CSS3**: Desain tema gelap (*Dark Mode Cyber/FinTech*), responsif, glassmorphism, dan animasi flash perubahan harga real-time.
- **Google Fonts**: *Inter* (UI) dan *JetBrains Mono* (Ticker & Angka Finansial).

### Backend:
- **Python 3.13+**
- **FastAPI**: Backend web framework modern berkecepatan tinggi.
- **Uvicorn**: Server ASGI untuk menjalankan FastAPI.
- **HTTPX**: Async HTTP client untuk fetching klines historis dan daftar pasar dari Tokocrypto.
- **python-dotenv**: Memuat environment variables dari file `.env`.
- **uv**: Package manager dan environment runner Python generasi terbaru yang sangat cepat.

---

## 📁 Struktur Direktori

```text
kriptoyoi/
├── .env                      # API Key Tokocrypto & konfigurasi rahasia
├── .gitignore
├── Dockerfile                # Konfigurasi container Docker
├── .dockerignore
├── vercel.json               # Konfigurasi deploy ke Vercel
├── requirements.txt          # Daftar dependensi standar pip
├── pyproject.toml            # Konfigurasi proyek & dependensi uv
├── uv.lock                   # Lockfile dependensi uv
├── main.py                   # Server backend FastAPI & routing API
├── README.md
└── static/                   # Aset Frontend Web
    ├── index.html            # Struktur dashboard web
    ├── style.css             # Tema dark terminal & styling
    ├── app.js                # Logika chart TradingView & WebSocket client
    └── libs/
        └── lightweight-charts.standalone.production.js  # Library TradingView lokal
```

---

## ⚙️ Persiapan & Konfigurasi

### 1. File `.env`
Pastikan file `.env` berada di root direktori proyek:

```env
apikey_tokocrypto=MASUKKAN_API_KEY_TOKOCRYPTO_ANDA
```
> **Catatan:** API Key Tokocrypto bersifat opsional untuk pembacaan data publik (chart/klines publik tetap dapat berjalan tanpa API key), namun sangat disarankan dimasukkan untuk menghindari pembatasan rate limit.

---

## 🚀 Cara Menjalankan di Lokal (Localhost)

### Opsi 1: Menggunakan `uv` (Direkomendasikan)
Jika Anda menggunakan `uv`, server dapat dijalankan langsung dengan satu perintah tanpa perlu aktivasi virtualenv manual:

```bash
uv run python main.py
```
*atau:*
```bash
uv run uvicorn main:app --reload --port 8000
```

### Opsi 2: Menggunakan Virtual Environment Standar (`.venv`)

**Di Windows (PowerShell):**
```powershell
# 1. Buat virtual environment (jika belum ada)
python -m venv .venv

# 2. Aktifkan virtual environment
.venv\Scripts\activate

# 3. Install dependensi
pip install -r requirements.txt

# 4. Jalankan aplikasi
uvicorn main:app --reload --port 8000
```

**Di Linux / macOS:**
```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Setelah server aktif, buka browser di:
👉 **`http://localhost:8000`** atau **`http://127.0.0.1:8000`**

---

## 🌐 Panduan Deploy

Aplikasi ini sangat ideal dideploy ke server mana pun karena WebSocket stream terhubung langsung dari browser pengguna ke Tokocrypto, sehingga backend hanya membutuhkan sumber daya server yang sangat ringan.

---

### A. Deploy ke VPS (Ubuntu / Debian Linux)

#### Cara 1: Menggunakan Docker & Docker Compose (Paling Praktis)
1. **Clone repository ke VPS Anda:**
   ```bash
   git clone <URL_REPO_ANDA> /var/www/kriptoyoi
   cd /var/www/kriptoyoi
   ```
2. **Buat file `.env` di VPS:**
   ```bash
   nano .env
   # Masukkan: apikey_tokocrypto=...
   ```
3. **Build & Jalankan container:**
   ```bash
   docker build -t kriptoyoi .
   docker run -d --name kriptoyoi_app -p 8000:8000 --restart always --env-file .env kriptoyoi
   ```

#### Cara 2: Menggunakan Systemd & Nginx (Standar Production)
1. **Install dependensi di VPS:**
   ```bash
   sudo apt update && sudo apt install -y python3-pip python3-venv nginx certbot python3-certbot-nginx
   ```
2. **Setup virtualenv:**
   ```bash
   cd /var/www/kriptoyoi
   python3 -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   ```
3. **Buat Systemd Service (`/etc/systemd/system/kriptoyoi.service`):**
   ```ini
   [Unit]
   Description=KriptoYoi FastAPI Application
   After=network.target

   [Service]
   User=www-data
   WorkingDirectory=/var/www/kriptoyoi
   ExecStart=/var/www/kriptoyoi/.venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000 --workers 2
   Restart=always
   EnvironmentFile=/var/www/kriptoyoi/.env

   [Install]
   WantedBy=multi-user.target
   ```
   Aktifkan service:
   ```bash
   sudo systemctl daemon-reload
   sudo systemctl start kriptoyoi
   sudo systemctl enable kriptoyoi
   ```
4. **Konfigurasi Nginx (`/etc/nginx/sites-available/kriptoyoi`):**
   ```nginx
   server {
       server_name domainanda.com;

       location / {
           proxy_pass http://127.0.0.1:8000;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
           proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
           proxy_set_header X-Forwarded-Proto $scheme;
       }
   }
   ```
   Aktifkan & pasang SSL HTTPS:
   ```bash
   sudo ln -s /etc/nginx/sites-available/kriptoyoi /etc/nginx/sites-enabled/
   sudo nginx -t && sudo systemctl reload nginx
   sudo certbot --nginx -d domainanda.com
   ```

---

### B. Deploy ke Cloud PaaS (Railway / Render / Fly.io)

Layanan Cloud PaaS mendukung file `Dockerfile` atau `requirements.txt` yang sudah disediakan:

#### 1. Railway (railway.app):
1. Buka dashboard Railway dan klik **New Project** $\rightarrow$ **Deploy from GitHub repo**.
2. Pilih repository proyek ini.
3. Tambahkan Environment Variable:
   - Key: `apikey_tokocrypto` | Value: `...`
4. Railway akan otomatis mendeteksi `Dockerfile` dan menjalankan port 8000.

#### 2. Render (render.com):
1. Klik **New Web Service** $\rightarrow$ Hubungkan repo GitHub Anda.
2. Pilih Runtime: **Python 3** (atau **Docker**).
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `uvicorn main:app --host 0.0.0.0 --port $PORT`
5. Di bagian **Environment Variables**, tambahkan `apikey_tokocrypto`.

---

### C. Deploy ke Vercel (Serverless)

File konfigurasi [`vercel.json`](file:///d:/kriptoyoi/vercel.json) sudah disiapkan di root proyek:

```json
{
  "version": 2,
  "builds": [
    {
      "src": "main.py",
      "use": "@vercel/python"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "main.py"
    }
  ]
}
```

#### Langkah Deploy ke Vercel:
1. **Menggunakan Vercel CLI:**
   ```bash
   npm i -g vercel
   vercel
   ```
2. **Atau Melalui Vercel Web Dashboard:**
   - Import repository GitHub Anda ke Vercel.
   - Tambahkan Environment Variable: `apikey_tokocrypto` pada menu Settings $\rightarrow$ Environment Variables.
   - Klik **Deploy**.

> 💡 **Kelebihan Arsitektur KriptoYoi pada Vercel:**
> Meskipun Vercel bersifat *serverless*, koneksi **WebSocket Tokocrypto berjalan langsung dari browser client** ke Tokocrypto (`wss://stream-cloud.tokocrypto.site`), sehingga streaming candlestick dan live trade tape tetap berjalan secara real-time tanpa batasan timeout fungsi serverless!

---

## 📡 Rincian API & Endpoint WebSocket Tokocrypto

- **Combined Stream URL:**
  `wss://stream-cloud.tokocrypto.site/stream?streams=<symbol>@kline_<interval>/<symbol>@miniTicker/<symbol>@trade`
- **Snapshot REST API:**
  `GET https://www.tokocrypto.site/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=500`
- **Ticker 24h:**
  `GET https://www.tokocrypto.site/api/v3/ticker/24hr`

---

## 📄 Lisensi
Proyek ini dibuat untuk keperluan analisis data pasar kripto dan edukasi. Bebas dimodifikasi dan dikembangkan lebih lanjut.
