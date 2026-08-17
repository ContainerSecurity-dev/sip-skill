# SIP Agent Skill: Security Immediate Plan

An explicitly invoked Agent Skill for applying or auditing the complete SIP
supply-chain framework in containerized software repositories:

**AI agent → dependencies → container build → attestations → vulnerability gate**

SIP makes targeted repository changes, validates what it can execute, and
reports host or GitHub settings that require manual authorization.

## Agent Skills compatibility

SIP is a single canonical Agent Skill in this repository (`SKILL.md` plus
bundled scripts/references). Do not duplicate it into per-client variants.

| Client | Agent Skills format | Install method/path | Invocation |
| --- | --- | --- | --- |
| OpenAI Codex | Yes | `$skill-installer` from `https://github.com/ContainerSecurity-dev/sip-skill`, or clone to `~/.agents/skills/sip` | Explicit: `$sip ...` |
| Claude Code | Yes | Project: `.claude/skills/sip`; Personal: `~/.claude/skills/sip`; optional plugin marketplace path is client-specific | Explicit: `/sip` or “use sip” |
| OpenCode | Yes | `.opencode/skills/sip` (native) or compatible paths: `.claude/skills/sip`, `.agents/skills/sip`, and global equivalents | Loaded via OpenCode skill tool when explicitly requested |
| Google Antigravity | Yes | Project: `.agents/skills/sip`; Global: `~/.gemini/config/skills/sip` | Explicitly request SIP by name |
| GitHub Copilot | Yes (Copilot cloud agent, code review, CLI/app, VS Code agent mode) | Project: `.github/skills/sip` or `.agents/skills/sip`; Personal: `~/.copilot/skills/sip` or `~/.agents/skills/sip` | Explicitly request SIP by name in chat/agent task |

## Install SIP

### Shared install path (where supported)

Codex, OpenCode, and GitHub Copilot discover personal skills from
`~/.agents/skills`. Other clients use the paths in the compatibility table.

```bash
mkdir -p ~/.agents/skills
git clone https://github.com/ContainerSecurity-dev/sip-skill.git ~/.agents/skills/sip
```

Update a manual installation with:

```bash
git -C ~/.agents/skills/sip pull --ff-only
```

### OpenAI Codex installer path (keep using when available)

Ask Codex to use the built-in installer:

```text
$skill-installer Install the SIP skill from https://github.com/ContainerSecurity-dev/sip-skill
```

Both installation methods trust the repository revision they retrieve. For a
reviewable, reproducible installation, record the reviewed commit SHA and check
out that exact revision after cloning. Review new commits before running
`git pull`; an update can change the executable validator and skill guidance.

## Use

SIP is intended for explicit use. Install SIP, open the target containerized
software repository, then invoke SIP from that repository:

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

SIP audits or applies controls ii–v and reports SIP i as a developer/host
control requiring manual host-side policy.

Client behavior varies: several clients advertise discovered skill metadata and
may select a relevant skill automatically. SIP's description restricts its use
to explicit SIP requests. Where a client supports an enforcement field, such as
Claude Code's `disable-model-invocation: true`, configure that field in a
client-specific installation when strict user-only invocation is required.

SIP is ecosystem-independent. Its bundled dependency validator and concrete
examples currently target npm; for other package managers, the skill applies
equivalent cooldown, locked-install, script-suppression, and fail-closed
verification invariants using ecosystem-native controls.

## Client-specific notes

- **Agent Skills standard compatibility:** `SKILL.md` frontmatter + Markdown
  instructions + colocated resources/scripts.
- **Client discovery/install differences:** skill directories, global vs
  project scope, and invocation UX vary by client.
- **Marketplace/plugin mechanisms:** optional distribution layers in some
  clients; they do not require creating a second copy of SIP.

## Distribution (optional)

Canonical distribution is this GitHub repository:

- `https://github.com/ContainerSecurity-dev/sip-skill`

Where officially supported, SIP can additionally be distributed through
client-specific catalogs/marketplaces/plugins in the future, but the canonical
skill should remain a single source here.

- **GitHub CLI:** [`gh skill`](https://docs.github.com/en/copilot/how-tos/copilot-on-github/customize-copilot/customize-cloud-agent/add-skills#managing-skills-with-github-cli)
  can search, preview, install, update, and publish
  Agent Skills. It is currently in public preview and requires GitHub CLI 2.90.0
  or newer. Preview a third-party skill before installing it.
- **Agent Skills ecosystem:** `npx skills` provides package-manager-style
  installation for multiple agent clients. [Google documents it for Antigravity](https://codelabs.developers.google.com/getting-started-with-antigravity-skills#6),
  while noting that clients differ in whether they discover its default
  `~/.agents/skills` destination directly.

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

The bundled validator requires a modern non-empty lockfile, compares locked
tarball URLs and integrity strings with npm registry metadata, rejects invalid
timestamps, and uses timed, bounded-retry registry requests. It does not download
and independently hash tarball contents. Exact package names
listed with `min-release-age-exclude` are honored and reported as explicit
exceptions.

The chosen Node release must bundle npm 11.10.0 or newer for `min-release-age`,
and npm 11.17.0 or newer when `min-release-age-exclude` is configured. The skill
does not bootstrap npm using an unlocked global or `npm exec` installation.

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
