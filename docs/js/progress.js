/* Sinkronisasi data progres yang telah disetujui untuk konsumsi publik. */
(function () {
  'use strict';
  let unsubscribe = null;

  function dengarkan(data) {
    if (!(window.firebase && window.ZNT_FIREBASE_CONFIG)) return;
    if (unsubscribe) {
      try { unsubscribe(); } catch (_) {}
      unsubscribe = null;
    }

    unsubscribe = firebase.firestore().collection('progressPublic').onSnapshot((snap) => {
      const perubahan = new Map();
      snap.forEach((d) => perubahan.set(String(d.id).trim().toUpperCase(), d.data()));

      if (window.petaZNT && typeof window.petaZNT.terapkanProgressCloud === 'function') {
        window.petaZNT.terapkanProgressCloud(perubahan);
        return;
      }

      // Fallback jika petaZNT belum menyediakan terapkanProgressCloud
      data.features.forEach((f) => {
        const rawId = window.zntSpatial
          ? window.zntSpatial.dapatkanIdZona(f.properties)
          : (f.properties.HISTZONE || f.properties.histzone || f.properties.Zona_ID || f.properties.ID_ZONA || '');
        const idZona = String(rawId).trim().toUpperCase();
        const p = perubahan.get(idZona);
        if (p) {
          Object.assign(f.properties, {
            STATUS: p.status || 'Belum',
            TITIK_SELESAI: p.titikSelesai,
            updatedAt: p.updatedAt || f.properties.updatedAt,
            _FIRESTORE_VERIFIED: true
          });
        }
      });
      if (window.petaZNT && window.petaZNT.renderUlang) {
        window.petaZNT.renderUlang();
      }
      document.dispatchEvent(new CustomEvent('znt:progress-changed', { detail: data }));
    }, (e) => console.warn('Progress publik tidak dapat dimuat:', e.message));
  }

  window.zntProgress = { dengarkan };
})();
