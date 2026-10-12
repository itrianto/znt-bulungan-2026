/* ============================================================
   js/map.js - Peta interaktif ZNT
   - Muat public-zona.geojson, tampilkan sebagai poligon
   - Mode warna: per surveyor / per status
   - Surveyor diambil dari Firestore (surveyorPublic), cadangan GeoJSON
   - Popup dihitung saat dibuka, jadi selalu memakai data terbaru
   - Legenda dapat diminimize (mulai tertutup di HP)
   ============================================================ */

(function () {
  'use strict';

  const WARNA_STATUS = {
    'Belum diverifikasi': '#bdc1c6',
    Belum: '#9aa0a6',
    Proses: '#fbbc04',
    Selesai: '#34a853',
    Masalah: '#d9534f'
  };

  const WARNA_KATEGORI = ['#c46b4e'];

  const WARNA_SURVEYOR = [
    '#c46b4e', '#e07856', '#f4a261', '#e9c46a',
    '#8ab17d', '#6a9f8f', '#5d7fa3', '#8b7fa8'
  ];

  const BELUM_DITUGASKAN = 'Belum ditugaskan';
  const WARNA_BELUM_DITUGASKAN = '#d5d8dc';

  let peta = null;
  let layerZona = null;
  let dataZona = null;
  let daftarKategori = [];
  let daftarSurveyor = [];
  let modeWarna = 'surveyor';

  // Di HP, legenda mulai dalam keadaan tertutup
  let legendaTerbuka = !window.matchMedia('(max-width: 768px)').matches;

  // ============================================================
  // FUNGSI DATA
  // ============================================================

  function dapatkanKategori(properties) {
    return properties.KATEGORI || 'Zona publik';
  }

  function dapatkanStatus(properties) {
    if (properties._FIRESTORE_VERIFIED === false) {
      return 'Belum diverifikasi';
    }
    return properties.STATUS || 'Belum';
  }

  // Prioritas: Firestore (surveyorPublic), lalu GeoJSON, lalu "Belum ditugaskan"
  function dapatkanSurveyor(properties) {
    const idZona = String(properties.ID_ZONA || '').trim().toUpperCase();
    const s = window.zntSurveyor && window.zntSurveyor.getSurveyorByZone(idZona);
    if (s && s.displayName) return s.displayName;
    return properties.SURVEYOR || BELUM_DITUGASKAN;
  }

  function daftarKategoriUnik(geojson) {
    const himpunan = new Set();
    geojson.features.forEach((f) => himpunan.add(dapatkanKategori(f.properties)));
    return Array.from(himpunan).sort();
  }

  // "Belum ditugaskan" tidak ikut daftar, supaya tidak menggeser warna surveyor lain
  function daftarSurveyorUnik(geojson) {
    const himpunan = new Set();
    geojson.features.forEach((f) => {
      const nama = dapatkanSurveyor(f.properties);
      if (nama !== BELUM_DITUGASKAN) himpunan.add(nama);
    });
    return Array.from(himpunan).sort();
  }

  function warnaUntukKategori(nama) {
    const idx = daftarKategori.indexOf(nama);
    return WARNA_KATEGORI[(idx >= 0 ? idx : 0) % WARNA_KATEGORI.length];
  }

  function warnaUntukSurveyor(nama) {
    if (nama === BELUM_DITUGASKAN) return WARNA_BELUM_DITUGASKAN;
    const idx = daftarSurveyor.indexOf(nama);
    return WARNA_SURVEYOR[(idx >= 0 ? idx : 0) % WARNA_SURVEYOR.length];
  }

  function warnaPoligon(properties) {
    if (modeWarna === 'status') {
      return WARNA_STATUS[dapatkanStatus(properties)] || '#cccccc';
    }
    if (modeWarna === 'surveyor') {
      return warnaUntukSurveyor(dapatkanSurveyor(properties));
    }
    return warnaUntukKategori(dapatkanKategori(properties));
  }

  // ============================================================
  // FUNGSI TAMPILAN
  // ============================================================

  function gayaPoligon(properties) {
    return {
      color: '#333333',
      weight: 1,
      opacity: 0.8,
      fillColor: warnaPoligon(properties),
      fillOpacity: 0.6
    };
  }

  function aman(teks) {
    const el = document.createElement('div');
    el.textContent = teks == null ? '' : String(teks);
    return el.innerHTML;
  }

  // Dipanggil setiap kali popup dibuka, jadi isinya selalu terbaru
  function buatKontenPopup(properties) {
    const titik = (properties._FIRESTORE_VERIFIED === false || properties.TITIK_SELESAI == null)
      ? 'Belum tersedia'
      : String(properties.TITIK_SELESAI);
    const surveyor = dapatkanSurveyor(properties);
    const status = dapatkanStatus(properties);
    const warnaSt = WARNA_STATUS[status] || '#cccccc';

    return (
      `<div style="min-width:180px;line-height:1.5">` +
      `<strong style="font-size:1.05em">Zona ${aman(properties.ID_ZONA)}</strong><br>` +
      `<span style="color:#5f6368">Kategori:</span> ${aman(dapatkanKategori(properties))}<br>` +
      `<span style="color:#5f6368">Surveyor ditugaskan:</span> <strong>${aman(surveyor)}</strong><br>` +
      `<span style="color:#5f6368">Status:</span> ` +
      `<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${warnaSt};margin-right:4px"></span>${aman(status)}<br>` +
      `<span style="color:#5f6368">Titik selesai:</span> ${aman(titik)}` +
      `</div>`
    );
  }

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

    // Fungsi, bukan teks tetap: isi dihitung ulang saat popup dibuka
    layer.bindPopup(() => buatKontenPopup(props));
  }

  function renderLayer() {
    if (layerZona) {
      peta.removeLayer(layerZona);
    }
    layerZona = L.geoJSON(dataZona, {
      style: (fitur) => gayaPoligon(fitur.properties),
      onEachFeature: padaSetiapZona
    });
    layerZona.addTo(peta);
  }

  function itemLegenda(nama, warna) {
    return (
      `<div class="map__legend-item">` +
      `<span class="map__legend-swatch" style="background:${warna}"></span>${aman(nama)}</div>`
    );
  }

  function perbaruiLegenda() {
    const wadah = document.getElementById('mapLegend');
    if (!wadah) return;
    let html = '';

    if (modeWarna === 'status') {
      html = Object.entries(WARNA_STATUS)
        .map(([nama, warna]) => itemLegenda(nama, warna))
        .join('');
    } else if (modeWarna === 'surveyor') {
      html = daftarSurveyor
        .map((nama) => itemLegenda(nama, warnaUntukSurveyor(nama)))
        .join('');
      // Tampilkan "Belum ditugaskan" hanya jika memang ada zona seperti itu
      if (dataZona && dataZona.features.some((f) => dapatkanSurveyor(f.properties) === BELUM_DITUGASKAN)) {
        html += itemLegenda(BELUM_DITUGASKAN, WARNA_BELUM_DITUGASKAN);
      }
    } else {
      html = daftarKategori
        .map((nama) => itemLegenda(nama, warnaUntukKategori(nama)))
        .join('');
    }

    wadah.innerHTML =
      `<button type="button" class="map__legend-toggle" aria-expanded="${legendaTerbuka}" aria-controls="mapLegendBody">` +
      `<span>Legenda</span><span class="map__legend-chevron" aria-hidden="true">&#9662;</span></button>` +
      `<div class="map__legend-body" id="mapLegendBody">${html}</div>`;
    wadah.classList.toggle('is-collapsed', !legendaTerbuka);
  }

  function gantiMode(mode) {
    modeWarna = mode;
    if (layerZona) {
      layerZona.eachLayer((lapisan) => {
        lapisan.setStyle(gayaPoligon(lapisan.feature.properties));
      });
    }
    perbaruiLegenda();
  }

  function tampilkanPesanError(pesan) {
    const wadah = document.getElementById('map');
    wadah.innerHTML =
      `<div style="padding:20px;color:#d93025;">` +
      `Gagal memuat data zona: ${aman(pesan)}</div>`;
  }

  // ============================================================
  // INISIALISASI & PEMUATAN DATA
  // ============================================================

  function initPeta() {
    peta = L.map('map', {
      zoomControl: true,
      tap: true
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    }).addTo(peta);

    document.getElementById('colorMode').addEventListener('change', (e) => {
      gantiMode(e.target.value);
    });

    const wadahLegenda = document.getElementById('mapLegend');
    if (wadahLegenda) {
      // Klik legenda tidak ikut menggeser atau mengklik peta
      L.DomEvent.disableClickPropagation(wadahLegenda);
      L.DomEvent.disableScrollPropagation(wadahLegenda);
      wadahLegenda.addEventListener('click', (e) => {
        if (!e.target.closest('.map__legend-toggle')) return;
        legendaTerbuka = !legendaTerbuka;
        perbaruiLegenda();
      });
    }
  }

  async function muatDataZona(url = 'public-data/public-zona.geojson') {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      dataZona = await res.json();

      daftarKategori = daftarKategoriUnik(dataZona);
      daftarSurveyor = daftarSurveyorUnik(dataZona);
      renderLayer();

      peta.fitBounds(layerZona.getBounds(), { padding: [20, 20] });

      perbaruiLegenda();
      document.dispatchEvent(new CustomEvent('znt:data-ready', { detail: dataZona }));
      if (window.zntProgress) window.zntProgress.dengarkan(dataZona);
    } catch (err) {
      tampilkanPesanError(err.message);
    }
  }

  // Data surveyor berubah (Firestore): hitung ulang warna, legenda, grafik
  function segarkanSurveyor() {
    if (!dataZona || !layerZona) return;
    daftarSurveyor = daftarSurveyorUnik(dataZona);
    layerZona.eachLayer((l) => {
      l.setStyle(gayaPoligon(l.feature.properties));
    });
    perbaruiLegenda();
    if (window.grafikZNT && window.grafikZNT.renderSurveyor) {
      window.grafikZNT.renderSurveyor(dataZona);
    }
  }

  document.addEventListener('surveyors:updated', segarkanSurveyor);

  // ============================================================
  // API PUBLIK
  // ============================================================
  window.petaZNT = {
    muatData: muatDataZona,
    getData: () => dataZona,
    renderUlang: renderLayer,
    gantiMode,
    dapatkanKategori,
    dapatkanStatus,
    dapatkanSurveyor
  };

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