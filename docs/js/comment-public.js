/* Komentar publik - submit dan display approved comments */
(function () {
  'use strict';

  // Setup form and load comments
  function init() {
    if (!(window.firebase && window.ZNT_FIREBASE_CONFIG)) {
      console.warn('Firebase not available for comments');
      return;
    }

    // Explicit Firestore check
    let firestore = null;
    try {
      firestore = firebase.firestore();
      if (!firestore) {
        console.error('Firestore instance failed to create');
        return;
      }
      console.log('✓ Firestore initialized:', firestore.app.name);
    } catch (err) {
      console.error('Firestore init error:', err.message);
      return;
    }

    setupForm();
    loadApprovedComments();
  }

  // Setup comment form
  function setupForm() {
    const btn = document.getElementById('btnSendComment');
    const messageInput = document.getElementById('commentMessage');
    const charCount = document.getElementById('commentCharCount');

    // Character counter
    if (messageInput && charCount) {
      messageInput.addEventListener('input', () => {
        charCount.textContent = messageInput.value.length;
      });
    }

    // Submit handler
    if (btn) {
      btn.addEventListener('click', submitComment);
    }
  }

   // Submit comment
   async function submitComment() {
     const status = document.getElementById('commentFormStatus');
     const surveyorName = document.getElementById('commentSurveyorName').value.trim();
     const zoneId = document.getElementById('commentZoneId').value.trim().toUpperCase();
     const message = document.getElementById('commentMessage').value.trim();

     // Reset status
     status.textContent = '';
     status.style.color = '';

     // Validasi
     if (!surveyorName || surveyorName.length === 0) {
       status.textContent = 'Nama surveyor harus diisi';
       status.style.color = '#d93025';
       return;
     }

     if (surveyorName.length > 100) {
       status.textContent = 'Nama surveyor maksimal 100 karakter';
       status.style.color = '#d93025';
       return;
     }

     if (!zoneId || !/^Z[0-9]{3}$/.test(zoneId)) {
       status.textContent = 'ID Zona harus format Z001-Z999';
       status.style.color = '#d93025';
       return;
     }

     if (!message || message.length === 0) {
       status.textContent = 'Komentar harus diisi';
       status.style.color = '#d93025';
       return;
     }

     if (message.length > 1000) {
       status.textContent = 'Komentar maksimal 1000 karakter';
       status.style.color = '#d93025';
       return;
     }

     const data = {
       surveyorName,
       zoneId,
       message,
       status: 'pending',
       createdAt: new Date()
     };

     try {
       console.log('[Comment] Submitting...', { surveyorName, zoneId, status: 'pending' });
       
       const ref = await firebase.firestore().collection('comments').add(data);
       console.log('[Comment] ✓ Success:', ref.id);
       
       status.textContent = 'Komentar berhasil dikirim. Menunggu persetujuan admin.';
       status.style.color = '#34a853';

       // Clear form
       document.getElementById('commentSurveyorName').value = '';
       document.getElementById('commentZoneId').value = '';
       document.getElementById('commentMessage').value = '';
       document.getElementById('commentCharCount').textContent = '0';
     } catch (error) {
       console.error('[Comment] Error:', error.code, error.message);
       
       let userMessage = 'Gagal mengirim komentar.';
       if (error.code === 'permission-denied') {
         userMessage = 'Akses ditolak oleh server. Refresh halaman dan coba lagi.';
       } else if (error.code === 'unavailable') {
         userMessage = 'Layanan sedang maintenance. Coba beberapa saat lagi.';
       } else if (error.code === 'unauthenticated') {
         userMessage = 'Anda perlu login untuk mengirim komentar.';
       }
       
       status.textContent = userMessage;
       status.style.color = '#d93025';
     }
   }

   // Load and display approved comments
   function loadApprovedComments() {
     const container = document.getElementById('commentListContainer');
     
     if (!container) {
       console.warn('[Comment] Container #commentListContainer not found');
       return;
     }

     console.log('[Comment] Starting to load approved comments...');

     firebase.firestore().collection('comments')
       .where('status', '==', 'approved')
       .orderBy('createdAt', 'desc')
       .limit(20)
       .onSnapshot(
         (snapshot) => {
           console.log('[Comment] ✓ Listener fired, docs count:', snapshot.size);
           if (snapshot.empty) {
             console.log('[Comment] No approved comments found');
             container.innerHTML = '<p class="placeholder__text">Belum ada komentar yang disetujui</p>';
             return;
           }

           const comments = [];
           snapshot.forEach(doc => {
             const data = doc.data();
             console.log('[Comment] Processing doc:', doc.id, 'status:', data.status);
             comments.push(`
               <div style="margin-bottom:16px;padding:16px;background:#fff;border:1px solid #e0e0e0;border-radius:8px">
                 <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                   <strong style="color:#c46b4e">${esc(data.surveyorName)}</strong>
                   <span style="font-size:0.85em;color:#5f6368">Zona ${esc(data.zoneId)}</span>
                 </div>
                 <p style="margin:0 0 8px 0;color:#202124">${esc(data.message)}</p>
                 <small style="color:#5f6368">${formatDate(data.createdAt)}</small>
               </div>
             `);
           });

           container.innerHTML = comments.join('');
           console.log('[Comment] ✓ Rendered', comments.length, 'comments');
         },
         (error) => {
           console.error('[Comment] ✗ Listener error:', error.code, error.message);
           container.innerHTML = `<p class="placeholder__text" style="color:#d93025">Error memuat komentar: ${error.message}</p>`;
         }
       );
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
    return date.toLocaleDateString('id-ID', { 
      day: 'numeric', 
      month: 'long', 
      year: 'numeric',
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  // Auto-init
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
