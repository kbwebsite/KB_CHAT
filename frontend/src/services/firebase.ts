import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore'
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage'

// Web config for project kbwebsite-s. Values are PUBLIC (they ship in the
// bundle by design) — paste them from Firebase Console > Project settings >
// Your apps > Web app, or set the VITE_FIREBASE_* env vars on Vercel.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
  messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID as string | undefined,
  appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
}

export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId)
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null
let storage: FirebaseStorage | null = null
let emulatorsWired = false

function missingKeys(): string[] {
  return (Object.keys(firebaseConfig) as (keyof typeof firebaseConfig)[]).filter(
    k => !firebaseConfig[k],
  )
}

/** Lazily initializes Firebase. Throws a human-readable error if unconfigured. */
export function ensureFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore; storage: FirebaseStorage } {
  if (!isFirebaseConfigured()) {
    throw new Error(
      `Firebase is not configured (missing: ${missingKeys().join(', ') || 'unknown'}). ` +
        'Set VITE_FIREBASE_* env vars (see Firebase Console > Project settings).',
    )
  }
  if (!app) {
    app = getApps().length ? getApps()[0]! : initializeApp(firebaseConfig as Record<string, string>)
    auth = getAuth(app)
    db = getFirestore(app)
    storage = getStorage(app)
    if (import.meta.env.VITE_USE_FIREBASE_EMULATORS === 'true' && !emulatorsWired) {
      emulatorsWired = true
      try {
        connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
        connectFirestoreEmulator(db, '127.0.0.1', 8080)
        connectStorageEmulator(storage, '127.0.0.1', 9199)
      } catch {
        /* already connected (StrictMode double-mount) */
      }
    }
  }
  return { app, auth: auth!, db: db!, storage: storage! }
}

export function getFirebaseAuth(): Auth {
  return ensureFirebase().auth
}

export function getFirebaseDb(): Firestore {
  return ensureFirebase().db
}

export function getFirebaseStorage(): FirebaseStorage {
  return ensureFirebase().storage
}
