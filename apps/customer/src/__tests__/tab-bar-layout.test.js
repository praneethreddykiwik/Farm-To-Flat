import { describe, expect, it } from 'vitest';
import { measureTabBar } from '../lib/tabBarLayout';

// Five tabs in the bar (Home, Basket, Orders, Wallet, Profile); staff with the AI planner also get
// its round button beside the bar.
const WIDTHS = [320, 340, 360, 375, 390, 393, 402, 412, 430];
const GUTTER = 10;

/** Everything on the line: the bar with its padding, plus the AI button and the gap before it. */
const lineWidth = (m, ai) => m.rowW + m.barPad * 2 + (ai ? m.aiGap + m.aiSize : 0);

describe('tab bar layout', () => {
  it('fits on one line, with a gutter either side, on every phone width', () => {
    for (const w of WIDTHS)
      for (const ai of [false, true]) {
        const m = measureTabBar(w, 5, ai);
        expect(lineWidth(m, ai), `${w}pt, ai=${ai}`).toBeLessThanOrEqual(w - GUTTER * 2);
      }
  });

  it('shows the word on the current tab wherever a customer could be', () => {
    for (const w of WIDTHS) expect(measureTabBar(w, 5, false).showLabel, `${w}pt`).toBe(true);
  });

  it('shows it for staff too from 360 points up, AI button and all', () => {
    for (const w of WIDTHS.filter((x) => x >= 360))
      expect(measureTabBar(w, 5, true).showLabel, `${w}pt`).toBe(true);
    // Narrower than that there is no room for both; the pill alone marks the tab.
    expect(measureTabBar(320, 5, true).showLabel).toBe(false);
  });

  it('never makes a tab too small to hit', () => {
    for (const w of WIDTHS)
      for (const ai of [false, true])
        expect(measureTabBar(w, 5, ai).tabW).toBeGreaterThanOrEqual(40);
  });

  it('keeps the bar one width whichever tab is current', () => {
    const m = measureTabBar(393, 5, true);
    // One labelled tab and four plain ones — or, on the AI screen, five sharing the same row.
    expect(m.rowW).toBe(m.activeW + 4 * m.tabW);
    expect(m.activeW).toBeGreaterThan(m.tabW);
  });
});
