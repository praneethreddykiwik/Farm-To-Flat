import { useEffect, useState } from 'react';

// Public /support is unauthenticated (see apps/api/src/routes/support.js) and backed by the same
// admin-editable value shown on Settings → Support contact — so the address on the public
// Terms/Privacy pages always matches what the operator has configured, with no separate hardcoded
// copy to fall out of sync.
const BASE = `${import.meta.env.VITE_API_URL || ''}/api/v1`;
const FALLBACK_EMAIL = 'support@farmtoflat.in';

/** The operator-configured support email, for the public (no-login) Terms/Privacy pages. */
export function useSupportEmail() {
  const [email, setEmail] = useState(FALLBACK_EMAIL);
  useEffect(() => {
    let cancelled = false;
    fetch(`${BASE}/support`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data?.support?.email) setEmail(data.support.email);
      })
      .catch(() => {}); // keep the fallback — a public legal page must never show a network error
    return () => {
      cancelled = true;
    };
  }, []);
  return email;
}
