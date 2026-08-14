#!/usr/bin/env node

import { readFile } from 'node:fs/promises';

const minimumAgeDays = Number.parseInt(process.env.MIN_RELEASE_AGE_DAYS ?? '5', 10);
if (!Number.isInteger(minimumAgeDays) || minimumAgeDays < 0) {
  throw new Error('MIN_RELEASE_AGE_DAYS must be a non-negative integer');
}

const cutoff = Date.now() - minimumAgeDays * 24 * 60 * 60 * 1000;
const lockfile = JSON.parse(await readFile('package-lock.json', 'utf8'));
const dependencies = new Map();

for (const [path, metadata] of Object.entries(lockfile.packages ?? {})) {
  if (!path || !metadata.version || metadata.link) continue;

  const marker = 'node_modules/';
  const markerIndex = path.lastIndexOf(marker);
  if (markerIndex < 0) continue;

  const name = metadata.name ?? path.slice(markerIndex + marker.length);
  dependencies.set(`${name}@${metadata.version}`, { name, version: metadata.version });
}

const packages = new Map();
for (const { name, version } of dependencies.values()) {
  const versions = packages.get(name) ?? new Set();
  versions.add(version);
  packages.set(name, versions);
}

const violations = [];
const packageEntries = [...packages.entries()];
const batchSize = 10;

for (let offset = 0; offset < packageEntries.length; offset += batchSize) {
  const batch = packageEntries.slice(offset, offset + batchSize);
  await Promise.all(batch.map(async ([name, versions]) => {
    const packageUrl = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
    const response = await fetch(packageUrl, { headers: { accept: 'application/json' } });

    if (!response.ok) {
      throw new Error(`Unable to retrieve publish time for ${name}: HTTP ${response.status}`);
    }

    const metadata = await response.json();
    for (const version of versions) {
      const publishedAt = metadata.time?.[version];
      if (!publishedAt || !Number.isFinite(Date.parse(publishedAt))) {
        violations.push(`${name}@${version}: publish time unavailable`);
      } else if (Date.parse(publishedAt) > cutoff) {
        violations.push(`${name}@${version}: published ${publishedAt}`);
      }
    }
  }));
}

if (violations.length > 0) {
  console.error(`Dependencies younger than ${minimumAgeDays} days or unverifiable:`);
  console.error(violations.sort().map((violation) => `- ${violation}`).join('\n'));
  process.exit(1);
}

console.log(`Validated ${dependencies.size} locked packages against a ${minimumAgeDays}-day cooldown.`);
