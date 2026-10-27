import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore, doc, getDocFromServer } from 'firebase/firestore';
import firebaseConfig from '../../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
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
