export interface NarrationCue {
  timestampMs: number;
  text: string;
}

export interface AudioChunk {
  index: number;
  timestampMs: number;
  filePath: string;
  durationMs: number;
}

export interface TutorialManifest {
  id: string;
  title: string;
  description: string;
  chapters: { time: string; name: string }[];
  steps: { name: string; screenshot: string; time: string }[];
  thumbnailScreenshot: string | null;
}

export interface GenerateOptions {
  force: boolean;
  keepIntermediates: boolean;
  pollyVoice: string;
  tutorialIds: string[];
  ffmpegPath: string;
  awsRegion: string;
}
