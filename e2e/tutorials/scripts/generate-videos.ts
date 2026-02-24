import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import type { GenerateOptions, TutorialManifest } from './lib/types';
import { TRIGGER_MAP } from './lib/trigger-map';
import { hasChanged, updateHash } from './lib/content-hash';
import { parseNarrationScript } from './lib/narration-parser';
import { synthesizeNarration } from './lib/polly-tts';
import { generateTitleCard } from './lib/title-card';
import { composeVideo } from './lib/ffmpeg-compose';
import { generateYouTubeMetadata } from './lib/youtube-metadata';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'e2e', 'tutorials', 'output');

function printUsage(): void {
  console.log(`
Usage: npx tsx e2e/tutorials/scripts/generate-videos.ts [options]

Options:
  --force              Regenerate all videos, ignoring content hash cache
  --keep-intermediates Keep intermediate files in temp directory
  --voice <id>         Amazon Polly voice ID (default: Matthew)
  --tutorials <ids>    Comma-separated tutorial IDs (default: all)
  --ffmpeg <path>      Path to ffmpeg binary (default: ffmpeg)
  --region <region>    AWS region for Polly (default: us-east-1)
  --help               Show this help message
`);
}

function parseArgs(argv: string[]): GenerateOptions {
  const options: GenerateOptions = {
    force: false,
    keepIntermediates: false,
    pollyVoice: 'Matthew',
    tutorialIds: [],
    ffmpegPath: 'ffmpeg',
    awsRegion: 'us-east-1',
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--force':
        options.force = true;
        break;
      case '--keep-intermediates':
        options.keepIntermediates = true;
        break;
      case '--voice':
        options.pollyVoice = argv[++i];
        break;
      case '--tutorials':
        options.tutorialIds = argv[++i].split(',').map((s) => s.trim());
        break;
      case '--ffmpeg':
        options.ffmpegPath = argv[++i];
        break;
      case '--region':
        options.awsRegion = argv[++i];
        break;
      case '--help':
        printUsage();
        process.exit(0);
      default:
        console.error(`Unknown option: ${argv[i]}`);
        printUsage();
        process.exit(1);
    }
  }

  return options;
}

function discoverTutorials(): string[] {
  return Object.keys(TRIGGER_MAP).sort();
}

function ensureFfmpeg(ffmpegPath: string): void {
  try {
    execFileSync(ffmpegPath, ['-version'], { stdio: 'pipe' });
  } catch {
    console.error(`ffmpeg not found at "${ffmpegPath}". Install ffmpeg or use --ffmpeg <path>.`);
    process.exit(1);
  }
}

async function processTutorial(
  tutorialId: string,
  options: GenerateOptions,
): Promise<boolean> {
  const tutorialOutputDir = path.join(OUTPUT_DIR, tutorialId);
  const recordingPath = path.join(tutorialOutputDir, 'recording.webm');
  const narrationPath = path.join(tutorialOutputDir, 'narration-script.md');
  const manifestPath = path.join(tutorialOutputDir, 'manifest.json');

  // Check prerequisites
  if (!fs.existsSync(recordingPath)) {
    console.log(`  [skip] No recording found at ${recordingPath}`);
    console.log(`         Run "npm run tutorial:record" first.`);
    return false;
  }

  if (!fs.existsSync(narrationPath)) {
    console.log(`  [skip] No narration script at ${narrationPath}`);
    return false;
  }

  if (!fs.existsSync(manifestPath)) {
    console.log(`  [skip] No manifest at ${manifestPath}`);
    return false;
  }

  // Set up working directory
  const workDir = path.join(os.tmpdir(), 'artifact-keeper-tutorials', tutorialId);
  fs.mkdirSync(workDir, { recursive: true });

  try {
    // Parse narration cues
    console.log('  Parsing narration script...');
    const cues = parseNarrationScript(narrationPath);
    console.log(`  Found ${cues.length} narration cues`);

    // Synthesize audio via Polly
    console.log('  Synthesizing voiceover with Amazon Polly...');
    const audioChunks = await synthesizeNarration(cues, workDir, {
      voice: options.pollyVoice,
      region: options.awsRegion,
      ffmpegPath: options.ffmpegPath,
    });

    // Generate title card
    console.log('  Generating title card...');
    const manifest: TutorialManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const titleCardPath = path.join(workDir, 'title-card.mp4');
    generateTitleCard(manifest.title, titleCardPath, options.ffmpegPath);

    // Compose final video
    console.log('  Composing final video...');
    const finalPath = path.join(tutorialOutputDir, 'final.mp4');
    composeVideo(recordingPath, titleCardPath, audioChunks, finalPath, workDir, options.ffmpegPath);

    // Generate YouTube metadata
    console.log('  Generating YouTube metadata...');
    generateYouTubeMetadata(manifest, tutorialOutputDir);

    // Update content hash
    updateHash(tutorialId);

    const sizeMB = (fs.statSync(finalPath).size / (1024 * 1024)).toFixed(1);
    console.log(`  Complete: ${finalPath} (${sizeMB} MB)`);

    return true;
  } finally {
    if (!options.keepIntermediates) {
      fs.rmSync(workDir, { recursive: true, force: true });
    } else {
      console.log(`  Intermediates kept at: ${workDir}`);
    }
  }
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv);

  console.log('Tutorial Video Generator');
  console.log('========================\n');

  // Verify ffmpeg is available
  ensureFfmpeg(options.ffmpegPath);

  // Determine which tutorials to process
  const allTutorials = discoverTutorials();
  const targetTutorials = options.tutorialIds.length > 0
    ? options.tutorialIds.filter((id) => {
        if (!allTutorials.includes(id)) {
          console.warn(`Warning: unknown tutorial ID "${id}", skipping`);
          return false;
        }
        return true;
      })
    : allTutorials;

  if (targetTutorials.length === 0) {
    console.log('No tutorials to process.');
    return;
  }

  console.log(`Tutorials: ${targetTutorials.join(', ')}`);
  console.log(`Voice: ${options.pollyVoice}`);
  console.log(`Force: ${options.force}`);
  console.log('');

  // Optionally run Playwright recording first
  if (process.env.RECORD_BEFORE_GENERATE === 'true') {
    console.log('Recording tutorials with Playwright...\n');
    const tutorialFilter = targetTutorials.length < allTutorials.length
      ? targetTutorials.map((id) => id.replace(/^(\d+)-/, '$1')).join('|')
      : '';
    const recordArgs = ['test', '--config', 'playwright-tutorials.config.ts'];
    if (tutorialFilter) {
      recordArgs.push('-g', tutorialFilter);
    }
    execFileSync('npx', ['playwright', ...recordArgs], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
    console.log('');
  }

  // Process each tutorial
  let processed = 0;
  let skipped = 0;

  for (const tutorialId of targetTutorials) {
    console.log(`\n[${tutorialId}]`);

    if (!options.force && !hasChanged(tutorialId)) {
      console.log('  Up to date, skipping (use --force to override)');
      skipped++;
      continue;
    }

    const success = await processTutorial(tutorialId, options);
    if (success) {
      processed++;
    }
  }

  // Regenerate combined manifest
  if (processed > 0) {
    console.log('\nRegenerating combined manifest...');
    execFileSync('npx', ['tsx', 'e2e/tutorials/scripts/generate-manifest.ts'], {
      cwd: PROJECT_ROOT,
      stdio: 'inherit',
    });
  }

  console.log(`\nDone: ${processed} generated, ${skipped} up to date`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
