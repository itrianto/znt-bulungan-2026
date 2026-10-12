# Roadmap Dashboard ZNT Bulungan

Dashboard responsif untuk memantau 353 zona ZNT Bulungan. Frontend statis berada di folder `docs` agar siap untuk GitHub Pages atau Firebase Hosting.

## Yang sudah siap

- Peta Leaflet dengan 353 poligon dari `docs/data/zona.geojson`.
- Warna per surveyor atau status, popup detail, legenda, serta layout HP/laptop.
- Rekap zona dan grafik Chart.js otomatis dari atribut `STATUS`.
- Fondasi Google Sign-In dan sinkronisasi Cloud Firestore.
- Aturan Firestore yang membatasi perubahan progres pada pemilik zona; admin harus memiliki custom claim `admin: true`.

## Menyiapkan data GIS

Di ArcGIS Pro, pastikan setiap poligon memiliki `ID_ZONA` yang unik dan `Surveyor`. Ekspor master sebagai WGS84 GeoJSON lalu ganti `docs/data/zona.geojson`. Validasi sebelum ekspor: jumlah fitur harus 353, ID tidak boleh kosong/duplikat, dan ejaan nama surveyor konsisten.

Data titik belum tersedia, jadi kartu titik belum dihitung sebagai capaian akhir. Saat data titik tersedia, impor dengan `ID_TITIK` unik dan simpan daftar ID titik selesai (bukan hanya angka) untuk menghindari hitung ganda.

## Mengaktifkan Firebase

1. Buat Web App di Firebase Console, aktifkan Google provider pada Authentication, lalu tempel konfigurasi Web App ke `docs/js/firebase-config.js`.
2. Buat dokumen `zones/{ID_ZONA}` untuk setiap zona dan isi minimal `ownerUid` dengan UID surveyor yang bertanggung jawab. Ini adalah sumber otorisasi backend.
3. Jalankan `firebase deploy --only firestore:rules,hosting` setelah Firebase CLI dan project dipilih.
4. Beri custom claim `admin: true` menggunakan Admin SDK/Cloud Function untuk akun admin; jangan menjadikannya atribut yang bisa ditulis dari browser.

Koleksi `progressZona` menggunakan ID dokumen yang sama dengan `ID_ZONA` dan berisi `status`, `titikSelesai`, `ownerUid`, serta `updatedAt`.

## Publikasi GitHub Pages

Push repositori ke GitHub lalu aktifkan Pages dengan sumber branch `main` dan folder `/docs`. Konfigurasi Firebase boleh tampil di frontend; pengamanan tetap berada di Firestore Rules dan daftar `ownerUid` pada koleksi `zones`.
