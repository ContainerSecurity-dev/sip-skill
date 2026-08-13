# Skill: SIP Supply Chain Hardening (ii–iv)

## Purpose

Apply Security Immediate Plan controls **ii to iv** to a Node.js containerized project:

- **ii. Freeze unvetted dependencies**
- **iii. Harden container builds**
- **iv. Generate SBOM and provenance attestations**

## Inputs

- Repository contents (especially `.npmrc`, `package-lock.json`, `Dockerfile*`, and GitHub Actions workflows)
- Existing CI/CD constraints

## Required Actions

1. **Dependencies (SIP ii)**
   - Ensure `.npmrc` contains:
     - `min-release-age=5`
     - `ignore-scripts=true`
   - Ensure CI uses `npm ci --ignore-scripts` (not `npm install`).
   - Keep `package-lock.json` committed and used in CI.

2. **Container build (SIP iii)**
   - Convert to multi-stage Docker build if not already.
   - Use Docker Hardened Images:
     - build: `dhi.io/node:<version>-<distro>-dev`
     - runtime: `dhi.io/node:<version>-<distro>`
   - Keep runtime stage minimal and non-root by default.
   - Add `ARG BUILDKIT_SBOM_SCAN_STAGE=true` for stage-aware SBOM generation.
   - Authenticate to DHI in CI with `docker/login-action` and secrets.

3. **Attestations (SIP iv)**
   - Build with BuildKit attestation settings:
     - `sbom: true`
     - `provenance: mode=max`
     - `outputs: type=image,push=true,oci-mediatypes=true,oci-artifact=true`
   - Tag candidate image with commit SHA.
   - Capture and use the image digest output for downstream steps.

## Output Expectations

- Minimal, targeted repository updates implementing SIP ii–iv.
- Updated workflow snippets with pinned-action placeholders where necessary.
- No unrelated refactors.
