/* Preferensi tampilan lokal: pilihan pengguna menang atas tema sistem. */
(function () {
  'use strict';
  const root = document.documentElement;
  const button = document.getElementById('themeToggle');
  const media = window.matchMedia('(prefers-color-scheme: dark)');
  function aktif() { return localStorage.getItem('znt-theme') || (media.matches ? 'dark' : 'light'); }
  function terapkan(theme) {
    root.dataset.theme = theme;
    const gelap = theme === 'dark';
    button.setAttribute('aria-pressed', String(gelap));
    button.setAttribute('aria-label', gelap ? 'Aktifkan tema terang' : 'Aktifkan tema gelap');
    button.querySelector('.theme-toggle__text').textContent = gelap ? 'Terang' : 'Gelap';
  }
  terapkan(aktif());
  button.addEventListener('click', () => { const berikutnya = root.dataset.theme === 'dark' ? 'light' : 'dark'; localStorage.setItem('znt-theme', berikutnya); terapkan(berikutnya); });
  media.addEventListener('change', (event) => { if (!localStorage.getItem('znt-theme')) terapkan(event.matches ? 'dark' : 'light'); });
})();
