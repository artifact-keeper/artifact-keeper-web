#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Patch @artifact-keeper/sdk to add the ./client subpath export.
 * The published 1.1.0-dev.1 is missing this export; it's fixed in the
 * repo source but not yet published. This runs as a postinstall hook.
 */
const fs = require('fs');
const path = require('path');

const pkgPath = path.join(__dirname, '..', 'node_modules', '@artifact-keeper', 'sdk', 'package.json');

try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  if (!pkg.exports?.['./client']) {
    pkg.exports = pkg.exports || {};
    pkg.exports['./client'] = {
      import: './src/client.gen.ts',
      types: './src/client.gen.ts',
    };
    fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    console.log('Patched @artifact-keeper/sdk: added ./client subpath export');
  }
} catch (e) {
  // SDK not installed yet or path doesn't exist — skip silently
}
