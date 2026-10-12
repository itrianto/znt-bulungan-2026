# Roadmap Dashboard ZNT Bulungan

Dashboard responsif untuk memantau 353 zona ZNT Bulungan. Frontend statis berada di folder `docs` agar siap untuk GitHub Pages atau Firebase Hosting.

## Yang sudah siap

- Peta Leaflet dengan 353 poligon dari `docs/data/zona.geojson`.
- Warna per surveyor atau status, popup detail, legenda, serta layout HP/laptop.
- Rekap zona dan grafik Chart.js otomatis dari atribut `STATUS`.
- Dashboard publik hanya membaca koleksi `progressPublic` yang telah disetujui.
- Halaman admin memakai Google Sign-In; Firestore Rules memverifikasi `admins/{UID}` di server.

## Menyiapkan data GIS

Di ArcGIS Pro, pastikan setiap poligon memiliki `ID_ZONA` yang unik dan `Surveyor`. Ekspor master sebagai WGS84 GeoJSON lalu ganti `docs/data/zona.geojson`. Validasi sebelum ekspor: jumlah fitur harus 353, ID tidak boleh kosong/duplikat, dan ejaan nama surveyor konsisten.

Data titik belum tersedia, jadi kartu titik belum dihitung sebagai capaian akhir. Saat data titik tersedia, impor dengan `ID_TITIK` unik dan simpan daftar ID titik selesai (bukan hanya angka) untuk menghindari hitung ganda.

## Mengaktifkan Firebase

1. Aktifkan Google provider pada Firebase Authentication dan atur Authorized Domains.
2. Setelah login pertama, buat dokumen privat `admins/{UID}` melalui Firebase Console. SDK browser tidak diberi izin untuk membuat atau mengubah dokumen tersebut.
3. Audit dan migrasikan progres lama ke `progressPublic` sebelum deploy Rules baru. Jangan menyalin UID, email, owner, atau metadata internal.
4. Jalankan deploy Rules/hosting hanya setelah file GeoJSON publik hasil sanitasi disetujui.

Koleksi `progressPublic` menggunakan ID dokumen yang sama dengan `ID_ZONA` dan hanya berisi `status`, `titikSelesai`, serta `updatedAt`.

## Publikasi GitHub Pages

Jangan aktifkan GitHub Pages atau Firebase Hosting sampai `docs/data` hanya memuat GeoJSON yang telah disanitasi dan disetujui. Konfigurasi Firebase web bukan credential administratif; pengamanan tetap berada pada Firestore Rules dan daftar admin privat.
