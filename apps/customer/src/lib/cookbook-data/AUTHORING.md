# Writing dishes for the Fooducia cookbook

The app's "What are you cooking?" box: a shopper types a dish (English, romanised Telugu/Hindi, or
native script) and sees what it needs from our shelf, how much for their family, and what to have
in the kitchen. It runs on the phone, offline, from these files. Accuracy matters more than volume.

## Read first

- `ingredients.js` — the ONLY keys you may use. If something is missing, use the closest key and
  note it in your report; do not edit ingredients.js (another agent owns it… actually the lead does).
- `schema.js` — the dish shape and every rule. Read the long comment at the top.

## Your file

`dishes/<your-area>.js`, exporting ONE array: `export const DISHES_<AREA> = [ ... ];`
Put `// prettier-ignore` on the line above the array. One dish per object. Keep it readable.

## Rules that matter

- **Real home recipes.** What a Hyderabad / Andhra / Indian home cook actually uses. No restaurant
  shortcuts that need things we'd never sell (MSG etc.).
- **needs** = fresh things the dish cannot be made without, most important first. **better** = fresh
  extras that genuinely improve it. **pantry** = staples (rice, dals, flours, oil, ghee, spices,
  tamarind, jaggery, curd, milk, salt). Every dish lists its pantry items.
- **g** = grams per ONE ADULT portion of the dish, for vegetables, gourds, leafy greens (a bunch of
  spinach ≈ 250 g), meat, fish, eggs (one egg = 50 g), paneer, fruit, sprouts. Realistic portions:
  a main vegetable curry ~120–180 g veg per adult; a supporting vegetable 20–60 g; onion in a gravy
  ~40–60 g; tomato in a gravy ~40–80 g; meat/fish main ~150–200 g; paneer main ~80–120 g; eggs in
  egg curry 100 g (2 eggs). Omit g for coriander, mint, curry leaves, green chilli, ginger, garlic,
  lemon, spring onion, dill (the engine handles them).
- **why** ≤ 70 characters, about taste/texture/technique in THIS dish ("Fried crisp before the
  gravy goes in."). NEVER health/nutrition words (the checker bans: vitamin, protein, iron, healthy,
  digest, fibre, calorie, cure, weight…). Plain, warm, specific. No emojis.
- **say**: lower-case romanised names people type, several spellings. Must be unique across ALL
  files (the checker will tell you). Don't put a bare single ingredient ("paneer", "chicken") —
  only dish names ("chicken 65", "paneer butter masala", "butter paneer").
- **te / hi**: native-script dish names only when you are sure of the common spelling; else omit.
- **diet** must match needs: meat/fish in needs → 'nonveg'; eggs (no meat) → 'egg'; else 'veg'.
- **main**: the ING key whose absence ruins the dish (null for things like plain rice dishes with
  no single star, chutney powders, etc.).
- Use only ids not already used by another area (prefix if unsure, e.g. `kerala_fish_curry`).

## Example

```js
// prettier-ignore
export const DISHES_NORTH = [
  { id: 'paneer_butter_masala', name: 'Paneer butter masala', hi: 'पनीर बटर मसाला', te: 'పనీర్ బటర్ మసాలా',
    say: ['paneer butter masala', 'butter paneer', 'paneer makhani', 'paneer makhanwala'],
    diet: 'veg', meal: ['lunch', 'dinner'], region: 'north', main: 'paneer',
    needs: [ { key: 'paneer', g: 100, why: 'Soft cubes, added last so they stay tender.' },
             { key: 'tomato', g: 100, why: 'Cooked down and blended into a smooth, tangy base.' },
             { key: 'onion', g: 40, why: 'Softened and blended in for body and sweetness.' },
             { key: 'ginger', why: 'A little in the paste keeps the richness lively.' },
             { key: 'garlic', why: 'Cooked into the paste for depth.' } ],
    better: [ { key: 'cream', why: 'A swirl at the end makes it silky.' },
              { key: 'capsicum', g: 20, why: 'A few strips for crunch, dhaba style.' },
              { key: 'coriander', why: 'Scattered over just before serving.' } ],
    pantry: ['butter', 'cashews', 'kasuriMethi', 'kashmiriChilli', 'garamMasala', 'sugar', 'salt', 'oil'] },
];
```

(cream is a pantry item, but it may also be offered in better because we might sell it — fine
either way, but never in both.)

## Check your work

```
cd /Users/vivekshaganti/Developer/farm-to-flat/apps/customer && node scripts/check-cookbook.mjs src/lib/cookbook-data/dishes/<your-file>.js
```

Then once more with no argument, to catch ids/aliases clashing with other areas' files (others are
writing at the same time; fix clashes in YOUR file by renaming your id or dropping your alias).
Must print `OK`. Do not edit any other file.
