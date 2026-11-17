# Release distribution

Store publication starts when a **stable GitHub release is published**, not when
its draft is created. `distribute.yml` downloads the exact release assets, checks
GitHub provenance against the release workflow and tag, and checks SHA256SUMS.
Jobs run independently so one store outage does not prevent the others.

## Automated channels

| Destination | Default | One-time setup |
| --- | --- | --- |
| GitHub Releases | Enabled | Push a new version tag, review the generated draft, then publish it |
| GHCR | Enabled on release publication | Permit Actions package writes; review package visibility after first publication |
| GitHub Packages (npm) | Enabled on release publication | Permit package creation in ContainerSecurity-dev; review package access/visibility |
| npmjs.org | Opt-in | Own the `@containersecurity-dev` scope; set `NPM_TOKEN` secret with publish access and `NPM_PUBLISH=true` repository variable |
| Docker Hub (OCI) | Opt-in | Create the target repository; set `DOCKERHUB_USERNAME` and `DOCKERHUB_REPOSITORY` (`namespace/repository`) variables, `DOCKERHUB_TOKEN` secret, and `DOCKERHUB_PUBLISH=true` |

Enable optional channels only after confirming namespace ownership, credentials,
and account terms. Never put token values in committed configuration. Enabled
channels fail visibly on missing credentials; disabled channels appear skipped
in the workflow summary. Registry policy can still block an enabled channel.

The npm package is `@containersecurity-dev/sip-skill`. It contains
`skills/sip/`, README and LICENSE, without dependencies, install scripts, or a
CLI. Installing the npm package does not automatically install a skill into an
agent; copy its `skills/sip/` directory into the intended client's skill path.
GitHub's npm registry requires authentication even for public packages.

OCI destinations contain the same canonical tarball, npm tarball, plugin ZIP,
and checksums under versioned tags such as `v0.1.1`. The artifact type is explicitly
project-specific: `application/vnd.containersecurity.sip.bundle.v1`. This is an
ORAS-downloadable bundle, not a claim of interoperability with either emerging
Agent Skills OCI proposal. It is not a runnable Docker image. To retrieve it:

```bash
oras pull ghcr.io/containersecurity-dev/sip-skill:v0.1.1
sha256sum --check SHA256SUMS
```

For immutable retrieval, use the digest printed in the publication job summary.
Verify the downloaded archive's GitHub attestation before installing it. Existing
OCI tags are compared file-for-file; npm versions are compared by SHA-512
integrity. A collision fails instead of overwriting an existing release. No
mutable `latest` tag is updated (npm uses `release-<version>`), so older retries cannot roll back newer releases.

## Skill directories and reviewed marketplaces

| Channel | Release support | Remaining action |
| --- | --- | --- |
| GitHub skill ecosystem | Canonical GitHub repository and versioned release | Add `agent-skills` repository topic; validate client discovery before claiming tested support |
| skills.sh | GitHub source remains installable through its CLI | Directory ranking/discovery uses real installs; CI does not manufacture install telemetry |
| SkillsMP | Public SKILL.md remains indexable | Indexing is controlled by SkillsMP; its documented API is for search, not publishing |
| Claude plugins | `sip-plugin-<version>.zip` includes `.claude-plugin/plugin.json` and `skills/sip/` | Test locally, then submit through the official directory portal for review |
| Cursor plugins | Same ZIP includes `.cursor-plugin/plugin.json` | Test locally, then submit repository/plugin via the marketplace review process; ZIP generation does not submit it |
| LobeHub | Canonical GitHub source and skill archive available | Import/claim the skill and authenticate with its user CLI; see below |
| ClawHub | Excluded | Its current MIT-0 publication terms conflict with the owner's Apache-2.0 decision |

No official directory approval, listing, or client execution test is implied by
building a ZIP. GitHub/skills.sh installation is repository-based; the plugin
ZIP is a separate adapter, generated from exactly the same skill files. Official
plugin stores may require a dedicated Git repository layout before accepting a
submission. Do not upload ZIPs or source to undocumented endpoints.

The inspected LobeHub CLI `@lobehub/market-cli@0.0.46` publishes with
`lhm skill publish --identifier <owned-id> --dir <skill-directory>`. It requires
an owned/claimed skill and a user OAuth login stored in its local credential
file; its machine client credentials do not authorize this command. It also
assigns the published version server-side, without a release-version flag.
This pipeline does not export a rotating personal OAuth session into CI or
pretend its service credentials can publish. Revisit automation when a supported
CI authentication/versioning interface is available.

## Trigger and retry

For a new release, update VERSION, CHANGELOG.md and README, commit, then push a
matching tag. To manually prepare its draft (the tag must include this workflow):

```bash
gh workflow run release.yml --ref v0.1.1 --repo ContainerSecurity-dev/sip-skill
```

Publishing the draft triggers distribution. To retry all channels against an
already published stable release, including channels configured later:

```bash
gh workflow run distribute.yml --ref main -f tag=v0.1.1 --repo ContainerSecurity-dev/sip-skill
```

Alternatively use **Re-run failed jobs**. Inspect the summary and each enabled
store's listing before announcing availability. A skipped channel is not a
successful publication. If a verified version already exists, reruns compare its
bytes and report success; different bytes require investigation and a new version.
The old v0.1.0 tag lacks these adapters and cannot use this pipeline unchanged.

## Sources reviewed

- [GitHub skill publishing](https://cli.github.com/manual/gh_skill_publish)
- [GitHub npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry)
- [ORAS push](https://oras.land/docs/commands/oras_push/)
- [npm publish](https://docs.npmjs.com/cli/v11/commands/npm-publish/)
- [skills.sh discovery](https://skills.sh/docs)
- [SkillsMP API](https://skillsmp.com/developers)
- [Claude directory](https://github.com/anthropics/claude-plugins-official)
- [Cursor submission](https://cursor.com/docs/plugins)
- [LobeHub CLI package](https://www.npmjs.com/package/@lobehub/market-cli/v/0.0.46)
- [ClawHub publishing terms](https://github.com/openclaw/clawhub/blob/main/docs/cli.md)
