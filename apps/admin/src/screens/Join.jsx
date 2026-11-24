/**
 * /go?src=counter&p=PR01&c=aquantis  and  /join?code=XXXX — the public page a counter QR, a
 * WhatsApp post or a neighbour's invite opens. No sign-in, no sidebar.
 *
 *   Android: straight on to Google Play with the tag as the install referrer, so the app knows who
 *            sent the household the moment it first opens — nobody types a code.
 *   iPhone and computers: there is no referrer on iOS, so the page shows the code to enter at the
 *            first order (or "your neighbour's phone number" for an invite).
 *
 * The scan itself is counted anonymously first (POST /links/click: a daily count per tag — no IP,
 * no device, no cookie), so a counter session's scans can be set against its installs.
 */
import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import logoFull from '../assets/fooducia-logo-full.png';
import { APP_STORE_URL, PLAY_STORE_URL, playUrlFor, readTag } from '../lib/storeLinks.js';

const API = `${import.meta.env.VITE_API_URL || ''}/api/v1`;
const isIphone = () =>
  typeof navigator !== 'undefined' && /iphone|ipad|ipod/i.test(navigator.userAgent || '');
const isAndroid = () =>
  typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || '');

function countScan(tag) {
  if (!tag.src && !tag.p) return;
  const body = JSON.stringify({ src: tag.src, p: tag.p, c: tag.c, r: tag.r });
  try {
    // sendBeacon survives the redirect that follows; fetch keepalive is the fallback.
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon && navigator.sendBeacon(`${API}/links/click`, blob)) return;
  } catch {
    /* fall through */
  }
  fetch(`${API}/links/click`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
    keepalive: true,
  }).catch(() => {});
}

export function Join() {
  const { search, pathname } = useLocation();
  const tag = useMemo(() => readTag(search), [search]);
  const code = tag.r || tag.p;
  const playUrl = playUrlFor(tag) || '#';
  const live = !!PLAY_STORE_URL;
  const [leaving, setLeaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const ios = isIphone();

  useEffect(() => {
    countScan(tag);
    if (pathname === '/go' && live && isAndroid()) {
      setLeaving(true);
      const t = setTimeout(() => window.location.replace(playUrl), 150);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [tag, pathname, live, playUrl]);

  return (
    <main className="join">
      <div className="join__card">
        <img className="join__logo" src={logoFull} alt="Fooducia" />
        {leaving ? (
          <p className="join__how">Opening Google Play…</p>
        ) : code ? (
          <>
            <div className="join__label">{tag.r ? 'Your neighbour’s code' : 'Your code'}</div>
            <div className="join__code">{code}</div>
            <p className="join__how">
              Install the Fooducia app, fill your basket, and enter <b>{code}</b> at your first
              order{tag.r ? ' — you and your neighbour both get ₹30.' : '.'}
            </p>
          </>
        ) : (
          <p className="join__how">
            Vegetables harvested after you order, delivered to your door the next morning. Install
            the app to order.
          </p>
        )}
        {code && !leaving && (
          <button
            type="button"
            className="join__play"
            style={{
              border: 'none',
              cursor: 'pointer',
              justifyContent: 'center',
              marginBottom: 10,
            }}
            onClick={() =>
              navigator.clipboard
                ?.writeText(code)
                .then(() => setCopied(true))
                .catch(() => {})
            }
          >
            <b>{copied ? 'Copied' : 'Copy the code'}</b>
          </button>
        )}
        {ios && APP_STORE_URL ? (
          <a className="join__play" href={APP_STORE_URL} rel="noreferrer">
            <span>
              <small>Download on the</small>
              <b>App Store</b>
            </span>
          </a>
        ) : null}
        <a
          className="join__play"
          href={playUrl}
          aria-disabled={live ? undefined : 'true'}
          target={live ? '_blank' : undefined}
          rel="noreferrer"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3.6 2.4a1 1 0 0 0-.5.87v17.46a1 1 0 0 0 .5.87l9.3-9.6z" fill="#34A853" />
            <path d="M16.9 8.1L5.2 1.6a1 1 0 0 0-1.1.03l9.3 9.57z" fill="#EA4335" />
            <path d="M16.9 15.9l-3.5-3.6 3.5-3.6 3.3 1.84c.8.45.8 1.6 0 2.05z" fill="#FBBC04" />
            <path d="M4.1 22.37a1 1 0 0 0 1.1.03l11.7-6.5-3.5-3.6z" fill="#4285F4" />
          </svg>
          <span>
            <small>Get it on</small>
            <b>Google Play</b>
          </span>
        </a>
        <p className="join__note">
          {live
            ? APP_STORE_URL
              ? 'Keep this code for your first order.'
              : 'On an iPhone? The iPhone app is on its way — keep this code for your first order.'
            : 'Launching on Google Play shortly. Keep this code for your first order.'}
        </p>
      </div>
    </main>
  );
}
