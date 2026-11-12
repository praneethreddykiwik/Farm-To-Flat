import type React from 'react';
import { S1Thought, S1_INTRO, S1_LOOP } from './S1Thought';
import { S2Idea, S2_INTRO, S2_LOOP } from './S2Idea';
import { S3Promise, S3_INTRO, S3_LOOP } from './S3Promise';
import { S4Knowledge, S4_INTRO, S4_LOOP } from './S4Knowledge';
import { S5App, S5_INTRO, S5_LOOP } from './S5App';
import { S6Hold, S6_INTRO, S6_LOOP } from './S6Hold';
import { S7Launch, S7_INTRO, S7_LOOP } from './S7Launch';

export type SceneDef = {
  readonly id: string;
  /** What the operator sees in the cue list. */
  readonly title: string;
  /** What the presenter is saying while this is up. */
  readonly cue: string;
  readonly Component: React.FC;
  /** Seconds of choreographed animation. */
  readonly intro: number;
  /** Seconds of seamless idle loop the scene then holds on until the next cue. */
  readonly loop: number;
  /** Cut straight in instead of cross-fading (the launch must answer the key press at once). */
  readonly cut?: boolean;
};

// The seven cues of the launch, in the order agreed in the stand-up.
export const SCENES: SceneDef[] = [
  {
    id: 'S1Thought',
    title: 'The thought',
    cue: 'What are we really eating — and why our grandparents never had to ask.',
    Component: S1Thought,
    intro: S1_INTRO,
    loop: S1_LOOP,
  },
  {
    id: 'S2Idea',
    title: 'The problem → the idea',
    cue: 'Food waits, hand to hand. The answer: as fresh as possible. That is where the idea rose.',
    Component: S2Idea,
    intro: S2_INTRO,
    loop: S2_LOOP,
  },
  {
    id: 'S3Promise',
    title: 'Where Fooducia comes in',
    cue: 'Fooducia closes the gap between harvest and your kitchen — ordered tonight, harvested at dawn, home by morning.',
    Component: S3Promise,
    intro: S3_INTRO,
    loop: S3_LOOP,
  },
  {
    id: 'S4Knowledge',
    title: 'Every vegetable has a story',
    cue: 'Not just fresh — tap any item for what is good to know, its story, and a recipe.',
    Component: S4Knowledge,
    intro: S4_INTRO,
    loop: S4_LOOP,
  },
  {
    id: 'S5App',
    title: 'A glimpse of the app',
    cue: 'Open, add to basket, know every item, track it from the field — and a diet plan, coming soon.',
    Component: S5App,
    intro: S5_INTRO,
    loop: S5_LOOP,
  },
  {
    id: 'S6Hold',
    title: 'HOLD — invite the chief guest',
    cue: 'Stop here. Invite the chief guest to the podium. Count down with the room, then ENTER.',
    Component: S6Hold,
    intro: S6_INTRO,
    loop: S6_LOOP,
  },
  {
    id: 'S7Launch',
    title: 'LAUNCH',
    cue: 'Officially launched. Leave this up — no thank-you slide. Team members scan and download.',
    Component: S7Launch,
    intro: S7_INTRO,
    loop: S7_LOOP,
    cut: true,
  },
];
