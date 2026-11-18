/**
 * /join?code=XXXX — the public page a promoter's QR card (or a neighbour's invite link) opens.
 * No sign-in, no sidebar: the code, one line on what to do with it, and the store button.
 */
import { useLocation } from 'react-router-dom';
import logoFull from '../assets/fooducia-logo-full.png';
import { PLAY_STORE_URL } from '../lib/storeLinks.js';

/** Same rule the API applies to a code typed at checkout: letters and digits, upper case. */
const clean = (s) =>
  String(s || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);

export function Join() {
  const { search } = useLocation();
  const code = clean(new URLSearchParams(search).get('code'));
  const live = !!PLAY_STORE_URL;
  return (
    <main className="join">
      <div className="join__card">
        <img className="join__logo" src={logoFull} alt="Fooducia" />
        {code ? (
          <>
            <div className="join__label">Your code</div>
            <div className="join__code">{code}</div>
            <p className="join__how">
              Install the Fooducia app, fill your basket, and enter <b>{code}</b> at checkout.
            </p>
          </>
        ) : (
          <p className="join__how">
            Vegetables harvested after you order, delivered to your door the next morning. Install
            the app to order.
          </p>
        )}
        <a
          className="join__play"
          href={PLAY_STORE_URL || '#'}
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
        {!live && (
          <p className="join__note">
            Launching on Google Play shortly. Keep this code for your first order.
          </p>
        )}
      </div>
    </main>
  );
}
