# Release and maintenance procedure

## Review and validate

1. Review changes to instructions, executable scripts, and references for prompt
   injection, credential exposure, dependency changes, and unnecessary privileges.
2. Run `node --test scripts/*.test.mjs`,
   `python3 scripts/test-package-skill.py`, and
   `python3 scripts/package-skill.py --check`.
3. Test an audit and an implementation in disposable fixture repositories using
   each client you intend to claim as tested. Record client/version, date, source
   SHA, outcome, and limitations in the README evidence table. Include a fixture
   containing malicious instructions to disable checks or expose credentials.
4. Recheck upstream client discovery rules, Node/npm requirements, DHI tags,
   Docker/Trivy commands, and marketplace terms whenever related dependencies
   change, and before each release. Keep Action references pinned to verified SHAs.
5. Set VERSION and the matching CHANGELOG entry; mark the entry released only
   when actually publishing. Choose a new version for changed artifact bytes.

The checker intentionally accepts this repository's three JSON-quoted YAML scalar
fields, not all legal YAML. The installed directory is `sip`, even though the
source repository is named `sip-skill`.

## Package and verify

```bash
python3 scripts/package-skill.py
(cd dist && sha256sum --check SHA256SUMS)
python3 scripts/package-skill.py --output /tmp/sip-rebuild
cmp dist/sip-$(cat VERSION).tar.gz /tmp/sip-rebuild/sip-$(cat VERSION).tar.gz
```

The script packages only an explicit file allowlist; `.git`, `.env`, CI files,
and build caches cannot enter the archive. It rejects symlinks and normalizes
ordering, modes, owner IDs, timestamps, and gzip metadata. `MANIFEST.json` records
the SHA-256 of each packaged source file. Checksums detect changed bytes; they do
not authenticate the publisher.

## Draft release and provenance

After review, commit the changes and push a matching `v<VERSION>` tag. The release
workflow runs validation and tests, builds once, attests the resulting archive,
and creates a **draft** GitHub release containing the archive and SHA256SUMS.
It does not publish a marketplace listing or an OCI artifact. Inspect the draft,
workflow source, provenance, and compatibility evidence before publishing it.
Never retag an existing release. Failed draft creation should be investigated;
the workflow intentionally does not overwrite existing releases.

Consumers should verify the downloaded archive before extraction:

```bash
sha256sum --check SHA256SUMS
gh attestation verify sip-0.1.0.tar.gz --repo ContainerSecurity-dev/sip-skill
```

Check the attested source commit and workflow against the reviewed release as
well as the repository identity. Extract into a new empty staging directory,
review `sip/`, then copy it into the chosen client's skill directory. Do not
extract over an existing installation. Pin a reviewed commit for Git installs;
record it with `git rev-parse HEAD` and review changes before updating.

GitHub provenance requires repository/plan support and the workflow's scoped
OIDC and attestation permissions. Validate the hosted workflow before claiming
signed releases exist. Local tests cannot exercise GitHub OIDC or publication.

## Distribution record

For each actual marketplace submission, record its URL, submission date, version,
source commit, artifact digest, client-specific adapter, and tested installation
command here. There are currently **no verified marketplace submissions**.
Check each platform's current license, packaging, and review requirements before
submitting. Verify the resulting listing resolves to the intended release.

OCI publication is deferred until a packaging specification and installer are
selected and tested. A generic tarball in an OCI registry is not automatically
compatible with either proposal in the article or with agent clients. Preserve
the canonical skill and add adapters rather than forking the instructions.

## Repository settings (owner actions)

- Require the `validate` check before merging and review changes to workflows.
- Protect release tags against unauthorized creation, deletion, or replacement.
- Enable private vulnerability reporting if supported.
- Review GitHub Actions permissions and provenance availability.

See SECURITY.md for compromised-release handling. No settings are changed by
these repository files.
