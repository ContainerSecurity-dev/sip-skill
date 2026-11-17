import importlib.util
import io
import json
from pathlib import Path
import tarfile
import tempfile
import unittest
import zipfile


def load(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module

canonical = load('package-skill')
stores = load('package-stores')
ROOT = Path(__file__).resolve().parent.parent


class StorePackages(unittest.TestCase):
    def test_packages_preserve_skill_and_are_reproducible(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            archive = canonical.build(ROOT, path / 'source')
            first = stores.build(archive, path / 'first')
            second = stores.build(archive, path / 'second')
            self.assertEqual([p.read_bytes() for p in first], [p.read_bytes() for p in second])
            with tarfile.open(first[0]) as npm:
                metadata = json.load(npm.extractfile('package/package.json'))
                self.assertNotIn('scripts', metadata)
                self.assertNotIn('dependencies', metadata)
                self.assertEqual(npm.extractfile('package/skills/sip/SKILL.md').read(), (ROOT / 'SKILL.md').read_bytes())
            with zipfile.ZipFile(first[1]) as plugin:
                self.assertEqual(plugin.read('skills/sip/SKILL.md'), (ROOT / 'SKILL.md').read_bytes())
                for client in ('claude', 'cursor'):
                    self.assertEqual(json.loads(plugin.read(f'.{client}-plugin/plugin.json'))['version'], metadata['version'])

    def test_unsafe_and_corrupted_archives_fail(self):
        with tempfile.TemporaryDirectory() as directory:
            for name in ('sip/../evil', '/tmp/evil', 'sip/SKILL.md'):
                path = Path(directory) / 'bad.tar.gz'
                with tarfile.open(path, 'w:gz') as tar:
                    payload = b'changed bytes'
                    entry = tarfile.TarInfo(name)
                    entry.size = len(payload)
                    tar.addfile(entry, io.BytesIO(payload))
                with self.assertRaises((ValueError, KeyError)):
                    stores.read_skill(path)


if __name__ == '__main__':
    unittest.main()
