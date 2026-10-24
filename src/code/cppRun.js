// Мини-интерпретатор подмножества C++ для код-режима боя.
// Поддержка: int/bool, функции, if/else, while, for, return,
// арифметика (+ - * / %), сравнения, логика (&& || !), тернарник ? :,
// +=, ++/--, вызовы функций. Ошибки — по-русски, с номером строки.

const KEYWORDS = new Set(['int', 'bool', 'void', 'if', 'else', 'while', 'for', 'return', 'true', 'false']);
const MAX_STEPS = 2000000;
const MAX_DEPTH = 200;

class CppError extends Error {
  constructor(msg, line) {
    super(line ? `${msg} (строка ${line})` : msg);
    this.line = line;
  }
}

// ——— токенизатор ———

function tokenize(src) {
  const toks = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    if (ch === '\n') { line++; i++; continue; }
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
    if (ch === '/' && src[i + 1] === '/') { while (i < n && src[i] !== '\n') i++; continue; }
    if (ch === '/' && src[i + 1] === '*') {
      i += 2;
      while (i < n && !(src[i] === '*' && src[i + 1] === '/')) { if (src[i] === '\n') line++; i++; }
      if (i >= n) throw new CppError('комментарий /* не закрыт', line);
      i += 2; continue;
    }
    if (/[0-9]/.test(ch)) {
      let j = i;
      while (j < n && /[0-9]/.test(src[j])) j++;
      if (src[j] === '.' && /[0-9]/.test(src[j + 1] || '')) {
        j++;
        while (j < n && /[0-9]/.test(src[j])) j++;
      }
      toks.push({ t: 'num', v: parseFloat(src.slice(i, j)), line });
      i = j; continue;
    }
    if (/[A-Za-z_А-Яа-я]/.test(ch)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_А-Яа-я]/.test(src[j])) j++;
      const w = src.slice(i, j);
      toks.push({ t: KEYWORDS.has(w) ? 'kw' : 'id', v: w, line });
      i = j; continue;
    }
    // двухсимвольные операторы
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||', '++', '--', '+=', '-=', '*=', '/='].includes(two)) {
      toks.push({ t: 'op', v: two, line });
      i += 2; continue;
    }
    if ('+-*/%<>=!?:;(),{}'.includes(ch)) {
      toks.push({ t: 'op', v: ch, line });
      i++; continue;
    }
    throw new CppError(`неизвестный символ «${ch}»`, line);
  }
  toks.push({ t: 'end', v: null, line });
  return toks;
}

// ——— парсер (рекурсивный спуск) ———

function parse(toks) {
  let p = 0;
  const peek = () => toks[p];
  const at = (t, v) => toks[p].t === t && (v === undefined || toks[p].v === v);
  const eat = (t, v) => {
    if (!at(t, v)) throw new CppError(`ожидалось ${v ? `«${v}»` : t}, встретилось «${toks[p].v ?? 'конец'}»`, toks[p].line);
    return toks[p++];
  };
  const type = () => {
    if (at('kw', 'int') || at('kw', 'bool') || at('kw', 'void')) return toks[p++].v;
    throw new CppError('ожидался тип int/bool/void', peek().line);
  };

  function primary() {
    if (at('num')) return { k: 'num', v: toks[p++].v };
    if (at('kw', 'true')) { p++; return { k: 'num', v: 1, bool: true }; }
    if (at('kw', 'false')) { p++; return { k: 'num', v: 0, bool: true }; }
    if (at('id')) return { k: 'var', name: toks[p++].v, line: toks[p - 1].line };
    if (at('op', '(')) { p++; const e = expr(); eat('op', ')'); return e; }
    throw new CppError(`неожиданное «${peek().v ?? 'конец файла'}»`, peek().line);
  }

  function postfix() {
    let e = primary();
    for (;;) {
      if (at('op', '(')) {
        p++;
        const args = [];
        if (!at('op', ')')) {
          args.push(expr());
          while (at('op', ',')) { p++; args.push(expr()); }
        }
        eat('op', ')');
        e = { k: 'call', name: e.name || '?', args, line: e.line };
      } else if (at('op', '++') || at('op', '--')) {
        e = { k: 'post', op: toks[p++].v, e, line: toks[p - 1].line };
      } else break;
    }
    return e;
  }

  function unary() {
    if (at('op', '!') || at('op', '-') || at('op', '+') || at('op', '++') || at('op', '--')) {
      const op = toks[p++].v;
      return { k: 'un', op, e: unary(), line: toks[p - 1].line };
    }
    return postfix();
  }

  function bin(level) {
    // приоритеты: от низкого (||) к высокому (* / %)
    const levels = [
      ['||'],
      ['&&'],
      ['==', '!='],
      ['<', '>', '<=', '>='],
      ['+', '-'],
      ['*', '/', '%']
    ];
    if (level >= levels.length) return unary();
    let left = bin(level + 1);
    while (at('op') && levels[level].includes(peek().v)) {
      const op = toks[p++].v;
      left = { k: 'bin', op, a: left, b: bin(level + 1), line: toks[p - 1].line };
    }
    return left;
  }

  function ternary() {
    const c = bin(0);
    if (at('op', '?')) {
      p++;
      const a = expr();
      eat('op', ':');
      return { k: 'tern', c, a, b: ternary(), line: toks[p - 1].line };
    }
    return c;
  }

  function expr() {
    const left = ternary();
    const assignOps = ['=', '+=', '-=', '*=', '/='];
    if (at('op') && assignOps.includes(peek().v)) {
      const op = toks[p++].v;
      if (left.k !== 'var') throw new CppError('присваивать можно только в переменную', toks[p - 1].line);
      return { k: 'assign', op, name: left.name, e: expr(), line: toks[p - 1].line };
    }
    return left;
  }

  function stmt() {
    if (at('op', '{')) {
      p++;
      const body = [];
      while (!at('op', '}')) body.push(stmt());
      eat('op', '}');
      return { k: 'block', body };
    }
    if (at('kw', 'if')) {
      p++;
      eat('op', '(');
      const c = expr();
      eat('op', ')');
      const a = stmt();
      let b = null;
      if (at('kw', 'else')) { p++; b = stmt(); }
      return { k: 'if', c, a, b };
    }
    if (at('kw', 'while')) {
      p++;
      eat('op', '(');
      const c = expr();
      eat('op', ')');
      return { k: 'while', c, body: stmt() };
    }
    if (at('kw', 'for')) {
      p++;
      eat('op', '(');
      const init = at('op', ';') ? null : (at('kw', 'int') || at('kw', 'bool') ? decl() : expr());
      eat('op', ';');
      const c = at('op', ';') ? null : expr();
      eat('op', ';');
      const step = at('op', ')') ? null : expr();
      eat('op', ')');
      return { k: 'for', init, c, step, body: stmt() };
    }
    if (at('kw', 'return')) {
      p++;
      const e = at('op', ';') ? null : expr();
      eat('op', ';');
      return { k: 'return', e, line: toks[p - 1].line };
    }
    if (at('kw', 'int') || at('kw', 'bool')) {
      const d = decl();
      eat('op', ';');
      return d;
    }
    const e = expr();
    eat('op', ';');
    return { k: 'expr', e };
  }

  function decl() {
    const ty = type();
    const nameTok = eat('id');
    let e = null;
    if (at('op', '=')) { p++; e = expr(); }
    return { k: 'decl', ty, name: nameTok.v, e, line: nameTok.line };
  }

  function fn() {
    const ret = type();
    const nameTok = eat('id');
    eat('op', '(');
    const params = [];
    if (!at('op', ')')) {
      for (;;) {
        const ty = type();
        const nm = eat('id');
        params.push({ ty, name: nm.v });
        if (!at('op', ',')) break;
        p++;
      }
    }
    eat('op', ')');
    eat('op', '{');
    const body = [];
    while (!at('op', '}')) body.push(stmt());
    eat('op', '}');
    return { name: nameTok.v, ret, params, body, line: nameTok.line };
  }

  const funcs = new Map();
  while (!at('end')) {
    const f = fn();
    if (funcs.has(f.name)) throw new CppError(`функция ${f.name} объявлена дважды`, f.line);
    funcs.set(f.name, f);
  }
  return funcs;
}

// ——— интерпретатор ———

function callFn(funcs, name, args, depth, counter) {
  const f = funcs.get(name);
  if (!f) throw new CppError(`неизвестная функция ${name}()`);
  if (depth > MAX_DEPTH) throw new CppError('слишком глубокая рекурсия');
  if (args.length !== f.params.length) {
    throw new CppError(`функция ${name}: ожидалось аргументов: ${f.params.length}, получено: ${args.length}`);
  }
  const env = new Map();
  f.params.forEach((pm, i) => env.set(pm.name, args[i]));

  const scopes = [env];
  const lookup = (nm, line) => {
    for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].has(nm)) return scopes[i].get(nm);
    throw new CppError(`неизвестная переменная ${nm}`, line);
  };
  const assign = (nm, val, line) => {
    for (let i = scopes.length - 1; i >= 0; i--) if (scopes[i].has(nm)) { scopes[i].set(nm, val); return; }
    throw new CppError(`неизвестная переменная ${nm}`, line);
  };

  const num = (v, line) => {
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v !== 'number') throw new CppError('нечисловое значение', line);
    return v;
  };

  function ev(e) {
    if (++counter.n > MAX_STEPS) throw new CppError('слишком долгий цикл (возможно, бесконечный)');
    switch (e.k) {
      case 'num': return e.v;
      case 'var': return lookup(e.name, e.line);
      case 'assign': {
        const v = ev(e.e);
        if (e.op === '=') assign(e.name, v, e.line);
        else {
          const cur = num(lookup(e.name, e.line), e.line);
          const r = e.op === '+=' ? cur + num(v, e.line) : e.op === '-=' ? cur - num(v, e.line)
            : e.op === '*=' ? cur * num(v, e.line) : cur / num(v, e.line);
          assign(e.name, e.op === '/=' ? Math.trunc(r) : r, e.line);
        }
        return v;
      }
      case 'un': {
        if (e.op === '++' || e.op === '--') {
          if (e.e.k !== 'var') throw new CppError('++/-- только для переменной', e.line);
          const cur = num(lookup(e.e.name, e.line), e.line);
          const v = e.op === '++' ? cur + 1 : cur - 1;
          assign(e.e.name, v, e.line);
          return v;
        }
        const v = ev(e.e);
        if (e.op === '!') return num(v, e.line) === 0 ? 1 : 0;
        return e.op === '-' ? -num(v, e.line) : num(v, e.line);
      }
      case 'post': {
        if (e.e.k !== 'var') throw new CppError('++/-- только для переменной', e.line);
        const cur = num(lookup(e.e.name, e.line), e.line);
        assign(e.e.name, e.op === '++' ? cur + 1 : cur - 1, e.line);
        return cur;
      }
      case 'bin': {
        if (e.op === '&&') return num(ev(e.a), e.line) !== 0 ? (num(ev(e.b), e.line) !== 0 ? 1 : 0) : 0;
        if (e.op === '||') return num(ev(e.a), e.line) !== 0 ? 1 : (num(ev(e.b), e.line) !== 0 ? 1 : 0);
        const a = num(ev(e.a), e.line), b = num(ev(e.b), e.line);
        switch (e.op) {
          case '+': return a + b;
          case '-': return a - b;
          case '*': return a * b;
          case '/':
            if (b === 0) throw new CppError('деление на ноль', e.line);
            return Math.trunc(a / b);
          case '%':
            if (b === 0) throw new CppError('деление на ноль', e.line);
            return a % b;
          case '<': return a < b ? 1 : 0;
          case '>': return a > b ? 1 : 0;
          case '<=': return a <= b ? 1 : 0;
          case '>=': return a >= b ? 1 : 0;
          case '==': return a === b ? 1 : 0;
          case '!=': return a !== b ? 1 : 0;
          default: throw new CppError(`оператор «${e.op}» не поддерживается`, e.line);
        }
      }
      case 'tern': return num(ev(e.c), e.line) !== 0 ? ev(e.a) : ev(e.b);
      case 'call': {
        const vals = e.args.map(ev);
        return callFn(funcs, e.name, vals, depth + 1, counter);
      }
      default: throw new CppError('неизвестное выражение', e.line);
    }
  }

  function ex(s) {
    if (++counter.n > MAX_STEPS) throw new CppError('слишком долгий цикл (возможно, бесконечный)');
    switch (s.k) {
      case 'block': {
        scopes.push(new Map());
        try { for (const st of s.body) { const r = ex(st); if (r) return r; } }
        finally { scopes.pop(); }
        return null;
      }
      case 'decl': {
        const v = s.e ? ev(s.e) : 0;
        if (scopes[scopes.length - 1].has(s.name)) throw new CppError(`переменная ${s.name} уже объявлена`, s.line);
        scopes[scopes.length - 1].set(s.name, v);
        return null;
      }
      case 'expr': ev(s.e); return null;
      case 'if': return num(ev(s.c), s.line) !== 0 ? ex(s.a) : (s.b ? ex(s.b) : null);
      case 'while':
        while (num(ev(s.c), s.line) !== 0) {
          const r = ex(s.body);
          if (r) return r;
        }
        return null;
      case 'for': {
        scopes.push(new Map());
        try {
          if (s.init) ex(s.init);
          while (!s.c || num(ev(s.c), s.line) !== 0) {
            const r = ex(s.body);
            if (r) return r;
            if (s.step) ev(s.step);
          }
        } finally { scopes.pop(); }
        return null;
      }
      case 'return': return { value: s.e ? ev(s.e) : null };
      default: throw new CppError('неизвестный оператор');
    }
  }

  for (const st of f.body) {
    const r = ex(st);
    if (r) return r.value;
  }
  throw new CppError(`функция ${name}() не вернула значение (нет return)`);
}

// запуск функции entry из исходника code с аргументами args
export function runCpp(code, entry, args = []) {
  try {
    const funcs = parse(tokenize(String(code || '')));
    const value = callFn(funcs, entry, args.map((a) => (typeof a === 'boolean' ? (a ? 1 : 0) : a)), 0, { n: 0 });
    return { ok: true, value };
  } catch (e) {
    return { ok: false, error: e instanceof CppError ? e.message : `ошибка: ${e.message}` };
  }
}
