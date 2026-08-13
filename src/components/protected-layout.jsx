import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';

export default function ProtectedLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="app-shell">
      <Sidebar mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
      <div className="app-main">
        <div className="app-topbar">
          <button className="app-topbar-burger" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            ☰
          </button>
          <span className="sidebar-brand-mark sidebar-brand-mark-sm">S</span>
        </div>
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
