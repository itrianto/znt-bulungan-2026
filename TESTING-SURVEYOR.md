# Langkah Pengujian Fitur Surveyor

## Persiapan

1. **Deploy Firestore Rules:**
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Verifikasi admin di Firebase Console:**
   - Buka Firestore Database
   - Buat collection `admins` jika belum ada
   - Tambah dokumen dengan ID = UID Google account admin
   - Dokumen dapat kosong atau `{role: "admin"}`

## Pengujian Akses Publik

### Test 1: Dashboard Publik Tanpa Data Surveyor
**Langkah:**
1. Buka `https://[PROJECT].web.app/` atau `docs/index.html` lokal
2. Pastikan Firebase connected (cek console browser)
3. Surveyor section seharusnya **tidak tampil** (display:none)

**Expected:**
- Section surveyor tersembunyi
- Dashboard lain (map, charts, zona) tetap berfungsi
- Tidak ada error di console

### Test 2: Tombol Login Admin
**Langkah:**
1. Di dashboard publik, cek header kanan atas
2. Klik tombol "Login Admin"

**Expected:**
- Redirect ke `admin.html`
- Tombol jelas terlihat, style konsisten dengan theme toggle

## Pengujian Admin (Belum Terautentikasi)

### Test 3: Admin Page Without Login
**Langkah:**
1. Buka `admin.html` tanpa login
2. Lihat status di section "Akses administrasi"

**Expected:**
- Status: "Masuk dengan akun Google..."
- Tombol "Masuk dengan Google" visible
- Section "Pengelolaan Surveyor" **tersembunyi** (display:none)
- Section "Pembaruan progres zona" masih placeholder

## Pengujian Admin (Non-Admin User)

### Test 4: Login dengan Non-Admin Account
**Langkah:**
1. Klik "Masuk dengan Google"
2. Login dengan akun yang **tidak** ada di collection `/admins`

**Expected:**
- Status: "Login berhasil, tetapi akun ini bukan admin."
- Tombol "Keluar" visible
- Section "Pengelolaan Surveyor" **tetap tersembunyi**

## Pengujian Admin (Admin Terverifikasi)

### Test 5: Login dengan Admin Account
**Langkah:**
1. Logout jika sudah login
2. Login dengan akun yang **ada** di `/admins/{uid}`

**Expected:**
- Status: "Akun terverifikasi sebagai admin."
- Section "Pengelolaan Surveyor" **muncul**
- Tabel assignment kosong dengan pesan "Belum ada penugasan surveyor"
- Tombol "+ Penugasan Baru" visible

## Pengujian CRUD Assignment

### Test 6: Create Assignment Baru
**Langkah:**
1. Sebagai admin, klik "+ Penugasan Baru"
2. Form muncul dengan fields: Nama Surveyor, ID Zona
3. Isi:
   - Nama: "Tim Surveyor A"
   - Zona: "Z001, Z002, Z003"
4. Klik "Simpan"

**Expected:**
- Status: "Penugasan berhasil dibuat"
- Form tertutup otomatis
- Tabel refresh, muncul 1 row baru
- Status: "Draft" (badge abu-abu)
- Kolom Aksi: Edit, Terbitkan, Hapus

**Validasi Firestore:**
- Collection `/surveyorAssignments` ada 1 dokumen
- Field: `displayName`, `zones` (array), `isPublished: false`, `createdAt`, `updatedAt`
- Collection `/surveyorPublic` masih kosong

### Test 7: Edit Assignment
**Langkah:**
1. Klik tombol "Edit" pada assignment
2. Form muncul dengan data terisi
3. Ubah nama menjadi "Tim Surveyor A (Updated)"
4. Tambah zona: ", Z004"
5. Klik "Simpan"

**Expected:**
- Status: "Penugasan berhasil diperbarui"
- Tabel refresh dengan data baru
- Jumlah zona: 4

**Validasi Firestore:**
- Dokumen di `/surveyorAssignments` terupdate
- `updatedAt` berubah
- `/surveyorPublic` masih kosong (belum diterbitkan)

### Test 8: Publish Assignment
**Langkah:**
1. Klik tombol "Terbitkan"
2. Konfirmasi dialog muncul
3. Klik OK

**Expected:**
- Status: "Berhasil diterbitkan"
- Tabel refresh
- Status berubah jadi "Dipublikasi" (badge hijau)
- Tombol "Terbitkan" hilang, muncul "Batalkan"

**Validasi Firestore:**
- `/surveyorAssignments/{id}`: `isPublished: true`
- `/surveyorPublic/{id}` **dibuat** dengan field: `displayName`, `zones`, `updatedAt`
- Tidak ada field `isPublished`, `createdAt` di public

**Validasi Dashboard Publik:**
- Refresh `index.html`
- Section "Surveyor" **muncul**
- Tabel surveyor ada 1 row: "Tim Surveyor A (Updated)", 4 zona

### Test 9: Unpublish Assignment
**Langkah:**
1. Klik tombol "Batalkan"
2. Konfirmasi dialog
3. Klik OK

**Expected:**
- Status: "Publikasi dibatalkan"
- Tabel refresh
- Status kembali "Draft"
- Tombol "Batalkan" hilang, muncul "Terbitkan"

**Validasi Firestore:**
- `/surveyorAssignments/{id}`: `isPublished: false`
- `/surveyorPublic/{id}` **dihapus**

**Validasi Dashboard Publik:**
- Refresh `index.html`
- Section "Surveyor" **tersembunyi** lagi

### Test 10: Delete Assignment (Unpublished)
**Langkah:**
1. Pastikan assignment dalam status Draft
2. Klik tombol "Hapus"
3. Konfirmasi dialog

**Expected:**
- Status: "Penugasan dihapus"
- Row hilang dari tabel
- Dokumen terhapus dari `/surveyorAssignments`

### Test 11: Delete Assignment (Published)
**Langkah:**
1. Buat assignment baru dan terbitkan
2. Klik tombol "Hapus" (saat masih Published)
3. Konfirmasi

**Expected:**
- Status: "Penugasan dihapus"
- Dokumen terhapus dari `/surveyorAssignments` **dan** `/surveyorPublic`
- Dashboard publik: section surveyor tersembunyi

## Pengujian Validasi

### Test 12: Nama Surveyor Kosong
**Langkah:**
1. Buat assignment baru, kosongkan nama
2. Klik Simpan

**Expected:**
- Status form: "Nama surveyor harus diisi"
- Tidak ada write ke Firestore

### Test 13: Nama Surveyor >100 Karakter
**Langkah:**
1. Isi nama dengan 150 karakter
2. Klik Simpan

**Expected:**
- Status: "Nama surveyor maksimal 100 karakter"
- Tidak ada write ke Firestore

### Test 14: Zona >500
**Langkah:**
1. Isi zona dengan 501 ID (Z001, Z002, ... Z501)
2. Klik Simpan

**Expected:**
- Status: "Maksimal 500 zona"
- Tidak ada write ke Firestore

### Test 15: Zona Kosong (Valid)
**Langkah:**
1. Isi nama, kosongkan zona
2. Klik Simpan

**Expected:**
- Berhasil tersimpan
- Jumlah zona: 0
- Array zones: []

## Pengujian Firestore Rules

### Test 16: Public Write Access (Harus Ditolak)
**Langkah:**
1. Buka console browser di dashboard publik (tanpa login)
2. Jalankan:
   ```js
   firebase.firestore().collection('surveyorPublic').add({
     displayName: "Hacker",
     zones: ["Z999"],
     updatedAt: new Date()
   })
   ```

**Expected:**
- Error: "Missing or insufficient permissions"
- Tidak ada dokumen baru di Firestore

### Test 17: Public Read Access (Harus Sukses)
**Langkah:**
1. Console browser di dashboard publik:
   ```js
   firebase.firestore().collection('surveyorPublic').get()
     .then(snap => console.log(snap.size))
   ```

**Expected:**
- Berhasil, return jumlah dokumen public

### Test 18: Non-Admin Read surveyorAssignments (Harus Ditolak)
**Langkah:**
1. Login sebagai non-admin atau tanpa login
2. Console browser:
   ```js
   firebase.firestore().collection('surveyorAssignments').get()
   ```

**Expected:**
- Error: "Missing or insufficient permissions"

### Test 19: Admin Read surveyorAssignments (Harus Sukses)
**Langkah:**
1. Login sebagai admin
2. Console browser di admin.html:
   ```js
   firebase.firestore().collection('surveyorAssignments').get()
     .then(snap => console.log(snap.size))
   ```

**Expected:**
- Berhasil, return jumlah assignments

## Pengujian Konsistensi Data

### Test 20: Stale Data Detection
**Langkah:**
1. Sebagai admin, buat dan terbitkan assignment
2. Manual di Firebase Console: hapus dokumen di `/surveyorPublic/{id}` saja
3. Refresh admin page

**Expected:**
- Assignment masih ada di tabel dengan status "Dipublikasi"
- (Future: UI bisa warn "Inconsistent: public doc missing")

### Test 21: Multiple Surveyors Published
**Langkah:**
1. Buat 3 assignments berbeda
2. Terbitkan semuanya
3. Cek dashboard publik

**Expected:**
- Section surveyor muncul
- Tabel surveyor ada 3 rows
- Total "3 surveyor" di header

## Pengujian XSS Protection

### Test 22: XSS di Nama Surveyor
**Langkah:**
1. Buat assignment dengan nama:
   ```
   <script>alert('XSS')</script>Surveyor
   ```
2. Terbitkan
3. Buka dashboard publik

**Expected:**
- Tidak ada alert popup
- Text muncul verbatim sebagai plain text (escaped)
- Tabel admin dan publik aman dari XSS

## Checklist Akhir

- [ ] Firestore Rules deployed
- [ ] Admin doc exists di `/admins/{uid}`
- [ ] Semua syntax checks passed
- [ ] Public dashboard: surveyor section tersembunyi saat kosong
- [ ] Public dashboard: surveyor section muncul saat ada data published
- [ ] Admin login flow berfungsi
- [ ] CRUD operations (create, edit, delete) berfungsi
- [ ] Publish/unpublish flow berfungsi
- [ ] Public tidak bisa write ke Firestore
- [ ] Non-admin tidak bisa read surveyorAssignments
- [ ] Admin bisa CRUD surveyorAssignments dan surveyorPublic
- [ ] XSS protection active
- [ ] Validasi field berfungsi
- [ ] Tidak ada data surveyor/zona yang dikarang
- [ ] Progress zona existing tidak berubah

## Langkah Berikutnya (Tidak Dilakukan Sekarang)

1. Deploy ke Firebase Hosting untuk test production
2. Tambahkan Cloud Function untuk sync atomik (optional)
3. Tambahkan UI consistency check di admin page
4. Tambahkan editor progres zona (fitur terpisah)
5. Tambahkan filter/search surveyor di dashboard publik
