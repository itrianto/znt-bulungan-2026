# Catatan Implementasi Dashboard ZNT Bulungan

## Tahap 1 — selesai lokal

- Konfigurasi Firebase Web App disimpan lokal dengan SDK CDN compat yang telah digunakan proyek.
- Dashboard publik dipisahkan dari halaman login admin.
- Aksi tulis progres dihapus dari peta publik.
- Firebase Hosting mengabaikan `docs/data/**` sampai data publik disetujui.

## Tahap 2 — selesai lokal, belum dideploy

- Rules memakai `exists(admins/{UID})` untuk otorisasi admin di server.
- Koleksi `admins` privat dan tidak dapat diubah melalui SDK browser.
- `progressPublic` adalah satu-satunya koleksi yang dapat dibaca publik.
- Rules hanya menerima `status`, `titikSelesai`, dan `updatedAt` dengan tipe/validasi yang ditentukan.
- Koleksi lama tetap tidak disentuh dan dikunci pada Rules baru.

## Tahap 3 — migrasi kering

- Data GeoJSON lokal yang ada belum disetujui sebagai data publik karena memuat atribut yang tidak diperlukan untuk dashboard publik.
- Skrip `scripts/sanitize-public-zona.ps1` dibuat tetapi belum dijalankan. Outputnya hanya mempertahankan `ID_ZONA` dan geometri.
- Tidak ada pembacaan, pengubahan, penghapusan, atau migrasi data Firestore produksi.
- Dashboard kini menunggu koleksi `progressPublic`; data lama harus diekspor dan diperiksa sebelum disalin secara manual ke koleksi tersebut.
