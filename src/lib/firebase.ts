import { getApp, getApps, initializeApp } from 'firebase/app';
import { getAuth, initializeAuth, type Auth } from 'firebase/auth';
// version React Native du module d'auth (même instance que 'firebase/auth' à l'exécution)
import { getReactNativePersistence } from '@firebase/auth';
import { getFirestore } from 'firebase/firestore';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Projet Firebase « Zembo Claude ». Ces clés sont publiques : elles identifient le projet,
// la sécurité des données repose sur les règles Firestore (firestore.rules).
const firebaseConfig = {
  apiKey: 'AIzaSyDd-8XRHfM1zHCY-mYVMFBKVXLe30bYOCU',
  authDomain: 'zembo-claude.firebaseapp.com',
  projectId: 'zembo-claude',
  storageBucket: 'zembo-claude.firebasestorage.app',
  messagingSenderId: '599076829604',
  appId: '1:599076829604:web:72fe5a5da6a342187da931',
};

export const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

// La session reste ouverte quand on ferme l'app (stockée sur le téléphone)
function makeAuth(): Auth {
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    return getAuth(app); // déjà initialisé (rechargement à chaud)
  }
}
export const auth = makeAuth();
export const db = getFirestore(app);
