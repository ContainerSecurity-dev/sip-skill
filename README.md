# SIP Skill: Security Immediate Plan

This repository provides an agentic skill for the complete SIP framework:

1. Isolate local AI agents.
2. Freeze unvetted dependencies.
3. Harden container builds.
4. Generate SBOM and provenance attestations.
5. Scan the attested SBOM and gate releases.

SIP follows the software supply chain in order:

**AI agent → dependencies → container build → attestations → vulnerability gate**

Each control reduces the risk passed to the next. The final scan consumes the SBOM generated during the build, and promotion reuses the exact digest that passed the gate.

## Skill Intent

Invoke `$sip` explicitly when applying the framework to a Node.js container supply chain. Implicit invocation is disabled because SIP can modify agent isolation, dependencies, Dockerfiles, and CI/CD workflows.
The agent should produce actionable file edits and workflow updates, keeping changes minimal and deterministic.

## Operating Rules for the Agent

### SIP i — Isolate Local AI Agents

- Run local coding agents in Docker Sandboxes (`sbx`) when available.
- Start with `sbx policy init deny-all`, then allow only required destinations.
- Keep tokens in `sbx` secret storage rather than exposing their raw values to the agent.
- Codex OAuth can remain host-side with `sbx secret set openai --oauth`.

Example:

```bash
sbx policy init deny-all
sbx policy allow network "api.openai.com,github.com,*.npmjs.org"
sbx secret set openai --oauth
sbx secret set github
sbx run codex .
```

### SIP ii — Freeze Unvetted Dependencies

- Enforce a 5-day dependency cooldown in `.npmrc`:
  - `min-release-age=5`
- Current npm interprets `min-release-age` in days.
- Disable lifecycle scripts in `.npmrc`:
  - `ignore-scripts=true`
- Use locked installs in CI:
  - `npm ci --ignore-scripts`
- Preserve and rely on `package-lock.json` for deterministic installs.
- Do not add cooldown exclusions automatically. If a required security update is blocked, report the package and recommend an explicit `min-release-age-exclude` exception.

### SIP iii — Harden Container Builds

- Convert Dockerfiles to multi-stage builds with separate build/runtime stages.
- Prefer Docker Hardened Images (DHI), e.g.:
  - Build stage: `dhi.io/node:<version>-<distro>-dev`
  - Runtime stage: `dhi.io/node:<version>-<distro>`
- Keep runtime image minimal and non-root by default.
- Authenticate to DHI in CI via `docker/login-action` using secrets (never Docker build args for credentials).
- Include this declaration in every stage that must be scanned because Dockerfile `ARG` scope is stage-specific:
  - `ARG BUILDKIT_SBOM_SCAN_STAGE=true`

### SIP iv — Generate SBOM + Provenance Attestations

- Use BuildKit attestations during image build:
  - `sbom: true`
  - `provenance: mode=max`
  - `outputs: type=image,push=true,oci-mediatypes=true,oci-artifact=true`
- Push candidate image tagged by commit SHA.
- Use build output digest (`steps.<id>.outputs.digest`) as the immutable artifact reference for downstream steps.

### SIP v — Scan the Attested SBOM

- Install an explicitly pinned Trivy version.
- Scan the exact build digest with `--sbom-sources oci` so Trivy consumes the attached SBOM.
- Fail on fixable Critical CVEs with `--severity CRITICAL --ignore-unfixed --exit-code 1`.
- Promote only after the gate succeeds, and promote the scanned digest rather than rebuilding.

## Baseline GitHub Actions Pattern

The placeholders below are documentation only. When modifying an executable workflow, use verified full commit SHAs. Never write `<PINNED-SHA>` or another placeholder into a real workflow; if a SHA cannot be verified, preserve the existing reference and report it as a manual action.

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

      # SIP v
      - name: Install Trivy
        uses: aquasecurity/setup-trivy@<PINNED-SHA>
        with:
          version: <PINNED-TRIVY-VERSION>

      - name: Gate Critical CVEs using the attested SBOM
        run: |
          trivy image \
            --sbom-sources oci \
            --scanners vuln \
            --severity CRITICAL \
            --ignore-unfixed \
            --exit-code 1 \
            ghcr.io/${{ github.repository }}@${{ steps.build.outputs.digest }}

      - name: Promote the scanned image
        run: |
          docker buildx imagetools create \
            --tag ghcr.io/${{ github.repository }}:latest \
            ghcr.io/${{ github.repository }}@${{ steps.build.outputs.digest }}
```
