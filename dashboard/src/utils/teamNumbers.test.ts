import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTeamNumbers } from './teamNumbers.ts';
test('imports CSV headers and formatted phone numbers while removing input duplicates', () => {
  assert.deepEqual(parseTeamNumbers('phone\n"+91 9111 111111"\n919111111111;919222222222'), { numbers: ['919111111111', '919222222222'], invalid: [], duplicates: 1 });
});
test('reports malformed entries instead of silently inventing phone numbers', () => {
  const result = parseTeamNumbers('Alice123456789\n123\n919333333333');
  assert.deepEqual(result.invalid, ['Alice123456789', '123']);
  assert.deepEqual(result.numbers, ['919333333333']);
});
