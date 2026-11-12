import React from 'react';
import { Composition, Folder } from 'remotion';
import './fonts';
import { FILM_FRAMES, LaunchFilm, LaunchMoment } from './Film';
import { S1Thought } from './scenes/S1Thought';
import { S2Idea } from './scenes/S2Idea';
import { S3Promise } from './scenes/S3Promise';
import { S4Knowledge } from './scenes/S4Knowledge';
import { S5App } from './scenes/S5App';
import { S6Hold } from './scenes/S6Hold';
import { S7Launch } from './scenes/S7Launch';

// Scene lengths are each scene's animation + one pass of its idle loop, at 30 fps
// (the same numbers as the *_INTRO / *_LOOP constants in each scene file).
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="LaunchFilm" component={LaunchFilm} durationInFrames={FILM_FRAMES} fps={30} width={1920} height={1080} />
      <Composition id="LaunchMoment" component={LaunchMoment} durationInFrames={690} fps={30} width={1920} height={1080} />
      <Folder name="Scenes">
        <Composition id="S1-Thought" component={S1Thought} durationInFrames={540} fps={30} width={1920} height={1080} />
        <Composition id="S2-Idea" component={S2Idea} durationInFrames={660} fps={30} width={1920} height={1080} />
        <Composition id="S3-Promise" component={S3Promise} durationInFrames={630} fps={30} width={1920} height={1080} />
        <Composition id="S4-Knowledge" component={S4Knowledge} durationInFrames={960} fps={30} width={1920} height={1080} />
        <Composition id="S5-App" component={S5App} durationInFrames={1020} fps={30} width={1920} height={1080} />
        <Composition id="S6-Hold" component={S6Hold} durationInFrames={225} fps={30} width={1920} height={1080} />
        <Composition id="S7-Launch" component={S7Launch} durationInFrames={690} fps={30} width={1920} height={1080} />
      </Folder>
    </>
  );
};
