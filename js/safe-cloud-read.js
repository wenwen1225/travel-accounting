/* Safe cloud read: additive only. No write action to GAS, no deletion of local trips. */
(function () {
  'use strict';
  const BACKUP_PREFIX = 'travelLedgerV1_preCloudRead_';
  let reading = false;
  let lastSafeRead = 0;
  const RECORD_TYPES = ['expenses', 'pretrip', 'exchange'];

  function validateCloud(data) {
    if (!data || data.success !== true || !Array.isArray(data.trips)) {
      throw new Error('雲端回傳不完整（缺少旅行清單），已保留本機資料。');
    }
    const seen = new Set();
    for (const trip of data.trips) {
      if (!trip || (typeof trip.id !== 'string' && typeof trip.id !== 'number') || !String(trip.id).trim()) {
        throw new Error('雲端旅行 ID 無效，已停止讀取。');
      }
      if (seen.has(String(trip.id))) throw new Error('雲端旅行 ID 重複，已停止讀取。');
      seen.add(String(trip.id));
      for (const key of RECORD_TYPES) {
        if (trip[key] !== undefined && !Array.isArray(trip[key])) {
          throw new Error('雲端旅行的「' + key + '」格式不正確，已停止讀取。');
        }
      }
    }
    if (data.trips.length === 0 && Array.isArray(state.trips) && state.trips.length > 0) {
      throw new Error('雲端回傳零趟旅行；為保護既有紀錄，未套用空資料。');
    }
    return data.trips;
  }

  function mergeMissingOnly(localTrips, cloudTrips) {
    const merged = JSON.parse(JSON.stringify(localTrips));
    const existing = new Map(merged.map(t => [String(t.id), t]));
    let addedTrips = 0;
    let addedRecords = 0;

    for (const remote of cloudTrips) {
      const id = String(remote.id);
      const local = existing.get(id);
      if (!local) {
        const copy = JSON.parse(JSON.stringify(remote));
        for (const key of RECORD_TYPES) {
          copy[key] = (copy[key] || []).map(record => ({
            ...record,
            syncStatus: 'synced',
            lastSyncError: ''
          }));
          addedRecords += copy[key].length;
        }
        copy.cloudStatus = 'synced';
        merged.push(copy);
        existing.set(id, copy);
        addedTrips++;
        continue;
      }
      // An archived/completed local trip stays byte-for-byte unchanged.
      if (local.archived) continue;
      // Never overwrite existing trip metadata or any existing local record.
      for (const key of RECORD_TYPES) {
        if (!Array.isArray(local[key])) local[key] = [];
        const ids = new Set(local[key].map(r => String(r.id)));
        for (const remoteRecord of (remote[key] || [])) {
          if (!remoteRecord || remoteRecord.id === undefined || remoteRecord.id === null) continue;
          const recordId = String(remoteRecord.id);
          if (ids.has(recordId)) continue;
          local[key].push({...remoteRecord, syncStatus:'synced', lastSyncError:''});
          ids.add(recordId);
          addedRecords++;
        }
      }
    }
    return {merged, addedTrips, addedRecords};
  }

  async function safeReadCloud(options = {}) {
    const silent = options.silent !== false;
    if (reading) return false;
    if (!getApiUrl()) {
      if (!silent) alert('這個瀏覽器尚未設定 Google Apps Script 網址，請先到「設定」填入原本使用的網址。');
      return false;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      if (!silent) alert('目前離線，已保留本機紀錄。');
      return false;
    }
    if (state.backupRestoreLocalOnly) {
      if (!silent) alert('目前啟用「備份只還原本機」，為保護資料，暫不讀取雲端。');
      return false;
    }

    reading = true;
    const btn = document.getElementById('cloudReloadBtn');
    if (btn) { btn.disabled = true; btn.textContent = '安全讀取雲端中…'; }
    try {
      // getAllData is read-only. Never submit pending writes during a read.
      const data = await postToCloud({action:'getAllData'});
      const cloudTrips = validateCloud(data);
      const before = localStorage.getItem(STORE_KEY);
      const localTrips = Array.isArray(state.trips) ? state.trips : [];
      const result = mergeMissingOnly(localTrips, cloudTrips);

      // Save a restorable snapshot BEFORE touching the live dataset.
      const snapshotKey = BACKUP_PREFIX + new Date().toISOString().replace(/[:.]/g, '-');
      if (before !== null) localStorage.setItem(snapshotKey, before);
      const priorTrips = state.trips;
      const priorRevision = state.lastCloudRevision;
      const priorSyncAt = state.lastSyncAt;
      try {
        state.trips = result.merged;
        if (data.cloudRevision !== undefined && data.cloudRevision !== null) {
          state.lastCloudRevision = String(data.cloudRevision);
        }
        state.lastSyncAt = new Date().toISOString();
        persist();
      } catch (saveError) {
        state.trips = priorTrips;
        state.lastCloudRevision = priorRevision;
        state.lastSyncAt = priorSyncAt;
        if (before !== null) localStorage.setItem(STORE_KEY, before);
        throw saveError;
      }
      lastSafeRead = Date.now();
      lastCloudPullAt = lastSafeRead;
      if (state.lastCloudRevision) lastCloudRevision = state.lastCloudRevision;
      renderHome();
      if (currentTrip) {
        const sameTrip = getTripById(currentTrip.id);
        if (sameTrip) { currentTrip = sameTrip; renderTripSummary(); }
      }
      updateHomeSyncStatus();
      if (!silent) alert('安全讀取完成：新增 ' + result.addedTrips + ' 趟旅行、' + result.addedRecords + ' 筆紀錄。原本的旅行與記帳資料沒有被刪除或覆蓋。');
      return true;
    } catch (error) {
      console.error('Safe cloud read failed:', error);
      if (!silent) alert('安全讀取失敗，原有紀錄未變更：\n' + (error?.message || error));
      return false;
    } finally {
      reading = false;
      if (btn) { btn.disabled = false; btn.textContent = '↻ 重新讀取雲端最新資料'; }
    }
  }

  // Override destructive manual refresh and all cloud-pull callers.
  refreshFromCloudNow = function () { return safeReadCloud({silent:false}); };
  pullCloudTrips = function (options = {}) { return safeReadCloud(options); };
  pullCloudIfStale = function (maxAgeMs = 300000) {
    if (Date.now() - lastSafeRead < maxAgeMs) return Promise.resolve(false);
    return safeReadCloud({silent:true});
  };
  // Explicitly do NOT trigger any write or resend pending queue during startup.
  syncAndPullCloud = function () { return safeReadCloud({silent:true}); };

  // A configured browser may safely add missing cloud records on startup.
  // A new browser needs one-time GAS URL setup; do not publish a private URL in source.
  document.addEventListener('DOMContentLoaded', () => {
    if (getApiUrl() && !state.backupRestoreLocalOnly) {
      safeReadCloud({silent:true});
    }
  });
})();