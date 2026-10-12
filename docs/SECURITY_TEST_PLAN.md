# Rencana Uji Keamanan Firestore

Jalankan skenario ini di Firestore Rules Playground atau Emulator setelah rules dideploy ke lingkungan uji. Gunakan koleksi dan data uji, bukan data progres produksi.

| Aktor | Operasi | Hasil yang wajib |
| --- | --- | --- |
| Anonim | Baca `progressPublic/{ID_ZONA}` | Diizinkan. |
| Anonim | Tulis/hapus `progressPublic`, baca `admins` | Ditolak. |
| Login non-admin | Baca `progressPublic`, `get admins/{UID sendiri}` | Diizinkan. |
| Login non-admin | Tulis/hapus `progressPublic`, list `admins`, buat/ubah/hapus `admins` | Ditolak. |
| Admin | Buat/perbarui/hapus `progressPublic` dengan payload valid | Diizinkan. |
| Admin | Tambah field, status di luar daftar, angka titik negatif/lebih dari 1.509, timestamp klien | Ditolak. |
| Semua aktor | Baca atau tulis `progressZona`, `zones`, `users` lama | Ditolak. |

Payload valid hanya berisi `status`, `titikSelesai`, dan `updatedAt`. `updatedAt` harus `serverTimestamp()` dari SDK.
