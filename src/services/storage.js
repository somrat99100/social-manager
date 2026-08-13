import { ref, uploadString, getDownloadURL } from 'firebase/storage';
import { storage } from '../config/firebase.js';

/**
 * Uploads a base64 PNG (as returned by Gemini's image model) to Firebase
 * Storage and returns a public download URL.
 *
 * Why this exists: publishing an image right now can send raw base64 bytes
 * straight to Facebook, but *scheduling* a future post can't — Facebook's
 * scheduling endpoint only accepts a URL it can fetch itself at publish
 * time. So any AI-generated image that's part of an Auto-pilot (scheduled)
 * post needs a real, public URL first, which is what this gives it.
 */
export async function uploadGeneratedImage(uid, base64, mimeType = 'image/png') {
  if (!storage) throw new Error('Storage is not configured for this project.');
  const ext = mimeType.split('/')[1] || 'png';
  const path = `users/${uid}/ai-generated/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const storageRef = ref(storage, path);
  await uploadString(storageRef, base64, 'base64', { contentType: mimeType });
  return getDownloadURL(storageRef);
}
