(function () {
  'use strict';
  const cfg = window.ZNT_FIREBASE_CONFIG;
  if (!cfg || !window.firebase) return;
  if (!firebase.apps.length) firebase.initializeApp(cfg);
  const auth = firebase.auth();
  window.zntAuth = {
    auth,
    user: () => auth.currentUser,
    signIn: () => auth.signInWithPopup(new firebase.auth.GoogleAuthProvider()),
    signOut: () => auth.signOut(),
    onChange: (callback) => auth.onAuthStateChanged(callback)
  };
})();
