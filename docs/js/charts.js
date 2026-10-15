/* Grafik otomatis dari properti STATUS (doughnut) dan jumlah zona per surveyor (batang). */
(function () {
  'use strict';
  const warna = { 'Belum diverifikasi': '#bdc1c6', Belum: '#9aa0a6', Proses: '#fbbc04', Selesai: '#34a853', Masalah: '#d9534f' };
  const statusList = ['Belum diverifikasi', 'Belum', 'Proses', 'Selesai', 'Masalah'];
  let donut, surveyor;

  function hancurkan(...grafik) { grafik.forEach((g) => { if (g) g.destroy(); }); }

  // Chart 2: jumlah zona per surveyor.
  // Sumber daftar, urutan, dan warna = surveyor.csv (sama dengan legenda peta);
  // jumlah dihitung dari fitur Master_Zona. Surveyor tanpa zona tetap tampil (0).
  function renderSurveyor(data) {
    if (!window.Chart || !data || !window.petaZNT) return;
    hancurkan(surveyor); surveyor = null;
    const kanvas = document.getElementById('chartRekapSurveyor');
    if (!kanvas) return;

    const daftar = window.petaZNT.daftarSurveyorCSV();
    if (!daftar.length) return;
    const jumlah = new Map(daftar.map((s) => [s.nama, 0]));
    (data.features || []).forEach((f) => {
      const nama = window.petaZNT.dapatkanSurveyor(f.properties);
      if (jumlah.has(nama)) jumlah.set(nama, jumlah.get(nama) + 1);
    });

    surveyor = new Chart(kanvas, {
      type: 'bar',
      data: {
        labels: daftar.map((s) => s.nama),
        datasets: [{
          label: 'Jumlah zona',
          data: daftar.map((s) => jumlah.get(s.nama)),
          backgroundColor: daftar.map((s) => s.warna)
        }]
      },
      options: {
        indexAxis: 'y',
        plugins: { legend: { display: false } },
        scales: {
          x: { beginAtZero: true, ticks: { precision: 0 } },
          y: { ticks: { autoSkip: false, font: { size: 10 } } }
        },
        responsive: true,
        maintainAspectRatio: false
      }
    });
  }

  function render(data, status) {
    if (!window.Chart) return;
    hancurkan(donut);

    // Chart 1: Status doughnut
    donut = new Chart(document.getElementById('chartProgresZona'), {
      type: 'doughnut',
      data: {
        labels: statusList,
        datasets: [{
          data: statusList.map((s) => status[s] || 0),
          backgroundColor: statusList.map((s) => warna[s])
        }]
      },
      options: {
        plugins: { legend: { position: 'bottom' } },
        responsive: true,
        maintainAspectRatio: false
      }
    });

    // Chart 2: Surveyor bar chart
    renderSurveyor(data);
  }

  window.grafikZNT = { render, renderSurveyor };
})();