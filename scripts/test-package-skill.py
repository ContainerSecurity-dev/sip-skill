import hashlib
import importlib.util
import json
from pathlib import Path
import shutil
import tarfile
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('packaging', Path(__file__).with_name('package-skill.py'))
packaging = importlib.util.module_from_spec(spec)
spec.loader.exec_module(packaging)
ROOT = Path(__file__).resolve().parent.parent


class PackageTests(unittest.TestCase):
    def test_reproducible_allowlisted_archive_and_inventory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'source'
            shutil.copytree(ROOT, root, ignore=shutil.ignore_patterns('.git', 'dist', '__pycache__'))
            (root / '.env').write_text('SECRET=must-not-ship')
            first = packaging.build(root, Path(directory) / 'first')
            for name in packaging.FILES:
                (root / name).chmod(0o755)
            second = packaging.build(root, Path(directory) / 'second')
            self.assertEqual(first.read_bytes(), second.read_bytes())
            with tarfile.open(first) as archive:
                self.assertEqual(set(archive.getnames()), {f'sip/{name}' for name in packaging.FILES} | {'sip/MANIFEST.json'})
                inventory = json.load(archive.extractfile('sip/MANIFEST.json'))
                for name, digest in inventory['sha256'].items():
                    self.assertEqual(hashlib.sha256(archive.extractfile(name).read()).hexdigest(), digest)
                self.assertTrue(all(member.isfile() and member.mode == 0o644 for member in archive.getmembers()))

    def test_invalid_releases_fail_closed(self):
        for name, content in [('LICENSE', ''), ('VERSION', '01.0.0'), ('SKILL.md', '---\nname: "wrong"\n---\nbody')]:
            with self.subTest(name=name), tempfile.TemporaryDirectory() as directory:
                root = Path(directory) / 'source'
                shutil.copytree(ROOT, root, ignore=shutil.ignore_patterns('.git', 'dist', '__pycache__'))
                (root / name).write_text(content)
                with self.assertRaises(ValueError):
                    packaging.validate(root)

    def test_symlink_payload_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory) / 'source'
            shutil.copytree(ROOT, root, ignore=shutil.ignore_patterns('.git', 'dist', '__pycache__'))
            (root / 'LICENSE').unlink()
            (root / 'LICENSE').symlink_to(ROOT / 'LICENSE')
            with self.assertRaisesRegex(ValueError, 'Symlinks'):
                packaging.validate(root)


if __name__ == '__main__':
    unittest.main()
