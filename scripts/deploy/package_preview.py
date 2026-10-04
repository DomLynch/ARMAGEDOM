#!/usr/bin/env python3
"""Package a reviewed runtime allowlist without building or publishing."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import shutil
import tempfile


def package(runtime, manifest, output):
    runtime = Path(runtime).resolve(strict=True)
    output = Path(output).absolute()
    data = json.loads(Path(manifest).read_text())
    if not re.fullmatch(r'three-\d{8}-\d{3}', data['version']):
        raise ValueError('Expected immutable three-YYYYMMDD-NNN version')
    if not re.fullmatch(r'[0-9a-f]{64}', data['sourceFingerprint']):
        raise ValueError('Expected pinned source fingerprint')
    if output.exists() or output.is_symlink():
        raise ValueError('Output already exists; immutable versions cannot be overwritten')
    paths = set()
    total = 0
    for item in data['files']:
        name = item['path']
        path = PurePosixPath(name)
        if (not name or '\\' in name or path.is_absolute() or '..' in path.parts
                or str(path) != name or name in paths or name == 'release.json'):
            raise ValueError(f'Unsafe or duplicate runtime path: {name}')
        paths.add(name)
        source = runtime / name
        if any((runtime.joinpath(*path.parts[:i])).is_symlink()
               for i in range(1, len(path.parts) + 1)):
            raise ValueError(f'Symlink runtime input: {name}')
        raw = source.read_bytes()
        if len(raw) != item['bytes'] or hashlib.sha256(raw).hexdigest() != item['sha256']:
            raise ValueError(f'Runtime hash/size mismatch: {name}')
        total += len(raw)
    if 'index.html' not in paths or total != data['bytes']:
        raise ValueError('Missing entry point or incorrect manifest byte total')
    output.parent.mkdir(parents=True, exist_ok=True)
    temp = Path(tempfile.mkdtemp(prefix='.preview-', dir=output.parent))
    try:
        for item in data['files']:
            target = temp / item['path']
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(runtime / item['path'], target)
            # Recheck copied bytes to reject inputs changed during packaging.
            raw = target.read_bytes()
            if len(raw) != item['bytes'] or hashlib.sha256(raw).hexdigest() != item['sha256']:
                raise ValueError(f'Runtime changed during packaging: {item["path"]}')
        release = runtime / 'release.json'
        if release.is_file():
            if release.is_symlink() or json.loads(release.read_text()) != data:
                raise ValueError('Existing release manifest differs from approved manifest')
            shutil.copyfile(release, temp / 'release.json')
        else:
            (temp / 'release.json').write_text(json.dumps(data, indent=2) + '\n')
        # Exclusive creation also rejects concurrent publishers; move files only
        # into this newly reserved local directory. No webroot mutation here.
        output.mkdir()
        try:
            for child in temp.iterdir():
                shutil.move(str(child), output / child.name)
        except Exception:
            shutil.rmtree(output)
            raise
    finally:
        shutil.rmtree(temp)
    return {'version': data['version'], 'files': len(paths) + 1,
            'payload_bytes': total, 'output': str(output),
            'ignored_files': sorted(str(p.relative_to(runtime)) for p in runtime.rglob('*')
                                    if p.is_file() and str(p.relative_to(runtime)) not in paths
                                    and p.name != 'release.json')}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--runtime', required=True)
    parser.add_argument('--manifest', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()
    print(json.dumps(package(args.runtime, args.manifest, args.output), indent=2))
