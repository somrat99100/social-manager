import { useEffect, useRef, useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import Sidebar from './Sidebar';
import { usePostStatusSync } from '../lib/use-post-status-sync';

export default function ProtectedLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Update #10/#12 — keeps the broadcast log's "scheduled → posted" status
  // in sync globally, for as long as the person is signed in, not just
  // while they're looking at the Log page. Also surfaces which pages'
  // tokens have died so the person finds out from a banner instead of
  // wondering why a post never updates.
  const { pagesNeedingReconnect } = usePostStatusSync();
  const showBanner = pagesNeedingReconnect.length > 0 && !bannerDismissed;
  const reconnectSignature = pagesNeedingReconnect.map((p) => p.pageId).join(',');
  const lastSignatureRef = useRef('');
  useEffect(() => {
    if (reconnectSignature !== lastSignatureRef.current) {
      lastSignatureRef.current = reconnectSignature;
      setBannerDismissed(false);
    }
  }, [reconnectSignature]);

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
        {showBanner && (
          <div className="reconnect-banner">
            <span>
              ⚠ Can't check post status for {pagesNeedingReconnect.map((p) => p.name).join(', ')} — the saved
              token has expired.{' '}
              <Link to="/settings">Reconnect it in Settings</Link>.
            </span>
            <button className="reconnect-banner-close" onClick={() => setBannerDismissed(true)} aria-label="Dismiss">
              ✕
            </button>
          </div>
        )}
        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
