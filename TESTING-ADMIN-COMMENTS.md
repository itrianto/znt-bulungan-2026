# Admin Panel & Comment System - Testing Guide

## Prerequisites

1. **Deploy Firestore Rules:**
   ```bash
   firebase deploy --only firestore:rules
   ```

2. **Create Admin User:**
   - Go to Firebase Console → Firestore Database
   - Create collection: `admins`
   - Add document with ID = your Google account UID
   - Document can be empty: `{}`

## Test Sequence

### PART 1: Admin Authentication

**Test 1.1: Access without login**
1. Open `admin.html`
2. Expected: "Masuk dengan akun Google..." message
3. Expected: All admin sections hidden

**Test 1.2: Login with non-admin account**
1. Click "Masuk dengan Google"
2. Login with account NOT in `/admins` collection
3. Expected: "Login berhasil, tetapi akun ini bukan admin."
4. Expected: Admin sections remain hidden

**Test 1.3: Login with admin account**
1. Logout if logged in
2. Click "Masuk dengan Google"
3. Login with account that EXISTS in `/admins/{uid}`
4. Expected: "Akun terverifikasi sebagai admin."
5. Expected: 3 sections appear:
   - Pengelolaan Surveyor
   - Pembaruan Progres Zona
   - Moderasi Komentar

### PART 2: Progress Editor

**Test 2.1: View all zones**
1. As admin, check "Pembaruan Progres Zona" section
2. Expected: Table shows all 353 zones with:
   - ID Zona
   - Surveyor name
   - Current status (default: "Belum")
   - Titik selesai (default: 0)
   - Updated timestamp
   - Edit button

**Test 2.2: Edit progress (valid input)**
1. Click "Edit" on any zone (e.g., Z001)
2. Form appears with zone ID
3. Change status to "Proses"
4. Enter titik selesai: 50
5. Click "Simpan Progres"
6. Expected: "Progres berhasil disimpan" (green text)
7. Expected: Form closes
8. Expected: Table refreshes, Z001 shows updated values

**Verify Firestore:**
- Check `/progressPublic/Z001`
- Should have: `{status: "Proses", titikSelesai: 50, updatedAt: timestamp}`

**Verify Public Dashboard:**
1. Open `index.html` in another tab
2. Click zone Z001 on map
3. Popup should show: Status: Proses, Titik selesai: 50

**Test 2.3: Edit progress (invalid input)**
1. Click "Edit" on any zone
2. Enter titik selesai: 2000 (exceeds 1509)
3. Click "Simpan Progres"
4. Expected: "Titik selesai harus antara 0-1509" error

**Test 2.4: Realtime sync**
1. Keep admin page open
2. Open Firebase Console → Firestore
3. Manually edit `/progressPublic/Z001`: change status to "Selesai"
4. Expected: Admin table updates automatically (no refresh needed)

### PART 3: Public Comment Submission

**Test 3.1: Submit valid comment**
1. Open `index.html` (public dashboard)
2. Scroll to "Komentar & Kendala" section
3. Fill form:
   - Nama Surveyor: "Adi Nugroho"
   - ID Zona: "Z010"
   - Komentar: "Akses jalan menuju zona sulit dilalui"
4. Click "Kirim Komentar"
5. Expected: "Komentar berhasil dikirim. Menunggu persetujuan admin." (green)
6. Expected: Form cleared

**Verify Firestore:**
- Check `/comments` collection
- New document with: `{surveyorName, zoneId, message, status: "pending", createdAt}`
- No moderatedAt or moderatedBy fields yet

**Test 3.2: Submit invalid comment (empty fields)**
1. Leave "Nama Surveyor" empty
2. Click "Kirim Komentar"
3. Expected: "Nama surveyor harus diisi" error

**Test 3.3: Submit invalid comment (wrong zone ID)**
1. Fill all fields
2. Enter ID Zona: "ABC" (not Z### format)
3. Click "Kirim Komentar"
4. Expected: "ID Zona harus format Z001-Z999" error

**Test 3.4: Submit invalid comment (too long)**
1. Fill form
2. Enter 1001+ characters in Komentar
3. Expected: Character counter shows 1001/1000
4. Click "Kirim Komentar"
5. Expected: "Komentar maksimal 1000 karakter" error

**Test 3.5: Character counter**
1. Type in Komentar field
2. Expected: Counter updates in realtime (e.g., "45/1000")

### PART 4: Comment Moderation

**Test 4.1: View pending comments**
1. As admin, go to "Moderasi Komentar" section
2. Expected: Table shows pending comment from Test 3.1:
   - Surveyor: Adi Nugroho
   - Zona: Z010
   - Message (truncated if >50 chars)
   - Time
   - Status badge: "pending" (yellow/orange)
   - Actions: Setujui, Tolak buttons

**Test 4.2: Approve comment**
1. Click "Setujui" on pending comment
2. Confirm dialog
3. Expected: "Komentar disetujui" message
4. Expected: Status badge changes to "approved" (green)
5. Expected: Actions change to "Hapus" button only

**Verify Firestore:**
- Check the comment document
- Should now have: `{status: "approved", moderatedAt: timestamp, moderatedBy: admin_uid}`

**Verify Public Dashboard:**
1. Go to `index.html`
2. Scroll to "Komentar yang Disetujui" section
3. Expected: Comment appears with surveyor name, zone, message, timestamp
4. Comment shows without moderation details

**Test 4.3: Reject comment**
1. Submit another comment from public dashboard
2. As admin, click "Tolak" on new pending comment
3. Confirm dialog
4. Expected: "Komentar ditolak"
5. Expected: Status badge: "rejected" (red)
6. Expected: Actions: "Hapus" button

**Verify Public Dashboard:**
- Rejected comment should NOT appear in public list
- Only approved comments visible

**Test 4.4: Delete comment**
1. As admin, click "Hapus" on any approved/rejected comment
2. Confirm dialog
3. Expected: "Komentar dihapus"
4. Expected: Row disappears from table

**Verify Firestore:**
- Document deleted from `/comments`

**Test 4.5: Realtime updates**
1. Keep admin moderation page open
2. Open `index.html` in another tab
3. Submit new comment
4. Expected: Admin page shows new pending comment automatically (no refresh)

### PART 5: Security Tests

**Test 5.1: Public cannot moderate**
1. Open browser console on `index.html`
2. Try to update comment status:
   ```js
   firebase.firestore().collection('comments').doc('<comment_id>').update({
     status: 'approved'
   })
   ```
3. Expected: Error "Missing or insufficient permissions"

**Test 5.2: Public cannot write progress**
1. Console on `index.html`:
   ```js
   firebase.firestore().collection('progressPublic').doc('Z001').set({
     status: 'Selesai',
     titikSelesai: 999,
     updatedAt: new Date()
   })
   ```
2. Expected: Error "Missing or insufficient permissions"

**Test 5.3: Public can only read approved comments**
1. Console on `index.html`:
   ```js
   firebase.firestore().collection('comments')
     .where('status', '==', 'pending')
     .get()
   ```
2. Expected: Returns empty (Rules filter out pending for non-admin)

**Test 5.4: Non-admin cannot read surveyorAssignments**
1. Login as non-admin or no login
2. Console:
   ```js
   firebase.firestore().collection('surveyorAssignments').get()
   ```
3. Expected: Error "Missing or insufficient permissions"

**Test 5.5: Admin can read all comments**
1. As admin, console on `admin.html`:
   ```js
   firebase.firestore().collection('comments').get()
     .then(snap => console.log('Comments:', snap.size))
   ```
2. Expected: Returns all comments (pending, approved, rejected)

### PART 6: Validation Tests

**Test 6.1: Progress - status validation**
1. Try to manually set invalid status in Firestore Console:
   ```
   /progressPublic/Z001: {status: "Invalid", titikSelesai: 0, updatedAt: now}
   ```
2. Expected: Firestore Rules reject (status not in allowed list)

**Test 6.2: Progress - titikSelesai validation**
1. Admin edit Z001
2. Try titikSelesai: -5
3. Expected: Client-side validation error
4. Try via Firestore Console: `titikSelesai: 2000`
5. Expected: Rules reject (exceeds 1509)

**Test 6.3: Comment - zone ID format**
1. Try to create comment via Firestore Console:
   ```
   {surveyorName: "Test", zoneId: "ABC", message: "Test", status: "pending", createdAt: now}
   ```
2. Expected: Rules reject (zoneId doesn't match ^Z[0-9]{3}$)

**Test 6.4: Comment - status must be pending on create**
1. Try to create comment with status: "approved" directly
2. Expected: Rules reject (new comments must be "pending")

**Test 6.5: Comment moderation - preserve original data**
1. Admin moderates comment
2. Check Firestore: surveyorName, zoneId, message, createdAt unchanged
3. Only status, moderatedAt, moderatedBy added

### PART 7: Data Integrity

**Test 7.1: No UID/email in public data**
1. Check `/progressPublic` documents
2. Verify: No admin UID or email fields
3. Check approved comments in public view
4. Verify: No moderatedBy UID visible

**Test 7.2: ModeratedBy contains admin UID**
1. Approve a comment as admin
2. Check Firestore document
3. Verify: moderatedBy field = your admin UID
4. This field NOT exposed to public dashboard

**Test 7.3: Timestamp accuracy**
1. Edit progress at 10:00 AM
2. Check updatedAt in Firestore
3. Should be server timestamp (not client time)
4. Same for comment createdAt and moderatedAt

### PART 8: Dashboard Synchronization

**Test 8.1: Progress updates reflect on map**
1. As admin, update Z050: Status="Selesai", Titik=100
2. Go to public dashboard
3. Map dropdown: select "Warna per status"
4. Expected: Z050 colored green (Selesai)
5. Click Z050 popup
6. Expected: Shows "Status: Selesai, Titik selesai: 100"

**Test 8.2: Progress updates reflect in charts**
1. Update multiple zones to "Selesai"
2. Check public dashboard charts
3. Expected: "Progres Zona" doughnut updates
4. Expected: "Zona per Surveyor" bar chart updates

**Test 8.3: Multiple admins (if available)**
1. Have 2 admins logged in simultaneously
2. Admin A edits Z010
3. Expected: Admin B sees update in realtime
4. Admin B moderates comment
5. Expected: Admin A sees moderation result

## Regression Tests

**Test 9.1: Existing features still work**
- Surveyor management (CRUD) still functional
- Map coloring (surveyor/status modes) works
- Dark mode toggle works
- Charts render correctly
- Zone table displays

**Test 9.2: No data loss**
- Existing progressPublic docs unchanged (unless edited)
- Existing surveyorAssignments intact
- GeoJSON data preserved

**Test 9.3: Mobile responsive**
- Open `index.html` on mobile viewport
- Comment form usable
- Admin tables scrollable
- No layout breaks

## Checklist Summary

- [ ] Admin login/logout works
- [ ] Non-admin blocked from admin features
- [ ] Progress editor loads all zones
- [ ] Progress edit saves to Firestore
- [ ] Progress updates sync to public dashboard (map + charts)
- [ ] Public comment form validates input
- [ ] Comments submitted as "pending"
- [ ] Admin can approve/reject/delete comments
- [ ] Only approved comments visible on public dashboard
- [ ] Realtime updates work (progress & comments)
- [ ] Firestore Rules enforce validation
- [ ] Security tests pass (public cannot write)
- [ ] No UID/email exposed in public views
- [ ] Character counter works
- [ ] XSS protection active (test with `<script>alert(1)</script>` in comment)
- [ ] Existing features preserved

## Expected Firestore Structure After Testing

```
/admins
  /{admin_uid}: {}

/progressPublic
  /Z001: {status: "Proses", titikSelesai: 50, updatedAt: timestamp}
  /Z010: {status: "Selesai", titikSelesai: 100, updatedAt: timestamp}
  ...

/comments
  /{commentId1}: {
    surveyorName: "Adi Nugroho",
    zoneId: "Z010",
    message: "Akses jalan menuju zona sulit dilalui",
    status: "approved",
    createdAt: timestamp,
    moderatedAt: timestamp,
    moderatedBy: "admin_uid"
  }
  /{commentId2}: {
    surveyorName: "Budi",
    zoneId: "Z020",
    message: "Cuaca buruk",
    status: "pending",
    createdAt: timestamp
  }

/surveyorAssignments
  (existing surveyor data - unchanged)

/surveyorPublic
  (existing public surveyor data - unchanged)
```

## Troubleshooting

**Issue: "Missing or insufficient permissions" on admin operations**
- Solution: Verify admin UID in `/admins` collection matches logged-in user
- Solution: Deploy latest Firestore Rules

**Issue: Comments not appearing in public view**
- Solution: Verify comment status is "approved"
- Solution: Check browser console for Firestore errors

**Issue: Progress not syncing to public dashboard**
- Solution: Check `/progressPublic/{zoneId}` exists in Firestore
- Solution: Refresh public dashboard (F5)
- Solution: Check progress.js is loaded and listening

**Issue: Form validation not working**
- Solution: Check browser console for JS errors
- Solution: Verify form input IDs match JS selectors
- Solution: Clear browser cache

**Issue: Realtime updates not working**
- Solution: Check Firestore connection (console.log in onSnapshot)
- Solution: Verify Firestore Rules allow read access
- Solution: Check network tab for WebSocket connections
