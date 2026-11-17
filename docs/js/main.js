/* Orkestrasi dashboard publik berbasis GeoJSON tersanitasi. */
(function () {
  'use strict';
  let dataAktif = null;
  function angka(id, nilai) { const el = document.getElementById(id); if (el) el.textContent = nilai; }
  function hitung(data) {
    const fitur = data.features || []; const status = { 'Belum diverifikasi': 0, Belum: 0, Proses: 0, Selesai: 0, Masalah: 0 };
    fitur.forEach((f) => { const s = window.petaZNT.dapatkanStatus(f.properties); status[s] = (status[s] || 0) + 1; });
    const selesai = status.Selesai || 0;
    angka('totalZona', fitur.length.toLocaleString('id-ID')); angka('zonaSelesai', selesai.toLocaleString('id-ID'));
    angka('zonaProses', (status.Proses || 0).toLocaleString('id-ID')); angka('zonaBelum', (status.Belum || 0).toLocaleString('id-ID'));
    angka('zonaBelumDiverifikasi', (status['Belum diverifikasi'] || 0).toLocaleString('id-ID'));
    angka('persenSelesai', fitur.length ? `${((selesai / fitur.length) * 100).toFixed(1)}%` : '0%');
    window.grafikZNT.render(data, status);
    renderZonaSiap(fitur);
    renderProgresTitik(fitur);
    renderTabel(data);
  }
  // Kartu Progres Titik: kebutuhan = jumlah zona x MIN_TITIK (dihitung, bukan angka tetap).
  // Titik di atas MIN_TITIK per zona dihitung sebagai cadangan.
  function renderProgresTitik(fitur) {
    const ringkas = document.getElementById('titikRingkas');
    if (!ringkas) return;
    let terkumpul = 0, cadangan = 0, kurang = 0, zonaKurang = 0;
    fitur.forEach((f) => {
      const t = Math.max(0, Number(f.properties.TITIK_SELESAI) || 0);
      terkumpul += t;
      cadangan += Math.max(0, t - MIN_TITIK);
      if (t < MIN_TITIK) { zonaKurang++; kurang += MIN_TITIK - t; }
    });
    const kebutuhan = fitur.length * MIN_TITIK;
    const fmt = (n) => n.toLocaleString('id-ID');
    ringkas.textContent = zonaKurang === 0 && fitur.length > 0
      ? `${fmt(terkumpul)} titik terkumpul. Semua zona sudah memenuhi minimal ${MIN_TITIK} titik.`
      : `${fmt(terkumpul)} titik terkumpul. ${fmt(zonaKurang)} zona belum mencapai ${MIN_TITIK} titik.`;
    document.getElementById('titikRinci').textContent =
      `Kebutuhan minimal ${fmt(kebutuhan)} titik (${fmt(fitur.length)} zona x ${MIN_TITIK}) | kurang ${fmt(kurang)} | cadangan ${fmt(cadangan)}`;
  }
  // Zona siap = zona dengan titik >= 3 (titik berasal dari data admin: TITIK_SELESAI).
  // Titik berlebih = cadangan, bukan masalah.
  const MIN_TITIK = 3;
  function renderZonaSiap(fitur) {
    const total = fitur.length;
    const siap = fitur.filter((f) => (Number(f.properties.TITIK_SELESAI) || 0) >= MIN_TITIK).length;
    const persen = total ? (siap / total) * 100 : 0;
    const semua = total > 0 && siap === total;
    const teks = document.getElementById('zonaSiapTeks');
    if (!teks) return;
    teks.textContent = `${siap.toLocaleString('id-ID')} / ${total.toLocaleString('id-ID')} zona siap`;
    document.getElementById('zonaSiapBar').style.width = `${persen.toFixed(1)}%`;
    document.getElementById('zonaSiapBarWrap').setAttribute('aria-valuenow', persen.toFixed(0));
    const badge = document.getElementById('zonaSiapBadge');
    const kelas = semua ? 'selesai' : (siap > 0 ? 'proses' : 'belum');
    badge.className = `status-badge status-badge--${kelas}`;
    badge.textContent = semua ? 'Selesai' : (siap > 0 ? 'Proses' : 'Belum');
    document.getElementById('zonaSiapKet').textContent = semua
      ? 'Semua zona siap dihitung'
      : `${persen.toFixed(1)}% zona siap dihitung (minimal ${MIN_TITIK} titik per zona)`;
  }
  function aman(teks) { const el = document.createElement('span'); el.textContent = teks; return el.innerHTML; }

  function parseTime(val) {
    if (!val) return 0;
    if (typeof val.toMillis === 'function') return val.toMillis();
    if (typeof val.toDate === 'function') return val.toDate().getTime();
    if (val.seconds) return val.seconds * 1000;
    if (typeof val === 'number') return val;
    const parsed = new Date(val).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }

  function formatWaktuRelatif(val) {
    const ms = parseTime(val);
    if (!ms) return '-';
    const diffSec = Math.floor((Date.now() - ms) / 1000);
    if (diffSec < 60) return 'Baru saja';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} mnt lalu`;
    const diffJam = Math.floor(diffMin / 60);
    if (diffJam < 24) return `${diffJam} jam lalu`;
    const diffHari = Math.floor(diffJam / 24);
    if (diffHari <= 7) return `${diffHari} hari lalu`;
    const d = new Date(ms);
    const tgl = String(d.getDate()).padStart(2, '0');
    const bln = String(d.getMonth() + 1).padStart(2, '0');
    return `${tgl}/${bln}/${d.getFullYear()}`;
  }

  let tableClickBound = false;

  function renderTabel(data) {
    dataAktif = data;
    const fitur = [...(data.features || [])];
    const totalSemua = fitur.length;

    // Urutkan zona yang paling baru diupdate di admin ke urutan paling atas
    fitur.sort((a, b) => {
      const timeA = parseTime(a.properties.updatedAt);
      const timeB = parseTime(b.properties.updatedAt);
      if (timeB !== timeA) return timeB - timeA;

      const vA = a.properties._FIRESTORE_VERIFIED ? 1 : 0;
      const vB = b.properties._FIRESTORE_VERIFIED ? 1 : 0;
      if (vB !== vA) return vB - vA;

      const sA = (a.properties.STATUS || '').toLowerCase();
      const sB = (b.properties.STATUS || '').toLowerCase();
      const rank = (s) => (s.includes('selesai') ? 4 : s.includes('proses') ? 3 : s.includes('masalah') ? 2 : s.includes('belum') ? 1 : 0);
      const rA = rank(sA), rB = rank(sB);
      if (rB !== rA) return rB - rA;

      const idA = window.zntSpatial ? window.zntSpatial.dapatkanIdZona(a.properties) : String(a.properties.histzone || a.properties.Zona_ID || a.properties.ID_ZONA || '');
      const idB = window.zntSpatial ? window.zntSpatial.dapatkanIdZona(b.properties) : String(b.properties.histzone || b.properties.Zona_ID || b.properties.ID_ZONA || '');
      return idA.localeCompare(idB, undefined, { numeric: true });
    });

    const countUpdated = fitur.filter(f => parseTime(f.properties.updatedAt) > 0 || f.properties._FIRESTORE_VERIFIED).length;
    const countBadge = document.getElementById('zoneTableCount');
    if (countBadge) {
      countBadge.textContent = countUpdated > 0 ? `${countUpdated} diperbarui` : `${totalSemua} zona`;
    }

    const tbody = document.getElementById('zoneTableBody');
    if (!tbody) return;

    const listTampil = fitur.slice(0, 15);
    tbody.innerHTML = listTampil.map((f) => {
      const p = f.properties;
      const status = window.petaZNT.dapatkanStatus(p);
      const kelas = status.toLowerCase().replace(/\s+/g, '');
      const id = window.zntSpatial ? window.zntSpatial.dapatkanIdZona(p) : String(p.histzone || p.Zona_ID || p.ID_ZONA || '-').trim();
      const surveyor = window.petaZNT.dapatkanSurveyor(p) || '-';
      const titik = Number(p.TITIK_SELESAI) || 0;
      const waktuStr = formatWaktuRelatif(p.updatedAt);
      const isUpdated = parseTime(p.updatedAt) > 0 || p._FIRESTORE_VERIFIED;

      return `
        <tr data-zone-id="${aman(id)}" style="cursor:pointer;" title="Klik untuk fokus ke Zona ${aman(id)} di peta">
          <td><strong style="color:var(--accent,#007aff);">${aman(id)}</strong></td>
          <td><span style="font-size:0.9em;">${aman(surveyor)}</span></td>
          <td><span class="status-badge status-badge--${kelas}">${aman(status)}</span></td>
          <td>${aman(titik)}</td>
          <td style="font-size:0.85em;color:var(--text-sub);white-space:nowrap;">
            ${isUpdated ? `🕒 ${aman(waktuStr)}` : aman(waktuStr)}
          </td>
        </tr>
      `;
    }).join('');

    if (!tableClickBound) {
      tableClickBound = true;
      tbody.addEventListener('click', (e) => {
        const tr = e.target.closest('tr[data-zone-id]');
        if (!tr) return;
        const id = tr.dataset.zoneId;
        if (window.petaZNT && window.petaZNT.fokusZona) {
          window.petaZNT.fokusZona(id);
          if (window.innerWidth < 992) {
            const mapEl = document.getElementById('map');
            if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      });
    }
  }
  document.addEventListener('znt:data-ready', (event) => hitung(event.detail));
  document.addEventListener('znt:progress-changed', (event) => hitung(event.detail));
})();
