import test from 'node:test';
import assert from 'node:assert/strict';
import { validateQuizImport } from '../services/quizImportValidation.ts';

test('accepts and normalizes a valid exported quiz', () => {
  const result = validateQuizImport({
    fileName: 'Biology',
    questions: [{
      id: 1,
      text: 'What is ATP?',
      options: ['Energy carrier', 'Cell wall'],
      correctIndex: 0,
      explanation: 'ATP carries usable chemical energy.',
      keyPoint: 'ATP',
      difficulty: 'Easy',
    }],
  });
  assert.equal(result.title, 'Biology');
  assert.equal(result.questions[0].type, 'MULTIPLE_CHOICE');
});

test('rejects malformed answer indexes', () => {
  assert.throws(() => validateQuizImport({
    questions: [{ text: 'Broken', options: ['A', 'B'], correctIndex: 9 }],
  }), /invalid answer definition/);
});

test('rejects unbounded question collections', () => {
  assert.throws(() => validateQuizImport({ questions: new Array(501).fill({}) }), /between 1 and 500/);
});
