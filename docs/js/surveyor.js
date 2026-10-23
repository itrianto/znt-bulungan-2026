/* Tampilan surveyor publik - data dari surveyor-zones.json */
(function () {
  'use strict';

  let surveyorData = [];

  // Load data surveyor dari static JSON
  function loadPublicSurveyors() {
    if (!(window.firebase && firebase.firestore)) {
      return loadFromJson();
    }

    firebase.firestore().collection('surveyorPublic')
      .orderBy('displayName')
      .onSnapshot(
        (snapshot) => {
          surveyorData = snapshot.docs.map(d => d.data());
          document.dispatchEvent(new CustomEvent('surveyors:updated'));
          if (surveyorData.length > 0) {
            renderSurveyorList();
          } else {
            hideSurveyorSection();
          }
        },
        (error) => {
          console.warn('Firestore surveyor gagal, pakai JSON:', error.message);
          loadFromJson();
        }
      );
  }

  function loadFromJson() {
    fetch('public-data/surveyor-zones.json?v=357')
      .then(response => response.json())
      .then(data => {
        surveyorData = data.surveyors || [];
        if (surveyorData.length > 0) {
          renderSurveyorList();
        } else {
          hideSurveyorSection();
        }
      })
      .catch(() => hideSurveyorSection());
  }

  // Render daftar surveyor
  function renderSurveyorList() {
    const section = document.getElementById('surveyorSection');
    const tbody = document.getElementById('surveyorTableBody');
    
    if (!section || !tbody) return;

    section.style.display = 'block';
    
    const rows = surveyorData.map(s => {
      const zoneList = s.zones && s.zones.length > 0 
        ? s.zones.slice(0, 5).map(z => esc(z)).join(', ') + (s.zones.length > 5 ? '...' : '')
        : 'Belum ada penugasan';
      
      return `
        <tr>
          <td>${esc(s.displayName)}</td>
          <td>${s.zoneCount || 0}</td>
          <td style="font-size:0.85em;color:#5f6368">${zoneList}</td>
        </tr>
      `;
    });

    tbody.innerHTML = rows.join('');
    
    const count = document.getElementById('surveyorCount');
    if (count) {
      count.textContent = `${surveyorData.length} surveyor`;
    }
  }

  // Sembunyikan section jika tidak ada data
  function hideSurveyorSection() {
    const section = document.getElementById('surveyorSection');
    if (section) {
      section.style.display = 'none';
    }
  }

  // Get surveyor by zone ID
  function getSurveyorByZone(zoneId) {
    return surveyorData.find(s => s.zones && s.zones.includes(zoneId));
  }

  // XSS protection
  function esc(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Public API
  window.zntSurveyor = {
    load: loadPublicSurveyors,
    getSurveyorByZone
  };

  // Auto-load saat halaman siap
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadPublicSurveyors);
  } else {
    loadPublicSurveyors();
  }
})();
