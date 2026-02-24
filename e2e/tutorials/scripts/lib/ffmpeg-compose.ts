import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { AudioChunk } from './types';
import { TITLE_CARD_DURATION_MS } from './title-card';

/**
 * Stage 1: Transcode WebM VP9 recording to H.264 MP4.
 */
function transcodeToH264(
  inputWebm: string,
  outputMp4: string,
  ffmpegPath: string,
): void {
  console.log('  [ffmpeg] Stage 1: Transcoding WebM to H.264...');
  execFileSync(ffmpegPath, [
    '-y',
    '-i', inputWebm,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-r', '30',
    '-pix_fmt', 'yuv420p',
    '-an', // strip any existing audio
    outputMp4,
  ], { stdio: 'pipe' });
}

/**
 * Stage 2: Mix audio chunks at their timestamp offsets into a single audio track.
 * Each chunk is delayed to its original timestamp using the adelay filter.
 */
function mixAudioChunks(
  chunks: AudioChunk[],
  outputAudio: string,
  ffmpegPath: string,
): void {
  if (chunks.length === 0) return;

  console.log(`  [ffmpeg] Stage 2: Mixing ${chunks.length} audio chunks...`);

  const inputs: string[] = [];
  const filterParts: string[] = [];

  for (let i = 0; i < chunks.length; i++) {
    inputs.push('-i', chunks[i].filePath);
    // adelay takes milliseconds, apply to all channels (use |0 for mono)
    const delayMs = chunks[i].timestampMs;
    filterParts.push(`[${i}]adelay=${delayMs}|${delayMs}[delayed${i}]`);
  }

  const mixInputs = chunks.map((_, i) => `[delayed${i}]`).join('');
  const filterComplex = [
    ...filterParts,
    `${mixInputs}amix=inputs=${chunks.length}:duration=longest:dropout_transition=0[mixed]`,
  ].join(';');

  execFileSync(ffmpegPath, [
    '-y',
    ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[mixed]',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-ar', '48000',
    outputAudio,
  ], { stdio: 'pipe' });
}

/**
 * Stage 3: Concatenate title card + main video, shift audio by title card duration.
 */
function concatenateWithTitleCard(
  titleCardPath: string,
  mainVideoPath: string,
  audioPath: string | null,
  outputPath: string,
  ffmpegPath: string,
): void {
  console.log('  [ffmpeg] Stage 3: Concatenating title card + main video...');

  // Write concat list
  const concatList = path.join(path.dirname(outputPath), 'concat-list.txt');
  fs.writeFileSync(concatList, [
    `file '${titleCardPath}'`,
    `file '${mainVideoPath}'`,
  ].join('\n'));

  if (audioPath && fs.existsSync(audioPath)) {
    // Concat video, then overlay audio shifted by title card duration
    const shiftMs = TITLE_CARD_DURATION_MS;

    execFileSync(ffmpegPath, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatList,
      '-i', audioPath,
      '-filter_complex', `[1:a]adelay=${shiftMs}|${shiftMs}[shifted]`,
      '-map', '0:v',
      '-map', '[shifted]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      outputPath,
    ], { stdio: 'pipe' });
  } else {
    // No audio, just concat the videos
    execFileSync(ffmpegPath, [
      '-y',
      '-f', 'concat',
      '-safe', '0',
      '-i', concatList,
      '-c:v', 'copy',
      '-an',
      outputPath,
    ], { stdio: 'pipe' });
  }

  fs.unlinkSync(concatList);
}

/**
 * Stage 4: Final pass to ensure proper container format for web streaming.
 */
function finalizeOutput(
  inputPath: string,
  outputPath: string,
  ffmpegPath: string,
): void {
  console.log('  [ffmpeg] Stage 4: Finalizing output with faststart...');
  execFileSync(ffmpegPath, [
    '-y',
    '-i', inputPath,
    '-c:v', 'libx264',
    '-preset', 'medium',
    '-crf', '18',
    '-c:a', 'aac',
    '-b:a', '192k',
    '-movflags', '+faststart',
    '-pix_fmt', 'yuv420p',
    outputPath,
  ], { stdio: 'pipe' });
}

/**
 * Run the full 4-stage video composition pipeline.
 *
 * 1. Transcode WebM -> H.264 MP4
 * 2. Mix audio chunks at timestamp offsets
 * 3. Concatenate title card + main video, shift audio
 * 4. Finalize with faststart for web streaming
 */
export function composeVideo(
  recordingPath: string,
  titleCardPath: string,
  audioChunks: AudioChunk[],
  outputPath: string,
  workDir: string,
  ffmpegPath: string,
): void {
  const transcodedPath = path.join(workDir, 'transcoded.mp4');
  const mixedAudioPath = path.join(workDir, 'mixed-audio.m4a');
  const concatenatedPath = path.join(workDir, 'concatenated.mp4');

  // Stage 1: Transcode
  transcodeToH264(recordingPath, transcodedPath, ffmpegPath);

  // Stage 2: Mix audio
  if (audioChunks.length > 0) {
    mixAudioChunks(audioChunks, mixedAudioPath, ffmpegPath);
  }

  // Stage 3: Concatenate with title card
  const hasAudio = audioChunks.length > 0 && fs.existsSync(mixedAudioPath);
  concatenateWithTitleCard(
    titleCardPath,
    transcodedPath,
    hasAudio ? mixedAudioPath : null,
    concatenatedPath,
    ffmpegPath,
  );

  // Stage 4: Finalize
  finalizeOutput(concatenatedPath, outputPath, ffmpegPath);

  console.log(`  [ffmpeg] Done: ${path.basename(outputPath)}`);
}
