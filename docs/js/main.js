/* Orkestrasi dashboard publik berbasis GeoJSON tersanitasi. */
(function () {
  'use strict';
  let dataAktif = null;
  function angka(id, nilai) { const el = document.getElementById(id); if (el) el.textContent = nilai; }
  function hitung(data) {
    const fitur = data.features || []; const status = { 'Belum diverifikasi': 0, Belum: 0, Proses: 0, Selesai: 0, Masalah: 0 };
    fitur.forEach((f) => { const s = window.petaZNT.dapatkanStatus(f.properties); status[s] = (status[s] || 0) + 1; });
    const selesai = status.Selesai || 0;
    angka('totalZona', fitur.length.toLocaleString('id-ID')); angka('zonaSelesai', selesai.toLocaleString('id-ID'));
    angka('zonaProses', (status.Proses || 0).toLocaleString('id-ID')); angka('zonaBelum', (status.Belum || 0).toLocaleString('id-ID'));
    angka('zonaBelumDiverifikasi', (status['Belum diverifikasi'] || 0).toLocaleString('id-ID'));
    angka('persenSelesai', fitur.length ? `${((selesai / fitur.length) * 100).toFixed(1)}%` : '0%');
    window.grafikZNT.render(data, status);
    renderTabel(data);
  }
  function aman(teks) { const el = document.createElement('span'); el.textContent = teks; return el.innerHTML; }
  function renderTabel(data) {
    dataAktif = data;
    const fitur = data.features;
    document.getElementById('zoneTableCount').textContent = `${fitur.length} zona`;
    document.getElementById('zoneTableBody').innerHTML = fitur.slice(0, 10).map((f) => {
      const p = f.properties, status = window.petaZNT.dapatkanStatus(p), kelas = status.toLowerCase().replace(/\s+/g, '');
      return `<tr><td>${aman(p.ID_ZONA)}</td><td><span class="status-badge status-badge--${kelas}">${aman(status)}</span></td></tr>`;
    }).join('');
  }
  document.addEventListener('znt:data-ready', (event) => hitung(event.detail));
  document.addEventListener('znt:progress-changed', (event) => hitung(event.detail));
})();
