/**
 * What this phone can afford, decided once at start. See deviceTierRule.js for the line and why.
 */
import { Dimensions, PixelRatio, Platform } from 'react-native';
import { isLowEnd } from './deviceTierRule';

function read() {
  let device = null;
  try {
    // Guarded: a binary without the module must fall back to the screen, not fail to start.
    device = require('expo-device');
  } catch {
    device = null;
  }
  let screenWidthPx = null;
  try {
    const s = Dimensions.get('screen');
    screenWidthPx = Math.round(Math.min(s.width, s.height) * PixelRatio.get());
  } catch {
    screenWidthPx = null;
  }
  return {
    os: Platform.OS,
    totalMemoryBytes: device?.totalMemory ?? null,
    screenWidthPx,
  };
}

const seen = read();

/** True on an Android phone to go easy on: no never-ending motion, no blurred shadows under cards. */
export const lowEnd = isLowEnd(seen);

// One line in every build, like the API line: a tester can say which way their phone was judged.
console.log(
  `[f2f] device → ${lowEnd ? 'easy' : 'full'} mode  memory=${
    seen.totalMemoryBytes ? (seen.totalMemoryBytes / 2 ** 30).toFixed(1) + 'GB' : '?'
  }  width=${seen.screenWidthPx ?? '?'}px`,
);
