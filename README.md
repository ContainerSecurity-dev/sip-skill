# SIP Skill: Security Immediate Plan

An explicitly invoked Codex skill for applying or auditing the complete SIP
supply-chain framework in Node.js container repositories:

**AI agent → dependencies → container build → attestations → vulnerability gate**

The skill makes targeted repository changes, validates what it can execute, and
reports host or GitHub settings that require manual authorization.

## Install

Ask Codex to use the built-in installer:

```text
$skill-installer Install the SIP skill from https://github.com/ContainerSecurity-dev/sip-skill
```

Or install it manually:

```bash
mkdir -p ~/.agents/skills
git clone https://github.com/ContainerSecurity-dev/sip-skill.git ~/.agents/skills/sip
```

Update a manual installation with:

```bash
git -C ~/.agents/skills/sip pull --ff-only
```

## Use

SIP never runs implicitly. Invoke it from the target repository:

```text
$sip Apply the complete SIP framework to this repository.
```

For a read-only audit:

```text
$sip Inspect this repository and report SIP gaps without modifying files.
```

To constrain implementation choices:

```text
$sip Apply SIP, preserving the existing registry and release-tag policy.
```

## Controls

### SIP i — local AI-agent isolation

SIP i is a developer/host control, not something GitHub CI can enforce. The
skill inspects and documents Docker Sandboxes usage but never resets or weakens
an existing host policy automatically.

Recommended developer setup:

```bash
sbx policy init deny-all
sbx policy allow network "api.openai.com,github.com,*.npmjs.org"
sbx secret set openai --oauth
sbx secret set github
sbx run codex .
```

### SIP ii — dependency cooldown

The skill enforces:

```ini
min-release-age=5
ignore-scripts=true
```

It keeps `package-lock.json`, uses only `npm ci --ignore-scripts`, and validates
publication timestamps for every locked dependency. This explicit validation is
necessary because `npm ci` installs existing lockfile entries without applying
resolution-time cooldown filtering.

The bundled validator requires a modern non-empty lockfile, checks locked
tarball URLs and integrity values against npm metadata, rejects invalid
timestamps, and uses timed, bounded-retry registry requests. Exact package names
listed with `min-release-age-exclude` are honored and reported as explicit
exceptions.

The chosen Node release must bundle an npm version that supports
`min-release-age`; the skill does not bootstrap npm using an unlocked global or
`npm exec` installation.

### SIP iii — hardened containers

The skill creates or updates a multi-stage Dockerfile using matching Docker
Hardened Image build and runtime variants. Runtime contents stay minimal and
non-root. Each relevant stage declares:

```dockerfile
ARG BUILDKIT_SBOM_SCAN_STAGE=true
```

### SIP iv — SBOM and provenance

The candidate is built once and pushed with:

```yaml
sbom: true
provenance: mode=max
outputs: type=image,push=true,oci-mediatypes=true,oci-artifact=true
```

The source SHA names the candidate; the resulting digest identifies it for every
downstream operation.

### SIP v — strict attached-SBOM gate

The skill does not trust best-effort `--sbom-sources oci` discovery alone. It
extracts `.SBOM.SPDX` from the exact image digest, validates a non-empty SPDX
document, and passes that file to pinned Trivy. Missing attestations fail closed.
A fixable Critical vulnerability blocks promotion.

## GitHub Actions design

The preferred shared job graph is:

```text
SIP ii dependencies
  → SIP iii–iv hardened container + attestations
  → SIP v attached-SBOM gate
  → promotion (trusted non-PR events only)
```

PR checks are visible separately, while container construction and attestation
remain together to avoid rebuilding. Release events reuse the same jobs and add
only digest promotion.

Credential-bearing same-repository PR jobs should use a protected GitHub
environment. Fork PRs never receive publishing credentials; a trusted main or
merge-queue run must complete the full gate before release. Optional PR reporting
updates one marker-based CVE comment instead of creating repeated comments.
Private-image inspection authenticates to the registry first, and every job uses
the same candidate SHA.

All executable workflow Actions must use verified full commit SHAs. The skill
also checks manual-ref eligibility, ref-scoped concurrency, least-privilege job
permissions, lowercase GHCR naming, and promotion of the scanned digest.

## Bundled resources

- [`scripts/validate-lockfile-age.mjs`](scripts/validate-lockfile-age.mjs): a
  fail-closed validator for npm publication age and locked artifact identity,
  with bounded concurrency, request timeouts, and retries.
- [`scripts/validate-lockfile-age.test.mjs`](scripts/validate-lockfile-age.test.mjs):
  regression coverage for malformed policy input, legacy lockfiles, registry
  metadata, exclusions, and transient failures.
- [`references/github-actions.md`](references/github-actions.md): detailed job,
  event, credential, reporting, and promotion guidance loaded when workflows are
  created or substantially changed.

## Expected result

After implementation, the agent reports:

- inspected Node, npm, Dockerfile, registry, workflow, and agent configuration;
- changes mapped to SIP i–v;
- verified Action SHAs and DHI versions;
- cooldown violations or explicit exceptions;
- PR, fork, main, tag, and manual-run behavior;
- protected-environment and required-check configuration still needed;
- whether the gate extracted and scanned the attached SPDX document; and
- whether promotion references exactly the digest that passed the gate.
