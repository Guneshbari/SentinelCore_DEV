import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const fallbackFirebaseConfig = {
  apiKey: 'AIzaSyDY844QFgCtn1l4rufgoWXBySW-xYrKDAg',
  authDomain: 'sentinelcore-99210.firebaseapp.com',
  projectId: 'sentinelcore-99210',
  storageBucket: 'sentinelcore-99210.firebasestorage.app',
  messagingSenderId: '497997127446',
  appId: '1:497997127446:web:3f2ae875ac9ec070c0fa37',
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY?.trim() || fallbackFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN?.trim() || fallbackFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID?.trim() || fallbackFirebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET?.trim() || fallbackFirebaseConfig.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID?.trim() || fallbackFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID?.trim() || fallbackFirebaseConfig.appId,
};

const missingFirebaseEnvValues = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_STORAGE_BUCKET',
  'VITE_FIREBASE_MESSAGING_SENDER_ID',
  'VITE_FIREBASE_APP_ID',
].filter((key) => !import.meta.env[key]);

if (missingFirebaseEnvValues.length > 0) {
  console.warn(
    `SentinelCore frontend is using fallback Firebase config for: ${missingFirebaseEnvValues.join(', ')}. Set VITE_FIREBASE_* values for production deployments.`,
  );
}

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
