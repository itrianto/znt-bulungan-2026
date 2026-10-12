/* Tampilan memeriksa dokumen admin sendiri; Rules tetap sumber otorisasi. */
(function () {
  'use strict';
  const status = document.getElementById('adminStatus');
  const masuk = document.getElementById('adminLogin');
  const keluar = document.getElementById('adminLogout');
  const formContainer = document.getElementById('adminAuthForm');
  const verifiedContainer = document.getElementById('adminAuthVerified');
  const emailDisplay = document.getElementById('adminEmailDisplay');
  const togglePassword = document.getElementById('adminTogglePassword');
  const passwordInput = document.getElementById('adminPassword');
  
  // Password toggle
  if (togglePassword && passwordInput) {
    togglePassword.addEventListener('click', () => {
      const type = passwordInput.type === 'password' ? 'text' : 'password';
      passwordInput.type = type;
      togglePassword.setAttribute('aria-label', type === 'password' ? 'Tampilkan password' : 'Sembunyikan password');
    });
  }
  
  if (!window.zntAuth) {
    status.textContent = 'Konfigurasi Firebase belum tersedia.';
    masuk.disabled = true;
    return;
  }
  
  async function periksaAdmin(user) {
    if (!user) {
      // Show login form
      formContainer.hidden = false;
      verifiedContainer.hidden = true;
      status.textContent = '';
      masuk.disabled = false;
      masuk.textContent = 'Masuk';
      
      if (window.zntAdminSurveyor) window.zntAdminSurveyor.init(false);
      if (window.zntAdminProgress) window.zntAdminProgress.init(false);
      if (window.zntAdminComment) window.zntAdminComment.init(false);
      return;
    }
    
    // Show loading state
    masuk.disabled = true;
    masuk.textContent = 'Memproses...';
    status.textContent = 'Memverifikasi akses admin…';
    
    try {
      const dokumen = await firebase.firestore().collection('admins').doc(user.uid).get();
      const isAdmin = dokumen.exists;
      
      if (isAdmin) {
        // Show verified state
        formContainer.hidden = true;
        verifiedContainer.hidden = false;
        emailDisplay.textContent = user.email;
      } else {
        // Not admin
        status.textContent = 'Login berhasil, tetapi akun ini bukan admin.';
        status.style.color = 'var(--issue)';
      }
      
      if (window.zntAdminSurveyor) window.zntAdminSurveyor.init(isAdmin);
      if (window.zntAdminProgress) window.zntAdminProgress.init(isAdmin);
      if (window.zntAdminComment) window.zntAdminComment.init(isAdmin);
    } catch (error) {
      status.textContent = 'Akses admin tidak dapat diverifikasi.';
      status.style.color = 'var(--issue)';
      console.warn('Verifikasi admin gagal:', error.code);
      
      if (window.zntAdminSurveyor) window.zntAdminSurveyor.init(false);
      if (window.zntAdminProgress) window.zntAdminProgress.init(false);
      if (window.zntAdminComment) window.zntAdminComment.init(false);
    }
  }
  
  window.zntAuth.onChange((user) => {
    periksaAdmin(user);
  });
  
  masuk.addEventListener('click', async () => {
    status.textContent = '';
    status.style.color = '';
    masuk.disabled = true;
    masuk.textContent = 'Memproses...';
    
    try { 
      await window.zntAuth.signIn(); 
    } catch (error) { 
      status.textContent = `Login tidak berhasil: ${error.message}`;
      status.style.color = 'var(--issue)';
      masuk.disabled = false;
      masuk.textContent = 'Masuk';
    }
  });
  
  keluar.addEventListener('click', () => window.zntAuth.signOut());
})();
