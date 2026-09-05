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
 * The recogniser needs a real audio input. A simulator has none, and starting there takes the whole
 * app down with a native exception, so voice is only offered on physical devices where the OS
 * reports recognition as available.
 */
function detectSupport() {
  if (!Module) return false;
  if (!Device.isDevice) return false;
  try {
    return Module.isRecognitionAvailable() && Module.supportsRecording();
  } catch {
    return false;
  }
}
/** The package ships a hook for native events; stub it when absent so hook order stays stable. */
const useEvent = Speech?.useSpeechRecognitionEvent ?? (() => {});

export const voiceSupported = detectSupport();
if (!voiceSupported && !voiceUnavailableReason) {
  voiceUnavailableReason = Device.isDevice
    ? 'speech recognition unavailable on this device'
    : 'needs a physical device (no microphone on a simulator)';
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
    if (!voiceSupported || !Module) return;
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
