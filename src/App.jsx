import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/auth-context';
import ProtectedLayout from './components/protected-layout';
import Login from './pages/login';
import CreateProfile from './pages/create-profile';
import Home from './pages/home';
import CreatePost from './pages/create-post';
import SheetImport from './pages/sheet-import';
import WebsiteImport from './pages/website-import';
import CreatePostYoutube from './pages/create-post-youtube';
import SheetImportYoutube from './pages/sheet-import-youtube';
import Log from './pages/log';
import Settings from './pages/Settings';

function Gate({ children }) {
  const { user, profile, loading } = useAuth();

  if (loading) return <div className="app-loading">Loading…</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return <Navigate to="/create-profile" replace />;
  return children;
}

function AppRoutes() {
  const { user, profile, loading } = useAuth();

  return (
    <Routes>
      <Route
        path="/login"
        element={!loading && user && profile ? <Navigate to="/" replace /> : <Login />}
      />
      <Route
        path="/create-profile"
        element={
          loading ? (
            <div className="app-loading">Loading…</div>
          ) : !user ? (
            <Navigate to="/login" replace />
          ) : profile ? (
            <Navigate to="/" replace />
          ) : (
            <CreateProfile />
          )
        }
      />
      <Route
        element={
          <Gate>
            <ProtectedLayout />
          </Gate>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/create" element={<CreatePost />} />
        <Route path="/sheet-import" element={<SheetImport />} />
        <Route path="/website-import" element={<WebsiteImport />} />
        <Route path="/create-youtube" element={<CreatePostYoutube />} />
        <Route path="/sheet-import-youtube" element={<SheetImportYoutube />} />
        <Route path="/log" element={<Log />} />
        <Route path="/settings" element={<Settings />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <HashRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
    </HashRouter>
  );
}
