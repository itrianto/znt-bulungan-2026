/* ============================================================
   js/map.js — Peta interaktif ZNT (Langkah 2)
   - Muat zona.geojson via fetch, tampilkan sebagai poligon
   - Basemap OpenStreetMap + fitBounds ke seluruh zona
   - Mode warna: per surveyor / per status (legenda ikut berubah)
   - Klik zona → popup detail (ID_ZONA, SURVEYOR, STATUS)
   - Efek hover/highlight pada zona
   ============================================================ */

(function () {
  'use strict';

  // ---------- Konstanta warna ----------
  const WARNA_STATUS = {
    Belum: '#9aa0a6',   // abu-abu
    Proses: '#fbbc04',  // kuning
    Selesai: '#34a853', // hijau
    Masalah: '#d9534f'  // merah
  };

  // 8 warna surveyor yang mudah dibedakan
  const WARNA_SURVEYOR = [
    '#e6194b', '#3cb44b', '#4363d8', '#f58231',
    '#911eb4', '#00a0c6', '#f032e6', '#808000'
  ];

  // ---------- Variabel modul ----------
  let peta = null;
  let layerZona = null;
  let dataZona = null;      // GeoJSON yang sudah dimuat
  let daftarSurveyor = [];  // daftar nama surveyor unik (terurut)
  let modeWarna = 'surveyor';
  let filterSurveyor = '';

  // ============================================================
  // FUNGSI DATA (mudah diganti sumbernya: GeoJSON → Firestore)
  // ============================================================

  // Normalisasi nama surveyor (data memakai "Surveyor")
  // Fallback "SURVEYOR" agar tahan jika sumber data berubah (misal Firestore)
  function dapatkanNamaSurveyor(properties) {
    return properties.Surveyor || properties.SURVEYOR || '(tanpa nama)';
  }

  // Normalisasi status (data belum punya STATUS → default "Belum")
  function dapatkanStatus(properties) {
    return properties.STATUS || 'Belum';
  }

  // Ambil daftar surveyor unik dari data zona
  function daftarSurveyorUnik(geojson) {
    const himpunan = new Set();
    geojson.features.forEach((fitur) => himpunan.add(dapatkanNamaSurveyor(fitur.properties)));
    return Array.from(himpunan).sort();
  }

  // Warna surveyor deterministik berdasarkan indeks di daftar unik
  function warnaUntukSurveyor(nama) {
    const idx = daftarSurveyor.indexOf(nama);
    return WARNA_SURVEYOR[(idx >= 0 ? idx : 0) % WARNA_SURVEYOR.length];
  }

  // Warna poligon sesuai mode warna aktif
  function warnaPoligon(properties) {
    if (modeWarna === 'status') {
      return WARNA_STATUS[dapatkanStatus(properties)] || '#cccccc';
    }
    return warnaUntukSurveyor(dapatkanNamaSurveyor(properties));
  }

  // ============================================================
  // FUNGSI TAMPILAN
  // ============================================================

  // Gaya poligon Leaflet
  function gayaPoligon(properties) {
    return {
      color: '#333333',
      weight: 1,
      opacity: 0.8,
      fillColor: warnaPoligon(properties),
      fillOpacity: 0.6
    };
  }

  // Popup detail saat zona diklik
  function buatKontenPopup(properties) {
    return (
      `<strong>${properties.ID_ZONA}</strong><br>` +
      `Surveyor: ${dapatkanNamaSurveyor(properties)}<br>` +
      `Status: ${dapatkanStatus(properties)}<br>` +
      `Titik selesai: ${properties.TITIK_SELESAI || 0}<br>` +
      `<div class="popup-actions" aria-label="Ubah status zona">` +
      `<button type="button" data-znt-zona="${properties.ID_ZONA}" data-znt-status="Proses">Mulai</button>` +
      `<button type="button" data-znt-zona="${properties.ID_ZONA}" data-znt-status="Selesai">Selesai</button></div>`
    );
  }

  // Efek hover + klik pada setiap zona
  // Catatan: Leaflet memanggil onEachFeature(feature, layer) — urutan ini penting
  function padaSetiapZona(fitur, layer) {
    const props = fitur.properties;

    layer.on({
      mouseover: (e) => {
        e.target.setStyle({ weight: 3, fillOpacity: 0.85 });
        e.target.bringToFront();
      },
      mouseout: (e) => {
        layerZona.resetStyle(e.target);
      },
      click: (e) => {
        layerZona.resetStyle();
        e.target.setStyle({ weight: 3, fillOpacity: 0.85 });
      }
    });

    layer.bindPopup(buatKontenPopup(props));
  }

  // Render ulang layer zona ke peta
  function renderLayer() {
    if (layerZona) {
      peta.removeLayer(layerZona);
    }
    const dataTampil = filterSurveyor ? { ...dataZona, features: dataZona.features.filter((fitur) => dapatkanNamaSurveyor(fitur.properties) === filterSurveyor) } : dataZona;
    layerZona = L.geoJSON(dataTampil, {
      style: (fitur) => gayaPoligon(fitur.properties),
      onEachFeature: padaSetiapZona
    });
    layerZona.addTo(peta);
  }

  // Perbarui isi legenda sesuai mode warna aktif
  function perbaruiLegenda() {
    const wadah = document.getElementById('mapLegend');
    let html = '';

    if (modeWarna === 'status') {
      html = Object.entries(WARNA_STATUS)
        .map(
          ([nama, warna]) =>
            `<div class="map__legend-item">` +
            `<span class="map__legend-swatch" style="background:${warna}"></span>${nama}</div>`
        )
        .join('');
    } else {
      html = daftarSurveyor
        .map((nama) => {
          const warna = warnaUntukSurveyor(nama);
          return (
            `<div class="map__legend-item">` +
            `<span class="map__legend-swatch" style="background:${warna}"></span>${nama}</div>`
          );
        })
        .join('');
    }

    wadah.innerHTML = html;
  }

  // Ganti mode warna: update gaya tiap poligon + legenda
  function gantiMode(mode) {
    modeWarna = mode;
    if (layerZona) {
      layerZona.eachLayer((lapisan) => {
        lapisan.setStyle(gayaPoligon(lapisan.feature.properties));
      });
    }
    perbaruiLegenda();
  }

  function saringSurveyor(nama) {
    filterSurveyor = nama;
    renderLayer();
  }

  // Tampilkan pesan error jika data gagal dimuat
  function tampilkanPesanError(pesan) {
    const wadah = document.getElementById('map');
    wadah.innerHTML =
      `<div style="padding:20px;color:#d93025;">` +
      `Gagal memuat data zona: ${pesan}</div>`;
  }

  // ============================================================
  // INISIALISASI & PEMUATAN DATA
  // ============================================================

  // Inisialisasi peta Leaflet + basemap OSM
  function initPeta() {
    peta = L.map('map', {
      zoomControl: true,
      tap: true // dukungan sentuh di HP
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(peta);

    // Dengarkan perubahan mode warna dari dropdown
    document.getElementById('colorMode').addEventListener('change', (e) => {
      gantiMode(e.target.value);
    });
    document.addEventListener('click', async (event) => {
      const tombol = event.target.closest('[data-znt-zona]');
      if (!tombol) return;
      const user = window.zntAuth && window.zntAuth.user();
      if (!(window.firebase && user)) return alert('Masuk dengan akun surveyor terlebih dahulu.');
      const fitur = dataZona && dataZona.features.find((f) => f.properties.ID_ZONA === tombol.dataset.zntZona);
      if (!fitur) return;
      try {
        await firebase.firestore().collection('progressZona').doc(tombol.dataset.zntZona).set({
          status: tombol.dataset.zntStatus,
          titikSelesai: Number(fitur.properties.TITIK_SELESAI || 0),
          ownerUid: user.uid,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      } catch (err) { alert(`Progres tidak dapat disimpan: ${err.message}`); }
    });
  }

  // Muat data zona dari file GeoJSON (nanti diganti: Firestore)
  async function muatDataZona(url = 'data/zona.geojson') {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      dataZona = await res.json();

      daftarSurveyor = daftarSurveyorUnik(dataZona);
      renderLayer();

      // Zoom otomatis ke batas seluruh zona
      peta.fitBounds(layerZona.getBounds(), { padding: [20, 20] });

      perbaruiLegenda();
      document.dispatchEvent(new CustomEvent('znt:data-ready', { detail: dataZona }));
      if (window.zntProgress) window.zntProgress.dengarkan(dataZona);
    } catch (err) {
      tampilkanPesanError(err.message);
    }
  }

  // ============================================================
  // API PUBLIK untuk main.js (Langkah 3)
  // ============================================================
  window.petaZNT = {
    muatData: muatDataZona,
    getData: () => dataZona,
    renderUlang: renderLayer,
    gantiMode,
    filterSurveyor: saringSurveyor,
    dapatkanNamaSurveyor,
    dapatkanStatus
  };

  // ---------- Titik masuk ----------
  function mulai() {
    initPeta();
    muatDataZona();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mulai);
  } else {
    mulai();
  }
})();
