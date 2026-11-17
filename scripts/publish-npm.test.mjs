import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

for (const scenario of ['new', 'same', 'different', 'unauthorized']) {
  test(`npm publication: ${scenario}`, () => {
    const root = mkdtempSync(join(tmpdir(), 'sip-npm-'));
    try {
      mkdirSync(join(root, 'dist'));
      mkdirSync(join(root, 'bin'));
      writeFileSync(join(root, 'dist/sip-npm-0.1.1.tgz'), 'fixture');
      const integrity = `sha512-${createHash('sha512').update('fixture').digest('base64')}`;
      const marker = join(root, 'published');
      writeFileSync(join(root, 'bin/npm'), `#!/usr/bin/env node
const fs = require('node:fs');
if (process.argv[2] === 'publish') { fs.writeFileSync(process.env.MARKER, 'yes'); process.exit(0); }
const scenario = process.env.SCENARIO;
if (scenario === 'unauthorized') { console.log(JSON.stringify({error:{code:'E401'}})); process.exit(1); }
if (scenario === 'new' && !fs.existsSync(process.env.MARKER)) { console.log(JSON.stringify({error:{code:'E404'}})); process.exit(1); }
console.log(JSON.stringify(scenario === 'different' ? 'sha512-other' : process.env.INTEGRITY));
`, { mode: 0o755 });
      const result = spawnSync(process.execPath, [resolve('scripts/publish-npm.mjs'), 'https://registry.npmjs.org', 'v0.1.1'], {
        cwd: root, encoding: 'utf8', env: { ...process.env, PATH: `${join(root, 'bin')}:${process.env.PATH}`, SCENARIO: scenario, MARKER: marker, INTEGRITY: integrity },
      });
      assert.equal(result.status === 0, ['new', 'same'].includes(scenario), result.stderr);
      assert.equal(existsSync(marker), scenario === 'new');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
}
