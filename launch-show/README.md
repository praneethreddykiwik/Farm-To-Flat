# Fooducia launch show

The five-minute app-launch segment: seven animated cues, run live from one offline file, with the
chief guest pressing **Enter** to fire the launch.

| What                | Where                              | How to make it             |
| ------------------- | ---------------------------------- | -------------------------- |
| Live stage show     | `dist-stage/index.html` (one file) | `npm run stage:build`      |
| Launch film (MP4)   | `out/fooducia-launch-film.mp4`     | `npm run render`           |
| Launch moment (MP4) | `out/fooducia-launch-moment.mp4`   | `npm run render:moment`    |
| Cue clips           | `out/clips/*.mp4`                  | `npx remotion render <id>` |

## Run it

```bash
npm install
npm run stage     # live show with hot reload (prints its URL)
npm run studio    # Remotion Studio: scrub every scene frame by frame
```

On the day, open `dist-stage/index.html` in Chrome. It needs no internet and no server.

| Key                       | Does                                  |
| ------------------------- | ------------------------------------- |
| `→` `Enter` `Space` click | next cue (on cue 6, fires the launch) |
| `←`                       | previous cue                          |
| `1`–`7`                   | jump to a cue                         |
| `R`                       | replay this cue                       |
| `F`                       | full screen                           |
| `B`                       | black screen                          |
| `M`                       | mute the launch sound                 |
| `H`                       | operator notes                        |

Add `?scene=5&t=12.5` to the URL to freeze any scene at a given second while editing.

## Change the words

Everything on screen is in [`src/copy.ts`](src/copy.ts): the story lines, the three QR targets, the
date line. Wrap a word in `*stars*` for the accent colour. Then `npm run stage:build`.

**Before the event:** the iPhone QR target in `copy.ts` is a placeholder. Replace it with the real
App Store link, rebuild, and scan all three codes on real phones.

## How it is put together

- `src/scenes/S1…S7` — one file per cue. Each exports `*_INTRO` (seconds of choreography) and
  `*_LOOP` (seconds of seamless idle loop it then holds on). Anything that moves during the hold
  must repeat exactly every `*_LOOP` seconds.
- `src/components` — the logo as live vectors, kinetic type, the phone, produce illustrations,
  petals, QR codes.
- `stage/main.tsx` — the live runner: plays a cue once, loops its tail, cross-fades to the next.
- `src/Film.tsx` — the same scenes as one continuous film, with the launch sound.
- `scripts/prep-logo.mjs` — splits the official leaf mark into its three leaves.
- `scripts/make-audio.mjs` — synthesises the launch sound (`npm run audio`; needs ffmpeg).

Built with [Remotion](https://www.remotion.dev). Remotion is free for teams of up to three; a larger
company needs a company licence — see https://www.remotion.dev/docs/license.
