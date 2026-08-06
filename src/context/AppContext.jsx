import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { mockPages } from '../lib/mockData';
import { fetchMyPages } from '../lib/facebook';

const AppContext = createContext(null);

const STORAGE_KEY = 'socialflow.settings.v1';
const POSTS_KEY = 'socialflow.posts.v1';
const PROFILE_KEY = 'socialflow.profile.v1';

const DEFAULT_PROFILE = {
  pageName: '',
  niche: '',
  audience: '',
  voice: 'Professional',
  defaultHashtags: '',
  googleEmail: '',
};

function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { fbToken: '', geminiKey: '' };
  } catch {
    return { fbToken: '', geminiKey: '' };
  }
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY);
    return raw ? { ...DEFAULT_PROFILE, ...JSON.parse(raw) } : DEFAULT_PROFILE;
  } catch {
    return DEFAULT_PROFILE;
  }
}

function loadPosts() {
  try {
    const raw = localStorage.getItem(POSTS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function AppProvider({ children }) {
  const [settings, setSettings] = useState(loadSettings);
  const [profile, setProfileState] = useState(loadProfile);
  const [posts, setPosts] = useState(loadPosts);
  const [pages, setPages] = useState(mockPages);
  const [usingLiveData, setUsingLiveData] = useState(false);
  const [pagesError, setPagesError] = useState(null);
  const [selectedPageId, setSelectedPageId] = useState(null);
  const [view, setView] = useState({ name: 'dashboard' });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
  }, [posts]);

  useEffect(() => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }, [profile]);

  function setProfile(patch) {
    setProfileState((prev) => ({ ...prev, ...patch }));
  }

  useEffect(() => {
    let cancelled = false;
    async function loadLivePages() {
      if (!settings.fbToken) {
        setPages(mockPages);
        setUsingLiveData(false);
        setPagesError(null);
        return;
      }
      try {
        const live = await fetchMyPages(settings.fbToken);
        if (!cancelled) {
          setPages(live.length ? live : mockPages);
          setUsingLiveData(live.length > 0);
          setPagesError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setPages(mockPages);
          setUsingLiveData(false);
          setPagesError(err.message);
        }
      }
    }
    loadLivePages();
    return () => { cancelled = true; };
  }, [settings.fbToken]);

  const selectedPage = useMemo(
    () => pages.find((p) => p.id === selectedPageId) || null,
    [pages, selectedPageId]
  );

  function addPost(post) {
    setPosts((prev) => [{ id: `local_${Date.now()}`, createdAt: new Date().toISOString(), ...post }, ...prev]);
  }

  function navigate(name, params = {}) {
    setView({ name, ...params });
  }

  const value = {
    settings, setSettings,
    profile, setProfile,
    posts, addPost,
    pages, usingLiveData, pagesError,
    selectedPageId, setSelectedPageId, selectedPage,
    view, navigate,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside AppProvider');
  return ctx;
}
