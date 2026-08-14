# GitHub Actions design reference

Use this reference when SIP adds or restructures GitHub Actions. Adapt existing
repository conventions; the snippets contain documentation placeholders and are
not executable until every Action reference and image value is resolved.

## Contents

- Job graph
- Event and credential boundaries
- Dependency job
- Container and attestation job
- Vulnerability job
- Promotion job
- Final audit

## Job graph

Use one shared artifact chain:

```text
SIP ii dependencies
  → SIP iii–iv hardened container + attestations
  → SIP v attached-SBOM gate
  → promotion (non-PR only)
```

Do not create a release job that repeats installation, building, attestation, or
scanning. Keep SIP iii and iv together because BuildKit creates the image and its
attestations in the same operation.

## Event and credential boundaries

- Run SIP ii for every PR targeting the protected branch.
- A `pull_request` from a fork must not receive repository secrets or a
  package-write token. Skip credential-bearing jobs and require a trusted main or
  merge-queue run before promotion.
- Put same-repository PR publication behind a protected GitHub environment with
  required reviewers. Repository files can name the environment, but configuring
  reviewers and secrets is a separate authorized GitHub operation.
- Never use `pull_request_target` to execute untrusted checked-out scripts or
  Dockerfiles with secrets unless a reviewed, explicit trust design makes that
  safe.
- On manual runs, accept only approved branches and release-tag patterns.
- Use ref-scoped concurrency with cancellation to prevent older runs promoting
  after newer ones.

Prefer least privilege at job scope:

| Job | Permissions |
| --- | --- |
| Dependencies | `contents: read` |
| Container + attestations | `contents: read`, `packages: write` |
| Vulnerability report | `contents: read`, `packages: read`, and `pull-requests: write` only when commenting |
| Promotion | `contents: read`, `packages: write` |

## Dependency job

1. Calculate one candidate SHA (`github.event.pull_request.head.sha` for PRs,
   otherwise `github.sha`) and check out that exact SHA in every source-consuming
   job.
2. Normalize the GHCR image name to lowercase and expose it as a job output.
3. Set up a verified Node version whose bundled npm supports
   `min-release-age`.
4. Run the bundled lockfile-age validator before installation.
5. Run `npm ci --ignore-scripts`, build, and tests.

Do not download a newer npm with `npm install --global` or `npm exec`. That
bootstrap is outside the application's lockfile and contradicts the locked
installation policy.

## Container and attestation job

- Depend on the SIP ii job.
- Check out the source commit that will identify the candidate. On PRs, use the
  head SHA rather than the synthetic merge-ref SHA when naming the candidate.
- Authenticate separately to DHI and the target registry with pinned login
  Actions.
- Build once with:

```yaml
sbom: true
provenance: mode=max
outputs: type=image,name=${{ env.IMAGE }}:sha-${{ env.CANDIDATE_SHA }},push=true,oci-mediatypes=true,oci-artifact=true
```

- Assert that the build digest is non-empty and expose both image name and digest
  as job outputs.

## Vulnerability job

- Depend on the container/attestation job and use only its immutable outputs.
- Authenticate to the target registry with read-only credentials before
  inspecting a private image. `packages: read` grants token permission but does
  not configure Docker authentication.
- Extract the SPDX predicate explicitly:

```bash
docker buildx imagetools inspect "${IMAGE}@${DIGEST}" \
  --format '{{ json .SBOM.SPDX }}' > sbom.spdx.json
```

- Fail unless `spdxVersion` exists and `packages` is a non-empty array.
- Scan the file with pinned Trivy. To comment before failing, first emit JSON with
  `--exit-code 0`, count fixable Critical findings, update the report, then fail
  in a final enforcement step when the count is nonzero.
- Use a stable HTML marker such as `<!-- sip-trivy-report -->` to find and update
  one existing PR comment. Paginate and fully consume comment lookup. Do not
  combine `gh api --slurp` with its built-in `--jq`; pipe to external `jq`:

```bash
comment_id=$(
  gh api "repos/${GITHUB_REPOSITORY}/issues/${PR_NUMBER}/comments" \
    --paginate --slurp |
    jq -r --arg marker '<!-- sip-trivy-report -->' \
      '[.[][] | select(.body | contains($marker))][0].id // empty'
)
```
- Limit table output while preserving full results in the job log, summary, or a
  retained artifact.

The comment is visibility, not the security boundary. The required job status is
the gate.

## Promotion job

- Run only for trusted non-PR events after SIP v succeeds.
- Select only approved tags (`latest` for the protected main branch or the
  validated release tag).
- Authenticate to the target registry and promote with:

```bash
docker buildx imagetools create \
  --tag "${IMAGE}:${PROMOTION_TAG}" \
  "${IMAGE}@${DIGEST}"
```

Never rebuild in this job.

## Final audit

Before completion, confirm:

- Every third-party Action uses a verified full commit SHA.
- The lockfile is committed and all installs use `npm ci --ignore-scripts`.
- No package-manager bootstrap bypasses the lockfile policy.
- DHI tags exist, match across stages, and bundle a compatible npm.
- Every included Dockerfile stage declares `BUILDKIT_SBOM_SCAN_STAGE=true`.
- Candidate naming uses the source SHA; downstream jobs use the digest.
- Attached SPDX extraction fails closed and Trivy scans that file.
- Fork PRs cannot access secrets and cannot cause promotion.
- Required checks and protected environments are reported as repository settings
  when they cannot be safely configured in code.
- Every source-consuming job checks out the same candidate SHA.
- Private-registry authentication precedes attached-SBOM retrieval.
- The promoted source is the exact scanned digest.
