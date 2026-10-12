/* Grafik otomatis dari properti STATUS dan SURVEYOR pada GeoJSON. */
(function () {
  'use strict';
  const warna = { 'Belum diverifikasi': '#bdc1c6', Belum: '#9aa0a6', Proses: '#fbbc04', Selesai: '#34a853', Masalah: '#d9534f' };
  const warnaSurveyor = ['#c46b4e', '#e07856', '#f4a261', '#e9c46a', '#8ab17d', '#6a9f8f', '#5d7fa3', '#8b7fa8'];
  const statusList = ['Belum diverifikasi', 'Belum', 'Proses', 'Selesai', 'Masalah'];
  let donut, surveyor, harian;

  function hancurkan(...grafik) { grafik.forEach((g) => { if (g) g.destroy(); }); }

  // Chart 2: Surveyor bar chart (dipisah supaya bisa diperbarui sendiri)
  function renderSurveyor(data) {
    if (!window.Chart || !data) return;
    if (surveyor) { surveyor.destroy(); surveyor = null; }

    const surveyorCount = {};
    const surveyorStatus = {};

    data.features.forEach((f) => {
      const nama = window.petaZNT.dapatkanSurveyor(f.properties);
      const s = window.petaZNT.dapatkanStatus(f.properties);

      if (!surveyorCount[nama]) {
        surveyorCount[nama] = 0;
        surveyorStatus[nama] = { 'Belum diverifikasi': 0, Belum: 0, Proses: 0, Selesai: 0, Masalah: 0 };
      }

      surveyorCount[nama]++;
      surveyorStatus[nama][s] = (surveyorStatus[nama][s] || 0) + 1;
    });

    const surveyorNama = Object.keys(surveyorCount).sort((a, b) => surveyorCount[b] - surveyorCount[a]);

    surveyor = new Chart(document.getElementById('chartRekapSurveyor'), {
      type: 'bar',
      data: {
        labels: surveyorNama,
        datasets: statusList.map((s) => ({
          label: s,
          data: surveyorNama.map((n) => surveyorStatus[n][s]),
          backgroundColor: warna[s]
        }))
      },
      options: {
        indexAxis: 'y',
        scales: { x: { stacked: true }, y: { stacked: true } },
        plugins: { legend: { position: 'bottom' } },
        responsive: true,
        maintainAspectRatio: false
      }
    });
  }

  function render(data, status) {
    if (!window.Chart) return;
    hancurkan(donut, harian);

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

    // Chart 3: Daily progress (empty placeholder)
    harian = new Chart(document.getElementById('chartProgresHarian'), {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Zona selesai',
          data: [],
          borderColor: warna.Selesai,
          backgroundColor: 'rgba(52,168,83,.15)',
          fill: true,
          tension: .3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          title: { display: true, text: 'Riwayat harian belum tersedia', font: { size: 14 }, color: '#5f6368' }
        },
        scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
      }
    });
  }

  window.grafikZNT = { render, renderSurveyor };
})();