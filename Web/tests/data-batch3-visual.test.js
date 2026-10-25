import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SURVIVOR_VARIANTS} from '../src/engine/remote-survivors.js';
import {FACE_APPEARANCE_VERSION, FACE_HEADS, FACE_HAIRS, FACE_SKINS, FACE_WEATHERING, FACE_RECIPES} from '../src/face-recipes.js';
import {CLOTHING_PALETTE_VERSION, TOP_COLOURS, TROUSER_COLOURS, PAIRINGS, outfitFor} from '../src/clothing-palettes.js';
import {GAME_DATA, validateVisual} from '../src/engine/game-data.js';

// Data batch 3: the survivor variants, the face ingredients, the clothing swatches and pairings and the effect colours moved from code
// into Web/src/data/visual.json. tests/fixtures/visual-pre-data.json is the old in-code values dumped from main before the move.
const old = JSON.parse(fs.readFileSync(new URL('./fixtures/visual-pre-data.json', import.meta.url)));
const plain = value => JSON.parse(JSON.stringify(value));
// The linear colours come from Math.pow, which differs in the last digit between platforms (the fixture was dumped on the Mac, the
// suite also runs on Linux): numbers match within 1e-12, everything else exactly.
function assertClose(actual, expected, label, path = '') {
  if (typeof expected === 'number') return assert(Math.abs(actual - expected) < 1e-12, `${label} ${path}: ${actual} vs ${expected}`);
  if (expected && typeof expected === 'object') {
    assert.deepEqual(Object.keys(actual ?? {}), Object.keys(expected), `${label} ${path} keys`);
    for (const key of Object.keys(expected)) assertClose(actual[key], expected[key], label, `${path}/${key}`);
  } else assert.equal(actual, expected, `${label} ${path}`);
}

test('SURVIVOR_VARIANTS equal the old in-code rows exactly, in order, and are frozen', () => {
  assert.deepEqual(plain(SURVIVOR_VARIANTS), old.survivorVariants);
  assert(Object.isFrozen(SURVIVOR_VARIANTS) && SURVIVOR_VARIANTS.every(v => Object.isFrozen(v) && Object.isFrozen(v.garment)));
});

test('the face ingredients and all 50 derived recipes equal the old ones exactly', () => {
  assert.equal(FACE_APPEARANCE_VERSION, old.faces.version);
  assert.deepEqual(plain(FACE_HEADS), old.faces.heads);
  assert.deepEqual(plain(FACE_HAIRS), old.faces.hairs);
  assert.deepEqual(plain(FACE_SKINS), old.faces.skins);
  assert.deepEqual(plain(FACE_WEATHERING), old.faces.weathering);
  assert.deepEqual(plain(FACE_RECIPES), old.faces.recipes);
  assert(Object.isFrozen(FACE_RECIPES) && Object.isFrozen(FACE_SKINS[0].photo));
});

test('the clothing swatches, every approved pairing and all 840 outfits equal the old ones (linear colours to 1e-12)', () => {
  assert.equal(CLOTHING_PALETTE_VERSION, old.clothing.version);
  assertClose(plain(TOP_COLOURS), old.clothing.tops, 'tops');
  assertClose(plain(TROUSER_COLOURS), old.clothing.trousers, 'trousers');
  assert.deepEqual(plain(PAIRINGS), old.clothing.pairings);
  let outfits = 0;
  for (const [top, trousers] of Object.entries(PAIRINGS))
    for (const trouser of trousers) {
      assertClose(plain(outfitFor(top, trouser)), old.clothing.outfits[`${top}/${trouser}`], `${top}/${trouser}`);
      outfits++;
    }
  assert.equal(outfits, Object.keys(old.clothing.outfits).length);
  assert.throws(() => outfitFor('top-charcoal-01', 'trousers-charcoal-01'), /unapproved/);
});

test('the effect colours read as the same numbers as the old 0x literals', () => {
  const asNumbers = Object.fromEntries(Object.entries(GAME_DATA.visual.effects.swingColours).map(([k, v]) => [k, parseInt(v, 16)]));
  assert.deepEqual(asNumbers, old.effects.swingColours);
  assert.deepEqual(GAME_DATA.visual.effects.lootColours.map(v => parseInt(v, 16)), old.effects.lootColours);
});

test('the loader validates visual.json: unknown, missing, malformed or out-of-range rows are rejected', () => {
  const file = JSON.parse(fs.readFileSync(new URL('../src/data/visual.json', import.meta.url)));
  const broken = mutate => {
    const d = structuredClone(file);
    mutate(d);
    return () => validateVisual(d);
  };
  assert.doesNotThrow(broken(() => {}));
  assert.throws(broken(d => { d.extra = 1; }));
  assert.throws(broken(d => { delete d.effects; }));
  assert.throws(broken(d => { d.survivorVariants[0].garment = [1, 1]; }), /three channels/);
  assert.throws(broken(d => { d.survivorVariants[0].accent[1] = 9; }), /above 2/);
  assert.throws(broken(d => { d.survivorVariants[1].id = 'azure'; }), /repeated/);
  assert.throws(broken(d => { d.clothing.tops[0][1] = '24272A'; }), /hex/);
  assert.throws(broken(d => { d.clothing.partners.charcoal.push('nowhere'); }), /unknown trousers family/);
  assert.throws(broken(d => { delete d.clothing.partners.sand; }));
  assert.throws(broken(d => { d.effects.swingColours.heavy = 'ffa64'; }), /hex/);
  assert.throws(broken(d => { d.faces.heads[0].width = -1; }));
});
