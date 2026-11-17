#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFileSync, appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const [registry, tag] = process.argv.slice(2);
if (!['https://registry.npmjs.org', 'https://npm.pkg.github.com'].includes(registry) ||
    !/^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.test(tag ?? '')) {
  throw new Error('Expected an approved registry and stable release tag');
}
const version = tag.slice(1);
const name = '@containersecurity-dev/sip-skill';
const file = `./dist/sip-npm-${version}.tgz`;
const integrity = `sha512-${createHash('sha512').update(readFileSync(file)).digest('base64')}`;
function inspect() {
  const result = spawnSync('npm', ['view', `${name}@${version}`, 'dist.integrity', '--json', '--registry', registry], { encoding: 'utf8' });
  if (result.status === 0) return JSON.parse(result.stdout);
  let error;
  try { error = JSON.parse(result.stdout).error; } catch { /* Fail closed below. */ }
  if (error?.code === 'E404') return null;
  throw new Error('Registry lookup failed; refusing to publish without a successful existence check');
}
const existing = inspect();
if (existing !== null && existing !== integrity) throw new Error('Published version has different bytes');
if (existing === null) {
  const result = spawnSync('npm', ['publish', file, '--access', 'public', '--tag', `release-${version}`, '--ignore-scripts', '--registry', registry], { stdio: 'inherit' });
  if (result.status !== 0) throw new Error('npm publication failed');
  if (inspect() !== integrity) throw new Error('Post-publish integrity verification failed');
}
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `Published/verified ${name}@${version} at ${registry}\n`);
