import { execFileSync } from 'child_process';
import * as os from 'os';
import * as path from 'path';

export const TITLE_CARD_DURATION_MS = 3500;

/**
 * Detect an available sans-serif font for ffmpeg drawtext.
 * Helvetica on macOS, DejaVu Sans on Linux.
 */
function detectFont(): string {
  if (os.platform() === 'darwin') {
    return '/System/Library/Fonts/Helvetica.ttc';
  }
  // Linux: DejaVu Sans is widely available
  return '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
}

/**
 * Generate a title card video using ffmpeg drawtext on a solid dark background.
 * Matches the app's dark theme (#0f172a / slate-900).
 *
 * Output: 1920x1080 H.264 MP4, 3.5 seconds, no audio.
 */
export function generateTitleCard(
  title: string,
  outputPath: string,
  ffmpegPath: string,
): void {
  const font = detectFont();
  const subtitle = 'Artifact Keeper Tutorials';

  // Escape special characters for ffmpeg drawtext
  const escapedTitle = title.replace(/[:\\'"]/g, '\\$&');
  const escapedSubtitle = subtitle.replace(/[:\\'"]/g, '\\$&');

  const durationSec = TITLE_CARD_DURATION_MS / 1000;

  // Title: white 56px centered, subtitle: slate-400 (#94a3b8) 28px below
  const drawtext = [
    `drawtext=fontfile='${font}':text='${escapedTitle}':fontcolor=white:fontsize=56:x=(w-text_w)/2:y=(h-text_h)/2-40`,
    `drawtext=fontfile='${font}':text='${escapedSubtitle}':fontcolor=#94a3b8:fontsize=28:x=(w-text_w)/2:y=(h+text_h)/2+20`,
  ].join(',');

  execFileSync(ffmpegPath, [
    '-y',
    '-f', 'lavfi',
    '-i', `color=c=0x0f172a:s=1920x1080:d=${durationSec}:r=30`,
    '-vf', drawtext,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-pix_fmt', 'yuv420p',
    '-t', String(durationSec),
    outputPath,
  ], { stdio: 'pipe' });

  console.log(`  [title-card] Generated ${durationSec}s title card: ${path.basename(outputPath)}`);
}
