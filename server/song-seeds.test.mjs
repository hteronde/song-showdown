import test from 'node:test';
import assert from 'node:assert/strict';
import { assignSongSeeds } from './song-seeds.mjs';

test('automatically fills blank seeds without taking explicit seeds', () => {
  assert.deepEqual(assignSongSeeds([{}, { seed: '1' }, { seed: '' }, { seed: ' 4 ' }]), [2, 1, 3, 4]);
});
test('rejects invalid and duplicate seeds within a region', () => {
  for (const seed of ['0', '17', '1.5', 'abc', true]) {
    assert.throws(() => assignSongSeeds([{ seed }]), /whole number/);
  }
  assert.throws(() => assignSongSeeds([{ seed: '2' }, { seed: '2' }]), /repeated/);
});
test('allows the same seed in separate regions and preserves automatic defaults', () => {
  const songs = Array.from({ length: 32 }, () => ({}));
  assert.deepEqual(assignSongSeeds(songs), [...Array.from({ length: 16 }, (_, i) => i + 1), ...Array.from({ length: 16 }, (_, i) => i + 1)]);
});
