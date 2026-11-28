import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { build } from 'esbuild';

const outFile = path.resolve('node_modules/.cache/sleep-swatter-tests.mjs');
fs.mkdirSync(path.dirname(outFile), { recursive: true });

await build({
  entryPoints: ['tests/game-logic.test.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: outFile,
  logLevel: 'silent',
});

const result = spawnSync(process.execPath, ['--test', outFile], { stdio: 'inherit' });
process.exit(result.status ?? 1);
