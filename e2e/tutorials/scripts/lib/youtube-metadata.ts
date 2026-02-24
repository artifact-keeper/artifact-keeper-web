import * as fs from 'fs';
import * as path from 'path';
import type { TutorialManifest } from './types';
import { TITLE_CARD_DURATION_MS } from './title-card';

interface YouTubeMetadata {
  title: string;
  description: string;
  chapters: { time: string; name: string }[];
  tags: string[];
}

/**
 * Parse a "M:SS" timestamp string into total milliseconds.
 */
function parseTimestamp(time: string): number {
  const parts = time.split(':');
  const minutes = parseInt(parts[0], 10);
  const seconds = parseInt(parts[1], 10);
  return (minutes * 60 + seconds) * 1000;
}

/**
 * Format milliseconds as "M:SS" for YouTube chapter format.
 */
function formatTimestamp(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * Generate YouTube metadata (chapters, description) from a tutorial manifest.
 * Chapter timestamps are offset by the title card duration since the title card
 * is prepended to the final video.
 */
export function generateYouTubeMetadata(
  manifest: TutorialManifest,
  outputDir: string,
): void {
  // Offset chapter timestamps by title card duration
  const chapters: { time: string; name: string }[] = [
    { time: '0:00', name: 'Intro' }, // Required by YouTube
  ];

  for (const chapter of manifest.chapters) {
    const originalMs = parseTimestamp(chapter.time);
    const offsetMs = originalMs + TITLE_CARD_DURATION_MS;
    chapters.push({
      time: formatTimestamp(offsetMs),
      name: chapter.name,
    });
  }

  // Build description text
  const descriptionLines = [
    manifest.description,
    '',
    'Chapters:',
    ...chapters.map((ch) => `${ch.time} ${ch.name}`),
    '',
    `Learn more at https://artifactkeeper.com`,
  ];

  const metadata: YouTubeMetadata = {
    title: manifest.title,
    description: descriptionLines.join('\n'),
    chapters,
    tags: [
      'artifact keeper',
      'package registry',
      'tutorial',
      manifest.id.replace(/^\d+-/, ''), // e.g. "getting-started"
    ],
  };

  // Write JSON metadata
  const jsonPath = path.join(outputDir, 'youtube-metadata.json');
  fs.writeFileSync(jsonPath, JSON.stringify(metadata, null, 2));

  // Write plain text description for copy-paste
  const txtPath = path.join(outputDir, 'youtube-description.txt');
  fs.writeFileSync(txtPath, metadata.description);

  console.log(`  [youtube] Metadata written: ${path.basename(jsonPath)}, ${path.basename(txtPath)}`);
}
