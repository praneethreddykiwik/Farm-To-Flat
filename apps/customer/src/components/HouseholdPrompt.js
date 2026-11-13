import React, { useEffect, useRef } from 'react';
import { useSelector } from 'react-redux';
import { useIsFocused } from 'expo-router';
import { HouseholdSheet } from './HouseholdSheet';
import { selectHouseholdAsked, selectHouseholdReady } from '../features/household/householdSlice';

/**
 * Puts "Who's eating at home?" in front of a shopper once: the first time they reach the shop after
 * signing in on this phone. Answering or closing it both count as asked; after that it is only
 * ever opened by the shopper, from Profile or the basket.
 *
 * It waits a moment so the shop is on screen first — a question before anything has been seen
 * reads as a toll gate.
 */
export function HouseholdPrompt() {
  const ready = useSelector(selectHouseholdReady);
  const asked = useSelector(selectHouseholdAsked);
  const focused = useIsFocused();
  const sheet = useRef(/** @type {any} */ (null));
  const shown = useRef(false);

  useEffect(() => {
    if (!ready || asked || !focused || shown.current) return undefined;
    const t = setTimeout(() => {
      shown.current = true;
      sheet.current?.present();
    }, 1400);
    return () => clearTimeout(t);
  }, [ready, asked, focused]);

  return <HouseholdSheet ref={sheet} />;
}
