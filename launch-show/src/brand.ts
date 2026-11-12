// Fooducia colours and type for the launch show.
// Greens and the ember gradient are sampled from the official logo; the cream/ink pair and the
// Fraunces + IBM Plex pairing are the app's own tokens (packages/tokens), so the phone on screen
// and the film around it look like one thing.

export const C = {
  // grounds
  night: '#04110B',
  night2: '#071D13',
  forestDeep: '#032A1C',
  forest: '#05472F', // wordmark green
  leaf: '#1E7A4C', // app primary
  leafBright: '#43B81F', // logo mid green
  lime: '#C0EE03', // logo highlight
  sprout: '#CDF56A', // app accent

  // ember — the gradient in the "oo" ribbon and the dot of the i
  emberA: '#FABC15',
  emberB: '#F4801F',
  emberC: '#ED2725',

  // paper + ink
  cream: '#F3F5EF',
  paper: '#FBF6E9',
  white: '#FFFFFF',
  ink: '#0E1B14',
  ink2: '#3D4B43',
  ink3: '#7C8781',

  // dusk tones for "the problem"
  dusk: '#1B2A2A',
  dull: '#7E8763',

  // petals
  marigold: '#FF9F0A',
  marigoldDeep: '#F26B0F',
  rose: '#E8336D',
  roseDeep: '#B81D4E',
  jasmine: '#FFFDF4',
} as const;

export const EMBER = `linear-gradient(135deg, ${C.emberA} 0%, ${C.emberB} 48%, ${C.emberC} 100%)`;

export const F = {
  display: '"Fraunces Show", Georgia, serif',
  body: '"Plex Show", "Helvetica Neue", Arial, sans-serif',
  mono: '"Plex Mono Show", Menlo, monospace',
  telugu: '"Anek Telugu Show", "Plex Show", sans-serif',
} as const;

// Fraunces is a variable font: SOFT rounds the terminals, opsz picks the display cut.
export const fraunces = (wght = 600, soft = 100, wonk = 0) =>
  ({
    fontFamily: F.display,
    fontWeight: wght,
    fontVariationSettings: `"SOFT" ${soft}, "WONK" ${wonk}, "opsz" 144`,
  }) as const;

export const W = 1920;
export const H = 1080;
export const FPS = 30;
