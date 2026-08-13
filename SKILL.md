---
name: sip
description: "Apply the complete SIP supply-chain security framework to a Node.js container repository: isolate local AI agents, freeze unvetted npm dependencies, harden Docker builds, generate BuildKit SBOM and provenance attestations, and gate releases by scanning the attested SBOM with Trivy. Use only when explicitly invoked to implement SIP hardening in a repository."
---

# SIP

Apply the Security Immediate Plan as one ordered chain:

**AI agent → dependencies → container build → attestations → vulnerability gate**

Make minimal, targeted repository changes and no unrelated refactors.

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
- Identify local AI-agent configuration and whether Docker Sandboxes (`sbx`) is available.
- Identify existing vulnerability scans, release tags, and promotion steps.

## Step 2 — Isolate local AI agents (SIP i)

- Run local AI coding agents inside a sandboxed microVM using Docker Sandboxes when available.
- Initialize a deny-by-default policy with `sbx policy init deny-all`.
- Allow only the network destinations required for the task.
- Store credentials with `sbx secret set`; do not expose raw tokens inside the sandbox.
- For Codex OAuth, prefer host-side credential handling with `sbx secret set openai --oauth`.
- Do not weaken an existing sandbox or secret policy. If `sbx` is unavailable, report isolation as a manual action instead of silently substituting a weaker control.

## Step 3 — Freeze unvetted dependencies (SIP ii)

- Ensure `.npmrc` contains `min-release-age=5`; current npm interprets this value in days.
- Ensure `.npmrc` contains `ignore-scripts=true`.
- Ensure CI uses `npm ci --ignore-scripts`, not `npm install`.
- Keep `package-lock.json` committed and use it in CI.
- Do not automatically add cooldown exclusions. If the cooldown blocks a required security update, report the package and recommend an explicit `min-release-age-exclude` exception.

## Step 4 — Harden container builds (SIP iii)

- Convert each applicable Dockerfile to a multi-stage build if it is not already multi-stage.
- Use Docker Hardened Images:
  - Build stage: `dhi.io/node:<version>-<distro>-dev`
  - Runtime stage: `dhi.io/node:<version>-<distro>`
- Keep the runtime stage minimal and non-root by default.
- Declare `ARG BUILDKIT_SBOM_SCAN_STAGE=true` in every stage that must be included in the SBOM. Dockerfile `ARG` scope is stage-specific.
- Authenticate to DHI in CI with `docker/login-action` and secrets. Never pass registry credentials as Docker build arguments.

## Step 5 — Generate attestations (SIP iv)

- Build with these BuildKit attestation settings:
  - `sbom: true`
  - `provenance: mode=max`
  - `outputs: type=image,push=true,oci-mediatypes=true,oci-artifact=true`
- Tag the candidate image with the commit SHA.
- Capture and use the image digest output as the immutable reference for downstream steps.

## Step 6 — Gate releases with the attested SBOM (SIP v)

- Install a verified, explicitly pinned Trivy version.
- Scan the exact image digest returned by the build, not a mutable tag.
- Use `trivy image --sbom-sources oci --scanners vuln --severity CRITICAL --ignore-unfixed --exit-code 1 <registry>/<image>@<digest>`.
- Treat a fixable Critical vulnerability as a failed CI gate.
- Make the scan a required gate before release promotion.
- After the gate succeeds, promote the already-scanned digest with `docker buildx imagetools create`; never rebuild between scanning and promotion.
- Verify that Trivy discovers the attached OCI SBOM. If the registry or tooling cannot supply it, fail safely and report the missing attestation path instead of silently rescanning image layers.

## Workflow safety

- When modifying an actual GitHub Actions workflow, use verified full commit SHAs.
- Never insert `<PINNED-SHA>` or another placeholder into an executable workflow.
- If a SHA cannot be verified, preserve the existing reference and report it as a manual action.
- Placeholders are acceptable only in clearly labeled documentation examples.

## Output

- Summarize inspected files and detected configuration.
- List the minimal repository changes made for SIP i–v.
- Report unverified action references, cooldown exceptions, or other required manual actions.
- Report whether the vulnerability gate consumed the attached SBOM and whether promotion references the scanned digest.
- Report the validation commands run and their results.
