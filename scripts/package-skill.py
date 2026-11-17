#!/usr/bin/env python3
"""Validate this repository's scalar frontmatter and build a reproducible skill archive."""
import argparse
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile

FILES = (
    'SKILL.md', 'LICENSE', 'VERSION', 'README.md', 'SECURITY.md',
    'CHANGELOG.md', 'RELEASING.md', 'agents/openai.yaml',
    'references/github-actions.md', 'scripts/validate-lockfile-age.mjs',
    'scripts/validate-lockfile-age.test.mjs',
)


def validate(root):
    for name in FILES:
        path = root / name
        if any(part.is_symlink() for part in [path, *path.parents] if part != root.parent):
            raise ValueError(f'Symlinks are not allowed: {name}')
        if not path.is_file() or not path.stat().st_size:
            raise ValueError(f'Missing or empty release file: {name}')
    text = (root / 'SKILL.md').read_text()
    if not text.startswith('---\n') or '\n---\n' not in text[4:]:
        raise ValueError('SKILL.md must start with YAML frontmatter')
    header, body = text[4:].split('\n---\n', 1)
    fields = {}
    # Deliberately narrow repository convention, not a general YAML parser.
    # Require JSON-quoted strings, which are also valid YAML scalar strings.
    for line in header.splitlines():
        key, separator, value = line.partition(': ')
        if not separator or key in fields:
            raise ValueError('Use unique, single-line JSON-quoted frontmatter fields')
        fields[key] = json.loads(value)
        if not isinstance(fields[key], str):
            raise ValueError(f'{key} must be a string')
    if set(fields) != {'name', 'description', 'license'}:
        raise ValueError('Unexpected or missing frontmatter fields')
    if fields['name'] != 'sip':
        raise ValueError('The packaged directory and skill name must both be sip')
    if not 1 <= len(fields['description']) <= 1024:
        raise ValueError('Description must be 1–1024 characters')
    if fields['license'] != 'Apache-2.0' or 'Apache License' not in (root / 'LICENSE').read_text():
        raise ValueError('Apache-2.0 license metadata and file are required')
    if not body.strip():
        raise ValueError('Skill instructions are missing')
    version = (root / 'VERSION').read_text().strip()
    if not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version):
        raise ValueError('VERSION must be a stable semantic version')
    if f'## {version} ' not in (root / 'CHANGELOG.md').read_text():
        raise ValueError('Version must have a changelog entry')
    return version


def build(root, output):
    version = validate(root)
    payload = {f'sip/{name}': (root / name).read_bytes() for name in FILES}
    inventory = {name: hashlib.sha256(data).hexdigest() for name, data in sorted(payload.items())}
    payload['sip/MANIFEST.json'] = (json.dumps({'version': version, 'sha256': inventory}, indent=2) + '\n').encode()
    output.mkdir(parents=True, exist_ok=True)
    archive = output / f'sip-{version}.tar.gz'
    with archive.open('wb') as stream:
        with gzip.GzipFile(filename='', mode='wb', fileobj=stream, mtime=0) as compressed:
            with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as tar:
                for name, data in sorted(payload.items()):
                    info = tarfile.TarInfo(name)
                    info.size = len(data)
                    info.mode = 0o644
                    info.mtime = 0
                    info.uid = info.gid = 0
                    info.uname = info.gname = ''
                    tar.addfile(info, io.BytesIO(data))
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    (output / 'SHA256SUMS').write_text(f'{digest}  {archive.name}\n')
    return archive


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--output', type=Path, default=Path('dist'))
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    if args.check:
        print(f'Validated SIP {validate(root)}')
    else:
        print(build(root, args.output))
