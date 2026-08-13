import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { firebaseConfig } from './firebase-config.js';

const isConfigured = firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith('YOUR_');

export const firebaseReady = isConfigured;

const app = isConfigured
  ? (getApps().length ? getApps()[0] : initializeApp(firebaseConfig))
  : null;

export const auth = app ? getAuth(app) : null;
export const db = app ? getFirestore(app) : null;
// Used to host AI-generated images at a public URL — Facebook's scheduling
// API can only fetch images from a URL, not raw bytes, so a generated image
// needs somewhere to live before a future-dated post can point to it.
export const storage = app ? getStorage(app) : null;
