# SIP Skill: Security Immediate Plan (ii–iv)

This repository provides an AI agentic skill focused on SIP controls **ii–iv**:

1. Freeze unvetted dependencies  
2. Harden container builds  
3. Generate SBOM and provenance attestations

## Skill Intent

Use this skill when asked to secure a Node.js container supply chain in CI/CD.  
The agent should produce actionable file edits and workflow updates, keeping changes minimal and deterministic.

## Operating Rules for the Agent

### SIP ii — Freeze Unvetted Dependencies

- Enforce a 5-day dependency cooldown in `.npmrc`:
  - `min-release-age=5`
- Disable lifecycle scripts in `.npmrc`:
  - `ignore-scripts=true`
- Use locked installs in CI:
  - `npm ci --ignore-scripts`
- Preserve and rely on `package-lock.json` for deterministic installs.

### SIP iii — Harden Container Builds

- Convert Dockerfiles to multi-stage builds with separate build/runtime stages.
- Prefer Docker Hardened Images (DHI), e.g.:
  - Build stage: `dhi.io/node:<version>-<distro>-dev`
  - Runtime stage: `dhi.io/node:<version>-<distro>`
- Keep runtime image minimal and non-root by default.
- Authenticate to DHI in CI via `docker/login-action` using secrets (never Docker build args for credentials).
- Include:
  - `ARG BUILDKIT_SBOM_SCAN_STAGE=true`
  to ensure SBOM stage coverage in build metadata.

### SIP iv — Generate SBOM + Provenance Attestations

- Use BuildKit attestations during image build:
  - `sbom: true`
  - `provenance: mode=max`
  - `outputs: type=image,push=true,oci-mediatypes=true,oci-artifact=true`
- Push candidate image tagged by commit SHA.
- Use build output digest (`steps.<id>.outputs.digest`) as the immutable artifact reference for downstream steps.

## Baseline GitHub Actions Pattern (ii–iv)

```yaml
name: SIP Supply Chain (ii-iv)

on:
  push:
    branches: [main]

permissions:
  contents: read
  packages: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@<PINNED-SHA>

      # SIP ii
      - name: Set up Node
        uses: actions/setup-node@<PINNED-SHA>
        with:
          node-version: 26

      - name: Install locked dependencies
        run: npm ci --ignore-scripts

      - name: Test
        run: npm test

      # SIP iii
      - name: Login to DHI
        uses: docker/login-action@<PINNED-SHA>
        with:
          registry: dhi.io
          username: ${{ vars.DOCKER_USERNAME }}
          password: ${{ secrets.DHI_TOKEN }}

      - name: Login to GHCR
        uses: docker/login-action@<PINNED-SHA>
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}

      - name: Set up Buildx
        uses: docker/setup-buildx-action@<PINNED-SHA>

      # SIP iv
      - name: Build and attest candidate
        id: build
        uses: docker/build-push-action@<PINNED-SHA>
        with:
          context: .
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
          sbom: true
          provenance: mode=max
          outputs: type=image,push=true,oci-mediatypes=true,oci-artifact=true
```