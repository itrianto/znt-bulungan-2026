/* Grafik otomatis dari properti STATUS pada GeoJSON. */
(function () {
  'use strict';
  const warna = { Belum: '#9aa0a6', Proses: '#fbbc04', Selesai: '#34a853', Masalah: '#d9534f' }; let donut, tim, harian;
  function hancurkan(...grafik) { grafik.forEach((g) => { if (g) g.destroy(); }); }
  function render(data, status) {
    if (!window.Chart) return; hancurkan(donut, tim, harian);
    donut = new Chart(document.getElementById('chartProgresZona'), { type: 'doughnut', data: { labels: ['Belum', 'Proses', 'Selesai', 'Masalah'], datasets: [{ data: ['Belum', 'Proses', 'Selesai', 'Masalah'].map((s) => status[s] || 0), backgroundColor: ['Belum', 'Proses', 'Selesai', 'Masalah'].map((s) => warna[s]) }] }, options: { plugins: { legend: { position: 'bottom' } }, responsive: true, maintainAspectRatio: false } });
    const rekap = {}; data.features.forEach((f) => { const nama = window.petaZNT.dapatkanNamaSurveyor(f.properties), s = window.petaZNT.dapatkanStatus(f.properties); if (!rekap[nama]) rekap[nama] = { Belum: 0, Proses: 0, Selesai: 0, Masalah: 0 }; rekap[nama][s] = (rekap[nama][s] || 0) + 1; });
    const nama = Object.keys(rekap);
    tim = new Chart(document.getElementById('chartRekapTim'), { type: 'bar', data: { labels: nama, datasets: ['Belum', 'Proses', 'Selesai', 'Masalah'].map((s) => ({ label: s, data: nama.map((n) => rekap[n][s]), backgroundColor: warna[s] })) }, options: { indexAxis: 'y', scales: { x: { stacked: true }, y: { stacked: true } }, plugins: { legend: { position: 'bottom' } }, responsive: true, maintainAspectRatio: false } });
    harian = new Chart(document.getElementById('chartProgresHarian'), { type: 'line', data: { labels: ['Hari ini'], datasets: [{ label: 'Zona selesai', data: [status.Selesai || 0], borderColor: warna.Selesai, backgroundColor: 'rgba(52,168,83,.15)', fill: true, tension: .3 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
  }
  window.grafikZNT = { render };
})();
