---
name: sip
description: "Apply or audit the complete SIP supply-chain security framework for a Node.js container repository: document developer-side AI-agent isolation, enforce an npm dependency cooldown and locked script-free installs, use multi-stage Docker Hardened Images, publish BuildKit SBOM/provenance attestations, strictly scan the attached SBOM, report PR findings, and promote only the scanned digest. Use only when explicitly invoked for SIP implementation or gap analysis."
---

# SIP

Apply this chain in order:

**AI agent → dependencies → container build → attestations → vulnerability gate**

Make minimal repository changes. Preserve existing registry and release semantics
unless they conflict with a SIP invariant.

## 1. Inspect before editing

- Identify Node.js and bundled npm versions; confirm npm supports
  `min-release-age` without downloading another package manager.
- Inspect `package.json`, `package-lock.json`, `.npmrc`, every Dockerfile, and all
  image build, PR, scan, promotion, and release workflows.
- Identify registry naming, authentication, protected environments, fork
  behavior, required checks, concurrency, release tags, and existing attestations.
- Inspect local agent configuration and `sbx` availability, but treat SIP i as a
  developer/host control rather than repository enforcement.
- Inventory every GitHub Action reference and verify executable workflows use
  full commit SHAs.

## 2. SIP i — document local agent isolation

- Recommend `sbx policy init deny-all`, task-scoped network allowances, host-side
  `sbx` secrets, and `sbx secret set openai --oauth` for Codex.
- Never reset, replace, or weaken an existing sandbox policy automatically.
- Do not claim GitHub CI enforces SIP i. Record it as developer guidance/manual
  action when the repository cannot represent the host policy.

## 3. SIP ii — freeze unvetted dependencies

- Ensure `.npmrc` contains `min-release-age=5` and `ignore-scripts=true`.
- Keep `package-lock.json` committed. Use `npm ci --ignore-scripts`, never
  `npm install`, in CI and Docker builds.
- Do not assume the cooldown evaluates existing lockfile entries: `npm ci` does
  not re-resolve them. Add a fail-closed publication-age check for every locked
  package before installation. Reuse `scripts/validate-lockfile-age.mjs` from
  this skill when compatible with the repository.
- Verify the selected Node release bundles npm 11 or another version supporting
  `min-release-age`. Do not bootstrap npm with an unlocked `npm install` or
  `npm exec` download.
- Do not add cooldown exclusions automatically. Report a blocked security update
  and recommend a narrow `min-release-age-exclude` entry.

## 4. SIP iii — harden the container

- Convert applicable Dockerfiles to multi-stage builds.
- Select verified, matching DHI build/runtime tags compatible with the app and
  bundled npm:
  - Build: `dhi.io/node:<version>-<distro>-dev`
  - Runtime: `dhi.io/node:<version>-<distro>`
- Keep runtime contents minimal, copy files with correct ownership, and run as a
  non-root user.
- Declare `ARG BUILDKIT_SBOM_SCAN_STAGE=true` in every stage to include; Dockerfile
  `ARG` scope is stage-specific.
- Authenticate to DHI through a pinned `docker/login-action` and secrets. Never
  pass registry credentials as build arguments.

## 5. SIP iv — build once and attest

- Keep container construction and attestation in one BuildKit operation:
  - `sbom: true`
  - `provenance: mode=max`
  - `outputs: type=image,push=true,oci-mediatypes=true,oci-artifact=true`
- Tag the candidate with the source commit SHA and expose the build digest as a
  job output. Use that digest for every downstream operation.
- Derive registry/image names from existing configuration. For GHCR, normalize
  `${{ github.repository }}` to lowercase rather than hardcoding a repository.
- Never rebuild between attestation, scanning, and promotion.

## 6. SIP v — strictly scan the attached SBOM

- Install a verified, explicitly pinned Trivy version.
- Do not rely only on `trivy image --sbom-sources oci`; OCI lookup is best-effort
  and may fall back to layer analysis.
- Extract the exact digest's attached SPDX predicate with Buildx, validate a
  non-empty SPDX document, then pass that file to `trivy sbom`:

```bash
docker buildx imagetools inspect "${IMAGE}@${DIGEST}" \
  --format '{{ json .SBOM.SPDX }}' > sbom.spdx.json
jq -e '.spdxVersion and (.packages | type == "array") and (.packages | length > 0)' \
  sbom.spdx.json > /dev/null
trivy sbom --scanners vuln --severity CRITICAL --ignore-unfixed \
  --exit-code 1 sbom.spdx.json
```

- Fail safely when the digest, attestation, SPDX structure, or registry lookup is
  missing. A fixable Critical vulnerability must fail the gate.
- Promote only after the gate and only with `docker buildx imagetools create`
  referencing the scanned digest.

## 7. Design safe GitHub Actions

Read `references/github-actions.md` before creating or substantially modifying a
workflow. Apply these invariants:

- Trigger dependency validation on PRs. Prefer separate visible jobs for SIP ii,
  combined SIP iii–iv, SIP v, and promotion.
- Reuse the same job graph for PR and release events; promotion is the only
  release-only job.
- For same-repository PRs, put credential-bearing publication behind a protected
  environment with required reviewers. Never expose DHI or package-write
  credentials to fork PRs.
- Ensure trusted `main` or merge-queue execution completes SIP ii–v before
  promotion when a fork cannot run credential-bearing jobs.
- Add a marker-based PR CVE comment when requested; update it rather than posting
  repeatedly. Keep the gate independent of comment success where appropriate.
- Reject ineligible manual refs and use ref-scoped concurrency to prevent stale
  `latest` promotion.
- Use least-privilege job permissions and pinned full Action SHAs.

## Workflow safety

- Never place `<PINNED-SHA>` or another placeholder in an executable workflow.
- Verify Action tag SHAs from upstream before pinning. If verification is
  impossible, preserve the existing reference and report a manual action.
- Do not mutate repository/environment protection settings or secrets without
  explicit authorization. Report required GitHub configuration separately.

## Validate and report

- Run the lockfile-age validator, `npm ci --ignore-scripts`, build, tests,
  `actionlint` when available, and `git diff --check`.
- Run an authenticated end-to-end build when credentials and authorization allow;
  otherwise state exactly which registry behavior remains unverified.
- Report inspected files, changes by SIP control, Node/npm/DHI versions, Action
  SHA verification, cooldown exceptions, PR/fork event behavior, protected
  environment requirements, and required-check configuration.
- Explicitly report whether the gate extracted and scanned the attached SPDX
  document and whether promotion references that same digest.
