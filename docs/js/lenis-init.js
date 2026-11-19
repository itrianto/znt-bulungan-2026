/* ============================================================
   js/lenis-init.js - Inisialisasi Smooth Scroll Lenis
   - Aktif untuk Dashboard Publik (index.html) & Admin (admin.html)
   - Melindungi area Peta Leaflet, Legenda, Kontrol, dan Tabel Scroll
     agar zoom/scroll internal tidak bentrok dengan Lenis.
   ============================================================ */
(function () {
  'use strict';

  function initLenis() {
    if (typeof window.Lenis !== 'function') return;

    // Hormati preferensi aksesibilitas pengguna jika reduced motion aktif
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return;
    }

    const lenis = new window.Lenis({
      duration: 1.05,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      syncTouch: false,
      wheelMultiplier: 1,
      prevent: (node) => {
        if (!node || typeof node.closest !== 'function') return false;
        return Boolean(
          node.closest(
            '#map, .map-section, .leaflet-container, .map__legend, .map__controls, .table-scroll, textarea, select'
          )
        );
      }
    });

    function raf(time) {
      lenis.raf(time);
      window.requestAnimationFrame(raf);
    }

    window.requestAnimationFrame(raf);
    window.zntLenis = lenis;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLenis);
  } else {
    initLenis();
  }
})();
