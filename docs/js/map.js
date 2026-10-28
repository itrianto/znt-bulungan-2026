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
  let layerOSM = null;
  let layerSatelit = null;
  let basemapAktif = 'osm';

  let dataTitik = [];
  let layerTitik = null;
  let filterTitik = 'all'; // 'all' | 'pertanian' | 'non_pertanian'
  let canvasRendererTitik = null;

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

  // Parser CSV untuk Sebaran Titik Survei (pertanian & non-pertanian)
  function parseTitikCSV(csvText, jenis) {
    if (csvText.charCodeAt(0) === 0xfeff) csvText = csvText.slice(1);
    const lines = csvText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    const header = lines[0].split(',').map((h) => h.trim().toLowerCase());
    const idxNo = header.findIndex((h) => h.includes('sampel') || h.includes('no') || h.includes('id'));
    const idxSurveyor = header.findIndex((h) => h.includes('penilai') || h.includes('surveyor') || h.includes('nama'));
    const idxLat = header.findIndex((h) => h === 'lat' || h.includes('latitude') || h.includes('lintang') || h === 'y');
    const idxLon = header.findIndex((h) => h === 'lon' || h.includes('longitude') || h.includes('bujur') || h === 'x');
    const idxStatus = header.findIndex((h) => h.includes('status'));

    const list = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.trim());
      if (cols.length < 4) continue;
      const lat = parseFloat(idxLat >= 0 ? cols[idxLat] : cols[2]);
      const lon = parseFloat(idxLon >= 0 ? cols[idxLon] : cols[3]);
      if (isNaN(lat) || isNaN(lon)) continue;

      const noSampel = (idxNo >= 0 ? cols[idxNo] : cols[0]) || String(i);
      const surveyor = (idxSurveyor >= 0 ? cols[idxSurveyor] : cols[1]) || '-';
      const status = (idxStatus >= 0 ? cols[idxStatus] : cols[4]) || 'Disetujui';

      list.push({
        noSampel,
        surveyor,
        lat,
        lon,
        status,
        jenis
      });
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

  // Normalisasi nama untuk pencocokan (huruf kecil, tanpa tanda baca/spasi ganda)
  function normalisasiNama(nama) {
    return String(nama || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function jarakEdit(a, b) {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i]);
    for (let j = 1; j <= b.length; j++) dp[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1,
          dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
        );
      }
    }
    return dp[a.length][b.length];
  }

  // Cocokkan nama dari GeoJSON/override ke entri surveyor.csv (toleran salah ketik kecil).
  // Mengembalikan null jika tidak ada yang cocok: tidak pernah membuat surveyor baru.
  function cocokkanSurveyor(nama) {
    const kunci = normalisasiNama(nama);
    if (!kunci) return null;
    let terbaik = null;
    let jarakTerbaik = Infinity;
    let seri = false;
    for (const s of mapSurveyor.values()) {
      const kandidat = normalisasiNama(s.nama);
      if (kandidat === kunci) return s;
      const d = jarakEdit(kunci, kandidat);
      if (d < jarakTerbaik) { jarakTerbaik = d; terbaik = s; seri = false; }
      else if (d === jarakTerbaik) seri = true;
    }
    return (jarakTerbaik <= 2 && !seri) ? terbaik : null;
  }

  // Join Master_Zona.geojson dengan surveyor.csv (surveyor.csv = sumber tunggal daftar surveyor)
  function tautkanSurveyorDanZona(geojson) {
    // Reset penugasan agar tidak menumpuk saat sinkronisasi ulang
    mapSurveyor.forEach((s) => { s.zones = []; });
    geojson.features.forEach((f) => {
      const props = f.properties || {};
      if (!props.ID_ZONA && props.Zona_ID) props.ID_ZONA = props.Zona_ID;
      if (!props.Zona_ID && props.ID_ZONA) props.Zona_ID = props.ID_ZONA;
      if (!props.SURVEYOR && props.Surveyor) props.SURVEYOR = props.Surveyor;
      if (!props.Surveyor && props.SURVEYOR) props.Surveyor = props.SURVEYOR;
      const namaSurveyor = (props.Surveyor || props.SURVEYOR || '').trim();
      const idZona = String(props.Zona_ID || props.ID_ZONA || '').trim().toUpperCase();

      const surveyorObj = cocokkanSurveyor(namaSurveyor);

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

    daftarSurveyor = Array.from(mapSurveyor.values()).map((s) => s.nama); // urutan surveyor.csv

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
      const match = cocokkanSurveyor(sName);
      return match ? match.nama : BELUM_DITUGASKAN;
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
    return Array.from(mapSurveyor.values()).map((s) => s.nama); // urutan surveyor.csv
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
    if (modeWarna === 'titik') {
      return {
        color: '#2c3e50',
        weight: 1.2,
        opacity: 0.6,
        fillColor: '#95a5a6',
        fillOpacity: 0.12
      };
    }
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
        if (modeWarna === 'titik') {
          e.target.setStyle({ weight: 2, fillOpacity: 0.18 });
          return;
        }
        e.target.setStyle({ weight: 3, fillOpacity: 0.85 });
        e.target.bringToFront();
      },
      mouseout: (e) => {
        layerZona.resetStyle(e.target);
      },
      click: (e) => {
        if (modeWarna === 'titik') return;
        layerZona.resetStyle();
        e.target.setStyle({ weight: 3, fillOpacity: 0.85 });
      }
    });

    // Fungsi, bukan teks tetap: isi dihitung ulang saat popup dibuka (nonaktif di mode titik agar popup titik diprioritaskan)
    layer.bindPopup(() => {
      if (modeWarna === 'titik') return null;
      return buatKontenPopup(props);
    });
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

  // ============================================================
  // FUNGSI SEBARAN TITIK SURVEI
  // ============================================================

  function dapatkanTitikTampil() {
    if (filterTitik === 'pertanian') {
      return dataTitik.filter((t) => t.jenis === 'Pertanian');
    }
    if (filterTitik === 'non_pertanian') {
      return dataTitik.filter((t) => t.jenis === 'Non-Pertanian');
    }
    return dataTitik;
  }

  function buatKontenPopupTitik(t) {
    const isDisetujui = String(t.status).toLowerCase().includes('setuju');
    const badgeColor = isDisetujui ? '#34a853' : '#d9534f';
    return (
      `<div style="min-width:185px;line-height:1.5">` +
      `<strong style="font-size:1.05em">Sampel #${aman(t.noSampel)}</strong><br>` +
      `<span style="color:#5f6368">Penilai Tanah:</span> <strong>${aman(t.surveyor)}</strong><br>` +
      `<span style="color:#5f6368">Jenis:</span> <strong>${aman(t.jenis)}</strong><br>` +
      `<span style="color:#5f6368">Status:</span> ` +
      `<span style="display:inline-block;padding:2px 8px;border-radius:6px;font-size:0.82em;font-weight:600;color:#fff;background:${badgeColor}">${aman(t.status)}</span><br>` +
      `<span style="color:#5f6368;font-size:0.85em">📍 ${t.lat.toFixed(6)}, ${t.lon.toFixed(6)}</span>` +
      `</div>`
    );
  }

  function renderTitikLayer() {
    if (!peta) return;
    if (layerTitik) {
      peta.removeLayer(layerTitik);
      layerTitik.clearLayers();
    } else {
      layerTitik = L.layerGroup();
    }

    if (modeWarna === 'titik') {
      const list = dapatkanTitikTampil();
      list.forEach((t) => {
        const isDisetujui = String(t.status).toLowerCase().includes('setuju');
        const badgeColor = isDisetujui ? '#34a853' : '#d9534f';
        let marker;

        if (t.jenis === 'Pertanian') {
          // Bentuk LINGKARAN untuk Pertanian
          const circleIcon = L.divIcon({
            className: 'custom-point-marker point-circle',
            html: `<svg width="14" height="14" viewBox="0 0 16 16" style="display:block;cursor:pointer;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.45));">
              <circle cx="8" cy="8" r="6" fill="${badgeColor}" stroke="#ffffff" stroke-width="1.8"/>
            </svg>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
            popupAnchor: [0, -8]
          });
          marker = L.marker([t.lat, t.lon], { icon: circleIcon, pane: 'titikPane' });
        } else {
          // Bentuk SEGITIGA untuk Non-Pertanian
          const triangleIcon = L.divIcon({
            className: 'custom-point-marker point-triangle',
            html: `<svg width="16" height="16" viewBox="0 0 16 16" style="display:block;cursor:pointer;filter:drop-shadow(0 1px 2px rgba(0,0,0,0.5));">
              <polygon points="8,1 15.5,14.5 0.5,14.5" fill="${badgeColor}" stroke="#ffffff" stroke-width="1.8" stroke-linejoin="round"/>
            </svg>`,
            iconSize: [16, 16],
            iconAnchor: [8, 8],
            popupAnchor: [0, -9]
          });
          marker = L.marker([t.lat, t.lon], { icon: triangleIcon, pane: 'titikPane' });
        }

        marker.bindPopup(() => buatKontenPopupTitik(t));
        layerTitik.addLayer(marker);
      });

      layerTitik.addTo(peta);
    }
  }

  function gantiFilterTitik(kategori) {
    filterTitik = kategori;
    renderTitikLayer();
    perbaruiLegenda();
  }

  async function muatDataTitik() {
    try {
      const urlsPertanian = [
        '../data/geojson/sebaran_titik/titik_pertanian.csv',
        'data/geojson/sebaran_titik/titik_pertanian.csv',
        'public-data/sebaran_titik/titik_pertanian.csv?v=2'
      ];
      const urlsNonPertanian = [
        '../data/geojson/sebaran_titik/titik_non_pertanian.csv',
        'data/geojson/sebaran_titik/titik_non_pertanian.csv',
        'public-data/sebaran_titik/titik_non_pertanian.csv?v=2'
      ];

      const [resP, resNP] = await Promise.all([
        fetchWithFallback(urlsPertanian).then((r) => r.text()).catch((e) => { console.warn(e); return ''; }),
        fetchWithFallback(urlsNonPertanian).then((r) => r.text()).catch((e) => { console.warn(e); return ''; })
      ]);

      const titikP = resP ? parseTitikCSV(resP, 'Pertanian') : [];
      const titikNP = resNP ? parseTitikCSV(resNP, 'Non-Pertanian') : [];

      dataTitik = [...titikP, ...titikNP];

      const optAll = document.querySelector('#pointFilterSelect option[value="all"]');
      const optP = document.querySelector('#pointFilterSelect option[value="pertanian"]');
      const optNP = document.querySelector('#pointFilterSelect option[value="non_pertanian"]');
      if (optAll) optAll.textContent = `Semua Titik (${dataTitik.length})`;
      if (optP) optP.textContent = `Pertanian (${titikP.length})`;
      if (optNP) optNP.textContent = `Non-Pertanian (${titikNP.length})`;

      renderTitikLayer();
    } catch (err) {
      console.warn('Data sebaran titik survei belum tersedia:', err.message);
    }
  }

  // ============================================================
  // LEGENDA & KONTROL PETA
  // ============================================================

  function perbaruiLegenda() {
    const wadah = document.getElementById('mapLegend');
    if (!wadah) return;
    let html = '';

    if (modeWarna === 'titik') {
      const titikTampil = dapatkanTitikTampil();
      const disetujuiCount = titikTampil.filter((t) => String(t.status).toLowerCase().includes('setuju')).length;
      const ditolakCount = titikTampil.filter((t) => String(t.status).toLowerCase().includes('tolak')).length;
      html =
        `<div style="font-weight:700;margin-bottom:6px;font-size:0.75rem;color:var(--text-sub)">STATUS TITIK (${titikTampil.length})</div>` +
        itemLegenda(`Disetujui (${disetujuiCount})`, '#34a853') +
        itemLegenda(`Ditolak (${ditolakCount})`, '#d9534f') +
        `<div style="font-weight:700;margin:8px 0 4px;font-size:0.75rem;color:var(--text-sub)">BENTUK JENIS</div>` +
        `<div class="map__legend-item"><span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;margin-right:7px;"><svg width="14" height="14" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#34a853" stroke="#fff" stroke-width="1.8"/></svg></span>Pertanian (Lingkaran)</div>` +
        `<div class="map__legend-item"><span style="display:inline-flex;align-items:center;justify-content:center;width:14px;height:14px;margin-right:7px;"><svg width="14" height="14" viewBox="0 0 16 16"><polygon points="8,1 15.5,14.5 0.5,14.5" fill="#34a853" stroke="#fff" stroke-width="1.8"/></svg></span>Non-Pertanian (Segitiga)</div>`;
    } else if (modeWarna === 'status') {
      html = Object.entries(WARNA_STATUS)
        .map(([nama, warna]) => itemLegenda(nama, warna))
        .join('');
    } else if (modeWarna === 'surveyor') {
      html = daftarSurveyor
        .map((nama) => itemLegenda(nama, warnaUntukSurveyor(nama)))
        .join('');
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
    const jumlahItem = (html.match(/map__legend-item/g) || []).length;
    wadah.classList.toggle('map__legend--grid', jumlahItem > 8);
  }

  function gantiMode(mode) {
    modeWarna = mode;

    const pointFilterRow = document.getElementById('pointFilterRow');
    if (pointFilterRow) pointFilterRow.style.display = (mode === 'titik' ? 'flex' : 'none');

    if (layerZona) {
      layerZona.eachLayer((lapisan) => {
        lapisan.setStyle(gayaPoligon(lapisan.feature.properties));
      });
    }
    renderTitikLayer();
    perbaruiLegenda();
  }

  function gantiBasemap(tipe) {
    basemapAktif = tipe;
    if (tipe === 'satellite') {
      if (layerOSM && peta.hasLayer(layerOSM)) peta.removeLayer(layerOSM);
      if (layerSatelit && !peta.hasLayer(layerSatelit)) peta.addLayer(layerSatelit);
    } else {
      if (layerSatelit && peta.hasLayer(layerSatelit)) peta.removeLayer(layerSatelit);
      if (layerOSM && !peta.hasLayer(layerOSM)) peta.addLayer(layerOSM);
    }
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

    // Custom pane khusus untuk titik survei (z-index 650 agar selalu di atas poligon zona)
    if (!peta.getPane('titikPane')) {
      const titikPane = peta.createPane('titikPane');
      titikPane.style.zIndex = '650';
    }

    // Peta Jalan (OSM)
    layerOSM = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution:
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19
    });

    // Peta Satelit (Esri World Imagery + batas jalan & wilayah)
    const esriImagery = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 19
    });
    const esriLabels = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19
    });
    layerSatelit = L.layerGroup([esriImagery, esriLabels]);

    // Default aktif: Peta Jalan (OSM)
    layerOSM.addTo(peta);

    // Event listener basemap
    const selBasemap = document.getElementById('baseMapSelect');
    if (selBasemap) {
      selBasemap.addEventListener('change', (e) => {
        gantiBasemap(e.target.value);
      });
    }

    // Event listener tampilan
    const selColorMode = document.getElementById('colorMode');
    if (selColorMode) {
      selColorMode.addEventListener('change', (e) => {
        gantiMode(e.target.value);
      });
    }

    // Event listener filter kategori titik
    const selPointFilter = document.getElementById('pointFilterSelect');
    if (selPointFilter) {
      selPointFilter.addEventListener('change', (e) => {
        gantiFilterTitik(e.target.value);
      });
    }

    // Kontrol Peta (Toggle Minimize)
    let kontrolTerbuka = !window.matchMedia('(max-width: 768px)').matches;
    const wadahKontrol = document.getElementById('mapControls');
    if (wadahKontrol) {
      L.DomEvent.disableClickPropagation(wadahKontrol);
      L.DomEvent.disableScrollPropagation(wadahKontrol);
      const btnToggle = document.getElementById('mapControlsToggle');
      if (btnToggle) {
        wadahKontrol.classList.toggle('is-collapsed', !kontrolTerbuka);
        btnToggle.setAttribute('aria-expanded', kontrolTerbuka);
        btnToggle.addEventListener('click', () => {
          kontrolTerbuka = !kontrolTerbuka;
          wadahKontrol.classList.toggle('is-collapsed', !kontrolTerbuka);
          btnToggle.setAttribute('aria-expanded', kontrolTerbuka);
        });
      }
    }

    // Legenda Peta (Toggle Minimize)
    const wadahLegenda = document.getElementById('mapLegend');
    if (wadahLegenda) {
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
        '../data/geojson/zona/Master_Zona.geojson',
        'data/geojson/zona/Master_Zona.geojson',
        '../data/geojson/Master_Zona.geojson',
        'data/geojson/Master_Zona.geojson',
        'public-data/Master_Zona.geojson?v=357',
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

      // 5. Muat sebaran titik survei secara paralel
      muatDataTitik();
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
    dapatkanSurveyor,
    // Daftar surveyor sesuai urutan & warna surveyor.csv (dipakai grafik)
    daftarSurveyorCSV: () => Array.from(mapSurveyor.values()).map((s) => ({ nama: s.nama, warna: s.warna }))
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