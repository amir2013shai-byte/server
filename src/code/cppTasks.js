// Задания для код-режима: простые (арифметика, условия, максимумы).
// У каждого — краткое условие, заготовка, открытые примеры и скрытые тесты.

export const EASY_TASKS = [
  {
    id: 'add2',
    title: 'Сумма двух чисел',
    brief: 'Напишите функцию add, возвращающую сумму a и b.',
    signature: 'int add(int a, int b)',
    skeleton: 'int add(int a, int b) {\n  // ваш код\n  return 0;\n}',
    hint: 'Верните a + b.',
    examples: [{ args: [2, 3], expect: 5 }],
    tests: [{ args: [2, 3], expect: 5 }, { args: [-4, 4], expect: 0 }, { args: [10, 10], expect: 20 }, { args: [-7, -3], expect: -10 }]
  },
  {
    id: 'max2',
    title: 'Максимум двух чисел',
    brief: 'Напишите функцию maxOf: возвращает большее из чисел a и b. Если равны — любое из них.',
    signature: 'int maxOf(int a, int b)',
    skeleton: 'int maxOf(int a, int b) {\n  // ваш код (if)\n  return 0;\n}',
    hint: 'Если a > b, верните a, иначе — b.',
    examples: [{ args: [3, 7], expect: 7 }],
    tests: [{ args: [3, 7], expect: 7 }, { args: [5, -2], expect: 5 }, { args: [4, 4], expect: 4 }, { args: [-9, -1], expect: -1 }]
  },
  {
    id: 'min2',
    title: 'Минимум двух чисел',
    brief: 'Напишите функцию minOf: возвращает меньшее из чисел a и b.',
    signature: 'int minOf(int a, int b)',
    skeleton: 'int minOf(int a, int b) {\n  // ваш код (if)\n  return 0;\n}',
    hint: 'Если a < b, верните a, иначе — b.',
    examples: [{ args: [3, 7], expect: 3 }],
    tests: [{ args: [3, 7], expect: 3 }, { args: [5, -2], expect: -2 }, { args: [4, 4], expect: 4 }, { args: [-9, -1], expect: -9 }]
  },
  {
    id: 'absOf',
    title: 'Модуль числа',
    brief: 'Напишите функцию absOf: возвращает число без знака (модуль). Отрицательное — со знаком минус убираем.',
    signature: 'int absOf(int a)',
    skeleton: 'int absOf(int a) {\n  // ваш код (if)\n  return 0;\n}',
    hint: 'Если a < 0, верните -a, иначе — a.',
    examples: [{ args: [-7], expect: 7 }],
    tests: [{ args: [5], expect: 5 }, { args: [-7], expect: 7 }, { args: [0], expect: 0 }, { args: [-100], expect: 100 }]
  },
  {
    id: 'clampX',
    title: 'Зажать в диапазоне',
    brief: 'Напишите функцию clamp: число x, но не меньше lo и не больше hi.',
    signature: 'int clamp(int x, int lo, int hi)',
    skeleton: 'int clamp(int x, int lo, int hi) {\n  // ваш код (два if)\n  return x;\n}',
    hint: 'Если x < lo — верните lo; если x > hi — верните hi; иначе — x.',
    examples: [{ args: [5, 1, 3], expect: 3 }],
    tests: [{ args: [5, 1, 3], expect: 3 }, { args: [0, 1, 3], expect: 1 }, { args: [2, 1, 3], expect: 2 }, { args: [-5, -2, 8], expect: -2 }]
  },
  {
    id: 'signOf',
    title: 'Знак числа',
    brief: 'Напишите функцию signOf: верните 1, если число положительное, -1, если отрицательное, и 0 для нуля.',
    signature: 'int signOf(int a)',
    skeleton: 'int signOf(int a) {\n  // ваш код (if / else)\n  return 0;\n}',
    hint: 'Три случая: a > 0, a < 0 и a == 0.',
    examples: [{ args: [42], expect: 1 }],
    tests: [{ args: [42], expect: 1 }, { args: [-3], expect: -1 }, { args: [0], expect: 0 }, { args: [-0], expect: 0 }]
  },
  {
    id: 'isEven',
    title: 'Чётное число',
    brief: 'Напишите функцию isEven: возвращает true, если число чётное, и false, если нечётное.',
    signature: 'bool isEven(int a)',
    skeleton: 'bool isEven(int a) {\n  // ваш код (остаток от деления: %)\n  return false;\n}',
    hint: 'Чётные делятся на 2 без остатка: a % 2 == 0.',
    examples: [{ args: [4], expect: true }],
    tests: [{ args: [4], expect: true }, { args: [7], expect: false }, { args: [0], expect: true }, { args: [-3], expect: false }]
  },
  {
    id: 'battleBonus',
    title: 'Бонус за победу',
    brief: 'Бой выигран (win = true) — к эликсиру прибавляется 3, проигран (win = false) — 1. Напишите функцию battleBonus.',
    signature: 'int battleBonus(int elixir, bool win)',
    skeleton: 'int battleBonus(int elixir, bool win) {\n  // ваш код (if)\n  return elixir;\n}',
    hint: 'Если win — верните elixir + 3, иначе elixir + 1.',
    examples: [{ args: [5, true], expect: 8 }],
    tests: [{ args: [5, true], expect: 8 }, { args: [5, false], expect: 6 }, { args: [0, true], expect: 3 }, { args: [10, false], expect: 11 }]
  }
];

// случайная задача из ещё не решённых в этом бою (или любая)
export function pickTask(solvedIds = []) {
  const pool = EASY_TASKS.filter((t) => !solvedIds.includes(t.id));
  const list = pool.length ? pool : EASY_TASKS;
  return list[Math.floor(Math.random() * list.length)];
}

// проверка решения: прогон скрытых тестов
import { runCpp } from './cppRun.js';

export function checkSolution(task, code) {
  const fnName = task.signature.split('(')[0].split(/\s+/).pop();
  for (const t of task.tests) {
    const r = runCpp(code, fnName, t.args);
    if (!r.ok) return { ok: false, error: r.error };
    const got = typeof t.expect === 'boolean' ? (r.value ? true : false) : r.value;
    const exp = t.expect;
    const pass = typeof exp === 'boolean' ? got === exp : got === exp;
    if (!pass) {
      const fmt = (v) => (typeof v === 'boolean' ? (v ? 'true' : 'false') : String(v));
      return {
        ok: false,
        error: `Тест не пройден: ${fnName}(${t.args.map(fmt).join(', ')}) → ожидалось ${fmt(exp)}, получено ${fmt(got)}`
      };
    }
  }
  return { ok: true };
}
