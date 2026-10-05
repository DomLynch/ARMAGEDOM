"""Read-only factory coverage/protected-slot check; no generation or runtime edits."""
import csv, hashlib, json, subprocess, sys
from collections import Counter
from pathlib import Path
HERE = Path(__file__).resolve().parent
REPO = Path('/Users/domininclynch/Desktop/Business/ARMAGEDOM')
baseline = json.loads((HERE / 'baseline.json').read_text())
plan = json.loads((HERE / 'plan.json').read_text())
ledger_path = REPO / 'briefs/CREATURE-PRODUCTION.csv'
rows = list(csv.DictReader(ledger_path.open()))
source = subprocess.check_output(['git', '-C', str(REPO), 'show', baseline['base'] + ':' + baseline['path']])
assert hashlib.sha256(source).hexdigest() == baseline['sourceSHA256'], 'baseline source drift'
ids = [r['recipe_id'] for r in rows]
assert len(ids) == len(set(ids)) == 30, 'catalogue must have30 unique recipeIDs'
assert Counter(r['foundation'] for r in rows) == {'human':12, 'rat':6, 'dog':6, 'cockroach':6}
slots = {s['key']: s for s in baseline['slots']}
assert len(slots) == 24
assert Counter(s['area'] for s in slots.values()) == {'westminster':6, 'east':9, 'south':9}
protected = {s['key'] for s in slots.values() if s['area']=='westminster'}
assert set(plan['protectedKeys']) == protected, 'protect all vest entitlement keys'
for recipe, key in plan['pilots'].items():
    assert recipe in ids and key in slots and key not in protected
    assert plan['cohorts']['A'][key] == recipe and plan['cohorts']['B'][key] == recipe
coverage = set()
for name, assignments in plan['cohorts'].items():
    assert set(assignments) == set(slots), 'no added/removed resident slots'
    assert set(assignments.values()) <= set(ids), 'unknown recipe'
    for key in protected:
        assert assignments[key] == slots[key]['existingRecipe'], 'protected replacement denied'
    coverage.update(assignments.values())
assert coverage == set(ids), 'not all30 recipes reachable in proposed cohorts'
result = {'status':'PASS','scope':'mapping/static-data only; no runtime cycles or creature-route proof',
          'base':baseline['base'],'spawnSourceSHA256':baseline['sourceSHA256'],
          'ledgerSHA256':hashlib.sha256(ledger_path.read_bytes()).hexdigest(),
          'planSHA256':hashlib.sha256((HERE/'plan.json').read_bytes()).hexdigest(),
          'baselineResidents':dict(Counter(s['existingRecipe'] for s in slots.values())),
          'cohortUniqueRecipes':{n:len(set(a.values())) for n,a in plan['cohorts'].items()},
          'catalogueCoverage':len(coverage),'protectedKeys':sorted(protected),
          'firstIncompleteStage':plan['firstIncompleteStage']}
print(json.dumps(result, indent=2))
