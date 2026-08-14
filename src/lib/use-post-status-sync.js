import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/auth-context';
import { watchPosts, updatePostStatus } from '../services/content';
import { checkPostStatus } from '../services/facebook';

const INTERVAL_MS = 45_000; // check every 45s

/**
 * Update #10 — the broadcast log wasn't reliably flipping "scheduled" posts
 * to "posted" once Facebook actually published them. The old check only ran
 * while the Log page itself was mounted, and its effect was wired to the
 * `posts` array as a dependency — so every Firestore snapshot (including
 * ones caused by the check's own writes) tore the interval down and rebuilt
 * it, and navigating away from /log stopped checking entirely.
 *
 * This hook runs once, globally, for the whole signed-in app (mounted in
 * ProtectedLayout) so status keeps syncing no matter which page is open. It
 * reads the live post list through a ref instead of a dependency so the
 * interval itself is stable, and also re-checks whenever the browser tab
 * regains focus (covers laptops that throttle timers in background tabs).
 *
 * Update #12 — a page whose Access Token has expired makes every check for
 * its scheduled posts fail with an auth error, which used to be swallowed
 * silently — posts would sit stuck as "Scheduled" forever with no
 * explanation, even after actually going live on Facebook. Now the hook
 * tracks which pages are failing on auth and exposes that, so the UI can
 * tell the person their token needs reconnecting instead of just... nothing
 * happening.
 */
export function usePostStatusSync() {
  const { user, profile } = useAuth();
  const checkingRef = useRef(false);
  const postsRef = useRef([]);
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const [pagesNeedingReconnect, setPagesNeedingReconnect] = useState([]); // [{ pageId, name }]

  useEffect(() => {
    if (!user) return;
    return watchPosts(user.uid, (posts) => {
      postsRef.current = posts;
    });
  }, [user]);

  useEffect(() => {
    if (!user) return;

    const runCheck = async () => {
      if (checkingRef.current) return;
      const pages = profileRef.current?.pages || [];
      const scheduled = postsRef.current.filter(
        (p) => p.status === 'scheduled' && p.fbPostId && p.fbPageId
      );
      if (scheduled.length === 0 || pages.length === 0) return;
      checkingRef.current = true;
      const authFailedPageIds = new Set();
      try {
        for (const p of scheduled) {
          const page = pages.find((pg) => pg.pageId === p.fbPageId);
          if (!page?.pageAccessToken) continue;
          const result = await checkPostStatus(p.fbPostId, page.pageAccessToken);
          if (result === 'posted') {
            await updatePostStatus(user.uid, p.id, 'posted');
          } else if (result === 'auth_error') {
            authFailedPageIds.add(p.fbPageId);
          }
        }
        setPagesNeedingReconnect(
          pages.filter((pg) => authFailedPageIds.has(pg.pageId)).map((pg) => ({ pageId: pg.pageId, name: pg.name }))
        );
      } finally {
        checkingRef.current = false;
      }
    };

    runCheck();
    const timer = setInterval(runCheck, INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') runCheck();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user]);

  return { pagesNeedingReconnect };
}
