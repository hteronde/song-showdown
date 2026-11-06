import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoteInput } from './vote-input.mjs';

test('accepts a vote and normalizes an empty comment', () => {
  assert.deepEqual(parseVoteInput({ userId: 4, selectedEntryId: 12, comment: '  ' }), {
    value: { userId: 4, selectedEntryId: 12, comment: null }
  });
});

test('rejects missing, invalid, and unsafe identifiers', () => {
  for (const input of [null, [], {}, { userId: 0, selectedEntryId: 12 },
    { userId: 1.5, selectedEntryId: 12 }, { userId: Number.MAX_SAFE_INTEGER + 1, selectedEntryId: 12 },
    { userId: 1, selectedEntryId: -2 }]) {
    assert.equal(typeof parseVoteInput(input).error, 'string');
  }
});

test('rejects comments over the UI limit or of a non-string type', () => {
  assert.match(parseVoteInput({ userId: 1, selectedEntryId: 2, comment: 7 }).error, /comment/);
  assert.match(parseVoteInput({ userId: 1, selectedEntryId: 2, comment: 'x'.repeat(281) }).error, /280/);
});
