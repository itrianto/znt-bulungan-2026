/* Pengelolaan surveyor dan penugasan zona - hanya untuk admin terverifikasi */
(function () {
  'use strict';

  let isAdminVerified = false;
  const db = () => firebase.firestore();

  // Inisialisasi setelah auth ready
  function init(isAdmin) {
    isAdminVerified = isAdmin;
    if (!isAdminVerified) {
      document.getElementById('surveyorSection').style.display = 'none';
      return;
    }
    document.getElementById('surveyorSection').style.display = 'block';
    loadAssignments();
    setupEventListeners();
  }

  // Load semua assignments dari Firestore
  async function loadAssignments() {
    const tbody = document.getElementById('assignmentTableBody');
    const status = document.getElementById('assignmentStatus');
    
    try {
      const snapshot = await db().collection('surveyorAssignments').orderBy('updatedAt', 'desc').get();
      
      if (snapshot.empty) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#5f6368">Belum ada penugasan surveyor</td></tr>';
        return;
      }

      const rows = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const publishStatus = data.isPublished ? 
          '<span class="status-badge status-badge--selesai">Dipublikasi</span>' : 
          '<span class="status-badge status-badge--belum">Draft</span>';
        
        rows.push(`
          <tr>
            <td>${esc(data.displayName)}</td>
            <td>${data.zones.length}</td>
            <td>${publishStatus}</td>
            <td style="font-size:0.85em;color:#5f6368">${formatDate(data.updatedAt)}</td>
            <td>
              <button class="btn-edit" data-id="${doc.id}">Edit</button>
              ${data.isPublished ? 
                `<button class="btn-unpublish" data-id="${doc.id}">Batalkan</button>` : 
                `<button class="btn-publish" data-id="${doc.id}">Terbitkan</button>`
              }
              <button class="btn-delete" data-id="${doc.id}">Hapus</button>
            </td>
          </tr>
        `);
      });
      
      tbody.innerHTML = rows.join('');
      attachRowActions();
    } catch (error) {
      status.textContent = `Error: ${error.message}`;
      console.error('Load assignments error:', error);
    }
  }

  // Setup event listeners
  function setupEventListeners() {
    document.getElementById('btnNewAssignment').addEventListener('click', showNewForm);
    document.getElementById('btnCancelForm').addEventListener('click', hideForm);
    document.getElementById('btnSaveAssignment').addEventListener('click', saveAssignment);
  }

  // Attach actions ke tombol di tabel
  function attachRowActions() {
    document.querySelectorAll('.btn-edit').forEach(btn => {
      btn.addEventListener('click', () => editAssignment(btn.dataset.id));
    });
    document.querySelectorAll('.btn-publish').forEach(btn => {
      btn.addEventListener('click', () => publishAssignment(btn.dataset.id));
    });
    document.querySelectorAll('.btn-unpublish').forEach(btn => {
      btn.addEventListener('click', () => unpublishAssignment(btn.dataset.id));
    });
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteAssignment(btn.dataset.id));
    });
  }

  // Show form baru
  function showNewForm() {
    document.getElementById('assignmentForm').style.display = 'block';
    document.getElementById('formTitle').textContent = 'Penugasan Surveyor Baru';
    document.getElementById('assignmentId').value = '';
    document.getElementById('displayName').value = '';
    document.getElementById('zones').value = '';
    document.getElementById('formStatus').textContent = '';
  }

  // Hide form
  function hideForm() {
    document.getElementById('assignmentForm').style.display = 'none';
  }

  // Edit assignment
  async function editAssignment(id) {
    try {
      const doc = await db().collection('surveyorAssignments').doc(id).get();
      if (!doc.exists) {
        alert('Dokumen tidak ditemukan');
        return;
      }
      
      const data = doc.data();
      document.getElementById('assignmentForm').style.display = 'block';
      document.getElementById('formTitle').textContent = 'Edit Penugasan Surveyor';
      document.getElementById('assignmentId').value = id;
      document.getElementById('displayName').value = data.displayName;
      document.getElementById('zones').value = data.zones.join(', ');
      document.getElementById('formStatus').textContent = '';
    } catch (error) {
      alert(`Error: ${error.message}`);
    }
  }

  // Save assignment (create or update)
  async function saveAssignment() {
    const status = document.getElementById('formStatus');
    const id = document.getElementById('assignmentId').value;
    const displayName = document.getElementById('displayName').value.trim();
    const zonesText = document.getElementById('zones').value.trim();

    // Validasi
    if (!displayName) {
      status.textContent = 'Nama surveyor harus diisi';
      return;
    }
    if (displayName.length > 100) {
      status.textContent = 'Nama surveyor maksimal 100 karakter';
      return;
    }

    const zones = zonesText ? zonesText.split(',').map(z => z.trim()).filter(z => z) : [];
    if (zones.length > 500) {
      status.textContent = 'Maksimal 500 zona';
      return;
    }

    const data = {
      displayName,
      zones,
      isPublished: false,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      if (id) {
        // Update
        await db().collection('surveyorAssignments').doc(id).update(data);
        status.textContent = 'Penugasan berhasil diperbarui';
      } else {
        // Create
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        await db().collection('surveyorAssignments').add(data);
        status.textContent = 'Penugasan berhasil dibuat';
      }
      
      setTimeout(() => {
        hideForm();
        loadAssignments();
      }, 1000);
    } catch (error) {
      status.textContent = `Error: ${error.message}`;
      console.error('Save error:', error);
    }
  }

  // Publish assignment
  async function publishAssignment(id) {
    if (!confirm('Terbitkan penugasan ini ke dashboard publik?')) return;

    const status = document.getElementById('assignmentStatus');
    try {
      // 1. Get assignment data
      const assignDoc = await db().collection('surveyorAssignments').doc(id).get();
      if (!assignDoc.exists) {
        status.textContent = 'Dokumen tidak ditemukan';
        return;
      }

      const data = assignDoc.data();
      
      // 2. Update isPublished di surveyorAssignments
      await db().collection('surveyorAssignments').doc(id).update({
        isPublished: true,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // 3. Create/update di surveyorPublic
      await db().collection('surveyorPublic').doc(id).set({
        displayName: data.displayName,
        zones: data.zones,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // Sinkronkan ke zntSync lokal untuk realtime dashboard
      if (window.zntSync && data.zones) {
        data.zones.forEach(z => {
          window.zntSync.saveZoneOverride(z, { Surveyor: data.displayName, SURVEYOR: data.displayName });
        });
      }

      status.textContent = 'Berhasil diterbitkan';
      setTimeout(() => {
        status.textContent = '';
        loadAssignments();
      }, 2000);
    } catch (error) {
      status.textContent = `Error publikasi: ${error.message}`;
      console.error('Publish error:', error);
    }
  }

  // Unpublish assignment
  async function unpublishAssignment(id) {
    if (!confirm('Batalkan publikasi? Data akan dihapus dari dashboard publik.')) return;

    const status = document.getElementById('assignmentStatus');
    try {
      const assignDoc = await db().collection('surveyorAssignments').doc(id).get();
      const zones = assignDoc.exists ? (assignDoc.data().zones || []) : [];

      // 1. Update isPublished di surveyorAssignments
      await db().collection('surveyorAssignments').doc(id).update({
        isPublished: false,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // 2. Delete dari surveyorPublic
      await db().collection('surveyorPublic').doc(id).delete();

      // Sinkronkan ke zntSync lokal
      if (window.zntSync && zones.length > 0) {
        zones.forEach(z => {
          window.zntSync.saveZoneOverride(z, { Surveyor: 'Belum ditugaskan', SURVEYOR: 'Belum ditugaskan' });
        });
      }

      status.textContent = 'Publikasi dibatalkan';
      setTimeout(() => {
        status.textContent = '';
        loadAssignments();
      }, 2000);
    } catch (error) {
      status.textContent = `Error pembatalan: ${error.message}`;
      console.error('Unpublish error:', error);
    }
  }

  // Delete assignment
  async function deleteAssignment(id) {
    if (!confirm('Hapus penugasan ini? Tindakan tidak dapat dibatalkan.')) return;

    const status = document.getElementById('assignmentStatus');
    try {
      // 1. Check if published
      const doc = await db().collection('surveyorAssignments').doc(id).get();
      const zones = (doc.exists && doc.data().zones) ? doc.data().zones : [];

      if (doc.exists && doc.data().isPublished) {
        // Delete dari surveyorPublic dulu
        await db().collection('surveyorPublic').doc(id).delete();
      }

      // 2. Delete dari surveyorAssignments
      await db().collection('surveyorAssignments').doc(id).delete();

      if (window.zntSync && zones.length > 0) {
        zones.forEach(z => {
          window.zntSync.saveZoneOverride(z, { Surveyor: 'Belum ditugaskan', SURVEYOR: 'Belum ditugaskan' });
        });
      }

      status.textContent = 'Penugasan dihapus';
      setTimeout(() => {
        status.textContent = '';
        loadAssignments();
      }, 2000);
    } catch (error) {
      status.textContent = `Error hapus: ${error.message}`;
      console.error('Delete error:', error);
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
  window.zntAdminSurveyor = { init };
})();
