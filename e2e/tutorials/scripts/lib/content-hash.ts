import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { TRIGGER_MAP } from './trigger-map';

const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const HASH_CACHE_PATH = path.join(PROJECT_ROOT, 'e2e', 'tutorials', 'output', '.content-hashes.json');

// fs.globSync is available in Node 22+ but @types/node may not include it yet
const globSync = (fs as any).globSync as (pattern: string) => string[];

type HashCache = Record<string, string>;

export function computeHash(tutorialId: string): string {
  const patterns = TRIGGER_MAP[tutorialId];
  if (!patterns) {
    throw new Error(`No trigger map entry for tutorial: ${tutorialId}`);
  }

  const hash = crypto.createHash('sha256');
  const filePaths: string[] = [];

  for (const pattern of patterns) {
    const fullPattern = path.join(PROJECT_ROOT, pattern);
    const matches = globSync(fullPattern);
    for (const entry of matches) {
      const stat = fs.statSync(entry);
      if (stat.isFile()) {
        filePaths.push(entry);
      }
    }
  }

  // Sort for deterministic hashing
  filePaths.sort();

  for (const filePath of filePaths) {
    const content = fs.readFileSync(filePath);
    hash.update(filePath);
    hash.update(content);
  }

  return hash.digest('hex');
}

export function loadHashCache(): HashCache {
  if (!fs.existsSync(HASH_CACHE_PATH)) {
    return {};
  }
  return JSON.parse(fs.readFileSync(HASH_CACHE_PATH, 'utf-8'));
}

export function saveHashCache(cache: HashCache): void {
  const dir = path.dirname(HASH_CACHE_PATH);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(HASH_CACHE_PATH, JSON.stringify(cache, null, 2));
}

export function hasChanged(tutorialId: string): boolean {
  const cache = loadHashCache();
  const currentHash = computeHash(tutorialId);
  return cache[tutorialId] !== currentHash;
}

export function updateHash(tutorialId: string): void {
  const cache = loadHashCache();
  cache[tutorialId] = computeHash(tutorialId);
  saveHashCache(cache);
}
