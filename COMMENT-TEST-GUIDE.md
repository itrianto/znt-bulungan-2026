# Testing Guide: Comment Submission Feature

## Test Scenario: Public Comment Submit

### Setup
- Open index.html in browser WITHOUT login
- Open DevTools (F12) → Console tab

### Test Steps
1. Scroll to "Kirim Komentar Baru" section
2. Fill form:
   - Nama Surveyor: `Test User`
   - ID Zona: `Z001`
   - Komentar: `Ini adalah test komentar untuk verifikasi sistem`
3. Click "Kirim Komentar" button
4. Check console for `[Comment]` log messages

### Expected Console Output

**SUCCESS path:**
```
[Comment] ============ SUBMIT START ============
[Comment] Validation passed, preparing submit...
[Comment] Firebase app: [DEFAULT]
[Comment] Firestore instance: Firestore
[Comment] Auth state: Unauthenticated
[Comment] Data keys: ['surveyorName', 'zoneId', 'message', 'status', 'createdAt']
[Comment] Data surveyorName type: string len: 9
[Comment] Data zoneId type: string value: Z001
[Comment] Data message type: string len: 47
[Comment] Data status: pending
[Comment] Data createdAt: [Object]
[Comment] Collection reference: comments
[Comment] ✓ SUCCESS - Document created: [auto-generated-id]
[Comment] Document reference: comments/[auto-generated-id]
```

**FAILURE path (shows error code):**
```
[Comment] ✗ SUBMIT FAILED ============
[Comment] Error code: [CODE: permission-denied|invalid-argument|unavailable|etc]
[Comment] Error message: [detailed error message]
[Comment] Error details: {code: '...', message: '...', stack: '...'}
[Comment] Data attempted: {surveyorName: 'Test User', zoneId: 'Z001', ...}
```

### Verification Checklist

#### 1. Form Validation
- [ ] Empty name → shows "Nama surveyor harus diisi"
- [ ] Zone format Z999 → shows "ID Zona harus format Z001-Z999"
- [ ] Empty message → shows "Komentar harus diisi"
- [ ] 1001 chars → shows "Komentar maksimal 1000 karakter"

#### 2. Submit Success
- [ ] No console errors starting with "[Comment]"
- [ ] Document ID appears in console log
- [ ] Form clears (name, zone, message inputs empty)
- [ ] Success message shows: "Komentar berhasil dikirim..."
- [ ] Document appears in Firestore Console

#### 3. Submit Failure with Error Code
If failure, identify error code:
- `permission-denied` → Rules blocked (check firestore.rules line 118)
- `unauthenticated` → Auth gate active (should be null allowed)
- `invalid-argument` → Data format wrong (check field types)
- `unavailable` → Firebase service down (retry)

#### 4. Firestore Verification
1. Go to Firebase Console → Firestore Database
2. Check collection "comments"
3. Look for document with:
   - `surveyorName`: "Test User"
   - `zoneId`: "Z001"
   - `message`: "Ini adalah test komentar..."
   - `status`: "pending" ⚠️ NOT "approved"
   - `createdAt`: timestamp

#### 5. Admin Moderation
1. Login to admin.html with verified admin account
2. Go to "Moderasi Komentar" section
3. Should see submitted comment in table
4. Click "Setujui" to approve
5. Back to index.html, refresh
6. Approved comment should appear in "Komentar yang Disetujui"

#### 6. Public View
1. Public should NOT see "pending" comments
2. Public SHOULD see "approved" comments
3. Approved comment displays: surveyor name, zone, message, timestamp

## Debugging Checklist

### If Submit Shows No Error
- Check Network tab: POST to `firestore.googleapis.com`
- Status should be 200 OK
- Response should contain document reference

### If "permission-denied" Error
```
Check firestore.rules line 118:
  allow create: if request.auth == null && validNewComment();
  
- request.auth == null? (publik harus null)
- validNewComment() passes? (check all 5 fields exist)
```

### If "invalid-argument" Error
```
Check data format:
- surveyorName: string, 1-100 chars
- zoneId: string, format Z###
- message: string, 1-1000 chars
- status: string, exact value "pending"
- createdAt: FieldValue.serverTimestamp()
```

### If "unavailable" Error
- Firebase service timeout
- Retry or check Firebase status page
- Check network connectivity

## Notes
- Test WITHOUT login (unauthenticated)
- Test on fresh private/incognito window if needed
- Check browser console WHILE submit happening
- Firestore rules should enforce, not app logic
