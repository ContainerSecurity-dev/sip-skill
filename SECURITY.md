# Security policy

## Reporting

Report ordinary bugs through GitHub Issues. Do not put credentials, exploit
payloads against live systems, or private repository content in public issues.
For vulnerabilities, use the repository's **Security → Report a vulnerability**
option if available. Maintainers must enable private vulnerability reporting
before advertising it as an available channel. If it is unavailable, open an
issue asking for a private contact without disclosing vulnerability details.
No response-time guarantee is currently offered.

## Permissions and network access

Installing the files grants no safety guarantee. Review the exact revision and
scripts before invoking SIP. The skill can propose changes to Dockerfiles,
dependency policy, workflows, and local agent configuration. Audits are read-only;
implementation, registry publication, secret changes, and destructive operations
must respect the user's authorized scope.

| Operation | Tools and access |
| --- | --- |
| Offline checks and packaging | Node.js 22+, Python 3.10+, local read access; packaging writes only its output directory |
| npm lockfile validator | Node.js 22+, reads package-lock.json and optional .npmrc in the working directory; HTTPS to registry.npmjs.org; no credentials required |
| Container implementation | Git, Docker/Buildx, jq, explicitly pinned Trivy, package registries and vulnerability databases |
| Registry operations | Scoped credentials for DHI and the chosen registry; publishing requires explicit authorization |
| Host isolation | Docker Sandboxes on a supported host; existing policies must not be weakened |

Do not grant production credentials just to inspect a repository. Scope network
access to the task. The npm validator supports npm registry tarballs; private
registries, Git dependencies, and local non-workspace packages need a reviewed
validator adaptation, not silently skipped checks. Registry metadata consistency
is not independent tarball hashing or proof that a package is trustworthy.

## Release incidents

Only the latest reviewed release is intended to receive fixes; no historical
support window is promised. On a compromised release, stop recommending it,
identify affected versions and source commits in a security advisory, notify
listed distribution channels, and publish a new version. Never replace an old
tag or silently overwrite an artifact. Mark affected releases deprecated and
update installation guidance. Existing clones cannot be remotely revoked:
consumers must remove or replace the affected revision and assess prior execution.
