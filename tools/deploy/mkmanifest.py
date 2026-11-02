"""Write release-manifest.json for release N from the assets.log gate output and the releases.json constants.

Usage: mkmanifest.py N <source sha> <fingerprint> <releases.json> <assets.log> <out>
"""
import json, sys

n, src, fp, rel, assets, out = sys.argv[1:7]
rows = json.load(open(rel))
version = rows[str(int(n) - 1)]['version'][:-len(str(int(n) - 1))] + n
a = json.load(open(assets))
m = {
    'version': version,
    'engine': 'three0.182.0',
    'sourceCommit': src,
    'sourceFingerprint': fp,
    'bytes': a['bytes'],
    'files': a['files'],
}
json.dump(m, open(out, 'w', newline='\n'), indent=2)
print(len(m['files']), m['bytes'])
