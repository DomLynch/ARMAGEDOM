import json
a = json.load(open('assets.log'))
m = {
    'version': 'three-20261028-336',
    'engine': 'three0.182.0',
    'sourceCommit': 'e2f0530d9200d049173ec4446234b04412572a99',
    'sourceFingerprint': '19466b5354c72f058e0ee223fd66f6a2ac6a0fe46a23cbe22be140dfdca752cf',
    'bytes': a['bytes'],
    'files': a['files'],
}
json.dump(m, open('release-manifest.json', 'w'), indent=2)
print(len(m['files']), m['bytes'])
