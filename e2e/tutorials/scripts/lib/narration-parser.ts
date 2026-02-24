import * as fs from 'fs';
import type { NarrationCue } from './types';

const CUE_REGEX = /^\*\*\[(\d+):(\d{2})\]\*\*\s+(.+)$/;

/**
 * Parse a narration-script.md file and extract timestamped narration cues.
 * Looks for lines between "## Narration Script" and the next "##" heading.
 */
export function parseNarrationScript(filePath: string): NarrationCue[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');

  const cues: NarrationCue[] = [];
  let inNarrationSection = false;

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed === '## Narration Script') {
      inNarrationSection = true;
      continue;
    }

    if (inNarrationSection && trimmed.startsWith('## ')) {
      break;
    }

    if (!inNarrationSection) continue;

    const match = trimmed.match(CUE_REGEX);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const timestampMs = (minutes * 60 + seconds) * 1000;
      cues.push({ timestampMs, text: match[3] });
    }
  }

  return cues;
}
