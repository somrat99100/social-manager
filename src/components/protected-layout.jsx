import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { usePostStatusSync } from '../lib/use-post-status-sync';

export default function ProtectedLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);

  // Update #10 — keeps the broadcast log's "scheduled → posted" status in
  // sync globally, for as long as the person is signed in, not just while
  // they're looking at the Log page.
  usePostStatusSync();

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
