/* Moderasi komentar - hanya untuk admin terverifikasi */
(function () {
  'use strict';

  let isAdminVerified = false;
  const db = () => firebase.firestore();

  // Inisialisasi setelah auth ready
  function init(isAdmin) {
    isAdminVerified = isAdmin;
    if (!isAdminVerified) {
      document.getElementById('commentSection').style.display = 'none';
      return;
    }
    document.getElementById('commentSection').style.display = 'block';
    loadComments();
  }

  // Load semua komentar (pending + approved + rejected)
  function loadComments() {
    const tbody = document.getElementById('commentTableBody');
    const status = document.getElementById('commentStatus');

    db().collection('comments').orderBy('createdAt', 'desc').onSnapshot(
      (snapshot) => {
        if (snapshot.empty) {
          tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:#5f6368">Belum ada komentar</td></tr>';
          status.textContent = '';
          return;
        }

        const rows = [];
        snapshot.forEach(doc => {
          const data = doc.data();
          const statusClass = data.status === 'approved' ? 'selesai' : (data.status === 'rejected' ? 'masalah' : 'proses');
          const statusBadge = `<span class="status-badge status-badge--${statusClass}">${esc(data.status)}</span>`;
          const message = data.message.length > 50 ? esc(data.message.substring(0, 50)) + '...' : esc(data.message);
          
          let actions = '';
          if (data.status === 'pending') {
            actions = `
              <button class="btn-approve" data-id="${doc.id}" style="background:#34a853;padding:4px 8px;font-size:0.85em">Setujui</button>
              <button class="btn-reject" data-id="${doc.id}" style="background:#d9534f;padding:4px 8px;font-size:0.85em">Tolak</button>
            `;
          } else {
            actions = `<button class="btn-delete" data-id="${doc.id}" style="padding:4px 8px;font-size:0.85em">Hapus</button>`;
          }
          
          rows.push(`
            <tr>
              <td style="font-size:0.85em">${esc(data.surveyorName)}</td>
              <td>${esc(data.zoneId)}</td>
              <td style="font-size:0.85em;max-width:200px" title="${esc(data.message)}">${message}</td>
              <td style="font-size:0.85em;color:#5f6368">${formatDate(data.createdAt)}</td>
              <td>${statusBadge}</td>
              <td>${actions}</td>
            </tr>
          `);
        });

        tbody.innerHTML = rows.join('');
        attachActions();
        
        const pending = snapshot.docs.filter(d => d.data().status === 'pending').length;
        status.textContent = pending > 0 ? `${pending} komentar menunggu moderasi` : 'Semua komentar sudah dimoderasi';
      },
      (error) => {
        status.textContent = `Error: ${error.message}`;
        console.error('Load comments error:', error);
      }
    );
  }

  // Attach actions ke tombol
  function attachActions() {
    document.querySelectorAll('.btn-approve').forEach(btn => {
      btn.addEventListener('click', () => moderateComment(btn.dataset.id, 'approved'));
    });
    document.querySelectorAll('.btn-reject').forEach(btn => {
      btn.addEventListener('click', () => moderateComment(btn.dataset.id, 'rejected'));
    });
    document.querySelectorAll('.btn-delete').forEach(btn => {
      btn.addEventListener('click', () => deleteComment(btn.dataset.id));
    });
  }

  // Moderate comment (approve/reject)
  async function moderateComment(commentId, newStatus) {
    const status = document.getElementById('commentStatus');
    
    if (!confirm(`${newStatus === 'approved' ? 'Setujui' : 'Tolak'} komentar ini?`)) return;

    try {
      const doc = await db().collection('comments').doc(commentId).get();
      if (!doc.exists) {
        status.textContent = 'Komentar tidak ditemukan';
        return;
      }

      const data = doc.data();
      await db().collection('comments').doc(commentId).update({
        status: newStatus,
        moderatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        moderatedBy: firebase.auth().currentUser.uid
      });

      status.textContent = newStatus === 'approved' ? 'Komentar disetujui' : 'Komentar ditolak';
      status.style.color = '#34a853';
      setTimeout(() => { status.textContent = ''; status.style.color = ''; }, 3000);
    } catch (error) {
      status.textContent = `Error: ${error.message}`;
      status.style.color = '#d93025';
      console.error('Moderate error:', error);
    }
  }

  // Delete comment
  async function deleteComment(commentId) {
    const status = document.getElementById('commentStatus');
    
    if (!confirm('Hapus komentar ini? Tindakan tidak dapat dibatalkan.')) return;

    try {
      await db().collection('comments').doc(commentId).delete();
      status.textContent = 'Komentar dihapus';
      status.style.color = '#34a853';
      setTimeout(() => { status.textContent = ''; status.style.color = ''; }, 3000);
    } catch (error) {
      status.textContent = `Error: ${error.message}`;
      status.style.color = '#d93025';
      console.error('Delete error:', error);
    }
  }

  // Helpers
  function esc(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
  }

  function formatDate(timestamp) {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  // Public API
  window.zntAdminComment = { init };
})();
