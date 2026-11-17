import os
from pathlib import Path
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('publish-oci.sh').resolve()


class OciPublish(unittest.TestCase):
    def test_existing_collision_absence_and_authentication(self):
        for scenario in ('same', 'different', 'absent', 'unauthorized'):
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as directory:
                root = Path(directory)
                (root / 'dist').mkdir()
                (root / 'bin').mkdir()
                for name in ('sip-0.1.1.tar.gz', 'sip-npm-0.1.1.tgz', 'sip-plugin-0.1.1.zip', 'SHA256SUMS'):
                    (root / 'dist' / name).write_text('fixture')
                mock = root / 'bin/oras'
                mock.write_text('''#!/usr/bin/env bash
case "$1" in
  manifest)
    case "$SCENARIO" in
      absent) echo 'manifest unknown' >&2; exit 1;;
      unauthorized) echo 'unauthorized' >&2; exit 1;;
      *) echo '{}';;
    esac;;
  pull)
    cp sip-0.1.1.tar.gz sip-npm-0.1.1.tgz sip-plugin-0.1.1.zip SHA256SUMS existing/
    if [[ "$SCENARIO" = different ]]; then echo changed > existing/SHA256SUMS; fi;;
  push) touch "$MARKER";;
  resolve) echo 'sha256:fixture';;
esac
''')
                mock.chmod(0o755)
                marker = root / 'pushed'
                env = {**os.environ, 'PATH': f'{root / "bin"}:{os.environ["PATH"]}',
                       'SCENARIO': scenario, 'MARKER': str(marker),
                       'GITHUB_REPOSITORY': 'ContainerSecurity-dev/sip-skill',
                       'GITHUB_STEP_SUMMARY': str(root / 'summary')}
                result = subprocess.run(['bash', str(SCRIPT), 'ghcr.io/containersecurity-dev/sip-skill', 'v0.1.1'], cwd=root, env=env, capture_output=True)
                self.assertEqual(result.returncode == 0, scenario in ('same', 'absent'), result.stderr)
                self.assertEqual(marker.exists(), scenario == 'absent')


if __name__ == '__main__':
    unittest.main()
