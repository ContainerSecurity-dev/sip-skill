#!/usr/bin/env python3
"""Build registry and plugin packages from the already validated canonical archive."""
import gzip
import hashlib
import io
import json
from pathlib import Path
import re
import tarfile
import zipfile


def read_skill(archive):
    with tarfile.open(archive, 'r:gz') as tar:
        files = {}
        for entry in tar:
            parts = entry.name.split('/')
            if not entry.isfile() or parts[0] != 'sip' or any(p in ('', '.', '..') for p in parts):
                raise ValueError('Unsafe archive entry')
            if entry.name in files or entry.size > 10_000_000:
                raise ValueError('Duplicate or oversized archive entry')
            files[entry.name] = tar.extractfile(entry).read()
    manifest = json.loads(files.pop('sip/MANIFEST.json'))
    hashes = {name: hashlib.sha256(data).hexdigest() for name, data in files.items()}
    if hashes != manifest['sha256']:
        raise ValueError('Skill inventory mismatch')
    version = files['sip/VERSION'].decode().strip()
    if version != manifest['version'] or not re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)', version):
        raise ValueError('Invalid release version')
    if 'Apache License' not in files['sip/LICENSE'].decode():
        raise ValueError('License missing')
    return version, files


def build(archive, output):
    version, files = read_skill(archive)
    description = 'Apply or audit SIP supply-chain security controls for containerized repositories.'
    metadata = {'name': '@containersecurity-dev/sip-skill', 'version': version,
                'description': description, 'license': 'Apache-2.0',
                'repository': {'type': 'git', 'url': 'git+https://github.com/ContainerSecurity-dev/sip-skill.git'},
                'keywords': ['agent-skills', 'security', 'docker', 'sip']}
    # No install scripts, dependencies, or executable entrypoints.
    npm = {f'package/skills/{name}': data for name, data in files.items()}
    npm['package/package.json'] = (json.dumps(metadata, indent=2) + '\n').encode()
    for name in ('README.md', 'LICENSE'):
        npm[f'package/{name}'] = files[f'sip/{name}']
    output.mkdir(parents=True, exist_ok=True)
    npm_path = output / f'sip-npm-{version}.tgz'
    with npm_path.open('wb') as stream, gzip.GzipFile(filename='', mode='wb', fileobj=stream, mtime=0) as compressed:
        with tarfile.open(fileobj=compressed, mode='w', format=tarfile.USTAR_FORMAT) as tar:
            for name, data in sorted(npm.items()):
                entry = tarfile.TarInfo(name)
                entry.size, entry.mode, entry.mtime = len(data), 0o644, 0
                tar.addfile(entry, io.BytesIO(data))
    plugin = {f'skills/{name}': data for name, data in files.items()}
    plugin_metadata = {'name': 'sip', 'version': version, 'description': description,
                       'license': 'Apache-2.0', 'repository': 'https://github.com/ContainerSecurity-dev/sip-skill'}
    for client in ('claude', 'cursor'):
        plugin[f'.{client}-plugin/plugin.json'] = (json.dumps(plugin_metadata, indent=2) + '\n').encode()
    plugin['LICENSE'] = files['sip/LICENSE']
    plugin_path = output / f'sip-plugin-{version}.zip'
    with zipfile.ZipFile(plugin_path, 'w', compression=zipfile.ZIP_STORED) as bundle:
        for name, data in sorted(plugin.items()):
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.external_attr = 0o100644 << 16
            bundle.writestr(entry, data)
    return [npm_path, plugin_path]


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('archive', type=Path)
    args = parser.parse_args()
    outputs = build(args.archive, args.archive.parent)
    artifacts = [args.archive, *outputs]
    (args.archive.parent / 'SHA256SUMS').write_text(''.join(
        f'{hashlib.sha256(path.read_bytes()).hexdigest()}  {path.name}\n' for path in artifacts))
    print('\n'.join(str(path) for path in artifacts))
