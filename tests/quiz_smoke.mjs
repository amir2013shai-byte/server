// Тесты особого режима «Экзамен»: банк вопросов ЕГЭ (node).
import { readFileSync } from 'node:fs';
import { SUBJECTS, QUESTIONS, pickQuestions } from '../src/code/quiz.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log('  ✓', name);
  else { console.error('  ✗', name); failed++; }
}

console.log('ЕГЭ-режим: предметов', SUBJECTS.length);

check('предметов 12 (все школьные ЕГЭ)', SUBJECTS.length === 12);
check('id предметов уникальны', new Set(SUBJECTS.map((s) => s.id)).size === SUBJECTS.length);
check('у каждого предмета имя и иконка', SUBJECTS.every((s) => s.name && s.icon));

let total = 0;
for (const s of SUBJECTS) {
  const qs = QUESTIONS[s.id] || [];
  total += qs.length;
  check(`«${s.name}»: минимум 6 вопросов (есть ${qs.length})`, qs.length >= 6);
  const valid = qs.every((q) =>
    q.q && typeof q.q === 'string' &&
    Array.isArray(q.options) && q.options.length === 4 &&
    Number.isInteger(q.a) && q.a >= 0 && q.a <= 3 &&
    q.why && typeof q.why === 'string' &&
    new Set(q.options).size === 4 &&
    q.options.every((o) => typeof o === 'string' && o.length > 0));
  check(`«${s.name}»: 4 варианта, верный индекс, пояснения, без дублей`, valid);
}
check(`всего вопросов в банке ≥ 72 (${total})`, total >= 72);

// pickQuestions: без повторов, из банка
const picked = pickQuestions('math', 5);
check('pickQuestions: 5 уникальных вопросов', picked.length === 5 && new Set(picked.map((q) => q.q)).size === 5);
check('pickQuestions: все из банка предмета', picked.every((q) => QUESTIONS.math.includes(q)));
check('pickQuestions: меньше лимита — вернёт всё, что есть', pickQuestions('math', 999).length === QUESTIONS.math.length);

// выборочные проверки фактов (правильный ответ действительно верный)
const logQ = QUESTIONS.math.find((q) => q.q.includes('log₂ 8'));
check('факт: log₂ 8 = 3', logQ && logQ.options[logQ.a] === '3');
const byteQ = QUESTIONS.cs.find((q) => q.q.includes('битов в одном байте'));
check('факт: в байте 8 бит', byteQ && byteQ.options[byteQ.a] === '8');
const warQ = QUESTIONS.history.find((q) => q.q.includes('Наполеоном'));
check('факт: Отечественная война — 1812', warQ && warQ.options[warQ.a] === '1812');
const waterQ = QUESTIONS.chemistry.find((q) => q.q.includes('Формула воды'));
check('факт: вода — H₂O', waterQ && waterQ.options[waterQ.a] === 'H₂O');
const moonQ = QUESTIONS.astro.find((q) => q.q.includes('Луна'));
check('факт: Луна — спутник Земли', moonQ && /спутник/.test(moonQ.options[moonQ.a]));

// интеграция с UI
const uiSrc = readFileSync(new URL('../src/ui.js', import.meta.url), 'utf8');
check('особый режим «Экзамен» в меню (m-exam)', uiSrc.includes('m-exam') && uiSrc.includes('showExam'));
check('экраны: предметы и викторина', uiSrc.includes('showExamSubjects') && uiSrc.includes('showExamQuiz'));
check('запас эликсира в бой (examBank)', uiSrc.includes('examBank') && uiSrc.includes('_examBank'));

if (failed) {
  console.error('\nПРОВАЛЕНО:', failed);
  process.exit(1);
}
console.log('\nВСЕ ТЕСТЫ ПРОЙДЕНЫ');
