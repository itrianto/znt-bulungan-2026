/* ============================================================
   js/admin-progress.js - Manajemen Zona & Progres Admin
   - Menghubungkan Master_Zona.geojson & surveyor.csv ke Admin
   - Sinkronisasi realtime ke Dashboard Publik melalui zntSync & Firestore
   ============================================================ */

(function () {
  'use strict';

  let isAdminVerified = false;
  let masterGeoJSON = null;
  let allZones = [];
  let surveyorList = [];
  let currentEditZone = null;
  let isAddMode = false;

  const db = () => (window.firebase && firebase.firestore ? firebase.firestore() : null);

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
    throw new Error(`Gagal memuat berkas dari: ${candidateUrls.join(' atau ')}`);
  }

  function parseSurveyorCSV(csvText) {
    if (csvText.charCodeAt(0) === 0xfeff) csvText = csvText.slice(1);
    const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
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
      const cols = line.split(d).map(c => c.trim().toLowerCase());
      if (cols.some(c => c === 'nama' || c === 'nama surveyor' || c === 'name' || c === 'surveyor')) {
        headerIdx = i;
        delim = d;
        headers = cols;
        break;
      }
    }

    const namaIdx = headers.findIndex(h => h === 'nama' || h === 'nama surveyor' || h === 'name' || h === 'surveyor');
    const idIdx = headers.findIndex(h => h === 'no.' || h === 'no' || h === 'id' || h === 'no_surveyor');

    const list = [];
    const startRow = headerIdx >= 0 ? headerIdx + 1 : 0;
    for (let i = startRow; i < lines.length; i++) {
      const line = lines[i];
      if (!line || line.startsWith('#')) continue;
      const cols = line.split(delim).map(c => c.trim());
      const nama = (namaIdx >= 0 ? cols[namaIdx] : cols[1]) || '';
      if (!nama || nama.toLowerCase().includes('data surveyor')) continue;
      const id = (idIdx >= 0 && cols[idIdx]) ? cols[idIdx] : String(list.length + 1);
      list.push({ id, nama });
    }
    return list;
  }

  function init(isAdmin) {
    isAdminVerified = isAdmin;
    const section = document.getElementById('progressSection');
    if (!section) return;

    if (!isAdminVerified) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';
    setupEventListeners();
    loadData();
  }

  // Helper untuk membaca titik survei dari memory, Firestore, atau CSV
  async function dapatkanSemuaTitikSurvei() {
    if (window.zntAdminTitik && typeof window.zntAdminTitik.getPoints === 'function') {
      const pts = window.zntAdminTitik.getPoints();
      if (Array.isArray(pts) && pts.length > 0) return pts;
    }
    if (db()) {
      try {
        const snap = await db().collection('sebaranTitik').doc('master').get();
        if (snap.exists && Array.isArray(snap.data().points) && snap.data().points.length > 0) {
          return snap.data().points;
        }
      } catch (e) {
        console.warn('Gagal membaca titik dari Firestore:', e.message);
      }
    }
    try {
      const [resP, resNP] = await Promise.all([
        fetchWithFallback([
          '../data/geojson/sebaran_titik/titik_pertanian.csv',
          'data/geojson/sebaran_titik/titik_pertanian.csv',
          'public-data/sebaran_titik/titik_pertanian.csv?v=2'
        ]).then(r => r.text()).catch(() => ''),
        fetchWithFallback([
          '../data/geojson/sebaran_titik/titik_non_pertanian.csv',
          'data/geojson/sebaran_titik/titik_non_pertanian.csv',
          'public-data/sebaran_titik/titik_non_pertanian.csv?v=2'
        ]).then(r => r.text()).catch(() => '')
      ]);
      const ptsP = resP ? parseCsvTitik(resP, 'Pertanian') : [];
      const ptsNP = resNP ? parseCsvTitik(resNP, 'Non-Pertanian') : [];
      return [...ptsP, ...ptsNP];
    } catch (e) {
      console.warn('Gagal fallback titik CSV:', e.message);
      return [];
    }
  }

  function parseCsvTitik(text, jenis) {
    const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(h => h.trim().toLowerCase());
    const idxNo = header.findIndex(h => h.includes('sampel') || h.includes('no') || h === 'id');
    const idxSurveyor = header.findIndex(h => h.includes('penilai') || h.includes('surveyor') || h.includes('nama'));
    const idxLat = header.findIndex(h => h === 'lat' || h.includes('latitude') || h.includes('lintang') || h === 'y');
    const idxLon = header.findIndex(h => h === 'lon' || h.includes('longitude') || h.includes('bujur') || h === 'x');
    const idxStatus = header.findIndex(h => h.includes('status'));

    const list = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
      if (cols.length < 2) continue;
      const lat = parseFloat(idxLat >= 0 ? cols[idxLat] : cols[2]);
      const lon = parseFloat(idxLon >= 0 ? cols[idxLon] : cols[3]);
      if (isNaN(lat) || isNaN(lon)) continue;

      list.push({
        noSampel: (idxNo >= 0 ? cols[idxNo] : cols[0]) || String(i),
        surveyor: (idxSurveyor >= 0 ? cols[idxSurveyor] : cols[1]) || '-',
        lat: lat,
        lon: lon,
        status: (idxStatus >= 0 ? cols[idxStatus] : cols[4]) || 'Disetujui',
        jenis: jenis
      });
    }
    return list;
  }

  // Hitung point-in-polygon sebaran titik ke poligon zona secara otomatis
  async function jalankanHitungSpasial(isManualClick = false) {
    if (!masterGeoJSON || !masterGeoJSON.features || masterGeoJSON.features.length === 0) return;
    if (!window.zntSpatial || typeof window.zntSpatial.tautkanTitikKeZona !== 'function') return;

    const banner = document.getElementById('spatialSummaryBanner');
    const bannerText = document.getElementById('spatialSummaryText');

    if (banner && isManualClick) {
      banner.style.display = 'block';
      if (bannerText) bannerText.textContent = 'Menghitung point-in-polygon sebaran titik survei ke polygon zona...';
    }

    const points = await dapatkanSemuaTitikSurvei();
    if (!points || points.length === 0) {
      if (bannerText && isManualClick) {
        bannerText.textContent = 'Tidak ditemukan titik survei untuk dihitung.';
      }
      return;
    }

    const res = window.zntSpatial.tautkanTitikKeZona(masterGeoJSON.features, points);

    // Sinkronkan ke allZones
    allZones = masterGeoJSON.features.map(f => {
      const p = f.properties;
      const id = (window.zntSpatial ? window.zntSpatial.dapatkanIdZona(p) : String(p.histzone || p.Zona_ID || p.ID_ZONA || '')).trim().toUpperCase();
      const luasan = window.zntSpatial ? window.zntSpatial.dapatkanLuasan(p) : (p.luasan || p.LUASAN || '-');
      const penggunaan = window.zntSpatial ? window.zntSpatial.dapatkanPenggunaan(p) : (p.PENGGUNAAN ?? p.penggunaan ?? 'Pertanian');
      return {
        id: id,
        surveyor: p.Surveyor || p.SURVEYOR || 'Belum ditugaskan',
        penggunaan: penggunaan,
        luasan: luasan,
        status: p.STATUS || 'Belum',
        titikSelesai: p.TITIK_SELESAI || 0,
        updatedAt: p.updatedAt || new Date().toISOString(),
        feature: f
      };
    });

    renderTable();

    if (banner && bannerText) {
      banner.style.display = 'block';
      bannerText.innerHTML = `<strong>${res.summary.titikMapped} dari ${res.summary.totalTitik} titik</strong> berhasil dipetakan ke <strong>${res.summary.totalZona} zona</strong> dalam ${res.summary.durationMs}ms. Status: <strong>${res.summary.zonaSiap} Siap</strong>, <strong>${res.summary.zonaProses} Proses</strong>, <strong>${res.summary.zonaBelum} Belum</strong>.`;
    }

    const titleBadge = document.getElementById('progressZoneTotalBadge');
    if (titleBadge) titleBadge.textContent = `(${allZones.length} Zona)`;
  }

  // Simpan progres seluruh zona hasil hitung spasial ke Cloud Firestore secara massal (batch)
  async function simpanSemuaProgresKeCloud() {
    if (!isAdminVerified) {
      alert('Hanya admin terverifikasi yang dapat menyimpan progres ke cloud Firestore.');
      return;
    }
    if (!db()) {
      alert('Firestore belum terhubung.');
      return;
    }
    if (allZones.length === 0) {
      alert('Tidak ada data zona yang dapat disinkronkan.');
      return;
    }

    const btn = document.getElementById('btnApplySpatialToCloud');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Menyimpan ke Cloud…';
    }

    try {
      let batch = db().batch();
      let count = 0;
      const now = firebase.firestore.FieldValue.serverTimestamp();

      for (let i = 0; i < allZones.length; i++) {
        const z = allZones[i];
        if (!z.id) continue;
        const titikInt = parseInt(z.titikSelesai, 10) || 0;
        const validStatus = ['Belum', 'Proses', 'Selesai', 'Masalah'].includes(z.status) ? z.status : 'Belum';
        const ref = db().collection('progressPublic').doc(z.id);
        batch.set(ref, {
          status: validStatus,
          titikSelesai: titikInt,
          updatedAt: now
        });
        count++;

        if (count % 400 === 0) {
          await batch.commit();
          batch = db().batch();
        }
      }

      if (count % 400 !== 0) {
        await batch.commit();
      }

      alert(`Sukses! ${count} progres zona berhasil disinkronkan ke Cloud Firestore.`);
      if (window.zntSync && window.zntSync.broadcast) {
        window.zntSync.broadcast('PROGRESS_BATCH_UPDATED', { count });
      }
    } catch (err) {
      console.error('Gagal simpan progres batch ke Firestore:', err);
      alert(`Gagal menyimpan ke Cloud Firestore: ${err.message}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = '☁️ Simpan Semua Progres ke Cloud';
      }
    }
  }

  // Handler saat admin mengunggah berkas polygon GeoJSON baru (misal hasil export SIPENTA)
  async function handleGeoJSONUpload(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const status = document.getElementById('progressStatus');
    if (status) status.textContent = `Membaca berkas polygon ${file.name}…`;

    try {
      const text = await file.text();
      let cleanText = text;
      if (cleanText.charCodeAt(0) === 0xfeff) {
        cleanText = cleanText.slice(1);
      }
      const parsed = JSON.parse(cleanText);

      if (!parsed || parsed.type !== 'FeatureCollection' || !Array.isArray(parsed.features) || parsed.features.length === 0) {
        throw new Error('Berkas tidak valid. Pastikan format GeoJSON FeatureCollection dengan minimal 1 fitur polygon.');
      }

      masterGeoJSON = parsed;

      // Simpan ke IndexedDB lokal agar persist saat reload & terbaca di dashboard publik
      if (window.zntSpatial && typeof window.zntSpatial.simpanPolygonLokal === 'function') {
        await window.zntSpatial.simpanPolygonLokal(parsed, {
          source: 'admin_upload',
          fileName: file.name,
          updatedAtTime: Date.now(),
          featureCount: parsed.features.length
        });
      }
      if (window.zntSync && window.zntSync.broadcast) {
        window.zntSync.broadcast('POLYGON_UPDATED', { count: parsed.features.length });
      }

      // Jalankan hitung spasial otomatis point-in-polygon terhadap titik yang ada
      await jalankanHitungSpasial(true);

      const statusEl = document.getElementById('progressStatus');
      if (statusEl) {
        statusEl.textContent = `✅ Berhasil memuat ${masterGeoJSON.features.length} polygon dari ${file.name}.`;
      }

      const tanyaPublikasi = confirm(
        `✅ Berhasil membaca ${masterGeoJSON.features.length} polygon zona dari ${file.name}!\n` +
        `Sebaran titik survei telah otomatis dipetakan ke zona masing-masing.\n\n` +
        `Apakah Anda ingin LANGSUNG mempublikasikannya ke Firebase Cloud Storage agar otomatis aktif untuk seluruh pengunjung publik?`
      );

      if (tanyaPublikasi) {
        await publikasikanPolygonKeCloudStorage();
      }
    } catch (err) {
      console.error('Gagal mengunggah GeoJSON:', err);
      alert(`Gagal memproses GeoJSON: ${err.message}`);
      if (status) status.textContent = `Gagal memproses GeoJSON: ${err.message}`;
    } finally {
      e.target.value = '';
    }
  }

  // Publikasikan polygon master ke Firebase Cloud Storage
  async function publikasikanPolygonKeCloudStorage() {
    if (!masterGeoJSON || !Array.isArray(masterGeoJSON.features) || masterGeoJSON.features.length === 0) {
      alert('Tidak ada polygon aktif untuk dipublikasikan. Silakan unggah polygon SIPENTA terlebih dahulu.');
      return;
    }

    if (typeof firebase === 'undefined' || !firebase.storage || !firebase.firestore) {
      alert('Firebase Storage / Firestore SDK belum siap.');
      return;
    }

    const auth = firebase.auth();
    const user = auth.currentUser;
    if (!user) {
      alert('Sesi admin berakhir. Silakan login kembali di halaman Admin.');
      return;
    }

    const btnPublish = document.getElementById('btnPublishPolygonCloud');
    const btnBanner = document.getElementById('btnPublishPolygonCloudBanner');
    const progressBox = document.getElementById('polygonUploadProgress');
    const progressBar = document.getElementById('polygonProgressBar');
    const progressText = document.getElementById('polygonUploadProgressText');
    const progressPercent = document.getElementById('polygonUploadProgressPercent');

    try {
      if (btnPublish) btnPublish.disabled = true;
      if (btnBanner) btnBanner.disabled = true;
      if (progressBox) progressBox.style.display = 'block';
      if (progressBar) progressBar.style.width = '5%';
      if (progressPercent) progressPercent.textContent = '5%';
      if (progressText) progressText.textContent = 'Menyiapkan berkas polygon GeoJSON…';

      const jsonStr = JSON.stringify(masterGeoJSON);
      const blob = new Blob([jsonStr], { type: 'application/geo+json' });
      const sizeMB = (blob.size / (1024 * 1024)).toFixed(2);

      if (progressText) progressText.textContent = `Mengunggah ke Firebase Storage (${sizeMB} MB)…`;

      const storage = firebase.storage();
      const storageRef = storage.ref('polygons/master_zona.geojson');
      const uploadTask = storageRef.put(blob, {
        contentType: 'application/geo+json',
        cacheControl: 'public, max-age=3600'
      });

      uploadTask.on(
        'state_changed',
        (snapshot) => {
          const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
          if (progressBar) progressBar.style.width = `${pct}%`;
          if (progressPercent) progressPercent.textContent = `${pct}%`;
          if (progressText) {
            progressText.textContent = `Mengunggah: ${(snapshot.bytesTransferred / (1024 * 1024)).toFixed(1)} / ${sizeMB} MB (${pct}%)`;
          }
        },
        (error) => {
          console.error('Error Firebase Storage upload:', error);
          let pesan = error.message;
          if (error.code === 'storage/bucket-not-found' || error.message.includes('bucket') || error.message.includes('not set up')) {
            pesan = 'Firebase Storage belum diaktifkan di Firebase Console.\n\nBuka https://console.firebase.google.com/project/znt-bulungan-2026/storage dan klik "Get Started" (Mulai).';
          } else if (error.code === 'storage/unauthorized') {
            pesan = 'Akses ditolak oleh Firebase Storage. Pastikan storage.rules sudah di-deploy dan akun Anda terdaftar di Firestore admins.';
          }
          alert(`Gagal mempublikasikan polygon: ${pesan}`);
          if (progressBox) progressBox.style.display = 'none';
          if (btnPublish) btnPublish.disabled = false;
          if (btnBanner) btnBanner.disabled = false;
        },
        async () => {
          try {
            if (progressText) progressText.textContent = 'Menyimpan tautan publikasi ke Cloud Firestore…';
            const downloadUrl = await uploadTask.snapshot.ref.getDownloadURL();

            const firestoreDb = firebase.firestore();
            const now = firebase.firestore.FieldValue.serverTimestamp();
            await firestoreDb.collection('sebaranTitik').doc('polygon_meta').set({
              downloadUrl: downloadUrl,
              storagePath: 'polygons/master_zona.geojson',
              featureCount: masterGeoJSON.features.length,
              sizeBytes: blob.size,
              updatedAt: now,
              updatedBy: user.email || user.uid
            });

            // Simpan juga ke cache lokal IndexedDB
            if (window.zntSpatial && typeof window.zntSpatial.simpanPolygonLokal === 'function') {
              await window.zntSpatial.simpanPolygonLokal(masterGeoJSON, {
                updatedAtTime: Date.now(),
                featureCount: masterGeoJSON.features.length,
                source: 'cloud_storage'
              });
            }

            if (window.zntSync && window.zntSync.broadcast) {
              window.zntSync.broadcast('POLYGON_UPDATED', { count: masterGeoJSON.features.length });
            }

            if (progressBar) progressBar.style.width = '100%';
            if (progressPercent) progressPercent.textContent = '100%';
            if (progressText) progressText.textContent = `✅ Berhasil dipublikasikan ke Cloud (${masterGeoJSON.features.length} zona).`;

            setTimeout(() => {
              if (progressBox) progressBox.style.display = 'none';
              if (btnPublish) btnPublish.disabled = false;
              if (btnBanner) btnBanner.disabled = false;
            }, 3500);

            alert(`🎉 Sukses! Sebanyak ${masterGeoJSON.features.length} polygon zona SIPENTA telah dipublikasikan ke Firebase Cloud Storage.\n\nDashboard Publik otomatis menampilkan polygon terbaru ini tanpa perlu deploy git manual!`);
          } catch (metaErr) {
            console.error('Gagal menyimpan metadata polygon:', metaErr);
            alert(`Berkas terunggah ke Storage, namun gagal mencatat metadata di Firestore: ${metaErr.message}`);
            if (progressBox) progressBox.style.display = 'none';
            if (btnPublish) btnPublish.disabled = false;
            if (btnBanner) btnBanner.disabled = false;
          }
        }
      );
    } catch (err) {
      console.error('Exception saat publikasi polygon:', err);
      alert(`Gagal mempublikasikan polygon: ${err.message}`);
      if (progressBox) progressBox.style.display = 'none';
      if (btnPublish) btnPublish.disabled = false;
      if (btnBanner) btnBanner.disabled = false;
    }
  }

  async function loadData() {
    const status = document.getElementById('progressStatus');
    status.textContent = 'Memuat data Master Zona dan Surveyor…';

    try {
      // 1. Muat surveyor.csv
      const resCsv = await fetchWithFallback([
        '../data/list_surveyor/surveyor.csv',
        'data/list_surveyor/surveyor.csv',
        'public-data/surveyor.csv'
      ]);
      const csvText = await resCsv.text();
      surveyorList = parseSurveyorCSV(csvText);
      populateSurveyorDropdown();

      // 2. Muat Master_Zona.geojson (Prioritas: Cloud Storage -> Cache IndexedDB -> Static File)
      const fallbackUrls = [
        'public-data/Master_Zona.geojson?v=20261117_358',
        '../docs/public-data/Master_Zona.geojson?v=20261117_358',
        '../data/geojson/zona/Master_Zona.geojson',
        'data/geojson/zona/Master_Zona.geojson',
        'public-data/public-zona.geojson'
      ];

      if (window.zntSpatial && typeof window.zntSpatial.muatPolygonAktif === 'function') {
        const result = await window.zntSpatial.muatPolygonAktif(fallbackUrls);
        masterGeoJSON = result.data;
        console.log(`[Admin] Memuat ${masterGeoJSON.features.length} polygon dari sumber: ${result.source}`);
      } else {
        const resGeo = await fetchWithFallback(fallbackUrls);
        masterGeoJSON = await resGeo.json();
      }

      // 3. Terapkan override dari zntSync jika ada
      if (window.zntSync) {
        window.zntSync.applyOverridesToGeoJSON(masterGeoJSON);
      }

      // 4. Muat Firestore progress jika tersedia
      let progressMap = {};
      if (db()) {
        try {
          const snap = await db().collection('progressPublic').get();
          snap.forEach(d => { progressMap[d.id] = d.data(); });
        } catch (e) {
          console.warn('Gagal memuat progressPublic Firestore:', e.message);
        }
      }

      // 5. Normalisasi data zona untuk tabel admin
      allZones = masterGeoJSON.features.map(f => {
        const p = f.properties;
        const id = (window.zntSpatial ? window.zntSpatial.dapatkanIdZona(p) : String(p.histzone || p.Zona_ID || p.ID_ZONA || '')).trim().toUpperCase();
        const firestoreP = progressMap[id] || {};
        const luasan = window.zntSpatial ? window.zntSpatial.dapatkanLuasan(p) : (p.luasan || p.LUASAN || '-');
        const penggunaan = window.zntSpatial ? window.zntSpatial.dapatkanPenggunaan(p) : (p.PENGGUNAAN ?? p.penggunaan ?? 'Pertanian');
        return {
          id: id,
          surveyor: p.Surveyor || p.SURVEYOR || 'Belum ditugaskan',
          penggunaan: penggunaan,
          luasan: luasan,
          status: firestoreP.status || p.STATUS || p.status || 'Belum',
          titikSelesai: firestoreP.titikSelesai != null ? firestoreP.titikSelesai : (p.TITIK_SELESAI || 0),
          updatedAt: firestoreP.updatedAt || p.updatedAt || null,
          feature: f
        };
      });

      renderTable();
      status.textContent = `${allZones.length} zona siap dikelola.`;
      const titleBadge = document.getElementById('progressZoneTotalBadge');
      if (titleBadge) titleBadge.textContent = `(${allZones.length} Zona)`;
    } catch (err) {
      status.textContent = `Error memuat data: ${err.message}`;
      console.error(err);
    }
  }

  function populateSurveyorDropdown() {
    const sel = document.getElementById('progressSurveyorSelect');
    if (!sel) return;
    sel.innerHTML = '<option value="Belum ditugaskan">-- Belum ditugaskan --</option>' +
      surveyorList.map(s => `<option value="${esc(s.nama)}">${esc(s.nama)}</option>`).join('');
  }

  function renderTable(filterQuery = '') {
    const tbody = document.getElementById('progressTableBody');
    const badge = document.getElementById('progressCountBadge');
    if (!tbody) return;

    const q = filterQuery.trim().toLowerCase();
    const filtered = allZones.filter(z => {
      if (!q) return true;
      return z.id.toLowerCase().includes(q) ||
             z.surveyor.toLowerCase().includes(q) ||
             z.penggunaan.toLowerCase().includes(q) ||
             (z.luasan && z.luasan.toLowerCase().includes(q)) ||
             z.status.toLowerCase().includes(q);
    });

    if (badge) {
      badge.textContent = `${filtered.length} dari ${allZones.length} zona`;
    }

    // Selamatkan form dari tbody sebelum innerHTML ditimpa (form bisa sedang inline di dalam tabel)
    parkForm();
    removeEditRows();

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:#5f6368">Tidak ada data zona yang cocok</td></tr>';
      if (currentEditZone && !isAddMode) document.getElementById('progressForm').style.display = 'none';
      return;
    }

    tbody.innerHTML = filtered.map(z => {
      const statusClass = z.status.toLowerCase().replace(/\s+/g, '');
      const badgeHtml = `<span class="status-badge status-badge--${statusClass}">${esc(z.status)}</span>`;
      return `
        <tr data-row-id="${esc(z.id)}">
          <td><strong>${esc(z.id)}</strong></td>
          <td>${esc(z.surveyor)}</td>
          <td><span style="font-size:0.9em;opacity:0.85;">${esc(z.penggunaan) || '-'}</span></td>
          <td style="font-size:0.85em;color:#5f6368">${esc(z.luasan) || '-'}</td>
          <td>${badgeHtml}</td>
          <td><strong>${z.titikSelesai}</strong></td>
          <td style="font-size:0.85em;color:#5f6368">${formatDate(z.updatedAt)}</td>
          <td style="white-space:nowrap;">
            <button type="button" class="btn-zone-edit" data-id="${esc(z.id)}" style="background:#007aff;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-weight:600;font-size:12px;cursor:pointer;margin-right:6px;">Edit</button>
            <button type="button" class="btn-zone-delete" data-id="${esc(z.id)}" title="Reset Data Survey (Penggunaan, Status, Titik)" aria-label="Reset Data Survey (Penggunaan, Status, Titik)" style="padding:6px 10px !important;font-size:14px !important;line-height:1;cursor:pointer;">🔄</button>
          </td>
        </tr>
      `;
    }).join('');

    // Tombol Edit ditangani lewat event delegation di setupEventListeners()
    // Pasang event ke tombol hapus (hapus = hanya data titik, polygon aman)
    tbody.querySelectorAll('.btn-zone-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteZonePoints(btn.dataset.id));
    });

    // Jika sedang mengedit, pasang kembali form inline di bawah barisnya
    if (currentEditZone && !isAddMode) placeFormInline(currentEditZone);
  }

  let listenersBound = false;

  function setupEventListeners() {
    // init() bisa dipanggil berkali-kali (perubahan status login); listener cukup dipasang sekali
    if (listenersBound) return;
    listenersBound = true;

    // Penanda posisi asal form (dipakai untuk mode tambah & saat form diparkir)
    const progressForm = document.getElementById('progressForm');
    if (progressForm && !formAnchor) {
      formAnchor = document.createComment('progress-form-anchor');
      progressForm.parentNode.insertBefore(formAnchor, progressForm);
    }

    // Event delegation: satu listener di tbody, tetap hidup walau isi tabel di-render ulang
    const progressBody = document.getElementById('progressTableBody');
    if (progressBody) {
      progressBody.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-zone-edit');
        if (!btn || !progressBody.contains(btn)) return;
        editZone(btn.dataset.id);
      });
    }

    // Tombol Form
    document.getElementById('btnSaveProgress').addEventListener('click', saveZoneData);
    document.getElementById('btnCancelProgress').addEventListener('click', hideForm);

    // Validasi live setelah percobaan submit pertama
    ['inputZoneId', 'progressSurveyorSelect', 'progressPenggunaanSelect', 'progressStatusSelect', 'progressTitik']
      .forEach(fid => {
        const el = document.getElementById(fid);
        if (!el) return;
        el.addEventListener('input', revalidateLive);
        el.addEventListener('change', revalidateLive);
      });

    // Tombol Section Actions
    document.getElementById('btnNewZone').addEventListener('click', showAddZoneForm);
    document.getElementById('btnExportGeoJSON').addEventListener('click', exportGeoJSON);
    document.getElementById('btnResetMaster').addEventListener('click', resetMasterData);

    // Tombol SIPENTA GeoJSON & Hitung Spasial Otomatis
    const btnUpload = document.getElementById('btnUploadGeoJSON');
    const inputUpload = document.getElementById('fileInputGeoJSON');
    if (btnUpload && inputUpload) {
      btnUpload.addEventListener('click', () => inputUpload.click());
      inputUpload.addEventListener('change', handleGeoJSONUpload);
    }

    const btnAutoRecalc = document.getElementById('btnAutoRecalcSpatial');
    if (btnAutoRecalc) {
      btnAutoRecalc.addEventListener('click', () => jalankanHitungSpasial(true));
    }

    const btnApplyCloud = document.getElementById('btnApplySpatialToCloud');
    if (btnApplyCloud) {
      btnApplyCloud.addEventListener('click', simpanSemuaProgresKeCloud);
    }

    const btnPublishCloud = document.getElementById('btnPublishPolygonCloud');
    if (btnPublishCloud) {
      btnPublishCloud.addEventListener('click', publikasikanPolygonKeCloudStorage);
    }

    const btnPublishCloudBanner = document.getElementById('btnPublishPolygonCloudBanner');
    if (btnPublishCloudBanner) {
      btnPublishCloudBanner.addEventListener('click', publikasikanPolygonKeCloudStorage);
    }

    // Dengarkan event titik diperbarui dari admin-titik untuk sinkronisasi otomatis
    window.addEventListener('znt:points-updated', () => {
      jalankanHitungSpasial(false);
    });

    // Filter Search
    const searchInput = document.getElementById('zoneSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => renderTable(e.target.value));
    }
  }

  // ---- Penempatan form: asal (atas tabel) vs inline di bawah baris ----
  let formAnchor = null; // penanda posisi asal #progressForm

  function parkForm() {
    const form = document.getElementById('progressForm');
    if (!form || !formAnchor || !formAnchor.parentNode) return;
    if (form.previousSibling !== formAnchor) {
      formAnchor.parentNode.insertBefore(form, formAnchor.nextSibling);
    }
  }

  function removeEditRows() {
    document.querySelectorAll('.zone-edit-row').forEach(r => r.remove());
    document.querySelectorAll('tr.zone-row-editing').forEach(r => r.classList.remove('zone-row-editing'));
  }

  // Taruh form tepat di bawah baris zona. Mengembalikan false bila baris tidak tampil (mis. terfilter).
  function placeFormInline(id) {
    const form = document.getElementById('progressForm');
    const tbody = document.getElementById('progressTableBody');
    if (!form || !tbody) return false;

    parkForm();
    removeEditRows();

    const row = Array.from(tbody.querySelectorAll('tr[data-row-id]')).find(r => r.dataset.rowId === id);
    if (!row) {
      form.style.display = 'none';
      return false;
    }

    const editRow = document.createElement('tr');
    editRow.className = 'zone-edit-row';
    const td = document.createElement('td');
    td.colSpan = 8;
    td.style.padding = '0 8px';
    editRow.appendChild(td);
    row.insertAdjacentElement('afterend', editRow);
    row.classList.add('zone-row-editing');
    td.appendChild(form);
    form.style.display = 'block';
    return true;
  }

  // Set judul form tanpa menghilangkan <span id="editZoneId"> (textContent pada h3 akan menghapus span itu)
  function setFormTitle(text, zoneId) {
    const title = document.getElementById('zoneFormTitle');
    if (!title) return;
    title.textContent = text;
    const span = document.createElement('span');
    span.id = 'editZoneId';
    span.style.color = '#007aff';
    span.textContent = zoneId || '';
    title.appendChild(span);
  }

  function showAddZoneForm() {
    // Tutup form edit inline (jika ada) dan pakai posisi asal form
    removeEditRows();
    parkForm();
    clearFormErrors();
    document.getElementById('btnSaveProgress').disabled = false;

    isAddMode = true;
    currentEditZone = null;
    document.getElementById('progressForm').style.display = 'block';
    setFormTitle('Tambah Zona Baru', '');
    
    const idGroup = document.getElementById('zoneIdInputGroup');
    idGroup.style.display = 'block';
    document.getElementById('inputZoneId').value = `Z${String(allZones.length + 1).padStart(3, '0')}`;
    document.getElementById('inputZoneId').readOnly = false;

    document.getElementById('progressSurveyorSelect').value = surveyorList[0] ? surveyorList[0].nama : 'Belum ditugaskan';
    document.getElementById('progressPenggunaanSelect').value = 'Pertanian';
    document.getElementById('progressStatusSelect').value = 'Belum';
    document.getElementById('progressTitik').value = 0;
    document.getElementById('progressFormStatus').textContent = '';
    document.getElementById('progressForm').scrollIntoView({ behavior: 'smooth' });
  }

  function editZone(id) {
    const zone = allZones.find(z => z.id === id);
    if (!zone) return;

    // Klik Edit lagi pada baris yang sama = tutup (gaya accordion)
    if (!isAddMode && currentEditZone === zone.id) {
      hideForm();
      return;
    }

    clearFormErrors();
    document.getElementById('btnSaveProgress').disabled = false;

    isAddMode = false;
    currentEditZone = zone.id;
    setFormTitle('Edit Data Zona ', zone.id);

    const idGroup = document.getElementById('zoneIdInputGroup');
    idGroup.style.display = 'block';
    const idInput = document.getElementById('inputZoneId');
    idInput.value = zone.id;
    idInput.readOnly = true;

    document.getElementById('progressSurveyorSelect').value = zone.surveyor;
    document.getElementById('progressPenggunaanSelect').value = zone.penggunaan;
    document.getElementById('progressStatusSelect').value = zone.status;
    document.getElementById('progressTitik').value = zone.titikSelesai;
    document.getElementById('progressFormStatus').textContent = '';

    // Tampilkan inline di bawah baris; tanpa scroll ke atas
    if (placeFormInline(zone.id)) {
      document.getElementById('progressForm').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  function hideForm() {
    parkForm();
    removeEditRows();
    document.getElementById('progressForm').style.display = 'none';
    document.getElementById('btnSaveProgress').disabled = false;
    clearFormErrors();
    currentEditZone = null;
    isAddMode = false;
  }

  // Format ID Zona: mendukung format lama Z001 atau kode histzone SIPENTA (alfanumerik 2-50 karakter)
  const ZONE_ID_REGEX = /^[A-Za-z0-9_.\-\/]{2,50}$/;
  const FORM_ERR_IDS = {
    zoneId: 'errZoneId',
    penggunaan: 'errPenggunaan',
    status: 'errStatus',
    titik: 'errTitik'
  };
  let submitAttempted = false;

  function isSurveyorAssigned(surveyor) {
    const s = String(surveyor || '').trim();
    return s !== '' && s.toLowerCase() !== 'belum ditugaskan';
  }

  function readFormValues() {
    return {
      zoneId: document.getElementById('inputZoneId').value.trim().toUpperCase(),
      surveyor: document.getElementById('progressSurveyorSelect').value,
      penggunaan: document.getElementById('progressPenggunaanSelect').value,
      status: document.getElementById('progressStatusSelect').value,
      titikRaw: document.getElementById('progressTitik').value.trim()
    };
  }

  // Mengembalikan objek { field: pesanError }. Objek kosong = valid.
  function validateZoneForm(v) {
    const errors = {};

    if (!ZONE_ID_REGEX.test(v.zoneId)) {
      errors.zoneId = 'Format ID Zona / Histzone harus alfanumerik (2-50 karakter)';
    } else if (isAddMode && allZones.some(z => z.id === v.zoneId)) {
      errors.zoneId = `ID Zona ${v.zoneId} sudah ada`;
    }

    const assigned = isSurveyorAssigned(v.surveyor);
    if (assigned) {
      if (!v.penggunaan) errors.penggunaan = 'Kategori Penggunaan wajib diisi';
      if (!v.status) errors.status = 'Status Progress wajib diisi';
      if (v.titikRaw === '') errors.titik = 'Titik Selesai wajib diisi';
    }

    if (!errors.titik && v.titikRaw !== '') {
      const n = Number(v.titikRaw);
      if (assigned && Number.isFinite(n) && n <= 0) {
        // Surveyor sudah ditugaskan: 0 dan angka negatif ditolak
        errors.titik = 'Titik Selesai minimal 1';
      } else if (!Number.isInteger(n) || n < 0 || n > 1509) {
        errors.titik = 'Titik Selesai harus bilangan bulat antara 0-1509';
      }
    }
    return errors;
  }

  function renderFormErrors(errors) {
    Object.keys(FORM_ERR_IDS).forEach(key => {
      const el = document.getElementById(FORM_ERR_IDS[key]);
      if (!el) return;
      el.textContent = errors[key] || '';
      el.style.display = errors[key] ? 'block' : 'none';
    });
    const inputIds = {
      zoneId: 'inputZoneId',
      penggunaan: 'progressPenggunaanSelect',
      status: 'progressStatusSelect',
      titik: 'progressTitik'
    };
    Object.keys(inputIds).forEach(key => {
      const input = document.getElementById(inputIds[key]);
      if (input) input.setAttribute('aria-invalid', errors[key] ? 'true' : 'false');
    });
  }

  function clearFormErrors() {
    submitAttempted = false;
    renderFormErrors({});
  }

  // Setelah percobaan submit pertama, validasi berjalan live agar error hilang saat diperbaiki
  function revalidateLive() {
    if (!submitAttempted) return;
    renderFormErrors(validateZoneForm(readFormValues()));
  }

  async function saveZoneData() {
    const statusMsg = document.getElementById('progressFormStatus');
    const v = readFormValues();

    submitAttempted = true;
    const errors = validateZoneForm(v);
    renderFormErrors(errors);
    if (Object.keys(errors).length > 0) {
      statusMsg.textContent = 'Periksa kembali isian yang ditandai.';
      statusMsg.style.color = '#d93025';
      return;
    }

    const idInput = v.zoneId;
    const surveyor = v.surveyor;
    // Surveyor belum ditugaskan: field boleh kosong, pakai nilai bawaan lama
    const penggunaan = v.penggunaan || 'Pertanian';
    const status = v.status || 'Belum';
    const titik = v.titikRaw === '' ? 0 : parseInt(v.titikRaw, 10);

    const saveBtn = document.getElementById('btnSaveProgress');
    saveBtn.disabled = true;

    statusMsg.textContent = 'Menyimpan perubahan…';
    statusMsg.style.color = '#007aff';

    const updateData = {
      Zona_ID: idInput,
      ID_ZONA: idInput,
      Surveyor: surveyor,
      SURVEYOR: surveyor,
      PENGGUNAAN: penggunaan,
      STATUS: status,
      TITIK_SELESAI: titik
    };

    if (isAddMode) {
      // Buat feature baru jika add mode
      const newFeature = {
        type: 'Feature',
        properties: {
          Zona_ID: idInput,
          ID_ZONA: idInput,
          Surveyor: surveyor,
          SURVEYOR: surveyor,
          PENGGUNAAN: penggunaan,
          STATUS: status,
          TITIK_SELESAI: titik
        },
        geometry: {
          type: 'MultiPolygon',
          coordinates: [[[[117.36, 2.85, 0], [117.37, 2.85, 0], [117.37, 2.84, 0], [117.36, 2.84, 0], [117.36, 2.85, 0]]]]
        }
      };
      if (window.zntSync) {
        window.zntSync.addZone(newFeature);
      }
    } else {
      if (window.zntSync) {
        window.zntSync.saveZoneOverride(idInput, updateData);
      }
    }

    // Simpan ke Firestore progressPublic jika admin terverifikasi (jalur permanen, terlihat publik)
    let syncError = null;
    if (!(db() && isAdminVerified)) {
      syncError = 'Firestore tidak aktif';
    } else {
      try {
        await db().collection('progressPublic').doc(idInput).set({
          status: status,
          titikSelesai: titik,
          updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
      } catch (e) {
        syncError = e.message;
        console.warn('Gagal sync ke Firestore progressPublic:', e.message);
      }
    }

    if (syncError) {
      statusMsg.textContent = `Tersimpan lokal saja (browser ini). Gagal sinkron ke Dashboard Publik: ${syncError}`;
      statusMsg.style.color = '#d93025';
    } else {
      statusMsg.textContent = 'Berhasil disimpan dan disinkronkan ke Dashboard Publik!';
      statusMsg.style.color = '#34a853';
    }

    setTimeout(() => {
      hideForm();
      loadData();
    }, syncError ? 2500 : 900);
  }

  // Reset data survey zona: PENGGUNAAN -> kosong, STATUS -> "Belum", TITIK_SELESAI -> 0.
  // Polygon (Master_Zona) dan surveyor TIDAK disentuh (hanya merge/update 3 field).
  // Tidak memanggil zntSync.deleteZone dan tidak menghapus dokumen progressPublic.
  async function deleteZonePoints(id) {
    if (!confirm('Yakin mereset data survey (Penggunaan, Status, Titik) di zona ini? Polygon tidak akan terhapus.')) return;

    // Jika zona ini sedang dibuka di form edit, tutup dulu agar tidak menimpa nilai baru
    if (currentEditZone === id) hideForm();

    if (window.zntSync) {
      // Override lokal: saveZoneOverride menggabungkan (merge) dengan override yang sudah ada,
      // jadi Surveyor dan properti lain tidak tertimpa. Geometri tidak disertakan.
      window.zntSync.saveZoneOverride(id, { PENGGUNAAN: '', STATUS: 'Belum', TITIK_SELESAI: 0 });
    }

    let syncError = null;
    if (db() && isAdminVerified) {
      try {
        const ref = db().collection('progressPublic').doc(id);
        const snap = await ref.get();
        // update() hanya mengubah status, titikSelesai & updatedAt (penggunaan tidak disimpan di Firestore).
        // Bila dokumen belum ada, tidak ada data di Firestore yang perlu direset.
        if (snap.exists) {
          await ref.update({
            status: 'Belum',
            titikSelesai: 0,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
        }
      } catch (e) {
        syncError = e.message;
        console.warn('Gagal mereset progressPublic di Firestore:', e.message);
      }
    }

    await loadData();
    const statusEl = document.getElementById('progressStatus');
    if (statusEl) {
      statusEl.textContent = syncError
        ? `Data survey zona ${id} direset lokal saja. Gagal sinkron ke Firestore: ${syncError}`
        : `Data survey zona ${id} direset (Penggunaan kosong, Status Belum, Titik 0). Polygon tetap utuh.`;
    }
  }

  // Hapus semua dokumen progressPublic (batch maksimal 400 operasi per commit)
  async function hapusSemuaProgressFirestore() {
    const snap = await db().collection('progressPublic').get();
    let batch = db().batch();
    let n = 0;
    for (const d of snap.docs) {
      batch.delete(d.ref);
      n++;
      if (n % 400 === 0) { await batch.commit(); batch = db().batch(); }
    }
    if (n % 400 !== 0) await batch.commit();
    return n;
  }

  let sudahEkspor = false;

  async function resetMasterData() {
    if (!isAdminVerified) {
      alert('Hanya admin terverifikasi yang dapat mengembalikan data ke kondisi awal.');
      return;
    }
    // Wajib menawarkan backup sebelum data dihapus
    if (!sudahEkspor) {
      if (confirm('Anda belum membuat backup pada sesi ini.\n\nOK = Ekspor backup sekarang lalu lanjut.\nBatal = Lanjut tanpa backup.')) {
        exportGeoJSON();
        sudahEkspor = true;
      } else if (!confirm('Lanjut TANPA backup? Data yang sudah dihapus tidak bisa dipulihkan.')) {
        return;
      }
    }
    if (!confirm('Kembalikan ke Data Awal?\n\nPERINGATAN: semua titik, status, perubahan surveyor, dan zona tambahan/hapus yang sudah diinput akan HILANG, termasuk data di Dashboard Publik (Firestore). Card Zona Siap akan kembali ke 0.')) return;

    if (window.zntSync) {
      window.zntSync.resetToMaster();
    }
    if (window.zntSpatial && typeof window.zntSpatial.hapusPolygonLokal === 'function') {
      await window.zntSpatial.hapusPolygonLokal();
    }
    if (db()) {
      try {
        await db().collection('sebaranTitik').doc('polygon_meta').delete();
      } catch (_) {}
    }
    const status = document.getElementById('progressStatus');
    if (db()) {
      try {
        const n = await hapusSemuaProgressFirestore();
        if (status) status.textContent = `Data dikembalikan ke awal. ${n} data progres Firestore dihapus.`;
      } catch (e) {
        console.warn('Gagal membersihkan progressPublic:', e.message);
        alert(`Data lokal sudah direset, tetapi data Firestore gagal dihapus: ${e.message}`);
      }
    }
    await loadData();
  }

  function tanggalHariIni() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  // Ekspor backup: nilai terkini (override lokal + Firestore), properti internal "_..." dibuang
  function exportGeoJSON() {
    if (!masterGeoJSON) return;
    if (window.zntSync) {
      window.zntSync.applyOverridesToGeoJSON(masterGeoJSON);
    }
    const terkini = new Map(allZones.map((z) => [z.id, z]));
    const salinan = JSON.parse(JSON.stringify(masterGeoJSON));
    salinan.features.forEach((f) => {
      const p = f.properties || {};
      Object.keys(p).forEach((k) => { if (k.charAt(0) === '_') delete p[k]; });
      const id = (window.zntSpatial ? window.zntSpatial.dapatkanIdZona(p) : String(p.histzone || p.Zona_ID || p.ID_ZONA || '')).trim().toUpperCase();
      const z = terkini.get(id);
      if (z) {
        p.STATUS = z.status;
        p.TITIK_SELESAI = z.titikSelesai;
        if (z.surveyor && z.surveyor !== 'Belum ditugaskan') {
          p.Surveyor = z.surveyor;
          p.SURVEYOR = z.surveyor;
        }
        if (z.penggunaan) {
          p.PENGGUNAAN = z.penggunaan;
        }
      }
    });
    const blob = new Blob([JSON.stringify(salinan)], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const dlAnchor = document.createElement('a');
    dlAnchor.href = url;
    dlAnchor.download = `Master_Zona_${tanggalHariIni()}.geojson`;
    document.body.appendChild(dlAnchor);
    dlAnchor.click();
    dlAnchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    sudahEkspor = true;
  }

  function esc(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
  }

  function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    if (isNaN(date.getTime())) return '-';
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  window.zntAdminProgress = { init, refresh: loadData };
})();
