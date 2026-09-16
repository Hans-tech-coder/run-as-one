import React from 'react';
import RunnerLoader from '@/components/ui/RunnerLoader';

import './Auth.css';

/**
 * What a sign-in page shows while it is on its way.
 *
 * The dashboard's own fallback draws the frame every screen there shares — an
 * 80px header with a skeleton bar where the title goes, then the content area.
 * A sign-in page has none of that: it is one centred card on a bare
 * background, so that bar stood over `/admin/login` as a placeholder for
 * furniture that never arrived.
 *
 * The figure is centred in `.auth-container`, the same box the page itself
 * uses — `100dvh`, flexed to the middle, on the auth background — so it stands
 * where the card is about to, rather than in a content area that is not there.
 * The background's drifting blobs are left out: they are decoration that only
 * the arriving page needs, and a wait is not the moment to start two more
 * animations.
 */
export default function AuthRouteLoading() {
  return (
    <div className="auth-container">
      <RunnerLoader size="lg" label="Loading this page" />
    </div>
  );
}
