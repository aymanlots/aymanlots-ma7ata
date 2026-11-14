import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import {
  initializeFirestore,
  getFirestore,
  doc,
  getDocFromServer,
  setLogLevel,
  Firestore,
} from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

// Silence internal @firebase/firestore transport timeout console.error logs when switching to offline/long-polling mode
try {
  setLogLevel('silent');
} catch {
  // Ignore if setLogLevel is unavailable
}

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);

function initDb(): Firestore {
  try {
    return initializeFirestore(
      app,
      {
        experimentalAutoDetectLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId
    );
  } catch {
    return getFirestore(app, firebaseConfig.firestoreDatabaseId);
  }
}

export const db = initDb();
export const googleProvider = new GoogleAuthProvider();

export const isFirebaseConfigured = (): boolean => {
  return Boolean(
    firebaseConfig.projectId &&
    firebaseConfig.apiKey &&
    !firebaseConfig.projectId.includes('remixed-project-id')
  );
};

// Validate Connection to Firestore on boot
export async function testFirebaseConnection() {
  if (!isFirebaseConfigured()) return false;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return false;
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn('Firebase client is offline, using offline cache.');
    }
    return false;
  }
}

if (typeof window !== 'undefined') {
  testFirebaseConnection().catch(() => {});
}
