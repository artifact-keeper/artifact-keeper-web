import { type Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

export interface Chapter {
  name: string;
  timestampMs: number;
}

export interface NarrationCue {
  text: string;
  timestampMs: number;
}

export interface TutorialStep {
  name: string;
  screenshotPath: string;
  timestampMs: number;
}

export interface TutorialMetadata {
  id: string;
  title: string;
  description: string;
}

export class TutorialHelper {
  private startTime = 0;
  private chapters: Chapter[] = [];
  private narrationCues: NarrationCue[] = [];
  private steps: TutorialStep[] = [];
  private outputDir: string;
  private screenshotsDir: string;
  private stepCounter = 0;

  constructor(
    private page: Page,
    private metadata: TutorialMetadata,
  ) {
    this.outputDir = path.join(__dirname, '..', 'output', metadata.id);
    this.screenshotsDir = path.join(this.outputDir, 'screenshots');
  }

  /** Call at the start of each tutorial to initialize timing and directories. */
  async begin(): Promise<void> {
    fs.mkdirSync(this.screenshotsDir, { recursive: true });
    this.startTime = Date.now();
    this.chapters = [];
    this.narrationCues = [];
    this.steps = [];
    this.stepCounter = 0;
  }

  /** Deliberate pause so viewers can see the current state. */
  async pause(ms = 1500): Promise<void> {
    await this.page.waitForTimeout(ms);
  }

  /** Mark a chapter boundary (for YouTube chapters). */
  chapter(name: string): void {
    this.chapters.push({ name, timestampMs: this.elapsed() });
  }

  /** Record a narration cue for AI TTS script generation. */
  narrate(text: string): void {
    this.narrationCues.push({ text, timestampMs: this.elapsed() });
  }

  /** Capture a named screenshot and log the step. */
  async step(name: string): Promise<void> {
    this.stepCounter++;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const filename = `step-${String(this.stepCounter).padStart(2, '0')}-${slug}.png`;
    const screenshotPath = path.join(this.screenshotsDir, filename);

    await this.page.screenshot({ path: screenshotPath, fullPage: false });

    this.steps.push({
      name,
      screenshotPath: `screenshots/${filename}`,
      timestampMs: this.elapsed(),
    });
  }

  /** Narrate + screenshot in one call (common pattern). */
  async show(stepName: string, narration: string): Promise<void> {
    this.narrate(narration);
    await this.pause(800);
    await this.step(stepName);
    await this.pause(1200);
  }

  /** Call at the end of each tutorial to write output files. */
  async finish(): Promise<void> {
    this.writeNarrationScript();
    this.writeManifest();

    // Move the Playwright video to the output directory
    const video = this.page.video();
    if (video) {
      const videoPath = await video.path();
      if (videoPath) {
        const dest = path.join(this.outputDir, 'recording.webm');
        await this.page.waitForTimeout(500);
        try {
          fs.copyFileSync(videoPath, dest);
        } catch {
          console.log(`[tutorial] Video will be in test-results; manual copy may be needed.`);
        }
      }
    }
  }

  private elapsed(): number {
    return Date.now() - this.startTime;
  }

  private formatTimestamp(ms: number): string {
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${String(seconds).padStart(2, '0')}`;
  }

  private writeNarrationScript(): void {
    const lines = [
      `# ${this.metadata.title}`,
      '',
      `> ${this.metadata.description}`,
      '',
      '## Narration Script',
      '',
    ];

    for (const cue of this.narrationCues) {
      lines.push(`**[${this.formatTimestamp(cue.timestampMs)}]** ${cue.text}`);
      lines.push('');
    }

    if (this.chapters.length > 0) {
      lines.push('## YouTube Chapters');
      lines.push('');
      lines.push('```');
      for (const ch of this.chapters) {
        lines.push(`${this.formatTimestamp(ch.timestampMs)} ${ch.name}`);
      }
      lines.push('```');
    }

    fs.writeFileSync(
      path.join(this.outputDir, 'narration-script.md'),
      lines.join('\n'),
    );
  }

  private writeManifest(): void {
    const manifest = {
      id: this.metadata.id,
      title: this.metadata.title,
      description: this.metadata.description,
      chapters: this.chapters.map((ch) => ({
        time: this.formatTimestamp(ch.timestampMs),
        name: ch.name,
      })),
      steps: this.steps.map((s) => ({
        name: s.name,
        screenshot: s.screenshotPath,
        time: this.formatTimestamp(s.timestampMs),
      })),
      thumbnailScreenshot: this.steps[1]?.screenshotPath ?? this.steps[0]?.screenshotPath ?? null,
    };

    fs.writeFileSync(
      path.join(this.outputDir, 'manifest.json'),
      JSON.stringify(manifest, null, 2),
    );
  }
}
