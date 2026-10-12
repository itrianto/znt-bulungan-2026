# Checklist Migrasi Progres

1. Sebelum deploy Rules baru, ekspor atau backup koleksi progres lama dari Firebase Console ke lokasi privat.
2. Catat jumlah dokumen, ID zona, status, dan jumlah titik; jangan memasukkan UID/email/owner ke hasil baru.
3. Bandingkan ID dokumen dengan `ID_ZONA` pada GeoJSON publik yang telah disetujui.
4. Buat dokumen `progressPublic/{ID_ZONA}` hanya dengan `status`, `titikSelesai`, dan `updatedAt`.
5. Validasi jumlah dokumen dan sampel status sebelum dan setelah migrasi.
6. Pastikan dashboard publik menerima update realtime dari `progressPublic`.
7. Simpan backup privat progres lama sampai validasi bisnis selesai. Jangan menghapus koleksi lama pada tahap ini.
