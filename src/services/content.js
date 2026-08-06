import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '../firebase';

// ---- Posts (drafts / scheduled / posted live in one collection, distinguished by status) ----

export function watchPosts(uid, cb) {
  const q = query(collection(db, 'users', uid, 'posts'), orderBy('updatedAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
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

// ---- Saved captions library ----

export function watchSavedTexts(uid, cb) {
  const q = query(collection(db, 'users', uid, 'savedTexts'), orderBy('createdAt', 'desc'));
  return onSnapshot(q, (snap) => {
    cb(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
  });
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
