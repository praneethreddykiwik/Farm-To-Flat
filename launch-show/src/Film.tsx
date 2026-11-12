import React from 'react';
import { AbsoluteFill, Sequence, useVideoConfig } from 'remotion';
import { TransitionSeries, linearTiming } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { Audio } from '@remotion/media';
import launchSting from './assets/launch.mp3';
import { FPS } from './brand';
import { S1Thought, S1_INTRO } from './scenes/S1Thought';
import { S2Idea, S2_INTRO } from './scenes/S2Idea';
import { S3Promise, S3_INTRO } from './scenes/S3Promise';
import { S4Knowledge, S4_INTRO } from './scenes/S4Knowledge';
import { S5App, S5_INTRO } from './scenes/S5App';
import { S6Hold } from './scenes/S6Hold';
import { S7Launch, S7_INTRO, S7_LOOP } from './scenes/S7Launch';

// The whole launch as one continuous film — the backup if the live stage cannot run, and the cut
// for social media afterwards. Each scene plays its animation plus a short hold, then dissolves.
const f = (seconds: number) => Math.round(seconds * FPS);
const HOLD = 2; // seconds each story scene rests before the dissolve
const X = f(0.5); // dissolve length, frames

export const FILM = {
  s1: f(S1_INTRO + HOLD),
  s2: f(S2_INTRO + HOLD),
  s3: f(S3_INTRO + HOLD),
  s4: f(S4_INTRO), // ends before the card turns again
  s5: f(S5_INTRO + HOLD),
  hold: f(3.5),
  launch: f(S7_INTRO + S7_LOOP),
};
// five scenes dissolve into the next (four dissolves + one into the hold); the launch is a hard cut
export const FILM_STORY = FILM.s1 + FILM.s2 + FILM.s3 + FILM.s4 + FILM.s5 + FILM.hold - X * 5;
export const FILM_FRAMES = FILM_STORY + FILM.launch;

export const LaunchFilm: React.FC = () => {
  const { fps } = useVideoConfig();
  return (
    <AbsoluteFill style={{ background: '#000' }}>
      <Sequence name="Story" durationInFrames={FILM_STORY} premountFor={fps}>
        <TransitionSeries>
          <TransitionSeries.Sequence name="1 · The thought" durationInFrames={FILM.s1} premountFor={fps}>
            <S1Thought />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: X })} />
          <TransitionSeries.Sequence name="2 · The idea" durationInFrames={FILM.s2} premountFor={fps}>
            <S2Idea />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: X })} />
          <TransitionSeries.Sequence name="3 · Fooducia" durationInFrames={FILM.s3} premountFor={fps}>
            <S3Promise />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: X })} />
          <TransitionSeries.Sequence name="4 · Every vegetable has a story" durationInFrames={FILM.s4} premountFor={fps}>
            <S4Knowledge />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: X })} />
          <TransitionSeries.Sequence name="5 · The app" durationInFrames={FILM.s5} premountFor={fps}>
            <S5App />
          </TransitionSeries.Sequence>
          <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: X })} />
          <TransitionSeries.Sequence name="6 · Hold" durationInFrames={FILM.hold} premountFor={fps}>
            <S6Hold />
          </TransitionSeries.Sequence>
        </TransitionSeries>
      </Sequence>
      <Sequence name="7 · Launch" from={FILM_STORY} durationInFrames={FILM.launch} premountFor={fps}>
        <S7Launch />
        <Audio src={launchSting} />
      </Sequence>
    </AbsoluteFill>
  );
};

/** The launch moment alone, with its sound — for the screen if the venue plays video files, and for reels. */
export const LaunchMoment: React.FC = () => (
  <AbsoluteFill style={{ background: '#000' }}>
    <S7Launch />
    <Audio src={launchSting} />
  </AbsoluteFill>
);
