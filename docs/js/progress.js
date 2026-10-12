/* Sinkronisasi data progres yang telah disetujui untuk konsumsi publik. */
(function () {
  'use strict';
  function dengarkan(data) { 
    if (!(window.firebase && window.ZNT_FIREBASE_CONFIG)) return; 
    firebase.firestore().collection('progressPublic').onSnapshot((snap) => { 
      const perubahan = new Map(); 
      snap.forEach((d) => perubahan.set(d.id, d.data())); 
      data.features.forEach((f) => { 
        const p = perubahan.get(f.properties.ID_ZONA); 
        if (p) { 
          Object.assign(f.properties, { STATUS: p.status || 'Belum', TITIK_SELESAI: p.titikSelesai, _FIRESTORE_VERIFIED: true }); 
        } else { 
          Object.assign(f.properties, { STATUS: 'Belum diverifikasi', TITIK_SELESAI: 0, _FIRESTORE_VERIFIED: false }); 
        } 
      }); 
      window.petaZNT.renderUlang(); 
      document.dispatchEvent(new CustomEvent('znt:progress-changed', { detail: data })); 
    }, (e) => console.warn('Progress publik tidak dapat dimuat:', e.message)); 
  }
  window.zntProgress = { dengarkan };
})();
