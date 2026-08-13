import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from 'firebase/auth';
import { doc, onSnapshot, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, firebaseReady } from '../config/firebase.js';
import { OWNER_EMAIL } from '../config/owner-config.js';

const AuthContext = createContext(null);

const ownerConfigured = !!OWNER_EMAIL && !OWNER_EMAIL.startsWith('YOUR_EMAIL');

function isOwner(email) {
  return ownerConfigured && (email || '').toLowerCase() === OWNER_EMAIL.toLowerCase();
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined); // undefined = loading, null = signed out
  const [profile, setProfile] = useState(undefined);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (!firebaseReady) {
      setUser(null);
      setProfile(null);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (u) => {
      // Defense in depth: even if a non-owner account somehow gets this far
      // (e.g. an account created before OWNER_EMAIL was set), boot it out here too.
      if (u && !isOwner(u.email)) {
        await signOut(auth);
        setUser(null);
        setProfile(null);
        setBlocked(true);
        return;
      }
      setBlocked(false);
      setUser(u || null);
      if (!u) setProfile(null);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!user || !firebaseReady) return;
    const ref = doc(db, 'users', user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setProfile(snap.exists() ? snap.data() : null);
      },
      (err) => {
        // Without this, a Firestore rules rejection (or offline error) would
        // leave `profile` stuck at `undefined` forever and the app would hang
        // on the loading screen with no explanation.
        console.error('Failed to load profile from Firestore:', err);
        setProfile(null);
      }
    );
    return unsub;
  }, [user]);

  const signup = useCallback(async (email, password) => {
    if (!ownerConfigured) {
      throw new Error('This app has not been locked to an owner email yet — set OWNER_EMAIL in src/config/owner-config.js.');
    }
    if (!isOwner(email)) {
      throw new Error('This app is private. Only the owner account can be created here.');
    }
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    return cred.user;
  }, []);

  const login = useCallback(async (email, password) => {
    if (ownerConfigured && !isOwner(email)) {
      throw new Error('This app is private. Only the owner account can log in.');
    }
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return cred.user;
  }, []);

  const logout = useCallback(() => signOut(auth), []);

  const createProfile = useCallback(async (data) => {
    if (!user) return;
    await setDoc(doc(db, 'users', user.uid), {
      name: data.name,
      avatar: data.avatar,
      fb: null,
      geminiApiKey: '',
      createdAt: serverTimestamp(),
    });
  }, [user]);

  const updateProfile = useCallback(async (partial) => {
    if (!user) return;
    await updateDoc(doc(db, 'users', user.uid), partial);
  }, [user]);

  const value = {
    user,
    profile,
    loading: user === undefined || (user && profile === undefined),
    blocked,
    ownerConfigured,
    signup,
    login,
    logout,
    createProfile,
    updateProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
