// ============================================================
// firebase.js — Firebase SDK Initialization for MOX-V4
// ============================================================
// Loads Firebase SDK modules from CDN and initializes the app,
// Auth, and Firestore instances as singletons.
// ============================================================

import { FIREBASE_CONFIG } from './firebase-config.js';

// We load Firebase using the ESM CDN bundle (compat path).
// These imports work in modern browsers without a bundler.
import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged, signOut, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

let _app, _auth, _db;

function getFirebaseApp() {
  if (!_app) {
    // Prevent double-init if the module is imported multiple times.
    _app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  }
  return _app;
}

function getFirebaseAuth() {
  if (!_auth) {
    _auth = getAuth(getFirebaseApp());
    // Persist auth session across browser restarts and PWA launches.
    setPersistence(_auth, browserLocalPersistence).catch(() => {});
  }
  return _auth;
}

let _dbPromise = null;

async function getFirebaseDb() {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      try {
        // Modern offline persistence (replaces deprecated enableIndexedDbPersistence).
        return initializeFirestore(getFirebaseApp(), {
          localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
        });
      } catch (err) {
        console.warn('[MOX Firebase] initializeFirestore fell back to default instance:', err);
        return getFirestore(getFirebaseApp());
      }
    })();
  }
  return _dbPromise;
}

export {
  getFirebaseApp, getFirebaseAuth, getFirebaseDb,
  GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, onAuthStateChanged, signOut
};
