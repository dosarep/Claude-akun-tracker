# Claude Account Tracker — Web

Website tracker akun Claude, sinkron real-time ke Google Sheet lewat Apps Script.
Siapa saja yang buka link-nya lihat status yang sama persis — countdown dihitung dari
timestamp terakhir dipakai, jadi tetap akurat walau dibuka ulang kapan saja.

## 1. Siapkan backend (Google Apps Script)

1. Buka Google Sheet cadangan tracker (`Claude_Account_Tracker_GoogleSheets.xlsx` yang sudah diimport).
2. Extensions > Apps Script, tempel isi file `AccountTracker_AppsScript.gs` (versi terbaru, sudah ada `doGet`/`doPost`).
3. Klik **Deploy > New deployment**.
4. Pilih tipe **Web app**.
5. Isi:
   - Execute as: **Me**
   - Who has access: **Anyone**
6. Klik **Deploy**, otorisasi akun Google-mu.
7. Copy **Web app URL** yang muncul (bentuknya `https://script.google.com/macros/s/xxxxx/exec`). Ini yang dipakai di langkah berikutnya.

> Setiap kali kamu mengubah kode `.gs`, kamu perlu **Deploy > Manage deployments > Edit (ikon pensil) > New version** supaya perubahan kepakai di URL yang sama.

## 2. Jalankan lokal (opsional, buat cek dulu)

```bash
npm install
cp .env.example .env
# isi VITE_API_URL di .env dengan Web app URL dari langkah 1
npm run dev
```

## 3. Deploy ke Vercel

1. Push folder ini ke GitHub (repo baru).
2. Di [vercel.com](https://vercel.com) → **Add New Project** → import repo tadi.
3. Framework preset otomatis kedeteksi **Vite**.
4. Di bagian **Environment Variables**, tambahkan:
   - Key: `VITE_API_URL`
   - Value: Web app URL dari langkah 1
5. Klik **Deploy**. Setelah selesai, kamu dapat link publik (`namamu.vercel.app`).

## 3b. Atau deploy ke Netlify

1. Push folder ini ke GitHub.
2. Di [netlify.com](https://netlify.com) → **Add new site > Import an existing project**.
3. Build command: `npm run build`, Publish directory: `dist`.
4. Site settings > Environment variables → tambahkan `VITE_API_URL` dengan value yang sama.
5. Deploy.

## Catatan

- Link website ini **publik** — siapa pun yang punya link bisa melihat & mengubah status akun (mark used, ganti topic, rename). Tidak ada login. Kalau butuh dibatasi hanya untuk kamu/tim, kabari saja, bisa ditambah proteksi password sederhana.
- Data tetap tersimpan di Google Sheet yang sama seperti sebelumnya — jadi Sheet dan Website selalu menunjukkan data yang identik.
- Kalau Sheet-nya kamu buka manual dan edit kolom secara langsung, website otomatis ikut ter-update dalam ≤15 detik (polling otomatis).
