/* ============================================================
   js/sync.js - Sinkronisasi Data Realtime Admin & Dashboard Publik
   - Media: localStorage (persistensi tab & reload) + BroadcastChannel (realtime tanpa reload)
   - Mendukung override Zona_ID, Surveyor, PENGGUNAAN, Status, Titik Selesai, dan Geometri
   ============================================================ */

(function () {
  'use strict';

  const STORAGE_KEY_OVERRIDES = 'znt_zona_overrides_v1';
  const STORAGE_KEY_DELETED = 'znt_zona_deleted_v1';
  const STORAGE_KEY_ADDED = 'znt_zona_added_v1';
  const CHANNEL_NAME = 'znt_sync_channel';

  let channel = null;
  if (typeof BroadcastChannel !== 'undefined') {
    try {
      channel = new BroadcastChannel(CHANNEL_NAME);
    } catch (e) {
      console.warn('BroadcastChannel tidak didukung, menggunakan storage event:', e);
    }
  }

  function getOverrides() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_OVERRIDES);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      console.warn('Gagal membaca znt_zona_overrides dari localStorage:', e);
      return {};
    }
  }

  function getDeletedZoneIds() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_DELETED);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function getAddedZones() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY_ADDED);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  function broadcast(type, detail) {
    const payload = { type, detail, timestamp: Date.now() };
    if (channel) {
      channel.postMessage(payload);
    }
    // Storage event trigger untuk tab lain jika BroadcastChannel dibatasi
    try {
      localStorage.setItem('znt_sync_ping', String(Date.now()));
    } catch (_) {}
    // Trigger event lokal di window yang sama
    window.dispatchEvent(new CustomEvent('znt:sync-update', { detail: payload }));
  }

  function saveZoneOverride(zoneId, data) {
    if (!zoneId) return false;
    const cleanId = String(zoneId).trim().toUpperCase();
    const overrides = getOverrides();
    overrides[cleanId] = {
      ...(overrides[cleanId] || {}),
      ...data,
      Zona_ID: cleanId,
      ID_ZONA: cleanId,
      updatedAt: new Date().toISOString()
    };
    try {
      localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(overrides));
      broadcast('ZONE_OVERRIDE_SAVED', { zoneId: cleanId, data: overrides[cleanId] });
      return true;
    } catch (e) {
      console.error('Gagal menyimpan override zona ke localStorage:', e);
      return false;
    }
  }

  function deleteZone(zoneId) {
    if (!zoneId) return;
    const cleanId = String(zoneId).trim().toUpperCase();
    const deleted = getDeletedZoneIds();
    if (!deleted.includes(cleanId)) {
      deleted.push(cleanId);
      localStorage.setItem(STORAGE_KEY_DELETED, JSON.stringify(deleted));
    }
    // Hapus dari overrides jika ada
    const overrides = getOverrides();
    if (overrides[cleanId]) {
      delete overrides[cleanId];
      localStorage.setItem(STORAGE_KEY_OVERRIDES, JSON.stringify(overrides));
    }
    // Hapus dari added jika ada
    const added = getAddedZones().filter(f => {
      const fid = String(f.properties.Zona_ID || f.properties.ID_ZONA || '').trim().toUpperCase();
      return fid !== cleanId;
    });
    localStorage.setItem(STORAGE_KEY_ADDED, JSON.stringify(added));

    broadcast('ZONE_DELETED', { zoneId: cleanId });
  }

  function addZone(feature) {
    if (!feature || !feature.properties) return;
    const props = feature.properties;
    const zoneId = String(props.Zona_ID || props.ID_ZONA || '').trim().toUpperCase();
    if (!zoneId) return;

    props.Zona_ID = zoneId;
    props.ID_ZONA = zoneId;
    const added = getAddedZones().filter(f => {
      const fid = String(f.properties.Zona_ID || f.properties.ID_ZONA || '').trim().toUpperCase();
      return fid !== zoneId;
    });
    added.push(feature);
    localStorage.setItem(STORAGE_KEY_ADDED, JSON.stringify(added));

    // Hapus dari deleted jika sebelumnya pernah dihapus
    const deleted = getDeletedZoneIds().filter(id => id !== zoneId);
    localStorage.setItem(STORAGE_KEY_DELETED, JSON.stringify(deleted));

    broadcast('ZONE_ADDED', { feature });
  }

  function resetToMaster() {
    localStorage.removeItem(STORAGE_KEY_OVERRIDES);
    localStorage.removeItem(STORAGE_KEY_DELETED);
    localStorage.removeItem(STORAGE_KEY_ADDED);
    broadcast('RESET_TO_MASTER', {});
  }

  // Terapkan override ke FeatureCollection GeoJSON
  function applyOverridesToGeoJSON(geojson) {
    if (!geojson || !geojson.features) return geojson;

    const overrides = getOverrides();
    const deleted = getDeletedZoneIds();
    const added = getAddedZones();

    // 1. Filter out deleted zones
    if (deleted.length > 0) {
      geojson.features = geojson.features.filter(f => {
        const id = String(f.properties.Zona_ID || f.properties.ID_ZONA || '').trim().toUpperCase();
        return !deleted.includes(id);
      });
    }

    // 2. Apply property overrides
    geojson.features.forEach(f => {
      const id = String(f.properties.Zona_ID || f.properties.ID_ZONA || '').trim().toUpperCase();
      const ov = overrides[id];
      if (ov) {
        if (ov.Surveyor) {
          f.properties.Surveyor = ov.Surveyor;
          f.properties.SURVEYOR = ov.Surveyor;
        }
        if (ov.PENGGUNAAN) {
          f.properties.PENGGUNAAN = ov.PENGGUNAAN;
        }
        if (ov.STATUS) {
          f.properties.STATUS = ov.STATUS;
          f.properties._FIRESTORE_VERIFIED = true;
        }
        if (ov.TITIK_SELESAI != null) {
          f.properties.TITIK_SELESAI = ov.TITIK_SELESAI;
          f.properties._FIRESTORE_VERIFIED = true;
        }
        if (ov.geometry) {
          f.geometry = ov.geometry;
        }
      }
    });

    // 3. Append added zones
    if (added.length > 0) {
      const existingIds = new Set(geojson.features.map(f => String(f.properties.Zona_ID || f.properties.ID_ZONA || '').trim().toUpperCase()));
      added.forEach(af => {
        const afId = String(af.properties.Zona_ID || af.properties.ID_ZONA || '').trim().toUpperCase();
        if (!existingIds.has(afId)) {
          geojson.features.push(JSON.parse(JSON.stringify(af)));
          existingIds.add(afId);
        }
      });
    }

    return geojson;
  }

  function onSyncUpdate(callback) {
    if (typeof callback !== 'function') return;

    if (channel) {
      channel.onmessage = (event) => {
        callback(event.data);
      };
    }

    window.addEventListener('storage', (e) => {
      if (e.key === STORAGE_KEY_OVERRIDES || e.key === STORAGE_KEY_DELETED || e.key === STORAGE_KEY_ADDED || e.key === 'znt_sync_ping') {
        callback({ type: 'STORAGE_EVENT', key: e.key });
      }
    });

    window.addEventListener('znt:sync-update', (e) => {
      callback(e.detail);
    });
  }

  window.zntSync = {
    getOverrides,
    getDeletedZoneIds,
    getAddedZones,
    saveZoneOverride,
    deleteZone,
    addZone,
    resetToMaster,
    applyOverridesToGeoJSON,
    onSyncUpdate,
    broadcast
  };
})();
