import {
  PollyClient,
  SynthesizeSpeechCommand,
} from '@aws-sdk/client-polly';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import type { NarrationCue, AudioChunk } from './types';

/**
 * Wrap narration text in SSML for natural-sounding speech.
 * Splits on sentence boundaries, adds pauses between sentences,
 * and slows the rate slightly for tutorial clarity.
 */
function buildSSML(text: string): string {
  // Split into sentences on period, exclamation, or question mark
  const sentences = text
    .split(/(?<=[.!?])\s+/)
    .filter((s) => s.trim().length > 0);

  const ssmlSentences = sentences.map((s) => `<s>${s}</s>`);
  const body = ssmlSentences.join('<break time="400ms"/>');

  return `<speak><prosody rate="95%">${body}</prosody></speak>`;
}

/**
 * Get the duration of an audio file in milliseconds using ffprobe.
 */
function getAudioDurationMs(filePath: string, ffmpegPath: string): number {
  const ffprobePath = path.join(path.dirname(ffmpegPath), 'ffprobe');
  const output = execFileSync(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'csv=p=0',
    filePath,
  ], { encoding: 'utf-8' });

  return Math.round(parseFloat(output.trim()) * 1000);
}

/**
 * Synthesize all narration cues into individual MP3 audio chunks
 * using Amazon Polly's Neural engine.
 */
export async function synthesizeNarration(
  cues: NarrationCue[],
  workDir: string,
  options: { voice: string; region: string; ffmpegPath: string },
): Promise<AudioChunk[]> {
  const client = new PollyClient({ region: options.region });
  const chunks: AudioChunk[] = [];

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    const ssml = buildSSML(cue.text);
    const chunkPath = path.join(workDir, `chunk-${String(i).padStart(2, '0')}.mp3`);

    const command = new SynthesizeSpeechCommand({
      Engine: 'neural',
      OutputFormat: 'mp3',
      SampleRate: '24000',
      Text: ssml,
      TextType: 'ssml',
      VoiceId: options.voice as SynthesizeSpeechCommand['input']['VoiceId'],
    });

    const response = await client.send(command);

    if (response.AudioStream) {
      const audioBuffer = await streamToBuffer(response.AudioStream);
      fs.writeFileSync(chunkPath, audioBuffer);

      const durationMs = getAudioDurationMs(chunkPath, options.ffmpegPath);
      chunks.push({
        index: i,
        timestampMs: cue.timestampMs,
        filePath: chunkPath,
        durationMs,
      });

      console.log(
        `  [polly] chunk ${i}: ${durationMs}ms at ${formatTime(cue.timestampMs)} - "${cue.text.slice(0, 50)}..."`,
      );
    }
  }

  return chunks;
}

async function streamToBuffer(stream: { transformToByteArray(): Promise<Uint8Array> } | AsyncIterable<Uint8Array>): Promise<Buffer> {
  if ('transformToByteArray' in stream) {
    return Buffer.from(await stream.transformToByteArray());
  }
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
