/* ============================================================
   js/spatial-engine.js - Mesin Analisis Spasial Point-in-Polygon
   ZNT Kabupaten Bulungan
   - Menguji koordinat titik survei [lat, lon] terhadap poligon zona
   - Mendukung format GeoJSON SIPENTA (kolom 'histzone', 'penggunaan', 'luasan')
     maupun format eksisting ('Zona_ID', 'ID_ZONA')
   - Menghitung otomatis: jumlah titik per zona, status (Belum/Proses/Selesai),
     dan surveyor berdasarkan data spasial
   ============================================================ */

(function () {
  'use strict';

  // Helper identifikasi properti universal
  function dapatkanIdZona(props) {
    if (!props) return '-';
    const val =
      props.histzone ??
      props.HISTZONE ??
      props.Histzone ??
      props.Zona_ID ??
      props.ID_ZONA ??
      props.id_zona ??
      props.ID ??
      props.id;
    return val ? String(val).trim() : '-';
  }

  function dapatkanPenggunaan(props) {
    if (!props) return '-';
    const val = props.penggunaan ?? props.PENGGUNAAN ?? props.KATEGORI ?? props.kategori;
    return val ? String(val).trim() : '-';
  }

  function dapatkanLuasan(props) {
    if (!props) return null;
    const val =
      props.luasan ??
      props.LUASAN ??
      props.Luas ??
      props.LUAS ??
      props.area ??
      props.AREA ??
      props.Shape_Area ??
      props.LUASWH;
    if (val == null || val === '') return null;
    const num = Number(val);
    if (isNaN(num)) return String(val);
    // Jika angka lebih besar dari 10.000, kemungkinan satuan m2 -> tampilkan m2 & Ha
    if (num > 10000) {
      const ha = (num / 10000).toFixed(2);
      return `${Math.round(num).toLocaleString('id-ID')} m² (${ha} Ha)`;
    }
    return `${num.toLocaleString('id-ID')} Ha`;
  }

  // ============================================================
  // ALGORITMA RAY-CASTING POINT-IN-POLYGON (Jordan Curve Theorem)
  // ============================================================
  function pointInRing(x, y, ring) {
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0], yi = ring[i][1];
      const xj = ring[j][0], yj = ring[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function pointInPolygonCoords(x, y, polyCoords) {
    if (!polyCoords || polyCoords.length === 0) return false;
    // Cincin luar (outer ring) harus memuat titik
    if (!pointInRing(x, y, polyCoords[0])) return false;
    // Cincin dalam / lubang (holes) tidak boleh memuat titik
    for (let h = 1; h < polyCoords.length; h++) {
      if (pointInRing(x, y, polyCoords[h])) return false;
    }
    return true;
  }

  function pointInGeometry(x, y, geom, bbox) {
    if (!geom || !geom.coordinates) return false;
    // Pre-filter cepat dengan Bounding Box
    if (x < bbox[0] || x > bbox[2] || y < bbox[1] || y > bbox[3]) return false;

    if (geom.type === 'Polygon') {
      return pointInPolygonCoords(x, y, geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      for (let p = 0; p < geom.coordinates.length; p++) {
        if (pointInPolygonCoords(x, y, geom.coordinates[p])) return true;
      }
    }
    return false;
  }

  function hitungBbox(coordinates) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    function walk(c) {
      if (typeof c[0] === 'number') {
        if (c[0] < minX) minX = c[0];
        if (c[0] > maxX) maxX = c[0];
        if (c[1] < minY) minY = c[1];
        if (c[1] > maxY) maxY = c[1];
        return;
      }
      for (let i = 0; i < c.length; i++) walk(c[i]);
    }
    walk(coordinates);
    return [minX, minY, maxX, maxY];
  }

  // ============================================================
  // EKSEKUSI SPATIAL JOIN: MEMETAKAN SEMUA TITIK KE DALAM ZONA
  // ============================================================
  function tautkanTitikKeZona(features, points, options) {
    const opt = options || {};
    const minTitikSelesai = opt.minTitikSelesai || 3;

    if (!Array.isArray(features)) {
      return { features: [], summary: {}, zonePointsMap: new Map() };
    }

    const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

    // 1. Buat indeks BBox untuk setiap fitur zona
    const indexedFeatures = features.map(f => {
      const bbox = (f.geometry && f.geometry.coordinates) ? hitungBbox(f.geometry.coordinates) : [0,0,0,0];
      return {
        feature: f,
        bbox: bbox,
        id: dapatkanIdZona(f.properties)
      };
    });

    const zonePointsMap = new Map();
    let mappedCount = 0;
    const pts = Array.isArray(points) ? points : [];

    // 2. Uji setiap titik ke dalam poligon zona
    pts.forEach(pt => {
      const lon = Number(pt.lon);
      const lat = Number(pt.lat);
      if (isNaN(lon) || isNaN(lat)) return;

      for (let i = 0; i < indexedFeatures.length; i++) {
        const item = indexedFeatures[i];
        if (pointInGeometry(lon, lat, item.feature.geometry, item.bbox)) {
          if (!zonePointsMap.has(item.id)) {
            zonePointsMap.set(item.id, []);
          }
          zonePointsMap.get(item.id).push(pt);
          mappedCount++;
          break; // satu titik hanya jatuh ke 1 zona
        }
      }
    });

    // 3. Hitung status, surveyor, dan progres per zona
    let zonaSiap = 0;
    let zonaProses = 0;
    let zonaBelum = 0;
    let totalTitikSelesai = 0;

    features.forEach(f => {
      const p = f.properties;
      const id = dapatkanIdZona(p);
      const titikList = zonePointsMap.get(id) || [];

      // Titik yang disetujui (valid)
      const approvedList = titikList.filter(t => {
        const st = String(t.status || '').toLowerCase();
        return st.includes('setuju') || st === 'approved' || st === 'valid';
      });

      const countApproved = approvedList.length;
      totalTitikSelesai += countApproved;

      // Status otomatis berdasarkan jumlah titik
      let statusOtomatis = 'Belum';
      if (countApproved >= minTitikSelesai) {
        statusOtomatis = 'Selesai';
        zonaSiap++;
      } else if (countApproved > 0) {
        statusOtomatis = 'Proses';
        zonaProses++;
      } else {
        statusOtomatis = 'Belum';
        zonaBelum++;
      }

      // Ambil nama surveyor dari titik yang masuk ke zona (jika belum ada surveyor tetap)
      let surveyorOtomatis = p.Surveyor || p.SURVEYOR || null;
      if (!surveyorOtomatis || surveyorOtomatis === 'Belum ditugaskan') {
        const surveyorsInZone = Array.from(new Set(titikList.map(t => t.surveyor).filter(s => s && s !== '-')));
        if (surveyorsInZone.length > 0) {
          surveyorOtomatis = surveyorsInZone.join(', ');
        }
      }

      // Pasang atribut hasil hitung spasial ke properti fitur
      p._SPATIAL_ID = id;
      p._SPATIAL_TITIK_COUNT = countApproved;
      p._SPATIAL_TITIK_TOTAL = titikList.length;
      p._SPATIAL_STATUS = statusOtomatis;
      p._SPATIAL_POINTS = titikList;

      // Sinkronkan ke atribut standar dashboard (jika tidak ada override manual berstatus 'Masalah')
      if (p.STATUS !== 'Masalah') {
        p.STATUS = statusOtomatis;
      }
      p.TITIK_SELESAI = countApproved;
      if (surveyorOtomatis) {
        p.Surveyor = surveyorOtomatis;
        p.SURVEYOR = surveyorOtomatis;
      }
      p.PENGGUNAAN = dapatkanPenggunaan(p);
      p._LUASAN_FORMATTED = dapatkanLuasan(p);
    });

    const t1 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const durationMs = Math.round(t1 - t0);

    const summary = {
      totalZona: features.length,
      zonaSiap: zonaSiap,
      zonaProses: zonaProses,
      zonaBelum: zonaBelum,
      totalTitik: pts.length,
      titikMapped: mappedCount,
      titikUnmapped: pts.length - mappedCount,
      totalTitikSelesai: totalTitikSelesai,
      durationMs: durationMs
    };

    return {
      features: features,
      summary: summary,
      zonePointsMap: zonePointsMap
    };
  }

  // ============================================================
  // PERSISTENSI POLIGON KUSTOM KE INDEXEDDB BROWSER
  // ============================================================
  const IDB_NAME = 'znt_spatial_cache_v1';
  const IDB_STORE = 'polygons';

  function bukaDB() {
    return new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    });
  }

  async function simpanPolygonLokal(geojson, meta) {
    const db = await bukaDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).put(geojson, 'active_master_polygon');
        if (meta) {
          tx.objectStore(IDB_STORE).put(meta, 'active_master_polygon_meta');
        }
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  async function muatPolygonLokal() {
    const db = await bukaDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get('active_master_polygon');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function muatPolygonMetaLokal() {
    const db = await bukaDB();
    if (!db) return null;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readonly');
        const req = tx.objectStore(IDB_STORE).get('active_master_polygon_meta');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch (_) {
        resolve(null);
      }
    });
  }

  async function ambilMetaCloud() {
    if (typeof firebase === 'undefined' || !firebase.firestore) return null;
    try {
      const db = firebase.firestore();
      const doc = await db.collection('sebaranTitik').doc('polygon_meta').get();
      if (doc.exists) {
        return doc.data();
      }
    } catch (e) {
      console.warn('[Spatial Engine] Gagal memeriksa metadata polygon di Cloud Firestore:', e);
    }
    return null;
  }

  // Pemuat cerdas:
  // 1. Cek Firestore sebaranTitik/polygon_meta. Jika ada versi Cloud Storage, bandingkan timestamp dengan cache lokal.
  //    Jika cache lokal sudah sama persis, langsung pakai cache lokal (0ms).
  //    Jika ada versi cloud lebih baru, unduh dari Firebase Storage CDN & perbarui cache lokal.
  // 2. Jika offline / belum ada cloud, gunakan IndexedDB lokal.
  // 3. Fallback ke berkas statis GeoJSON.
  async function muatPolygonAktif(fallbackUrls = []) {
    // 1. Cek Cloud
    try {
      const cloudMeta = await ambilMetaCloud();
      const localMeta = await muatPolygonMetaLokal();

      if (cloudMeta && cloudMeta.downloadUrl) {
        let cloudTime = 0;
        if (cloudMeta.updatedAt) {
          if (typeof cloudMeta.updatedAt.toMillis === 'function') {
            cloudTime = cloudMeta.updatedAt.toMillis();
          } else if (cloudMeta.updatedAt.seconds) {
            cloudTime = cloudMeta.updatedAt.seconds * 1000;
          } else {
            cloudTime = new Date(cloudMeta.updatedAt).getTime();
          }
        }
        const localTime = localMeta && localMeta.updatedAtTime ? localMeta.updatedAtTime : null;

        // Jika cache lokal masih segar & cocok, gunakan cache
        if (cloudTime > 0 && localTime === cloudTime) {
          const cached = await muatPolygonLokal();
          if (cached && Array.isArray(cached.features) && cached.features.length > 0) {
            console.log(`[Spatial Engine] Memuat ${cached.features.length} polygon dari IndexedDB (sinkron Cloud Storage v${cloudTime}).`);
            return { data: cached, source: 'cache_cloud', meta: cloudMeta };
          }
        }

        // Unduh dari Firebase Storage
        console.log('[Spatial Engine] Mengunduh polygon terbaru dari Firebase Cloud Storage…');
        const res = await fetch(cloudMeta.downloadUrl);
        if (res.ok) {
          const cloudGeo = await res.json();
          if (cloudGeo && Array.isArray(cloudGeo.features) && cloudGeo.features.length > 0) {
            await simpanPolygonLokal(cloudGeo, {
              updatedAtTime: cloudTime,
              featureCount: cloudGeo.features.length,
              source: 'cloud_storage'
            });
            console.log(`[Spatial Engine] Sukses mengunduh & menyimpan ${cloudGeo.features.length} polygon dari Cloud Storage.`);
            return { data: cloudGeo, source: 'cloud_storage', meta: cloudMeta };
          }
        }
      }
    } catch (err) {
      console.warn('[Spatial Engine] Gagal memuat polygon dari Cloud Storage, mencoba alternatif:', err);
    }

    // 2. Cek IndexedDB lokal
    try {
      const localCached = await muatPolygonLokal();
      if (localCached && Array.isArray(localCached.features) && localCached.features.length > 0) {
        console.log(`[Spatial Engine] Memuat ${localCached.features.length} polygon dari IndexedDB lokal.`);
        return { data: localCached, source: 'local_indexeddb' };
      }
    } catch (_) {}

    // 3. Fallback ke berkas statis
    for (const url of fallbackUrls) {
      try {
        const res = await fetch(url);
        if (res.ok) {
          const staticGeo = await res.json();
          if (staticGeo && Array.isArray(staticGeo.features) && staticGeo.features.length > 0) {
            console.log(`[Spatial Engine] Memuat ${staticGeo.features.length} polygon dari berkas statis: ${url}`);
            return { data: staticGeo, source: 'static_file', url };
          }
        }
      } catch (_) {}
    }

    throw new Error('Tidak dapat memuat berkas polygon dari Cloud Storage, penyimpanan lokal, maupun berkas statis.');
  }

  async function hapusPolygonLokal() {
    const db = await bukaDB();
    if (!db) return false;
    return new Promise((resolve) => {
      try {
        const tx = db.transaction(IDB_STORE, 'readwrite');
        tx.objectStore(IDB_STORE).delete('active_master_polygon');
        tx.objectStore(IDB_STORE).delete('active_master_polygon_meta');
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
      } catch (_) {
        resolve(false);
      }
    });
  }

  // Export ke window
  window.zntSpatial = {
    dapatkanIdZona,
    dapatkanPenggunaan,
    dapatkanLuasan,
    pointInGeometry,
    hitungBbox,
    tautkanTitikKeZona,
    simpanPolygonLokal,
    muatPolygonLokal,
    muatPolygonMetaLokal,
    ambilMetaCloud,
    muatPolygonAktif,
    hapusPolygonLokal
  };
})();
