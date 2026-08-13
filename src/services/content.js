import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../config/firebase.js';

// ---- Posts (drafts / scheduled / posted live in one collection, distinguished by status) ----

export function watchPosts(uid, cb) {
  const q = query(collection(db, 'users', uid, 'posts'), orderBy('updatedAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (err) => {
      console.error('Failed to load posts from Firestore:', err);
      cb([]);
    }
  );
}

export async function savePost(uid, post, existingId) {
  const payload = { ...post, updatedAt: serverTimestamp() };
  if (existingId) {
    await updateDoc(doc(db, 'users', uid, 'posts', existingId), payload);
    return existingId;
  }
  const ref = await addDoc(collection(db, 'users', uid, 'posts'), {
    ...payload,
    createdAt: serverTimestamp(),
  });
  return ref.id;
}

export async function deletePost(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'posts', id));
}

/**
 * Flip a post's status (e.g. 'scheduled' -> 'posted') once Facebook confirms
 * it actually went live. Used by the broadcast log's background status check.
 */
export async function updatePostStatus(uid, postId, newStatus) {
  await updateDoc(doc(db, 'users', uid, 'posts', postId), {
    status: newStatus,
    updatedAt: serverTimestamp(),
  });
}

export async function getPost(uid, postId) {
  const snap = await getDoc(doc(db, 'users', uid, 'posts', postId));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

// ---- Saved captions library ----

export function watchSavedTexts(uid, cb) {
  const q = query(collection(db, 'users', uid, 'savedTexts'), orderBy('createdAt', 'desc'));
  return onSnapshot(
    q,
    (snap) => {
      cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    },
    (err) => {
      console.error('Failed to load saved texts from Firestore:', err);
      cb([]);
    }
  );
}

export async function saveText(uid, text) {
  await addDoc(collection(db, 'users', uid, 'savedTexts'), {
    text,
    createdAt: serverTimestamp(),
  });
}

export async function deleteSavedText(uid, id) {
  await deleteDoc(doc(db, 'users', uid, 'savedTexts', id));
}
