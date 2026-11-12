// Fonts are bundled from @fontsource (no network at the venue) and registered once.
// loadFont() holds the render until each face is ready, so no frame is ever drawn in a fallback.
import { loadFont } from '@remotion/fonts';

import frauncesNormal from '@fontsource-variable/fraunces/files/fraunces-latin-full-normal.woff2';
import frauncesItalic from '@fontsource-variable/fraunces/files/fraunces-latin-full-italic.woff2';
import plex400 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-400-normal.woff2';
import plex500 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-500-normal.woff2';
import plex600 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-600-normal.woff2';
import plex700 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-700-normal.woff2';
import plexExt500 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-ext-500-normal.woff2';
import plexExt600 from '@fontsource/ibm-plex-sans/files/ibm-plex-sans-latin-ext-600-normal.woff2';
import plexMono500 from '@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2';
import anekTelugu from '@fontsource-variable/anek-telugu/files/anek-telugu-telugu-wght-normal.woff2';

// The rupee sign lives in the latin-ext subset.
const EXT = 'U+0100-02AF, U+1E00-1EFF, U+20A0-20C0, U+2113';
const LATIN =
  'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+2000-206F, U+2074, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD';

// `format` is stated outright: in the single-file build each font is a data: URI with no extension
// to infer it from.
let started: Promise<unknown> | null = null;

export const ensureFonts = () => {
  if (started) return started;
  started = Promise.all([
    loadFont({ format: 'woff2', family: 'Fraunces Show', url: frauncesNormal, weight: '100 900', style: 'normal' }),
    loadFont({ format: 'woff2', family: 'Fraunces Show', url: frauncesItalic, weight: '100 900', style: 'italic' }),
    loadFont({ format: 'woff2', family: 'Plex Show', url: plex400, weight: '400', unicodeRange: LATIN }),
    loadFont({ format: 'woff2', family: 'Plex Show', url: plex500, weight: '500', unicodeRange: LATIN }),
    loadFont({ format: 'woff2', family: 'Plex Show', url: plex600, weight: '600', unicodeRange: LATIN }),
    loadFont({ format: 'woff2', family: 'Plex Show', url: plex700, weight: '700', unicodeRange: LATIN }),
    loadFont({ format: 'woff2', family: 'Plex Show', url: plexExt500, weight: '500', unicodeRange: EXT }),
    loadFont({ format: 'woff2', family: 'Plex Show', url: plexExt600, weight: '600', unicodeRange: EXT }),
    loadFont({ format: 'woff2', family: 'Plex Mono Show', url: plexMono500, weight: '500' }),
    loadFont({ format: 'woff2', family: 'Anek Telugu Show', url: anekTelugu, weight: '100 800' }),
  ]).catch((err) => {
    // A missing face must never take the show down — fall back to the system stack.
    console.error('Font load failed', err);
  });
  return started;
};

ensureFonts();
