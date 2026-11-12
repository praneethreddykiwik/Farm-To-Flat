/// <reference types="vite/client" />
// ^ Types for what Vite provides at build time: `import.meta.env`, and importing `.css` / `.png`.

import 'react';

declare module 'react' {
  // CSS custom properties passed through `style` — e.g. style={{ '--i': 3 }} — which the
  // stylesheets read to stagger and drive animations.
  interface CSSProperties {
    [customProperty: `--${string}`]: string | number;
  }
}

declare global {
  interface Window {
    /** Google Identity Services, present once its <script> has loaded on the sign-in screen. */
    google?: any;
  }
}
