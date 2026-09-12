import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth'
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore'
import { getStorage, connectStorageEmulator, type FirebaseStorage } from 'firebase/storage'

// Web config for project kbwebsite-s. Values are PUBLIC (they ship in the
// bundle by design). Resolution order: VITE_FIREBASE_* build env first, then
// the backend's /api/config (covers Docker builds where env never arrives).
function envConfig(): Record<string, string | undefined> {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_SENDER_ID as string | undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  }
}

let runtimeConfig: Record<string, string> | null = null

function currentConfig(): Record<string, string | undefined> {
  return { ...envConfig(), ...(runtimeConfig ?? {}) }
}

export function isFirebaseConfigured(): boolean {
  const c = currentConfig()
  return Boolean(c.apiKey && c.projectId && c.appId)
}

/** Fetch backend-served web config (for builds that baked in no env). */
export async function ensureFirebaseAsync(): Promise<void> {
  if (isFirebaseConfigured()) {
    ensureFirebase()
    return
  }
  if (!runtimeConfig) {
    const res = await fetch('/api/config').then(r => r.json()).catch(() => null)
    const fb = res?.data?.firebase
    if (fb?.apiKey && fb?.projectId && fb?.appId) {
      runtimeConfig = {
        apiKey: fb.apiKey,
        authDomain: `${fb.projectId}.firebaseapp.com`,
        projectId: fb.projectId,
        storageBucket: `${fb.projectId}.firebasestorage.app`,
        messagingSenderId: fb.messagingSenderId || '',
        appId: fb.appId,
      }
    }
  }
  ensureFirebase()
}

let app: FirebaseApp | null = null
let auth: Auth | null = null
let db: Firestore | null = null
let storage: FirebaseStorage | null = null
let emulatorsWired = false

function missingKeys(): string[] {
  const c = currentConfig()
  return (Object.keys(c) as (keyof typeof c)[]).filter(k => !c[k])
}

/** Lazily initializes Firebase. Throws a human-readable error if unconfigured. */
export function ensureFirebase(): { app: FirebaseApp; auth: Auth; db: Firestore; storage: FirebaseStorage } {
  if (!isFirebaseConfigured()) {
    throw new Error(
      `Firebase is not configured (missing: ${missingKeys().join(', ') || 'unknown'}). ` +
        'Set VITE_FIREBASE_* env vars or serve them via /api/config.',
    )
  }
  if (!app) {
    app = getApps().length ? getApps()[0]! : initializeApp(currentConfig() as Record<string, string>)
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
