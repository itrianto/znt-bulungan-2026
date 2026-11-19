/* Grafik otomatis dari properti STATUS (doughnut) dan jumlah zona per surveyor (batang). */
(function () {
  'use strict';
  const warna = { 'Belum diverifikasi': '#bdc1c6', Belum: '#9aa0a6', Proses: '#fbbc04', Selesai: '#34a853', Masalah: '#d9534f' };
  const statusList = ['Belum diverifikasi', 'Belum', 'Proses', 'Selesai', 'Masalah'];
  let donut, surveyor;

  function hancurkan(...grafik) { grafik.forEach((g) => { if (g) g.destroy(); }); }

  // Chart 2: jumlah zona per surveyor.
  // Sumber daftar, urutan, dan warna = surveyor.csv + surveyor dinamis dari titik survei;
  // jumlah dihitung dari fitur Master_Zona. Surveyor tanpa zona tetap tampil (0).
  function renderSurveyor(data) {
    if (!window.Chart || !data || !window.petaZNT) return;
    const kanvas = document.getElementById('chartRekapSurveyor');
    if (!kanvas) return;

    const daftarBase = window.petaZNT.daftarSurveyorCSV() || [];
    const daftar = daftarBase.map((s) => ({ nama: s.nama, warna: s.warna }));
    const jumlah = new Map(daftar.map((s) => [s.nama, 0]));

    (data.features || []).forEach((f) => {
      const nama = window.petaZNT.dapatkanSurveyor(f.properties);
      if (!nama || nama === 'Belum ditugaskan') return;
      if (!jumlah.has(nama)) {
        jumlah.set(nama, 0);
        daftar.push({ nama, warna: '#64748b' });
      }
      jumlah.set(nama, jumlah.get(nama) + 1);
    });

    if (!daftar.length) return;

    const labels = daftar.map((s) => s.nama);
    const values = daftar.map((s) => jumlah.get(s.nama) || 0);
    const colors = daftar.map((s) => s.warna);

    if (surveyor) {
      surveyor.data.labels = labels;
      surveyor.data.datasets[0].data = values;
      surveyor.data.datasets[0].backgroundColor = colors;
      surveyor.update('none');
      return;
    }

    surveyor = new Chart(kanvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Jumlah zona',
          data: values,
          backgroundColor: colors
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
    const nilaiStatus = statusList.map((s) => status[s] || 0);

    // Chart 1: Status doughnut
    if (donut) {
      donut.data.datasets[0].data = nilaiStatus;
      donut.update('none');
    } else {
      donut = new Chart(document.getElementById('chartProgresZona'), {
        type: 'doughnut',
        data: {
          labels: statusList,
          datasets: [{
            data: nilaiStatus,
            backgroundColor: statusList.map((s) => warna[s])
          }]
        },
        options: {
          plugins: { legend: { position: 'bottom' } },
          responsive: true,
          maintainAspectRatio: false
        }
      });
    }

    // Chart 2: Surveyor bar chart
    renderSurveyor(data);
  }

  window.grafikZNT = { render, renderSurveyor };
})();