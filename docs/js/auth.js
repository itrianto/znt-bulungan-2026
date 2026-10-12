(function () {
  'use strict'; const cfg = window.ZNT_FIREBASE_CONFIG; let auth;
  function tombol(user) { const b = document.getElementById('loginBtn'); if (!b) return; b.textContent = user ? `Keluar (${user.displayName || user.email})` : 'Login surveyor'; b.onclick = async () => { if (!auth) return alert('Firebase belum dikonfigurasi. Isi docs/js/firebase-config.js terlebih dahulu.'); if (auth.currentUser) return auth.signOut(); try { await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()); } catch (e) { alert(`Login gagal: ${e.message}`); } }; }
  if (!cfg || !window.firebase) { tombol(null); return; } firebase.initializeApp(cfg); auth = firebase.auth(); auth.onAuthStateChanged(tombol); window.zntAuth = { auth, user: () => auth.currentUser };
})();
