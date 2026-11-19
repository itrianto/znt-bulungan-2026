/* ============================================================
   js/admin-titik.js - Manajemen Unggah & Publikasi Sebaran Titik Survei
   - Mendukung format Excel (.xlsx, .xls) dan CSV (.csv)
   - Menyatukan titik Pertanian & Non-Pertanian ke 1 dokumen Firestore
   - Memastikan dashboard publik langsung terupdate realtime
   ============================================================ */

(function () {
  'use strict';

  let initialized = false;
  let isAdminVerified = false;

  // State titik
  let cloudTitik = [];
  let stagedPertanian = null;
  let stagedNonPertanian = null;
  let hasPendingChanges = false;

  const db = () => (window.firebase && firebase.firestore ? firebase.firestore() : null);

  function esc(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function init(isAdmin) {
    isAdminVerified = !!isAdmin;
    const section = document.getElementById('titikSection');
    if (!section) return;

    if (!isAdminVerified) {
      section.style.display = 'none';
      return;
    }

    section.style.display = 'block';

    if (!initialized) {
      initialized = true;
      setupListeners();
    }

    muatDataTitik();
  }

  function setupListeners() {
    const btnPertanian = document.getElementById('btnBrowsePertanian');
    const inputPertanian = document.getElementById('fileTitikPertanian');
    if (btnPertanian && inputPertanian) {
      btnPertanian.addEventListener('click', () => inputPertanian.click());
      inputPertanian.addEventListener('change', (e) => handleFileSelect(e, 'Pertanian'));
    }

    const btnNonPertanian = document.getElementById('btnBrowseNonPertanian');
    const inputNonPertanian = document.getElementById('fileTitikNonPertanian');
    if (btnNonPertanian && inputNonPertanian) {
      btnNonPertanian.addEventListener('click', () => inputNonPertanian.click());
      inputNonPertanian.addEventListener('change', (e) => handleFileSelect(e, 'Non-Pertanian'));
    }

    const btnPublish = document.getElementById('btnPublishTitik');
    if (btnPublish) {
      btnPublish.addEventListener('click', publikasikanTitikKeCloud);
    }

    const btnRefresh = document.getElementById('btnRefreshTitik');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => {
        stagedPertanian = null;
        stagedNonPertanian = null;
        hasPendingChanges = false;
        muatDataTitik();
      });
    }

    const btnExport = document.getElementById('btnExportTitikJson');
    if (btnExport) {
      btnExport.addEventListener('click', eksporDataTitik);
    }

    const inputFilter = document.getElementById('titikFilterSearch');
    if (inputFilter) {
      inputFilter.addEventListener('input', () => renderSampleTable());
    }
  }

  // Muat data titik dari Firestore, jika kosong fallback ke file lokal CSV
  async function muatDataTitik() {
    const statusEl = document.getElementById('titikCloudStatus');
    const publishStatus = document.getElementById('titikPublishStatus');
    if (statusEl) statusEl.textContent = 'Memeriksa data titik di cloud…';
    if (publishStatus) publishStatus.textContent = '';

    try {
      let dataFound = false;

      // 1. Coba baca dari Firestore (sebaranTitik/master)
      if (db()) {
        try {
          const docSnap = await db().collection('sebaranTitik').doc('master').get();
          if (docSnap.exists) {
            const data = docSnap.data();
            if (Array.isArray(data.points) && data.points.length > 0) {
              cloudTitik = data.points;
              const dateStr = data.updatedAt && data.updatedAt.toDate
                ? data.updatedAt.toDate().toLocaleString('id-ID')
                : (data.updatedAt ? new Date(data.updatedAt).toLocaleString('id-ID') : '-');
              if (statusEl) {
                statusEl.innerHTML = `✅ <strong>${cloudTitik.length} titik aktif di Cloud</strong> (Terakhir diperbarui: ${dateStr} oleh ${esc(data.updatedBy || 'admin')})`;
              }
              dataFound = true;
            }
          }
        } catch (err) {
          console.warn('Gagal membaca sebaranTitik dari Firestore:', err.message);
        }
      }

      // 2. Fallback: baca dari CSV lokal bawaan
      if (!dataFound) {
        if (statusEl) statusEl.textContent = 'Memuat data titik bawaan (CSV lokal)…';
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

        const ptsP = resP ? parseCsvSimple(resP, 'Pertanian') : [];
        const ptsNP = resNP ? parseCsvSimple(resNP, 'Non-Pertanian') : [];
        cloudTitik = [...ptsP, ...ptsNP];

        if (statusEl) {
          statusEl.innerHTML = `ℹ️ Menggunakan data bawaan repositori (<strong>${cloudTitik.length} titik</strong>). Belum pernah diunggah ke cloud.`;
        }
      }

      // Inisialisasi staging dari data aktif
      stagedPertanian = cloudTitik.filter(t => t.jenis === 'Pertanian');
      stagedNonPertanian = cloudTitik.filter(t => t.jenis === 'Non-Pertanian');
      hasPendingChanges = false;

      updateBadgeTotal();
      renderPreviewCard();
      renderSampleTable();
      updatePublishButtonState();

      // Reset info file input
      const sfP = document.getElementById('statusFilePertanian');
      const sfNP = document.getElementById('statusFileNonPertanian');
      if (sfP) sfP.textContent = `Tersedia ${stagedPertanian.length} titik aktif`;
      if (sfNP) sfNP.textContent = `Tersedia ${stagedNonPertanian.length} titik aktif`;

    } catch (err) {
      console.error('Error muat data titik:', err);
      if (statusEl) statusEl.textContent = `Gagal memuat data titik: ${err.message}`;
    }
  }

  async function fetchWithFallback(urls) {
    let lastErr = null;
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (res.ok) return res;
      } catch (err) {
        lastErr = err;
      }
    }
    throw lastErr || new Error('Gagal memuat berkas fallback');
  }

  function parseCsvSimple(text, jenis) {
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

  // ============================================================
  // PARSER BERKAS EXCEL & CSV FLEKSIBEL
  // ============================================================
  async function handleFileSelect(e, jenis) {
    const file = e.target.files[0];
    if (!file) return;

    const statusEl = document.getElementById(jenis === 'Pertanian' ? 'statusFilePertanian' : 'statusFileNonPertanian');
    if (statusEl) {
      statusEl.textContent = `Membaca ${file.name}…`;
      statusEl.style.color = '#007aff';
    }

    try {
      const buffer = await file.arrayBuffer();
      if (!window.XLSX) {
        throw new Error('Pustaka SheetJS belum termuat. Periksa koneksi internet.');
      }

      const workbook = XLSX.read(buffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      const parsedResult = parseRowsToPoints(rawRows, jenis);

      if (parsedResult.points.length === 0) {
        throw new Error(`Tidak ditemukan titik valid di ${file.name}. Pastikan terdapat kolom Latitude & Longitude.`);
      }

      if (jenis === 'Pertanian') {
        stagedPertanian = parsedResult.points;
      } else {
        stagedNonPertanian = parsedResult.points;
      }

      hasPendingChanges = true;

      if (statusEl) {
        statusEl.innerHTML = `✅ <strong>${file.name}</strong> (${parsedResult.points.length} titik valid${parsedResult.errors > 0 ? `, ${parsedResult.errors} baris diabaikan` : ''})`;
        statusEl.style.color = '#34a853';
      }

      updateBadgeTotal();
      renderPreviewCard();
      renderSampleTable();
      updatePublishButtonState();

      const publishStatus = document.getElementById('titikPublishStatus');
      if (publishStatus) {
        publishStatus.textContent = `Berkas ${jenis} siap! Klik tombol "Publikasikan ke Dashboard Publik" untuk menyimpan ke cloud.`;
        publishStatus.style.color = '#e67e22';
      }

    } catch (err) {
      console.error('Error membaca berkas titik:', err);
      if (statusEl) {
        statusEl.textContent = `❌ ${err.message}`;
        statusEl.style.color = '#d9534f';
      }
    }
  }

  function parseRowsToPoints(rows, jenis) {
    if (!rows || rows.length < 2) return { points: [], errors: 0 };

    // 1. Deteksi baris header (cari baris yang mengandung lat/lon/sampel/surveyor/penilai)
    let headerIdx = -1;
    let headers = [];

    for (let r = 0; r < Math.min(10, rows.length); r++) {
      const rowStr = rows[r].map(c => String(c).trim().toLowerCase());
      const hasLat = rowStr.some(c => c === 'lat' || c.includes('latitude') || c.includes('lintang') || c === 'y');
      const hasLon = rowStr.some(c => c === 'lon' || c.includes('longitude') || c.includes('bujur') || c === 'x');
      const hasCoord = rowStr.some(c => c.includes('koordinat') || c.includes('coord'));
      const hasSampel = rowStr.some(c => c.includes('sampel') || c.includes('no') || c === 'id');

      if ((hasLat && hasLon) || hasCoord || (hasSampel && (hasLat || hasLon))) {
        headerIdx = r;
        headers = rowStr;
        break;
      }
    }

    if (headerIdx === -1) {
      // Default baris pertama sebagai header
      headerIdx = 0;
      headers = rows[0].map(c => String(c).trim().toLowerCase());
    }

    const idxNo = headers.findIndex(h => h.includes('sampel') || h.includes('no') || h === 'id');
    const idxSurveyor = headers.findIndex(h => h.includes('penilai') || h.includes('surveyor') || h.includes('nama'));
    let idxLat = headers.findIndex(h => h === 'lat' || h.includes('latitude') || h.includes('lintang') || h === 'y');
    let idxLon = headers.findIndex(h => h === 'lon' || h.includes('longitude') || h.includes('bujur') || h === 'x');
    const idxCoord = headers.findIndex(h => h.includes('koordinat') || h.includes('coord'));
    const idxStatus = headers.findIndex(h => h.includes('status'));

    const points = [];
    let errors = 0;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0 || row.every(cell => String(cell).trim() === '')) {
        continue; // abaikan baris kosong
      }

      let lat = NaN;
      let lon = NaN;

      // Parsing koordinat dari kolom gabungan (misal "2.7353787, 117.267192")
      if (idxCoord >= 0 && row[idxCoord]) {
        const coordStr = String(row[idxCoord]).replace(/[()]/g, '');
        const match = coordStr.match(/(-?\d+\.?\d*)\s*[,;\s]\s*(-?\d+\.?\d*)/);
        if (match) {
          lat = parseFloat(match[1]);
          lon = parseFloat(match[2]);
        }
      }

      // Parsing dari kolom terpisah jika belum didapat
      if (isNaN(lat) || isNaN(lon)) {
        const rawLat = idxLat >= 0 ? row[idxLat] : '';
        const rawLon = idxLon >= 0 ? row[idxLon] : '';
        lat = parseFloat(String(rawLat).replace(',', '.'));
        lon = parseFloat(String(rawLon).replace(',', '.'));
      }

      // Validasi angka koordinat
      if (isNaN(lat) || isNaN(lon)) {
        errors++;
        continue;
      }

      // Auto-koreksi jika surveyor terbalik meletakkan Lon di kolom Lat:
      // Wilayah Bulungan: Lat ~ 2.0 s/d 4.0; Lon ~ 116.0 s/d 118.5
      if (lat > 50 && lon < 10) {
        const temp = lat;
        lat = lon;
        lon = temp;
      }

      const noSampel = idxNo >= 0 && row[idxNo] !== '' ? String(row[idxNo]).trim() : String(points.length + 1);
      const surveyor = idxSurveyor >= 0 && row[idxSurveyor] !== '' ? String(row[idxSurveyor]).trim() : '-';

      let statusVal = 'Disetujui';
      if (idxStatus >= 0 && row[idxStatus] !== '') {
        const st = String(row[idxStatus]).trim();
        statusVal = st.toLowerCase().includes('tolak') ? 'Ditolak' : 'Disetujui';
      }

      points.push({
        noSampel: noSampel,
        surveyor: surveyor,
        lat: Number(lat.toFixed(7)),
        lon: Number(lon.toFixed(7)),
        status: statusVal,
        jenis: jenis
      });
    }

    return { points, errors };
  }

  // ============================================================
  // SIMPAN & PUBLIKASIKAN KE FIRESTORE (Pilihan A - Single Bundle)
  // ============================================================
  async function publikasikanTitikKeCloud() {
    if (!isAdminVerified) {
      alert('Anda harus terverifikasi sebagai admin untuk mempublikasikan titik.');
      return;
    }

    const btnPublish = document.getElementById('btnPublishTitik');
    const statusMsg = document.getElementById('titikPublishStatus');

    const totalP = (stagedPertanian || []).length;
    const totalNP = (stagedNonPertanian || []).length;
    const totalSemua = totalP + totalNP;

    if (totalSemua === 0) {
      alert('Tidak ada data titik untuk dipublikasikan.');
      return;
    }

    if (!confirm(`Yakin ingin mempublikasikan ${totalSemua} titik survei (${totalP} Pertanian, ${totalNP} Non-Pertanian) ke Dashboard Publik?`)) {
      return;
    }

    if (btnPublish) btnPublish.disabled = true;
    if (statusMsg) {
      statusMsg.textContent = '🚀 Sedang mengunggah dan mempublikasikan titik ke Cloud Firestore…';
      statusMsg.style.color = '#007aff';
    }

    const allPoints = [...(stagedPertanian || []), ...(stagedNonPertanian || [])];

    try {
      if (!db()) {
        throw new Error('Firestore tidak aktif atau konfigurasi Firebase belum terpasang.');
      }

      const user = window.zntAuth && window.zntAuth.user ? window.zntAuth.user() : null;
      const userEmail = user && user.email ? user.email : 'admin';

      // Simpan seluruh titik ke 1 dokumen: sebaranTitik/master (Single-Bundle Document)
      await db().collection('sebaranTitik').doc('master').set({
        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        updatedBy: userEmail,
        totalTitik: allPoints.length,
        totalPertanian: totalP,
        totalNonPertanian: totalNP,
        points: allPoints
      });

      cloudTitik = allPoints;
      hasPendingChanges = false;
      try {
        window.dispatchEvent(new CustomEvent('znt:points-updated', { detail: allPoints }));
        document.dispatchEvent(new CustomEvent('znt:points-updated', { detail: allPoints }));
        if (window.zntSync && typeof window.zntSync.broadcast === 'function') {
          window.zntSync.broadcast('POINTS_UPDATED', { count: allPoints.length });
        }
      } catch (_) {}

      if (statusMsg) {
        statusMsg.innerHTML = `🎉 <strong>Berhasil dipublikasikan!</strong> Sebanyak ${allPoints.length} titik telah aktif di Dashboard Publik secara realtime.`;
        statusMsg.style.color = '#34a853';
      }

      const statusEl = document.getElementById('titikCloudStatus');
      if (statusEl) {
        statusEl.innerHTML = `✅ <strong>${allPoints.length} titik aktif di Cloud</strong> (Terakhir diperbarui: baru saja oleh ${esc(userEmail)})`;
      }

      updatePublishButtonState();
      renderPreviewCard();

    } catch (err) {
      console.error('Gagal publikasikan titik:', err);
      if (statusMsg) {
        statusMsg.textContent = `❌ Gagal publikasi: ${err.message}`;
        statusMsg.style.color = '#d9534f';
      }
      if (btnPublish) btnPublish.disabled = false;
    }
  }

  // ============================================================
  // TAMPILAN PREVIEW & TABEL
  // ============================================================
  function updateBadgeTotal() {
    const badge = document.getElementById('titikBadgeTotal');
    if (!badge) return;
    const total = (stagedPertanian || []).length + (stagedNonPertanian || []).length;
    badge.textContent = `(${total} Titik)`;
    badge.style.fontSize = '14px';
    badge.style.color = '#007aff';
    badge.style.fontWeight = '600';
  }

  function renderPreviewCard() {
    const card = document.getElementById('titikPreviewCard');
    if (!card) return;

    const totalP = (stagedPertanian || []).length;
    const totalNP = (stagedNonPertanian || []).length;
    const total = totalP + totalNP;

    if (total === 0) {
      card.style.display = 'none';
      return;
    }

    card.style.display = 'block';

    const elTotal = document.getElementById('previewTotal');
    const elP = document.getElementById('previewPertanian');
    const elNP = document.getElementById('previewNonPertanian');
    const elStatusRatio = document.getElementById('previewStatusRatio');
    const elDetail = document.getElementById('previewDetailMsg');

    if (elTotal) elTotal.textContent = total.toLocaleString('id-ID');
    if (elP) elP.textContent = totalP.toLocaleString('id-ID');
    if (elNP) elNP.textContent = totalNP.toLocaleString('id-ID');

    const all = [...(stagedPertanian || []), ...(stagedNonPertanian || [])];
    const disetujui = all.filter(t => String(t.status).toLowerCase().includes('setuju')).length;
    const ditolak = all.filter(t => String(t.status).toLowerCase().includes('tolak')).length;

    if (elStatusRatio) elStatusRatio.textContent = `${disetujui} / ${ditolak}`;

    if (elDetail) {
      elDetail.innerHTML = hasPendingChanges
        ? `⚠️ Terdapat perubahan berkas baru yang belum dipublikasikan ke cloud. Tekan tombol <strong>"Publikasikan ke Dashboard Publik"</strong> di atas kanan agar data tampil di peta publik.`
        : `✅ Seluruh titik di atas telah sinkron dengan data cloud terkini.`;
    }
  }

  function updatePublishButtonState() {
    const btn = document.getElementById('btnPublishTitik');
    if (!btn) return;
    const total = (stagedPertanian || []).length + (stagedNonPertanian || []).length;
    btn.disabled = !hasPendingChanges || total === 0;
    if (btn.disabled) {
      btn.style.opacity = '0.5';
      btn.style.cursor = 'not-allowed';
    } else {
      btn.style.opacity = '1';
      btn.style.cursor = 'pointer';
    }
  }

  function renderSampleTable() {
    const tbody = document.getElementById('titikTableBody');
    if (!tbody) return;

    const all = [...(stagedPertanian || []), ...(stagedNonPertanian || [])];
    if (all.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:16px;">Belum ada titik yang dimuat.</td></tr>`;
      return;
    }

    const filterInput = document.getElementById('titikFilterSearch');
    const filterQuery = (filterInput ? filterInput.value : '').trim().toLowerCase();

    const filtered = filterQuery
      ? all.filter(t =>
          String(t.noSampel).toLowerCase().includes(filterQuery) ||
          String(t.surveyor).toLowerCase().includes(filterQuery) ||
          String(t.status).toLowerCase().includes(filterQuery) ||
          String(t.jenis).toLowerCase().includes(filterQuery)
        )
      : all;

    const sample = filtered.slice(0, 15); // Tampilkan 15 baris sampel

    tbody.innerHTML = sample.map(t => {
      const isDisetujui = String(t.status).toLowerCase().includes('setuju');
      const badgeColor = isDisetujui ? '#34a853' : '#d9534f';
      const badgeBg = isDisetujui ? 'rgba(52,168,83,0.15)' : 'rgba(217,83,79,0.15)';
      const isPertanian = t.jenis === 'Pertanian';

      return `
        <tr>
          <td><strong>${esc(t.noSampel)}</strong></td>
          <td>${esc(t.surveyor)}</td>
          <td>
            <span style="display:inline-flex;align-items:center;gap:6px;">
              ${isPertanian
                ? '<svg width="12" height="12" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="#34a853"/></svg>'
                : '<svg width="12" height="12" viewBox="0 0 16 16"><polygon points="8,1 15.5,14.5 0.5,14.5" fill="#e67e22"/></svg>'}
              ${esc(t.jenis)}
            </span>
          </td>
          <td><code>${t.lat.toFixed(6)}</code></td>
          <td><code>${t.lon.toFixed(6)}</code></td>
          <td>
            <span style="background:${badgeBg};color:${badgeColor};padding:3px 8px;border-radius:12px;font-size:11px;font-weight:700;">
              ${esc(t.status)}
            </span>
          </td>
        </tr>
      `;
    }).join('');

    if (filtered.length > 15) {
      tbody.innerHTML += `
        <tr>
          <td colspan="6" style="text-align:center;font-size:12px;opacity:0.75;padding:8px;">
            … dan ${filtered.length - 15} titik lainnya (${filtered.length} total terfilter)
          </td>
        </tr>
      `;
    }
  }

  // Unduh backup titik format JSON
  function eksporDataTitik() {
    const all = [...(stagedPertanian || []), ...(stagedNonPertanian || [])];
    if (all.length === 0) {
      alert('Belum ada data titik untuk diekspor.');
      return;
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      totalTitik: all.length,
      points: all
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const nowStr = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `sebaran_titik_backup_${nowStr}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Export ke window
  window.zntAdminTitik = {
    init: init,
    muatDataTitik: muatDataTitik,
    publikasikanTitikKeCloud: publikasikanTitikKeCloud,
    getPoints: () => cloudTitik || []
  };
})();
