// Test script untuk debug bug komentar & chart
console.log('=== TEST DEBUG ZNT ===');

// Test 1: Firebase SDK check
console.log('Firebase loaded:', typeof window.firebase !== 'undefined');
console.log('Firestore available:', typeof firebase !== 'undefined' && typeof firebase.firestore === 'function');
console.log('Config projectId:', window.ZNT_FIREBASE_CONFIG?.projectId);

// Test 2: Comment submit test
console.log('\n--- Test Comment Submit ---');
if (window.firebase && firebase.firestore) {
  const testData = {
    surveyorName: 'TEST-USER',
    zoneId: 'Z001',
    message: 'Test komentar dari publik',
    status: 'pending',
    createdAt: firebase.firestore.FieldValue.serverTimestamp()
  };
  console.log('Submit data:', JSON.stringify(testData, null, 2));
  
  firebase.firestore().collection('comments').add(testData)
    .then(ref => console.log('SUCCESS - Comment ID:', ref.id))
    .catch(err => console.error('FAILED -', err.code, ':', err.message));
} else {
  console.error('Firebase not ready');
}

// Test 3: Event listener test
console.log('\n--- Test Event Listener ---');
let eventFired = false;
document.addEventListener('znt:progress-changed', (e) => {
  eventFired = true;
  console.log('SUCCESS - Event znt:progress-changed received');
});
setTimeout(() => {
  if (!eventFired) console.log('Note: event listener ready');
}, 100);

// Test 4: Progress listener state
console.log('\n--- Test Progress Listener ---');
console.log('window.zntProgress available:', typeof window.zntProgress !== 'undefined');
console.log('zntProgress.dengarkan available:', typeof window.zntProgress?.dengarkan === 'function');
console.log('window.petaZNT available:', typeof window.petaZNT !== 'undefined');

// Test 5: Main.js hitung function
console.log('\n--- Test Chart Render ---');
if (window.grafikZNT && typeof window.grafikZNT.render === 'function') {
  console.log('SUCCESS - grafikZNT.render available');
} else {
  console.error('FAILED - grafikZNT.render not available');
}
