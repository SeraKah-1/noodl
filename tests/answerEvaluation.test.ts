import test from 'node:test';
import assert from 'node:assert/strict';
import { isFillBlankCorrect, normalizeShortAnswer } from '../services/answerEvaluation.ts';

test('fill blank never accepts a partial substring', () => {
  assert.equal(isFillBlankCorrect('a', 'Jakarta'), false);
  assert.equal(isFillBlankCorrect('karta', 'Jakarta'), false);
});

test('fill blank ignores harmless case, spacing, punctuation, and accents', () => {
  assert.equal(isFillBlankCorrect('  JAKARTA! ', 'Jakarta'), true);
  assert.equal(normalizeShortAnswer('  Café-au-lait  '), 'cafe au lait');
});

test('fill blank supports only explicit pipe-separated alternatives', () => {
  assert.equal(isFillBlankCorrect('air', 'H2O | water | air'), true);
  assert.equal(isFillBlankCorrect('wat', 'H2O | water | air'), false);
});
