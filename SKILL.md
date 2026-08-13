---
name: sip
description: Apply SIP supply-chain security controls ii–iv to a Node.js container repository by freezing unvetted npm dependencies, hardening Docker builds with Docker Hardened Images and multi-stage builds, and generating BuildKit SBOM and provenance attestations. Use only when explicitly invoked to implement SIP hardening in a repository.
---

# SIP

Apply Security Immediate Plan controls ii–iv with minimal, targeted repository changes and no unrelated refactors.

## Step 1 — Inspect

Before modifying anything:

- Identify the Node.js and npm versions.
- Inspect `package.json` and `package-lock.json`.
- Inspect the existing `.npmrc`.
- Find all `Dockerfile` variants.
- Find image build and push workflows.
- Identify the target container registry.
- Identify existing SBOM and provenance configuration.
- Identify existing GitHub Action versions and references.

## Step 2 — Freeze unvetted dependencies (SIP ii)

- Ensure `.npmrc` contains `min-release-age=5`; current npm interprets this value in days.
- Ensure `.npmrc` contains `ignore-scripts=true`.
- Ensure CI uses `npm ci --ignore-scripts`, not `npm install`.
- Keep `package-lock.json` committed and use it in CI.
- Do not automatically add cooldown exclusions. If the cooldown blocks a required security update, report the package and recommend an explicit `min-release-age-exclude` exception.

## Step 3 — Harden container builds (SIP iii)

- Convert each applicable Dockerfile to a multi-stage build if it is not already multi-stage.
- Use Docker Hardened Images:
  - Build stage: `dhi.io/node:<version>-<distro>-dev`
  - Runtime stage: `dhi.io/node:<version>-<distro>`
- Keep the runtime stage minimal and non-root by default.
- Declare `ARG BUILDKIT_SBOM_SCAN_STAGE=true` in every stage that must be included in the SBOM. Dockerfile `ARG` scope is stage-specific.
- Authenticate to DHI in CI with `docker/login-action` and secrets. Never pass registry credentials as Docker build arguments.

## Step 4 — Generate attestations (SIP iv)

- Build with these BuildKit attestation settings:
  - `sbom: true`
  - `provenance: mode=max`
  - `outputs: type=image,push=true,oci-mediatypes=true,oci-artifact=true`
- Tag the candidate image with the commit SHA.
- Capture and use the image digest output as the immutable reference for downstream steps.

## Workflow safety

- When modifying an actual GitHub Actions workflow, use verified full commit SHAs.
- Never insert `<PINNED-SHA>` or another placeholder into an executable workflow.
- If a SHA cannot be verified, preserve the existing reference and report it as a manual action.
- Placeholders are acceptable only in clearly labeled documentation examples.

## Output

- Summarize inspected files and detected configuration.
- List the minimal repository changes made for SIP ii–iv.
- Report unverified action references, cooldown exceptions, or other required manual actions.
- Report the validation commands run and their results.
