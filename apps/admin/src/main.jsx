import React from 'react';
import { createRoot } from 'react-dom/client';
import { initSentry, Sentry, sentryEnabled } from './lib/sentry.js';
import './styles/theme.css';
import { App } from './App.jsx';

// ESM imports are hoisted, so this runs before React renders anything — which is the point: an
// error thrown during the very first render is the kind that leaves an operator on a blank page.
initSentry();

/**
 * A render error used to show a blank white page and nothing else: no message for the operator,
 * no report for us. On a console that issues refunds, "it went white" is not a good enough
 * account of what happened.
 */
function Fallback() {
  return (
    <div style={{ padding: 40, fontFamily: 'system-ui, sans-serif', maxWidth: 520 }}>
      <h2 style={{ marginBottom: 8 }}>Something broke on this screen</h2>
      <p style={{ color: '#5c6b62', lineHeight: 1.5 }}>
        It has been reported. Reload to carry on — nothing you were looking at was changed.
      </p>
      <button
        onClick={() => window.location.reload()}
        style={{
          marginTop: 16,
          padding: '8px 16px',
          borderRadius: 8,
          border: '1px solid #1e7a4c',
          background: '#1e7a4c',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        Reload
      </button>
    </div>
  );
}

const tree = (
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

createRoot(document.getElementById('root')).render(
  // Without a DSN there is no boundary to add, so the tree renders exactly as it did before.
  sentryEnabled ? (
    <Sentry.ErrorBoundary fallback={<Fallback />}>{tree}</Sentry.ErrorBoundary>
  ) : (
    tree
  ),
);
