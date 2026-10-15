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

      // 2. Muat Master_Zona.geojson
      const resGeo = await fetchWithFallback([
        '../data/geojson/Master_Zona.geojson',
        'data/geojson/Master_Zona.geojson',
        'public-data/Master_Zona.geojson',
        'public-data/public-zona.geojson'
      ]);
      masterGeoJSON = await resGeo.json();

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
        const id = String(p.Zona_ID || p.ID_ZONA || '').trim().toUpperCase();
        const firestoreP = progressMap[id] || {};
        return {
          id: id,
          surveyor: p.Surveyor || p.SURVEYOR || 'Belum ditugaskan',
          penggunaan: p.PENGGUNAAN || p.penggunaan || 'Pertanian',
          status: firestoreP.status || p.STATUS || p.status || 'Belum',
          titikSelesai: firestoreP.titikSelesai != null ? firestoreP.titikSelesai : (p.TITIK_SELESAI || 0),
          updatedAt: firestoreP.updatedAt || p.updatedAt || null,
          feature: f
        };
      });

      renderTable();
      status.textContent = `${allZones.length} zona siap dikelola.`;
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
             z.status.toLowerCase().includes(q);
    });

    if (badge) {
      badge.textContent = `${filtered.length} dari ${allZones.length} zona`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#5f6368">Tidak ada data zona yang cocok</td></tr>';
      return;
    }

    tbody.innerHTML = filtered.map(z => {
      const statusClass = z.status.toLowerCase().replace(/\s+/g, '');
      const badgeHtml = `<span class="status-badge status-badge--${statusClass}">${esc(z.status)}</span>`;
      return `
        <tr>
          <td><strong>${esc(z.id)}</strong></td>
          <td>${esc(z.surveyor)}</td>
          <td><span style="font-size:0.9em;opacity:0.85;">${esc(z.penggunaan)}</span></td>
          <td>${badgeHtml}</td>
          <td>${z.titikSelesai}</td>
          <td style="font-size:0.85em;color:#5f6368">${formatDate(z.updatedAt)}</td>
          <td style="white-space:nowrap;">
            <button class="btn-zone-edit" data-id="${esc(z.id)}" style="background:#007aff;color:#fff;border:none;padding:6px 12px;border-radius:8px;font-weight:600;font-size:12px;cursor:pointer;margin-right:6px;">Edit</button>
            <button class="btn-zone-delete" data-id="${esc(z.id)}" style="background:rgba(217,83,79,0.85);color:#fff;border:none;padding:6px 12px;border-radius:8px;font-weight:600;font-size:12px;cursor:pointer;">Hapus</button>
          </td>
        </tr>
      `;
    }).join('');

    // Pasang event ke tombol edit & hapus
    tbody.querySelectorAll('.btn-zone-edit').forEach(btn => {
      btn.addEventListener('click', () => editZone(btn.dataset.id));
    });
    tbody.querySelectorAll('.btn-zone-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteZone(btn.dataset.id));
    });
  }

  function setupEventListeners() {
    // Tombol Form
    document.getElementById('btnSaveProgress').addEventListener('click', saveZoneData);
    document.getElementById('btnCancelProgress').addEventListener('click', hideForm);

    // Tombol Section Actions
    document.getElementById('btnNewZone').addEventListener('click', showAddZoneForm);
    document.getElementById('btnExportGeoJSON').addEventListener('click', exportGeoJSON);
    document.getElementById('btnResetMaster').addEventListener('click', resetMasterData);

    // Filter Search
    const searchInput = document.getElementById('zoneSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => renderTable(e.target.value));
    }
  }

  function showAddZoneForm() {
    isAddMode = true;
    currentEditZone = null;
    document.getElementById('progressForm').style.display = 'block';
    document.getElementById('zoneFormTitle').textContent = 'Tambah Zona Baru';
    document.getElementById('editZoneId').textContent = '';
    
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

    isAddMode = false;
    currentEditZone = zone.id;
    document.getElementById('progressForm').style.display = 'block';
    document.getElementById('zoneFormTitle').textContent = 'Edit Data Zona ';
    document.getElementById('editZoneId').textContent = zone.id;

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
    document.getElementById('progressForm').scrollIntoView({ behavior: 'smooth' });
  }

  function hideForm() {
    document.getElementById('progressForm').style.display = 'none';
    currentEditZone = null;
    isAddMode = false;
  }

  async function saveZoneData() {
    const statusMsg = document.getElementById('progressFormStatus');
    const idInput = document.getElementById('inputZoneId').value.trim().toUpperCase();
    const surveyor = document.getElementById('progressSurveyorSelect').value;
    const penggunaan = document.getElementById('progressPenggunaanSelect').value;
    const status = document.getElementById('progressStatusSelect').value;
    const titik = parseInt(document.getElementById('progressTitik').value, 10) || 0;

    if (!idInput) {
      statusMsg.textContent = 'ID Zona tidak boleh kosong';
      statusMsg.style.color = '#d93025';
      return;
    }

    if (titik < 0 || titik > 1509) {
      statusMsg.textContent = 'Titik selesai harus antara 0-1509';
      statusMsg.style.color = '#d93025';
      return;
    }

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

  async function deleteZone(id) {
    if (!confirm(`Hapus zona ${id} dari dashboard? Tindakan ini dapat dibatalkan dengan tombol "Kembalikan ke Data Awal".`)) return;
    if (window.zntSync) {
      window.zntSync.deleteZone(id);
    }
    // Hapus juga data progres zona ini di Firestore agar tidak tampil di dashboard publik
    if (db() && isAdminVerified) {
      try {
        await db().collection('progressPublic').doc(id).delete();
      } catch (e) {
        console.warn('Gagal menghapus progressPublic:', e.message);
      }
    }
    loadData();
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
      const id = String(p.Zona_ID || p.ID_ZONA || '').trim().toUpperCase();
      const z = terkini.get(id);
      if (z) {
        p.STATUS = z.status;
        p.TITIK_SELESAI = z.titikSelesai;
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
