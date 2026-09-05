/**
 * Voice search. Wraps expo-speech-recognition (SFSpeechRecognizer on iOS, the platform recogniser on
 * Android) behind one hook so screens only see { supported, listening, start, stop, error }.
 *
 * The module is native, so it is absent in Expo Go: `supported` is false there and the mic button
 * hides itself rather than throwing. Recognition runs on-device where the OS offers it, so a search
 * phrase does not leave the phone.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import * as Device from 'expo-device';

/** @type {any} */
let Speech = null;
/** Why voice is unavailable, surfaced in dev so a linking problem is visible rather than silent. */
export let voiceUnavailableReason = null;
try {
  Speech = require('expo-speech-recognition');
  if (!Speech?.ExpoSpeechRecognitionModule) voiceUnavailableReason = 'module export missing';
} catch (e) {
  Speech = null;
  voiceUnavailableReason = e?.message || 'import failed';
}

const Module = Speech?.ExpoSpeechRecognitionModule ?? null;

/**
 * Show the mic whenever the native module is linked (a dev/production build). It is absent in Expo
 * Go, where voice cannot work — there the mic hides itself. We deliberately do NOT hide it on the
 * simulator: the button should be visible there so the UI can be checked. What the simulator cannot
 * do is actually *capture* — Apple's recogniser needs real audio input and crashes the app if
 * started without it — so start() below refuses to launch capture off a physical device and shows a
 * friendly message instead. On a real phone, both the button and capture work.
 */
function detectSupport() {
  return !!Module;
}
/** The package ships a hook for native events; stub it when absent so hook order stays stable. */
const useEvent = Speech?.useSpeechRecognitionEvent ?? (() => {});

/** True only on a real phone; used to gate actual capture (not the button's visibility). */
export const voiceCaptureAvailable = !!Module && Device.isDevice;

export const voiceSupported = detectSupport();
if (!voiceSupported && !voiceUnavailableReason) {
  voiceUnavailableReason = 'voice module not linked in this build (Expo Go has no native modules)';
}

/**
 * @param {{ onResult?: (text: string) => void, onFinal?: (text: string) => void, lang?: string }} opts
 */
export function useVoiceSearch({ onResult, onFinal, lang = 'en-IN' } = {}) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const latest = useRef('');
  const cbs = useRef({ onResult, onFinal });
  useEffect(() => {
    cbs.current = { onResult, onFinal };
  }, [onResult, onFinal]);

  useEvent('result', (e) => {
    const text = e?.results?.[0]?.transcript ?? '';
    if (!text) return;
    latest.current = text;
    cbs.current.onResult?.(text);
    if (e.isFinal) cbs.current.onFinal?.(text);
  });

  useEvent('error', (e) => {
    // "no-speech" just means silence; not worth showing as a failure.
    if (e?.error && e.error !== 'no-speech') setError(e.message || e.error);
    setListening(false);
  });

  useEvent('end', () => {
    setListening(false);
    if (latest.current) cbs.current.onFinal?.(latest.current);
  });

  const start = useCallback(async () => {
    if (!Module) return;
    // The simulator has no usable audio input; starting capture there crashes natively. Refuse it
    // and tell the user to use their phone, rather than taking the app down.
    if (!voiceCaptureAvailable) {
      setError('Voice search works on your phone — open Farm to Flat on your device to speak.');
      return;
    }
    setError(null);
    latest.current = '';
    try {
      const perm = await Module.requestPermissionsAsync();
      if (!perm.granted) {
        setError('Microphone access is off. Turn it on in Settings to search by voice.');
        return;
      }
      Module.start({
        lang,
        interimResults: true,
        continuous: false,
        // Indian produce names the recogniser would otherwise mangle.
        contextualStrings: [
          'tamata',
          'karela',
          'palak',
          'kothimeera',
          'bendakaya',
          'sorakaya',
          'gongura',
          'dosakaya',
          'munakkaya',
          'pudina',
        ],
      });
      setListening(true);
    } catch (e) {
      setError(e?.message || 'Could not start listening');
      setListening(false);
    }
  }, [lang]);

  const stop = useCallback(() => {
    try {
      Module?.stop();
    } catch {}
    setListening(false);
  }, []);

  return { supported: voiceSupported, listening, error, start, stop };
}
