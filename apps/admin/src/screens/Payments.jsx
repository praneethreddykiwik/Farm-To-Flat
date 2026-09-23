/**
 * Cash on delivery and proof of hand-over.
 *
 * Both are deliberate decisions rather than defaults: an unpaid order costs a real packed bag if
 * nobody answers the door, and the cash cap is what keeps a large amount of money off a rider's
 * person. Everything here is re-checked by the API when an order commits, so turning cash off takes
 * effect on the next order rather than the next app release.
 */
import { useEffect, useState } from 'react';
import { toast, useResource } from '../lib/useApi.js';
import { api } from '../lib/api.js';
import { ErrorNote, TableSkeleton } from '../components/ui.jsx';
import { IconRupee } from '../components/icons.jsx';

const rupees = (paise) => Math.round(Number(paise || 0) / 100);

export default function Payments() {
  const { data, loading, error, reload } = useResource('/admin/payment-settings');
  const s = data?.settings;
  const [cap, setCap] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (s) setCap(String(rupees(s.cod.maxOrderPaise)));
  }, [s]);

  async function patch(body, msg) {
    setSaving(true);
    try {
      await api.patch('/admin/payment-settings', body);
      toast(msg);
      reload();
    } catch (e) {
      toast(e.message || 'Could not save', 'err');
    } finally {
      setSaving(false);
    }
  }

  const capBad = cap !== '' && (!/^\d+$/.test(cap) || Number(cap) < 0);

  return (
    <>
      <header className="topbar">
        <div>
          <h1 className="page-title">Payments &amp; delivery proof</h1>
          <p className="page-sub">
            Whether customers may pay in cash, and what the delivery team has to take at the door.
          </p>
        </div>
      </header>

      {error ? (
        <ErrorNote error={error} onRetry={reload} />
      ) : loading || !s ? (
        <div className="glass">
          <TableSkeleton rows={3} />
        </div>
      ) : (
        <>
          <div className="glass card reveal">
            <div className="card__head">
              <h2 className="card__title">
                <span className="hstack" style={{ gap: 8 }}>
                  <IconRupee size={18} style={{ color: 'var(--ink-3)' }} />
                  Cash on delivery
                </span>
              </h2>
            </div>

            <p className="muted" style={{ fontSize: 13, marginTop: -4, marginBottom: 10 }}>
              A cash order is confirmed the moment it is placed — there is nothing to collect online
              — so it is packed like any other. The money arrives at the door.
            </p>

            <button
              className={`chip${s.cod.enabled ? ' is-active' : ''}`}
              disabled={saving}
              onClick={() =>
                patch(
                  { codEnabled: !s.cod.enabled },
                  s.cod.enabled ? 'Cash on delivery turned off' : 'Cash on delivery turned on',
                )
              }
            >
              {s.cod.enabled ? 'Customers can pay in cash' : 'Cash payments are off'}
            </button>

            <div className="field" style={{ marginTop: 16, opacity: s.cod.enabled ? 1 : 0.5 }}>
              <label className="field__label">Largest cash order (₹)</label>
              <input
                className="field__input"
                style={{ maxWidth: 200 }}
                value={cap}
                onChange={(e) => setCap(e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                maxLength={7}
                disabled={!s.cod.enabled || saving}
              />
              <p className="field__hint">
                Above this the cash option disappears and the customer pays online instead. It is
                what stops a rider carrying a large amount of money.
              </p>
              {capBad && (
                <p className="field__hint" style={{ color: 'var(--tomato)' }}>
                  Enter a whole number of rupees.
                </p>
              )}
              <button
                className="btn btn--primary"
                style={{ marginTop: 8 }}
                disabled={!s.cod.enabled || saving || capBad || cap === ''}
                onClick={() => patch({ codMaxOrderPaise: Number(cap) * 100 }, 'Cash limit updated')}
              >
                Save limit
              </button>
            </div>
          </div>

          <div className="glass card reveal" style={{ marginTop: 18 }}>
            <div className="card__head">
              <h2 className="card__title">Code at the door</h2>
            </div>
            <p className="muted" style={{ fontSize: 13, marginTop: -4, marginBottom: 10 }}>
              When an order goes out for delivery the customer gets a four-digit code. They read it
              to the delivery person, who types it in to complete the delivery. It is proof the
              customer was actually there — and on a cash order, proof the money changed hands. The
              delivery team never sees the code, only whether one is waiting.
            </p>
            <button
              className={`chip${s.deliveryOtp.enabled ? ' is-active' : ''}`}
              disabled={saving}
              onClick={() =>
                patch(
                  { deliveryOtpEnabled: !s.deliveryOtp.enabled },
                  s.deliveryOtp.enabled ? 'Door code turned off' : 'Door code turned on',
                )
              }
            >
              {s.deliveryOtp.enabled ? 'Code required at the door' : 'No code required'}
            </button>
            {s.cod.enabled && !s.deliveryOtp.enabled && (
              <p className="field__hint" style={{ color: 'var(--tomato)', marginTop: 10 }}>
                Cash is on but no code is required — a delivery can then be marked complete with
                nothing proving the money was handed over.
              </p>
            )}
          </div>
        </>
      )}
    </>
  );
}
