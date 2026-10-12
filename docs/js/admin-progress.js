/* Editor progres zona - hanya untuk admin terverifikasi */
(function () {
  'use strict';

  let isAdminVerified = false;
  let zonesData = [];
  let currentEditZone = null;
  const db = () => firebase.firestore();

  // Inisialisasi setelah auth ready
  function init(isAdmin) {
    isAdminVerified = isAdmin;
    if (!isAdminVerified) {
      document.getElementById('progressSection').style.display = 'none';
      return;
    }
    document.getElementById('progressSection').style.display = 'block';
    loadZones();
    setupEventListeners();
  }

  // Load semua zona dengan progress dari Firestore
  async function loadZones() {
    const tbody = document.getElementById('progressTableBody');
    const status = document.getElementById('progressStatus');
    
    try {
      // Load zona dari public GeoJSON
      const res = await fetch('public-data/public-zona.geojson');
      const geojson = await res.json();
      zonesData = geojson.features.map(f => ({
        id: f.properties.ID_ZONA,
        surveyor: f.properties.SURVEYOR || 'Belum ditugaskan'
      }));

      // Load progress dari Firestore
      const progressSnapshot = await db().collection('progressPublic').get();
      const progressMap = {};
      progressSnapshot.forEach(doc => {
        progressMap[doc.id] = doc.data();
      });

      // Merge data
      const rows = [];
      zonesData.forEach(zone => {
        const progress = progressMap[zone.id] || { status: 'Belum', titikSelesai: 0 };
        const statusBadge = `<span class="status-badge status-badge--${progress.status.toLowerCase().replace(/\s+/g, '')}">${esc(progress.status)}</span>`;
        const updatedAt = progress.updatedAt ? formatDate(progress.updatedAt) : '-';
        
        rows.push(`
          <tr>
            <td>${esc(zone.id)}</td>
            <td style="font-size:0.85em">${esc(zone.surveyor)}</td>
            <td>${statusBadge}</td>
            <td>${progress.titikSelesai || 0}</td>
            <td style="font-size:0.85em;color:#5f6368">${updatedAt}</td>
            <td>
              <button class="btn-edit" data-zone="${zone.id}" data-status="${progress.status}" data-titik="${progress.titikSelesai || 0}">Edit</button>
            </td>
          </tr>
        `);
      });
      
      tbody.innerHTML = rows.join('');
      attachRowActions();
      status.textContent = `${zonesData.length} zona dimuat`;
    } catch (error) {
      status.textContent = `Error: ${error.message}`;
      console.error('Load zones error:', error);
    }
  }

  // Setup event listeners
  function setupEventListeners() {
    document.getElementById('btnSaveProgress').addEventListener('click', saveProgress);
    document.getElementById('btnCancelProgress').addEventListener('click', hideForm);
  }

  // Attach actions ke tombol di tabel
  function attachRowActions() {
    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => {
        const zoneId = btn.dataset.zone;
        const status = btn.dataset.status;
        const titik = parseInt(btn.dataset.titik);
        editProgress(zoneId, status, titik);
      });
    });
  }

  // Edit progress
  function editProgress(zoneId, status, titik) {
    currentEditZone = zoneId;
    document.getElementById('progressForm').style.display = 'block';
    document.getElementById('editZoneId').textContent = zoneId;
    document.getElementById('progressStatusSelect').value = status;
    document.getElementById('progressTitik').value = titik;
    document.getElementById('progressFormStatus').textContent = '';
  }

  // Hide form
  function hideForm() {
    document.getElementById('progressForm').style.display = 'none';
    currentEditZone = null;
  }

  // Save progress
  async function saveProgress() {
    const status = document.getElementById('progressFormStatus');
    const progressStatus = document.getElementById('progressStatusSelect').value;
    const titik = parseInt(document.getElementById('progressTitik').value) || 0;

    // Validasi
    if (titik < 0 || titik > 1509) {
      status.textContent = 'Titik selesai harus antara 0-1509';
      return;
    }

    if (!currentEditZone) {
      status.textContent = 'Zona tidak valid';
      return;
    }

    const data = {
      status: progressStatus,
      titikSelesai: titik,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      await db().collection('progressPublic').doc(currentEditZone).set(data);
      status.textContent = 'Progres berhasil disimpan';
      status.style.color = '#34a853';
      
      setTimeout(() => {
        hideForm();
        loadZones();
      }, 1000);
    } catch (error) {
      status.textContent = `Error: ${error.message}`;
      status.style.color = '#d93025';
      console.error('Save progress error:', error);
    }
  }

  // Helpers
  function esc(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  }

  // Public API
  window.zntAdminProgress = { init };
})();
