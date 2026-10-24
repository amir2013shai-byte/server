// Тесты код-режима: мини-интерпретатор C++ и банк заданий (node).
import { runCpp } from '../src/code/cppRun.js';
import { EASY_TASKS, pickTask, checkSolution } from '../src/code/cppTasks.js';

let failed = 0;
function check(name, cond) {
  if (cond) console.log('  ✓', name);
  else { console.error('  ✗', name); failed++; }
}

console.log('Код-режим: заданий в банке', EASY_TASKS.length);

// ——— интерпретатор: арифметика и функции ———
let r = runCpp('int add(int a, int b) { return a + b; }', 'add', [2, 3]);
check('сложение: add(2,3)=5', r.ok && r.value === 5);

r = runCpp('int f(int a) { return -a * (2 + 3) % 4; }', 'f', [7]);
check('приоритеты: -a*(2+3)%4', r.ok && r.value === ((-7 * 5) % 4));

// ——— условия и тернарник ———
r = runCpp('int maxOf(int a, int b) { if (a > b) return a; else return b; }', 'maxOf', [3, 7]);
check('if/else: maxOf(3,7)=7', r.ok && r.value === 7);

r = runCpp('int maxOf(int a, int b) { return a > b ? a : b; }', 'maxOf', [-9, -1]);
check('тернарник: maxOf(-9,-1)=-1', r.ok && r.value === -1);

// ——— циклы, +=, ++ ———
r = runCpp('int sum(int n) { int s = 0; for (int i = 1; i <= n; i++) { s += i; } return s; }', 'sum', [10]);
check('for + +=: сумма 1..10 = 55', r.ok && r.value === 55);

r = runCpp('int f(int n) { int s = 0; while (n > 0) { s = s + n; n--; } return s; }', 'f', [5]);
check('while + n--: сумма 1..5 = 15', r.ok && r.value === 15);

// ——— рекурсия и вызовы функций ———
r = runCpp('int fact(int n) { if (n <= 1) return 1; return n * fact(n - 1); }', 'fact', [5]);
check('рекурсия: fact(5)=120', r.ok && r.value === 120);

r = runCpp('int dbl(int x) { return x * 2; } int g(int a) { return dbl(a) + 1; }', 'g', [4]);
check('вызов другой функции: g(4)=9', r.ok && r.value === 9);

// ——— bool и логика ———
r = runCpp('bool isEven(int a) { return a % 2 == 0; }', 'isEven', [4]);
check('bool: isEven(4)=true', r.ok && r.value === 1);
r = runCpp('bool f(int a, int b) { return a > 0 && b > 0; }', 'f', [1, -2]);
check('&&: f(1,-2)=false', r.ok && r.value === 0);

// ——— ошибки по-русски ———
r = runCpp('int add(int a, int b) { return a + }', 'add', [1, 2]);
check('ошибка разбора называет строку', !r.ok && /строка/.test(r.error));

r = runCpp('int add(int a, int b) { return a + b; }', 'sub', [1, 2]);
check('нет такой функции → ошибка', !r.ok && /sub/.test(r.error));

r = runCpp('int f(int a) { return a / 0; }', 'f', [1]);
check('деление на ноль → ошибка', !r.ok && /деление на ноль/.test(r.error));

r = runCpp('int f(int a) { int x = 1; }', 'f', [1]);
check('нет return → ошибка', !r.ok && /return/.test(r.error));

r = runCpp('int f(int a) { while (1) { a = a + 1; } return a; }', 'f', [1]);
check('бесконечный цикл ловится', !r.ok && /цикл/.test(r.error));

r = runCpp('int f(int a) { return x; }', 'f', [1]);
check('неизвестная переменная → ошибка', !r.ok && /переменная/.test(r.error));

// ——— комментарии ———
r = runCpp('// сложение\nint add(int a, int b) { /* сумма */ return a + b; }', 'add', [20, 3]);
check('комментарии // и /* */ не мешают', r.ok && r.value === 23);

// ——— эталонные решения проходят все задания банка ———
const REF = {
  add2: 'int add(int a, int b) { return a + b; }',
  max2: 'int maxOf(int a, int b) { if (a > b) { return a; } return b; }',
  min2: 'int minOf(int a, int b) { if (a < b) { return a; } return b; }',
  absOf: 'int absOf(int a) { if (a < 0) { return -a; } return a; }',
  clampX: 'int clamp(int x, int lo, int hi) { if (x < lo) { return lo; } if (x > hi) { return hi; } return x; }',
  signOf: 'int signOf(int a) { if (a > 0) { return 1; } if (a < 0) { return -1; } return 0; }',
  isEven: 'bool isEven(int a) { return a % 2 == 0; }',
  battleBonus: 'int battleBonus(int elixir, bool win) { if (win) { return elixir + 3; } return elixir + 1; }'
};
for (const task of EASY_TASKS) {
  const sol = REF[task.id];
  check(`эталон решения проходит «${task.title}»`, !!sol && checkSolution(task, sol).ok);
}

// ——— неверные решения не проходят ———
check('пустая заготовка не проходит', !checkSolution(EASY_TASKS[0], EASY_TASKS[0].skeleton).ok);
check('кривой maxOf не проходит', !checkSolution(EASY_TASKS.find((t) => t.id === 'max2'),
  'int maxOf(int a, int b) { return a; }').ok);

// ——— pickTask ———
check('pickTask исключает решённые', [0, 1, 2].every(() => {
  const t = pickTask(['add2', 'max2', 'min2', 'absOf', 'clampX']);
  return !['add2', 'max2', 'min2', 'absOf', 'clampX'].includes(t.id);
}));
check('каждая задача имеет условие, заготовку и тесты', EASY_TASKS.every((t) =>
  t.title && t.brief && t.skeleton && t.hint && t.tests.length >= 3 && t.examples.length >= 1));

if (failed) {
  console.error('\nПРОВАЛЕНО:', failed);
  process.exit(1);
}
console.log('\nВСЕ ТЕСТЫ ПРОЙДЕНЫ');
