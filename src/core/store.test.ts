import { describe, expect, it } from 'vitest';
import { buildDefaultExample } from './examples';
import { evaluatePairs } from './pairs';
import {
  applyEdit,
  applyWithHistory,
  canRedo,
  canUndo,
  HISTORY_LIMIT,
  initHistory,
  redo,
  undo,
  type Edit,
} from './store';
import { resolveToken, type ThemeDoc } from './tokens';

function makeDoc(): ThemeDoc {
  return {
    name: 'test',
    base: { 'brand.500': '#2563eb', 'brand.600': '#1d4ed8', 'ink.900': '#0f172a' },
    themes: {
      light: {
        'color.action': { kind: 'ref', ref: 'brand.500' },
        'color.action.hover': { kind: 'ref', ref: 'brand.600' },
        'color.text': { kind: 'ref', ref: 'ink.900' },
      },
      dark: {
        'color.action': { kind: 'ref', ref: 'brand.600' },
        'color.action.hover': { kind: 'ref', ref: 'brand.500' },
        'color.text': { kind: 'color', color: '#f8fafc' },
      },
    },
  };
}

describe('applyEdit 校验', () => {
  it('接受合法颜色并归一化', () => {
    const { doc, error } = applyEdit(makeDoc(), { type: 'set-base', id: 'brand.500', color: '#ABC' });
    expect(error).toBeUndefined();
    expect(doc.base['brand.500']).toBe('#aabbcc');
  });

  it('拒绝非法颜色，文档不变', () => {
    const before = makeDoc();
    const { doc, error } = applyEdit(before, { type: 'set-base', id: 'brand.500', color: 'not-a-color' });
    expect(error).toContain('无效的颜色值');
    expect(doc).toBe(before);
  });

  it('拒绝引用不存在的令牌', () => {
    const before = makeDoc();
    const { doc, error } = applyEdit(before, {
      type: 'set-semantic',
      theme: 'light',
      id: 'color.action',
      value: { kind: 'ref', ref: 'ghost' },
    });
    expect(error).toContain('不存在');
    expect(doc).toBe(before);
  });
});

describe('循环拒绝', () => {
  it('拒绝会成环的引用修改，文档保持不变', () => {
    const before = makeDoc();
    // color.action.hover 已引用 brand.600；先把 brand.600 的“消费者”建好：
    // 让 color.action 引用 color.action.hover，再把 color.action.hover 改回引用 color.action 应被拒绝
    const step1 = applyEdit(before, {
      type: 'set-semantic',
      theme: 'light',
      id: 'color.action',
      value: { kind: 'ref', ref: 'color.action.hover' },
    });
    expect(step1.error).toBeUndefined();
    const step2 = applyEdit(step1.doc, {
      type: 'set-semantic',
      theme: 'light',
      id: 'color.action.hover',
      value: { kind: 'ref', ref: 'color.action' },
    });
    expect(step2.error).toContain('循环依赖被拒绝');
    expect(step2.error).toContain('color.action');
    expect(step2.doc).toBe(step1.doc); // 被拒绝，未产生新文档
  });

  it('拒绝自引用', () => {
    const before = makeDoc();
    const { doc, error } = applyEdit(before, {
      type: 'set-semantic',
      theme: 'light',
      id: 'color.action',
      value: { kind: 'ref', ref: 'color.action' },
    });
    expect(error).toContain('循环依赖被拒绝');
    expect(doc).toBe(before);
  });
});

describe('状态色传播', () => {
  it('修改基础令牌后，引用它的 hover 状态色即时更新', () => {
    const before = makeDoc();
    expect(resolveToken('color.action.hover', 'light', before)).toMatchObject({ ok: true, color: '#1d4ed8' });
    const { doc } = applyEdit(before, { type: 'set-base', id: 'brand.600', color: '#ff5500' });
    expect(resolveToken('color.action.hover', 'light', doc)).toMatchObject({ ok: true, color: '#ff5500' });
    // 深色主题的 hover 引用的是 brand.500，不受影响
    expect(resolveToken('color.action.hover', 'dark', doc)).toMatchObject({ ok: true, color: '#2563eb' });
  });

  it('状态色变化会反映到对比度评估结果', () => {
    const doc = buildDefaultExample();
    const before = evaluatePairs(doc).find((r) => r.pair.id === 'btn-primary-hover' && r.theme === 'light');
    expect(before?.ratio).toBeGreaterThan(4.5);
    // 把 hover 色改成接近白色的浅蓝，对比度必然崩塌
    const { doc: next } = applyEdit(doc, { type: 'set-base', id: 'blue.700', color: '#dbeafe' });
    const after = evaluatePairs(next).find((r) => r.pair.id === 'btn-primary-hover' && r.theme === 'light');
    expect(after?.level).toBe('fail');
  });
});

describe('主题覆盖（经 store）', () => {
  it('只改深色映射时浅色保持不变', () => {
    const before = makeDoc();
    const { doc } = applyEdit(before, {
      type: 'set-semantic',
      theme: 'dark',
      id: 'color.action',
      value: { kind: 'color', color: '#123123' },
    });
    expect(resolveToken('color.action', 'dark', doc)).toMatchObject({ ok: true, color: '#123123' });
    expect(resolveToken('color.action', 'light', doc)).toMatchObject({ ok: true, color: '#2563eb' });
  });
});

describe('撤销 / 重做', () => {
  const editA: Edit = { type: 'set-base', id: 'brand.500', color: '#111111' };
  const editB: Edit = { type: 'set-base', id: 'brand.600', color: '#222222' };

  it('编辑可撤销、可重做', () => {
    let h = initHistory(makeDoc());
    const r1 = applyWithHistory(h, editA);
    h = r1.state;
    expect(h.doc.base['brand.500']).toBe('#111111');
    expect(canUndo(h)).toBe(true);

    h = undo(h);
    expect(h.doc.base['brand.500']).toBe('#2563eb');
    expect(canRedo(h)).toBe(true);

    h = redo(h);
    expect(h.doc.base['brand.500']).toBe('#111111');
  });

  it('连续撤销按后进先出恢复', () => {
    let h = initHistory(makeDoc());
    h = applyWithHistory(h, editA).state;
    h = applyWithHistory(h, editB).state;
    h = undo(h);
    expect(h.doc.base['brand.600']).toBe('#1d4ed8');
    expect(h.doc.base['brand.500']).toBe('#111111');
    h = undo(h);
    expect(h.doc.base['brand.500']).toBe('#2563eb');
    expect(canUndo(h)).toBe(false);
    // 空栈上撤销是安全的无操作
    expect(undo(h)).toBe(h);
  });

  it('新编辑清空重做栈', () => {
    let h = initHistory(makeDoc());
    h = applyWithHistory(h, editA).state;
    h = undo(h);
    expect(canRedo(h)).toBe(true);
    h = applyWithHistory(h, editB).state;
    expect(canRedo(h)).toBe(false);
  });

  it('被拒绝的编辑不进入历史', () => {
    let h = initHistory(makeDoc());
    const { state, error } = applyWithHistory(h, {
      type: 'set-semantic',
      theme: 'light',
      id: 'color.action',
      value: { kind: 'ref', ref: 'color.action' },
    });
    expect(error).toBeDefined();
    expect(state).toBe(h);
    expect(canUndo(state)).toBe(false);
  });

  it('replace-doc（加载示例）同样可撤销', () => {
    let h = initHistory(makeDoc());
    const example = buildDefaultExample();
    h = applyWithHistory(h, { type: 'replace-doc', doc: example }).state;
    expect(h.doc).toBe(example);
    h = undo(h);
    expect(h.doc.name).toBe('test');
  });

  it('历史深度有上限', () => {
    let h = initHistory(makeDoc());
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) {
      h = applyWithHistory(h, { type: 'set-base', id: 'brand.500', color: `#${String(i % 256).padStart(2, '0')}00000` }).state;
    }
    expect(h.past.length).toBeLessThanOrEqual(HISTORY_LIMIT);
  });
});
