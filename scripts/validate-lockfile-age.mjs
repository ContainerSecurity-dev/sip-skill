#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const transientStatuses = new Set([429, 502, 503, 504]);

export function parseMinimumAge(value = '5') {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error('MIN_RELEASE_AGE_DAYS must be a positive integer');
  }
  const days = Number(value);
  if (!Number.isSafeInteger(days)) {
    throw new Error('MIN_RELEASE_AGE_DAYS must be a safe integer');
  }
  return days;
}

export function parseExclusions(npmrc = '') {
  return new Set(
    npmrc
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^min-release-age-exclude(?:\[\])?\s*=/.test(line))
      .flatMap((line) => line.slice(line.indexOf('=') + 1).split(','))
      .map((name) => name.trim())
      .filter(Boolean),
  );
}

export function collectDependencies(lockfile) {
  if (!Number.isInteger(lockfile.lockfileVersion) || lockfile.lockfileVersion < 2) {
    throw new Error('package-lock.json must use lockfileVersion 2 or newer');
  }
  if (!lockfile.packages || typeof lockfile.packages !== 'object' || Array.isArray(lockfile.packages)) {
    throw new Error('package-lock.json must contain a packages object');
  }

  const dependencies = [];
  for (const [path, metadata] of Object.entries(lockfile.packages)) {
    if (!path || !metadata.version || metadata.link) continue;
    const marker = 'node_modules/';
    const markerIndex = path.lastIndexOf(marker);
    if (markerIndex < 0) continue;
    dependencies.push({
      name: metadata.name ?? path.slice(markerIndex + marker.length),
      version: metadata.version,
      resolved: metadata.resolved,
      integrity: metadata.integrity,
    });
  }

  if (dependencies.length === 0) {
    throw new Error('package-lock.json does not contain any locked dependencies');
  }
  return dependencies;
}

async function fetchPackageMetadata(name, { fetchImpl, timeoutMs, retries }) {
  const packageUrl = `https://registry.npmjs.org/${encodeURIComponent(name)}`;
  let lastError;

  for (let attempt = 1; attempt <= retries + 1; attempt += 1) {
    try {
      const response = await fetchImpl(packageUrl, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.ok) return response.json();
      lastError = new Error(`HTTP ${response.status}`);
      if (!transientStatuses.has(response.status)) break;
    } catch (error) {
      lastError = error;
    }

    if (attempt <= retries) {
      await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** (attempt - 1)));
    }
  }

  const detail = lastError?.name === 'TimeoutError' ? `timed out after ${timeoutMs}ms` : lastError?.message;
  throw new Error(`Unable to retrieve npm metadata for ${name}: ${detail ?? 'unknown error'}`);
}

export async function validateLockfile({
  lockfile,
  npmrc = '',
  minimumAgeDays = 5,
  now = Date.now(),
  fetchImpl = fetch,
  timeoutMs = 15_000,
  retries = 2,
}) {
  const dependencies = collectDependencies(lockfile);
  const exclusions = parseExclusions(npmrc);
  const cutoff = now - minimumAgeDays * 24 * 60 * 60 * 1000;
  const packages = new Map();

  for (const { name, version } of dependencies) {
    if (exclusions.has(name)) continue;
    const versions = packages.get(name) ?? new Set();
    versions.add(version);
    packages.set(name, versions);
  }

  const violations = [];
  const packageEntries = [...packages.entries()];
  for (let offset = 0; offset < packageEntries.length; offset += 10) {
    const batch = packageEntries.slice(offset, offset + 10);
    await Promise.all(batch.map(async ([name, versions]) => {
      const metadata = await fetchPackageMetadata(name, { fetchImpl, timeoutMs, retries });
      for (const version of versions) {
        const publishedAt = metadata.time?.[version];
        const publishedTime = Date.parse(publishedAt);
        const registryArtifact = metadata.versions?.[version]?.dist;

        if (!publishedAt || !Number.isFinite(publishedTime)) {
          violations.push(`${name}@${version}: publish time unavailable`);
        } else if (publishedTime > cutoff) {
          violations.push(`${name}@${version}: published ${publishedAt}`);
        }

        for (const locked of dependencies.filter(
          (dependency) => dependency.name === name && dependency.version === version,
        )) {
          if (!locked.resolved || locked.resolved !== registryArtifact?.tarball) {
            violations.push(`${name}@${version}: resolved tarball does not match npm registry metadata`);
          }
          if (!locked.integrity || locked.integrity !== registryArtifact?.integrity) {
            violations.push(`${name}@${version}: integrity does not match npm registry metadata`);
          }
        }
      }
    }));
  }

  if (violations.length > 0) {
    throw new Error(
      `Dependencies younger than ${minimumAgeDays} days or unverifiable:\n` +
      violations.sort().map((violation) => `- ${violation}`).join('\n'),
    );
  }

  const excludedCount = dependencies.filter(({ name }) => exclusions.has(name)).length;
  return { validatedCount: dependencies.length - excludedCount, excludedCount };
}

async function main() {
  const minimumAgeDays = parseMinimumAge(process.env.MIN_RELEASE_AGE_DAYS ?? '5');
  const lockfile = JSON.parse(await readFile('package-lock.json', 'utf8'));
  const npmrc = await readFile('.npmrc', 'utf8').catch((error) => {
    if (error.code === 'ENOENT') return '';
    throw error;
  });
  const result = await validateLockfile({ lockfile, npmrc, minimumAgeDays });
  console.log(
    `Validated ${result.validatedCount} locked packages against a ${minimumAgeDays}-day cooldown ` +
    `(${result.excludedCount} excluded locked packages).`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
