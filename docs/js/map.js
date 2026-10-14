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
  const BELUM_DITUGASKAN = 'Belum ditugaskan';
  const WARNA_BELUM_DITUGASKAN = '#d5d8dc';

  let peta = null;
  let layerZona = null;
  let dataZona = null;
  let daftarKategori = [];
  let daftarSurveyor = [];
  let mapSurveyor = new Map();
  let modeWarna = 'surveyor';

  // Di HP, legenda mulai dalam keadaan tertutup
  let legendaTerbuka = !window.matchMedia('(max-width: 768px)').matches;

  // ============================================================
  // FUNGSI LOAD & PARSING DINAMIS
  // ============================================================

  async function fetchWithFallback(candidateUrls) {
    let lastError = null;
    for (const url of candidateUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) return res;
      } catch (err) {
        lastError = err;
      }
    }
    throw new Error(`Gagal memuat berkas dari: ${candidateUrls.join(' atau ')} (${lastError ? lastError.message : 'HTTP Error'})`);
  }

  // Konversi HSL ke Hex untuk warna dinamis berkualitas tinggi
  function hslToHex(h, s, l) {
    l /= 100;
    const a = (s * Math.min(l, 1 - l)) / 100;
    const f = (n) => {
      const k = (n + h / 30) % 12;
      const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
      return Math.round(255 * color).toString(16).padStart(2, '0');
    };
    return `#${f(0)}${f(8)}${f(4)}`;
  }

  // Golden angle (~137.508 derajat) mendistribusikan warna saling kontras berurutan
  function hasilkanWarnaDinamis(index, total) {
    const hue = Math.round((index * 137.508) % 360);
    return hslToHex(hue, 72, 50);
  }

  // Parser CSV dinamis untuk surveyor.csv (sumber tunggal surveyor)
  function parseSurveyorCSV(csvText) {
    if (csvText.charCodeAt(0) === 0xfeff) {
      csvText = csvText.slice(1);
    }
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let headerIdx = -1;
    let delim = ';';
    let headers = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.replace(/^[;\s,]+|[;\s,]+$/g, '').length === 0) continue;
      if (line.startsWith('#')) continue;

      const countSemi = (line.match(/;/g) || []).length;
      const countComma = (line.match(/,/g) || []).length;
      const d = countSemi >= countComma ? ';' : ',';
      const cols = line.split(d).map((c) => c.trim().toLowerCase());

      if (cols.some((c) => c === 'nama' || c === 'nama surveyor' || c === 'name' || c === 'surveyor')) {
        headerIdx = i;
        delim = d;
        headers = cols;
        break;
      }
    }

    const idIdx = headers.findIndex((h) => h === 'no.' || h === 'no' || h === 'id' || h === 'no_surveyor');
    const namaIdx = headers.findIndex((h) => h === 'nama' || h === 'nama surveyor' || h === 'name' || h === 'surveyor');
    const warnaIdx = headers.findIndex((h) => h.includes('warna') || h.includes('color') || h.includes('hex'));
    const zonaIdx = headers.findIndex((h) => h.includes('zona') || h.includes('zone'));

    const list = [];
    const startRow = headerIdx >= 0 ? headerIdx + 1 : 0;

    for (let i = startRow; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.startsWith('#')) continue;
      const cols = line.split(delim).map((c) => c.trim());
      const nama = (namaIdx >= 0 ? cols[namaIdx] : cols[1]) || '';
      if (!nama || nama.toLowerCase().includes('data surveyor')) continue;

      const id = (idIdx >= 0 && cols[idIdx]) ? cols[idIdx] : String(list.length + 1);
      const warna = (warnaIdx >= 0 && cols[warnaIdx]) ? cols[warnaIdx] : null;
      const zonaId = (zonaIdx >= 0 && cols[zonaIdx]) ? cols[zonaIdx] : null;

      list.push({ id, nama, warna, zonaId });
    }

    return list;
  }

  function inisialisasiSurveyorMap(surveyorList) {
    mapSurveyor.clear();
    surveyorList.forEach((s, idx) => {
      // Prioritaskan warna dari CSV jika ada; jika tidak ada, hasilkan warna dinamis unik
      const warna = s.warna || hasilkanWarnaDinamis(idx, surveyorList.length);
      mapSurveyor.set(s.nama.trim().toLowerCase(), {
        id: s.id,
        nama: s.nama,
        warna: warna,
        zones: s.zonaId ? [s.zonaId] : []
      });
    });
  }

  // Join Master_Zona.geojson dengan surveyor.csv
  function tautkanSurveyorDanZona(geojson) {
    geojson.features.forEach((f) => {
      const props = f.properties || {};
      if (!props.ID_ZONA && props.Zona_ID) props.ID_ZONA = props.Zona_ID;
      if (!props.Zona_ID && props.ID_ZONA) props.Zona_ID = props.ID_ZONA;
      if (!props.SURVEYOR && props.Surveyor) props.SURVEYOR = props.Surveyor;
      if (!props.Surveyor && props.SURVEYOR) props.Surveyor = props.SURVEYOR;
      const namaSurveyor = (props.Surveyor || props.SURVEYOR || '').trim();
      const idZona = String(props.Zona_ID || props.ID_ZONA || '').trim().toUpperCase();

      let surveyorObj = mapSurveyor.get(namaSurveyor.toLowerCase());
      if (!surveyorObj && namaSurveyor) {
        // Surveyor baru di GeoJSON otomatis diakomodasi tanpa edit kode
        const warnaBaru = hasilkanWarnaDinamis(mapSurveyor.size, mapSurveyor.size + 1);
        surveyorObj = {
          id: String(mapSurveyor.size + 1),
          nama: namaSurveyor,
          warna: warnaBaru,
          zones: []
        };
        mapSurveyor.set(namaSurveyor.toLowerCase(), surveyorObj);
      }

      if (surveyorObj) {
        if (idZona && !surveyorObj.zones.includes(idZona)) {
          surveyorObj.zones.push(idZona);
        }
        props._surveyorNama = surveyorObj.nama;
        props._surveyorWarna = surveyorObj.warna;
      } else {
        props._surveyorNama = BELUM_DITUGASKAN;
        props._surveyorWarna = WARNA_BELUM_DITUGASKAN;
      }
    });

    daftarSurveyor = Array.from(mapSurveyor.values()).map((s) => s.nama).sort();

    // Sinkronkan ke API global surveyor jika ada
    if (window.zntSurveyor) {
      window.zntSurveyor.getSurveyorByZone = (zoneId) => {
        const id = String(zoneId || '').trim().toUpperCase();
        for (const s of mapSurveyor.values()) {
          if (s.zones && s.zones.includes(id)) {
            return { displayName: s.nama, nama: s.nama, ...s };
          }
        }
        return null;
      };
      window.zntSurveyor.getAllSurveyors = () => Array.from(mapSurveyor.values());
    }
  }

  // ============================================================
  // FUNGSI DATA
  // ============================================================

  // Kategori dibaca dari kolom GeoJSON PENGGUNAAN (pertanian / non-pertanian)
  function dapatkanKategori(properties) {
    const val = properties.PENGGUNAAN ?? properties.penggunaan ?? properties.KATEGORI;
    if (val == null || String(val).trim() === '') {
      return '-';
    }
    return String(val).trim();
  }

  function dapatkanStatus(properties) {
    if (properties._FIRESTORE_VERIFIED === false) {
      return 'Belum diverifikasi';
    }
    return properties.STATUS || properties.status || 'Belum';
  }

  function dapatkanSurveyor(properties) {
    if (properties._surveyorNama) return properties._surveyorNama;
    const sName = (properties.Surveyor || properties.SURVEYOR || '').trim();
    if (sName) {
      const match = mapSurveyor.get(sName.toLowerCase());
      if (match) return match.nama;
      return sName;
    }
    const idZona = String(properties.Zona_ID || properties.ID_ZONA || '').trim().toUpperCase();
    for (const s of mapSurveyor.values()) {
      if (s.zones && s.zones.includes(idZona)) return s.nama;
    }
    return BELUM_DITUGASKAN;
  }

  function daftarKategoriUnik(geojson) {
    const himpunan = new Set();
    geojson.features.forEach((f) => himpunan.add(dapatkanKategori(f.properties)));
    return Array.from(himpunan).sort();
  }

  function daftarSurveyorUnik(geojson) {
    return Array.from(mapSurveyor.values()).map((s) => s.nama).sort();
  }

  const WARNA_KATEGORI_MAP = {
    'Pertanian': '#2e7d32',
    'Non-Pertanian': '#c67d0a',
    '-': '#9e9e9e'
  };

  function warnaUntukKategori(nama) {
    if (WARNA_KATEGORI_MAP[nama]) return WARNA_KATEGORI_MAP[nama];
    const idx = daftarKategori.indexOf(nama);
    return WARNA_KATEGORI[(idx >= 0 ? idx : 0) % WARNA_KATEGORI.length];
  }

  function warnaUntukSurveyor(nama) {
    if (nama === BELUM_DITUGASKAN) return WARNA_BELUM_DITUGASKAN;
    const match = mapSurveyor.get(String(nama).trim().toLowerCase());
    if (match && match.warna) return match.warna;
    return WARNA_BELUM_DITUGASKAN;
  }

  function warnaPoligon(properties) {
    if (modeWarna === 'status') {
      return WARNA_STATUS[dapatkanStatus(properties)] || '#cccccc';
    }
    if (modeWarna === 'surveyor') {
      return properties._surveyorWarna || warnaUntukSurveyor(dapatkanSurveyor(properties));
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
    const idZona = properties.Zona_ID || properties.ID_ZONA || '-';
    const titik = (properties._FIRESTORE_VERIFIED === false || properties.TITIK_SELESAI == null)
      ? 'Belum tersedia'
      : String(properties.TITIK_SELESAI);
    const surveyor = dapatkanSurveyor(properties);
    const status = dapatkanStatus(properties);
    const warnaSt = WARNA_STATUS[status] || '#cccccc';

    return (
      `<div style="min-width:180px;line-height:1.5">` +
      `<strong style="font-size:1.05em">Zona ${aman(idZona)}</strong><br>` +
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

  async function muatDataZona() {
    try {
      // 1. Muat surveyor.csv sebagai sumber tunggal surveyor & warna
      const resCsv = await fetchWithFallback([
        '../data/list_surveyor/surveyor.csv',
        'data/list_surveyor/surveyor.csv',
        'public-data/surveyor.csv'
      ]);
      const csvText = await resCsv.text();
      const listSurveyor = parseSurveyorCSV(csvText);
      inisialisasiSurveyorMap(listSurveyor);

      // 2. Muat Master_Zona.geojson sebagai sumber tunggal geometri & atribut zona
      const resGeo = await fetchWithFallback([
        '../data/geojson/Master_Zona.geojson',
        'data/geojson/Master_Zona.geojson',
        'public-data/Master_Zona.geojson',
        'public-data/public-zona.geojson'
      ]);
      dataZona = await resGeo.json();

      // Terapkan override dari Admin (localStorage / IndexedDB) jika ada
      if (window.zntSync) {
        window.zntSync.applyOverridesToGeoJSON(dataZona);
      }

      // 3. Tautkan (join) data poligon zona dengan data surveyor
      tautkanSurveyorDanZona(dataZona);
      daftarKategori = daftarKategoriUnik(dataZona);

      // 4. Render seluruh polygon ke peta Leaflet
      renderLayer();

      if (layerZona && layerZona.getBounds && layerZona.getBounds().isValid()) {
        peta.fitBounds(layerZona.getBounds(), { padding: [20, 20] });
      }

      perbaruiLegenda();
      document.dispatchEvent(new CustomEvent('znt:data-ready', { detail: dataZona }));
      if (window.zntProgress) window.zntProgress.dengarkan(dataZona);
    } catch (err) {
      console.error('Error memuat data peta ZNT:', err);
      tampilkanPesanError(err.message);
    }
  }

  function tampilkanToastSinkronisasi(pesan) {
    let toast = document.getElementById('zntSyncToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'zntSyncToast';
      toast.style.cssText = 'position:fixed;bottom:24px;left:24px;background:rgba(0,122,255,0.92);backdrop-filter:blur(10px);color:#fff;padding:12px 20px;border-radius:14px;box-shadow:0 8px 30px rgba(0,0,0,0.28);z-index:99999;font-weight:600;font-size:14px;transition:opacity 0.4s ease,transform 0.4s ease;opacity:0;transform:translateY(12px);pointer-events:none;';
      document.body.appendChild(toast);
    }
    toast.textContent = pesan;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(12px)';
    }, 3500);
  }

  // Listener sinkronisasi realtime dari Admin (tanpa reload halaman)
  if (window.zntSync) {
    window.zntSync.onSyncUpdate((msg) => {
      if (!dataZona) return;
      window.zntSync.applyOverridesToGeoJSON(dataZona);
      tautkanSurveyorDanZona(dataZona);
      daftarKategori = daftarKategoriUnik(dataZona);
      daftarSurveyor = daftarSurveyorUnik(dataZona);
      renderLayer();
      perbaruiLegenda();
      document.dispatchEvent(new CustomEvent('znt:data-ready', { detail: dataZona }));
      document.dispatchEvent(new CustomEvent('znt:progress-changed', { detail: dataZona }));
      tampilkanToastSinkronisasi('Data zona & surveyor diperbarui dari Admin!');
    });
  }

  // Data surveyor berubah: hitung ulang warna, legenda, grafik
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