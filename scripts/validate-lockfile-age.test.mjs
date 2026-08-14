import assert from 'node:assert/strict';
import test from 'node:test';

import {
  collectDependencies,
  parseMinimumAge,
  validateLockfile,
} from './validate-lockfile-age.mjs';

const oldDate = '2020-01-01T00:00:00.000Z';
const now = Date.parse('2026-01-01T00:00:00.000Z');

function fixture(overrides = {}) {
  return {
    lockfileVersion: 3,
    packages: {
      '': { name: 'fixture', version: '1.0.0' },
      'node_modules/example': {
        version: '1.0.0',
        resolved: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz',
        integrity: 'sha512-example',
        ...overrides,
      },
    },
  };
}

function registryMetadata(overrides = {}) {
  return {
    time: { '1.0.0': oldDate },
    versions: {
      '1.0.0': {
        dist: {
          tarball: 'https://registry.npmjs.org/example/-/example-1.0.0.tgz',
          integrity: 'sha512-example',
        },
      },
    },
    ...overrides,
  };
}

function response(metadata, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => metadata };
}

test('minimum age must be a complete positive integer', () => {
  assert.equal(parseMinimumAge('5'), 5);
  for (const value of ['0', '0disabled', '5days', '-1', '1.5', '']) {
    assert.throws(() => parseMinimumAge(value), /positive integer/);
  }
});

test('legacy and empty lockfiles fail closed', () => {
  assert.throws(() => collectDependencies({ lockfileVersion: 1, dependencies: {} }), /lockfileVersion 2/);
  assert.throws(() => collectDependencies({ lockfileVersion: 3, packages: {} }), /locked dependencies/);
});

test('validates publication time and registry artifact identity', async () => {
  const result = await validateLockfile({
    lockfile: fixture(),
    now,
    fetchImpl: async () => response(registryMetadata()),
  });
  assert.deepEqual(result, { validatedCount: 1, excludedCount: 0 });

  await assert.rejects(
    validateLockfile({
      lockfile: fixture({ integrity: 'sha512-attacker' }),
      now,
      fetchImpl: async () => response(registryMetadata()),
    }),
    /integrity does not match/,
  );
  await assert.rejects(
    validateLockfile({
      lockfile: fixture({ resolved: 'https://attacker.invalid/example.tgz' }),
      now,
      fetchImpl: async () => response(registryMetadata()),
    }),
    /resolved tarball does not match/,
  );
  await assert.rejects(
    validateLockfile({
      lockfile: fixture(),
      now,
      fetchImpl: async () => response(registryMetadata({ time: { '1.0.0': 'not-a-date' } })),
    }),
    /publish time unavailable/,
  );
});

test('exact npmrc exclusions bypass validation explicitly', async () => {
  const result = await validateLockfile({
    lockfile: fixture(),
    npmrc: 'min-release-age-exclude=example',
    now,
    fetchImpl: async () => { throw new Error('excluded package must not be fetched'); },
  });
  assert.deepEqual(result, { validatedCount: 0, excludedCount: 1 });
});

test('transient registry failures receive bounded retries', async () => {
  let calls = 0;
  const result = await validateLockfile({
    lockfile: fixture(),
    now,
    retries: 1,
    fetchImpl: async () => {
      calls += 1;
      return calls === 1 ? response({}, 503) : response(registryMetadata());
    },
  });
  assert.equal(calls, 2);
  assert.equal(result.validatedCount, 1);
});

test('stalled registry requests time out and fail closed', async () => {
  await assert.rejects(
    validateLockfile({
      lockfile: fixture(),
      now,
      timeoutMs: 5,
      retries: 0,
      fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
        const guard = setTimeout(() => reject(new Error('mock request did not abort')), 100);
        signal.addEventListener('abort', () => {
          clearTimeout(guard);
          reject(signal.reason);
        }, { once: true });
      }),
    }),
    /timed out after 5ms/,
  );
});
