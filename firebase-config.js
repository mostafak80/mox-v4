// ============================================================
// firebase-config.js — MOX-V4 Firebase Configuration
// ============================================================
// IMPORTANT: Replace every value below with your actual Firebase
// project configuration from the Firebase Console.
//
// How to get these values:
//   1. Go to https://console.firebase.google.com
//   2. Select your project → Project Settings → General
//   3. Scroll to "Your apps" → Web app → SDK setup
//   4. Copy the firebaseConfig object and paste the values here.
//
// This file is safe to include in frontend code.
// NEVER add Firebase Admin SDK keys, service account JSON, or
// private keys to this file or any frontend file.
// ============================================================

const FIREBASE_CONFIG = {
  apiKey:            "AIzaSyD8EIbHcwopgH0frKTKDEhP7CqToktGHas",
  authDomain:        "mox-v2-22fcc.firebaseapp.com",
  projectId:         "mox-v2-22fcc",
  storageBucket:     "mox-v2-22fcc.firebasestorage.app",
  messagingSenderId: "632182526574",
  appId:             "1:632182526574:web:ede171b582162820d84c7f",
  measurementId:     "G-N155SQJ8ZW"
};

// ============================================================
// Feature flags — adjust as needed
// ============================================================

/** Enable real-time Firestore listeners (phone ↔ laptop live sync). */
const FIRESTORE_REALTIME = true;

/** Firestore batch size for migration uploads (max 500 per Firestore batch). */
const MIGRATION_BATCH_SIZE = 200;

/** Maximum number of local safety snapshots to keep. */
const MAX_BACKUPS = 5;

export { FIREBASE_CONFIG, FIRESTORE_REALTIME, MIGRATION_BATCH_SIZE, MAX_BACKUPS };
