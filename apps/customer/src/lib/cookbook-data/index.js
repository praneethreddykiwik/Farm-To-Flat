/**
 * The whole cookbook: every dish file, in one list. Each file is one part of India's cooking,
 * written and checked by hand (see AUTHORING.md and schema.js; `node scripts/check-cookbook.mjs`).
 */
import { DISHES_TELUGU } from './dishes/telangana-andhra.js';
import { DISHES_SOUTH } from './dishes/south.js';
import { DISHES_NORTH } from './dishes/north.js';
import { DISHES_NONVEG } from './dishes/nonveg-indochinese.js';
import { DISHES_MORE } from './dishes/west-east-snacks.js';

export { ING, ING_KEYS } from './ingredients.js';

/** @type {any[]} */
export const ALL_DISHES = [
  ...DISHES_TELUGU,
  ...DISHES_SOUTH,
  ...DISHES_NORTH,
  ...DISHES_NONVEG,
  ...DISHES_MORE,
];
