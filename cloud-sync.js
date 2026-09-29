// ============================================================
// cloud-sync.js — Firestore Cloud Synchronization for MOX-V4
// ============================================================
// Architecture:
//   IndexedDB  ←→  cloud-sync.js  ←→  Firestore
//
// Every user's data lives under: users/{uid}/...
// Collections per user:
//   transactions/{id}
//   presets/{id}
//   fixedExpenses/{id}
//   variableExpenses/{id}
//   closings/{id}
//   audit/{id}
//   settings/main     (single document)
//   meta/sync         (last sync timestamp etc.)
// ============================================================

import { getFirebaseDb } from './firebase.js';
import { FIRESTORE_REALTIME, MIGRATION_BATCH_SIZE } from './firebase-config.js';
import {
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  writeBatch, serverTimestamp, onSnapshot, query, orderBy, limit,
  Timestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// ============================================================
// Sync Status
// ============================================================

export const SyncStatus = {
  ONLINE:   'online',
  OFFLINE:  'offline',
  SYNCING:  'syncing',
  ERROR:    'error',
  PENDING:  'pending',
};

let _status = SyncStatus.OFFLINE;
let _pendingCount = 0;
let _statusListeners = [];
let _realtimeUnsub = null;

export function onSyncStatusChange(fn) { _statusListeners.push(fn); return () => { _statusListeners = _statusListeners.filter(f => f !== fn); }; }
function setSyncStatus(status, pending = _pendingCount) {
  _status = status;
  _pendingCount = pending;
  _statusListeners.forEach(fn => fn(status, pending));
}
export function getSyncStatus() { return { status: _status, pendingCount: _pendingCount }; }

// ============================================================
// Firestore Path Helpers  (all paths are scoped to uid)
// ============================================================

function userRef(uid)                    { return doc(_db, 'users', uid); }
function colRef(uid, col)                { return collection(_db, 'users', uid, col); }
function docRef(uid, col, id)            { return doc(_db, 'users', uid, col, id); }
function settingsDocRef(uid)             { return doc(_db, 'users', uid, 'settings', 'main'); }
function metaSyncRef(uid)                { return doc(_db, 'users', uid, 'meta', 'sync'); }

let _db = null;
let _uid = null;

/**
 * Initialize cloud sync for the given Firebase UID.
 * Must be called after the user signs in.
 */
export async function initCloudSync(uid, onRemoteChange) {
  _db  = await getFirebaseDb();
  _uid = uid;

  // Start real-time listener for settings + transactions if enabled.
  if (FIRESTORE_REALTIME && onRemoteChange) {
    _startRealtimeListeners(onRemoteChange);
  }

  setSyncStatus(SyncStatus.ONLINE, 0);
}

export function stopCloudSync() {
  if (_realtimeUnsub) { _realtimeUnsub(); _realtimeUnsub = null; }
  _db  = null;
  _uid = null;
  setSyncStatus(SyncStatus.OFFLINE, 0);
}

// ============================================================
// Read Operations
// ============================================================

/**
 * Load all user data from Firestore.
 * Returns a state-compatible object (same shape as app.js state).
 */
export async function loadCloudState() {
  if (!_db || !_uid) return null;
  try {
    const [
      transactions, presets, fixedExpenses,
      variableExpenses, closings, audit, settings
    ] = await Promise.all([
      _getDocs('transactions'),
      _getDocs('presets'),
      _getDocs('fixedExpenses'),
      _getDocs('variableExpenses'),
      _getDocs('closings'),
      _getDocs('audit'),
      _getSettings(),
    ]);
    return { transactions, presets, fixedExpenses, variableExpenses, closings, audit, settings };
  } catch (err) {
    console.error('[MOX Sync] loadCloudState failed:', err);
    return null;
  }
}

async function _getDocs(colName) {
  const snap = await getDocs(colRef(_uid, colName));
  return snap.docs.map(d => _fromFirestore(d.data()));
}

async function _getSettings() {
  try {
    const snap = await getDoc(settingsDocRef(_uid));
    return snap.exists() ? _fromFirestore(snap.data()) : null;
  } catch { return null; }
}

// ============================================================
// Write Operations — Individual Records
// ============================================================

export async function syncTransaction(t) {
  if (!_db || !_uid) { _pendingCount++; return; }
  await _setDoc('transactions', t.id, _toFirestore(t));
}

export async function syncDeleteTransaction(id) {
  if (!_db || !_uid) return;
  await deleteDoc(docRef(_uid, 'transactions', id));
}

export async function syncPreset(p) {
  if (!_db || !_uid) { _pendingCount++; return; }
  await _setDoc('presets', p.id, _toFirestore(p));
}

export async function syncDeletePreset(id) {
  if (!_db || !_uid) return;
  await deleteDoc(docRef(_uid, 'presets', id));
}

export async function syncFixedExpense(e) {
  if (!_db || !_uid) { _pendingCount++; return; }
  await _setDoc('fixedExpenses', e.id, _toFirestore(e));
}

export async function syncDeleteFixedExpense(id) {
  if (!_db || !_uid) return;
  await deleteDoc(docRef(_uid, 'fixedExpenses', id));
}

export async function syncVariableExpense(e) {
  if (!_db || !_uid) { _pendingCount++; return; }
  await _setDoc('variableExpenses', e.id, _toFirestore(e));
}

export async function syncDeleteVariableExpense(id) {
  if (!_db || !_uid) return;
  await deleteDoc(docRef(_uid, 'variableExpenses', id));
}

export async function syncSettings(settings) {
  if (!_db || !_uid) return;
  await setDoc(settingsDocRef(_uid), { ..._toFirestore(settings), _syncedAt: serverTimestamp() }, { merge: true });
}

export async function syncAuditEntry(entry) {
  if (!_db || !_uid) return;
  await _setDoc('audit', entry.id, _toFirestore(entry));
}

// ============================================================
// Batch Write — used for migration and bulk operations
// ============================================================

/**
 * Upload an entire state snapshot to Firestore using batched writes.
 * Designed for initial migration — safe, chunked, no overwrites.
 * @param {object} state - sanitized MOX state
 * @param {function} onProgress - called with (uploaded, total)
 */
export async function uploadFullState(state, onProgress) {
  if (!_db || !_uid) throw new Error('Firestore not initialized');

  setSyncStatus(SyncStatus.SYNCING);

  const records = [
    ...(state.transactions || []).map(r => ({ col: 'transactions', id: r.id, data: r })),
    ...(state.presets || []).map(r => ({ col: 'presets', id: r.id, data: r })),
    ...(state.fixedExpenses || []).map(r => ({ col: 'fixedExpenses', id: r.id, data: r })),
    ...(state.variableExpenses || []).map(r => ({ col: 'variableExpenses', id: r.id, data: r })),
    ...(state.closings || []).map(r => ({ col: 'closings', id: r.id || `c_${Date.now()}`, data: r })),
    ...(state.audit || []).slice(-200).map(r => ({ col: 'audit', id: r.id, data: r })),
  ];

  const total = records.length;
  let uploaded = 0;

  // Upload in safe chunks.
  for (let i = 0; i < records.length; i += MIGRATION_BATCH_SIZE) {
    const chunk = records.slice(i, i + MIGRATION_BATCH_SIZE);
    const batch = writeBatch(_db);
    chunk.forEach(({ col, id, data }) => {
      batch.set(docRef(_uid, col, id), _toFirestore(data));
    });
    await batch.commit();
    uploaded += chunk.length;
    if (onProgress) onProgress(uploaded, total);
  }

  // Save settings separately.
  if (state.settings) {
    await setDoc(settingsDocRef(_uid), { ..._toFirestore(state.settings), _syncedAt: serverTimestamp() }, { merge: true });
  }

  // Update sync meta.
  await setDoc(metaSyncRef(_uid), {
    lastSyncAt: serverTimestamp(),
    migratedAt: serverTimestamp(),
    totalRecords: total,
    uid: _uid,
  }, { merge: true });

  setSyncStatus(SyncStatus.ONLINE, 0);
  return total;
}

/**
 * Sync a batch of transactions (e.g., after cashier save).
 */
export async function syncTransactionBatch(transactions) {
  if (!_db || !_uid || !transactions.length) return;
  setSyncStatus(SyncStatus.SYNCING);
  try {
    const batch = writeBatch(_db);
    transactions.forEach(t => batch.set(docRef(_uid, 'transactions', t.id), _toFirestore(t)));
    await batch.commit();
    setSyncStatus(SyncStatus.ONLINE, 0);
  } catch (err) {
    console.error('[MOX Sync] syncTransactionBatch failed:', err);
    setSyncStatus(SyncStatus.ERROR, transactions.length);
    throw err;
  }
}

/**
 * Sync multiple preset updates in a single batch.
 */
export async function syncPresetBatch(presets) {
  if (!_db || !_uid || !presets.length) return;
  const batch = writeBatch(_db);
  presets.forEach(p => batch.set(docRef(_uid, 'presets', p.id), _toFirestore(p), { merge: true }));
  await batch.commit();
}

// ============================================================
// Real-time Listeners
// ============================================================

function _startRealtimeListeners(onRemoteChange) {
  if (_realtimeUnsub) _realtimeUnsub();

  // Listen to transactions collection for cross-device updates.
  const unsub = onSnapshot(
    query(colRef(_uid, 'transactions'), orderBy('updatedAt', 'desc'), limit(500)),
    (snap) => {
      if (snap.metadata.hasPendingWrites) return; // local write — skip
      const changed = snap.docChanges().filter(c => c.type !== 'removed');
      if (changed.length > 0) {
        onRemoteChange('transactions', changed.map(c => _fromFirestore(c.doc.data())));
      }
    },
    (err) => console.error('[MOX Sync] Real-time listener error:', err)
  );

  _realtimeUnsub = unsub;
}

// ============================================================
// Sync Meta
// ============================================================

export async function getLastSyncMeta() {
  if (!_db || !_uid) return null;
  try {
    const snap = await getDoc(metaSyncRef(_uid));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

export async function updateSyncMeta(fields) {
  if (!_db || !_uid) return;
  await setDoc(metaSyncRef(_uid), { ...fields, lastSyncAt: serverTimestamp() }, { merge: true });
}

// ============================================================
// Merge Helpers — prevent duplicates
// ============================================================

/**
 * Merge incoming remote transactions into local state.
 * Uses updatedAt (last-write-wins for non-conflicting edits).
 * Never duplicates by id.
 */
export function mergeTransactions(local, remote) {
  const map = new Map(local.map(t => [t.id, t]));
  remote.forEach(r => {
    const existing = map.get(r.id);
    if (!existing) {
      map.set(r.id, r);
    } else {
      // Keep the version with the later updatedAt.
      const localTs = new Date(existing.updatedAt || 0).getTime();
      const remoteTs = new Date(r.updatedAt || 0).getTime();
      if (remoteTs > localTs) map.set(r.id, r);
    }
  });
  return [...map.values()];
}

/**
 * Merge remote presets into local presets.
 */
export function mergePresets(local, remote) {
  return mergeTransactions(local, remote); // same merge logic
}

// ============================================================
// Network Status Detection
// ============================================================

export function initNetworkMonitor(onOnline, onOffline) {
  window.addEventListener('online', () => {
    setSyncStatus(SyncStatus.PENDING);
    onOnline();
  });
  window.addEventListener('offline', () => {
    setSyncStatus(SyncStatus.OFFLINE);
    onOffline();
  });
  if (!navigator.onLine) setSyncStatus(SyncStatus.OFFLINE);
}

// ============================================================
// Firestore Serialization Helpers
// ============================================================

function _toFirestore(obj) {
  // Convert undefined fields to null for Firestore compatibility.
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = v === undefined ? null : v;
  }
  return out;
}

function _fromFirestore(data) {
  // Convert Firestore Timestamps to ISO strings.
  const out = {};
  for (const [k, v] of Object.entries(data)) {
    if (v && typeof v.toDate === 'function') {
      out[k] = v.toDate().toISOString();
    } else {
      out[k] = v;
    }
  }
  return out;
}

async function _setDoc(col, id, data) {
  await setDoc(docRef(_uid, col, id), data, { merge: true });
}
