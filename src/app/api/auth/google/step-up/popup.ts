import { NextResponse } from 'next/server';
import { STEP_UP_CHANNEL, type StepUpMessage } from '@/lib/step-up-message';

/**
 * What the "Confirm with Google" popup shows at the end, success or refusal
 * (lib/step-up.ts): a page that hands the answer to the dialog that opened it
 * (lib/step-up-message.ts) and closes itself. Never a redirect to an admin
 * page — the popup must not become a second dashboard window — and never the
 * token in an address. Not a route itself; Next serves only `route.ts`.
 */
export function stepUpPopup(message: StepUpMessage) {
  // Every `<` leaves as a JSON unicode escape, so nothing in the JSON can close
  // the script element. The backslash is doubled on purpose: with a single one
  // this literal is just `<` again and the replace does nothing.
  const data = JSON.stringify(message).replace(/</g, '\\u003c');
  const channel = JSON.stringify(STEP_UP_CHANNEL);
  const text = message.ok ? 'Confirmed. You can close this window.' : 'Not confirmed. You can close this window.';
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Run As One</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font:16px/1.5 system-ui,sans-serif;background:#0b1220;color:#e5e7eb}</style>
</head><body><p>${text}</p><script>
(function () {
  var data = ${data};
  try { var c = new BroadcastChannel(${channel}); c.postMessage(data); c.close(); } catch (e) {}
  try { if (window.opener) window.opener.postMessage(data, window.location.origin); } catch (e) {}
  setTimeout(function () { window.close(); }, 150);
})();
</script></body></html>`;
  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'Referrer-Policy': 'no-referrer',
    },
  });
}
