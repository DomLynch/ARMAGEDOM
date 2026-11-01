"""Pack a packaged export into the release tarball and its .sha256 sidecar.

Usage: mktarball.py N <source sha> <fingerprint> <release.json sha256> <releases.json> <export dir> <out dir>

three-<date>-N.tgz contains: site/ (the export tree, incl. release.json), manifest.json (sourceCommit, fingerprint,
node version, build time, release.json sha256, sha256 per file) and releases.json (the repo file with row N added).
"""
import hashlib, io, json, pathlib, subprocess, sys, tarfile, time

n, src, fp, relsha, relfile, export, outdir = sys.argv[1:8]
export, outdir = pathlib.Path(export), pathlib.Path(outdir)
rows = json.load(open(relfile))
version = rows[str(int(n) - 1)]['version'][:-len(str(int(n) - 1))] + n
rows[n] = {'version': version, 'source': src, 'fingerprint': fp, 'releaseSHA': relsha}

files = []
for p in sorted(export.rglob('*')):
    if p.is_file():
        files.append({'path': p.relative_to(export).as_posix(), 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()})
manifest = {
    'version': version,
    'sourceCommit': src,
    'sourceFingerprint': fp,
    'releaseSha256': relsha,
    'node': subprocess.check_output(['node', '-v']).decode().strip(),
    'buildTime': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    'files': files,
}
assert any(f['path'] == 'release.json' and f['sha256'] == relsha for f in files), 'release.json sha mismatch'

tgz = outdir / f'{version}.tgz'
assert not tgz.exists(), tgz


def add(tf, name, data):
    ti = tarfile.TarInfo(name)
    ti.size, ti.mtime, ti.mode = len(data), int(time.time()), 0o644
    tf.addfile(ti, io.BytesIO(data))


with tarfile.open(tgz, 'w:gz') as tf:
    add(tf, 'manifest.json', (json.dumps(manifest, indent=2) + '\n').encode())
    add(tf, 'releases.json', (json.dumps(rows, indent=1, sort_keys=True) + '\n').encode())
    for f in files:
        p = export / f['path']
        ti = tf.gettarinfo(str(p), arcname='site/' + f['path'])
        ti.uid = ti.gid = 0
        ti.uname = ti.gname = ''
        with open(p, 'rb') as fh:
            tf.addfile(ti, fh)
tsha = hashlib.sha256(tgz.read_bytes()).hexdigest()
(outdir / f'{version}.tgz.sha256').write_text(f'{tsha}  {version}.tgz\n')
print('TGZ', tgz, tsha)
