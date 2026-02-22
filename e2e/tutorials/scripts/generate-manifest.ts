import * as fs from 'fs';
import * as path from 'path';

interface TutorialManifestEntry {
  id: string;
  title: string;
  description: string;
  chapters: { time: string; name: string }[];
  steps: { name: string; screenshot: string; time: string }[];
  thumbnailScreenshot: string | null;
}

interface CombinedManifest {
  generatedAt: string;
  tutorials: TutorialManifestEntry[];
}

function main() {
  const outputDir = path.join(__dirname, '..', 'output');

  if (!fs.existsSync(outputDir)) {
    console.error('No output directory found. Run tutorial:record first.');
    process.exit(1);
  }

  const tutorials: TutorialManifestEntry[] = [];
  const entries = fs.readdirSync(outputDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;

    const manifestPath = path.join(outputDir, entry.name, 'manifest.json');
    if (!fs.existsSync(manifestPath)) continue;

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    tutorials.push(manifest);
  }

  // Sort by ID
  tutorials.sort((a, b) => a.id.localeCompare(b.id));

  const combined: CombinedManifest = {
    generatedAt: new Date().toISOString(),
    tutorials,
  };

  const outPath = path.join(outputDir, 'manifest.json');
  fs.writeFileSync(outPath, JSON.stringify(combined, null, 2));
  console.log(`Generated combined manifest with ${tutorials.length} tutorials at ${outPath}`);

  // Print a summary
  for (const t of tutorials) {
    console.log(`  ${t.id}: "${t.title}" (${t.chapters.length} chapters, ${t.steps.length} screenshots)`);
  }
}

main();
