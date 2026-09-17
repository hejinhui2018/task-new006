import { describe, expect, it } from 'vitest';
import {
  findProblems,
  getDependents,
  resolveTheme,
  resolveToken,
  wouldCreateCycle,
  type ThemeDoc,
} from './tokens';

/** 小型测试文档：base.a → sem.x → sem.y（链式），sem.z 直接引用 base.a */
function makeDoc(): ThemeDoc {
  return {
    name: 'test',
    base: { 'base.a': '#111111', 'base.b': '#eeeeee' },
    themes: {
      light: {
        'sem.x': { kind: 'ref', ref: 'base.a' },
        'sem.y': { kind: 'ref', ref: 'sem.x' },
        'sem.z': { kind: 'ref', ref: 'base.a' },
        'sem.solo': { kind: 'color', color: '#123456' },
      },
      dark: {
        'sem.x': { kind: 'ref', ref: 'base.b' },
        'sem.y': { kind: 'ref', ref: 'sem.x' },
        'sem.z': { kind: 'ref', ref: 'base.b' },
        'sem.solo': { kind: 'color', color: '#654321' },
      },
    },
  };
}

describe('依赖解析与来源链', () => {
  it('沿引用链解析到基础令牌，来源链顺序正确', () => {
    const doc = makeDoc();
    const r = resolveToken('sem.y', 'light', doc);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.color).toBe('#111111');
      expect(r.chain).toEqual(['sem.y', 'sem.x', 'base.a']);
    }
  });

  it('语义令牌可直接持有颜色', () => {
    const r = resolveToken('sem.solo', 'light', makeDoc());
    expect(r.ok && r.color === '#123456').toBe(true);
    expect(r.chain).toEqual(['sem.solo']);
  });

  it('基础令牌自身可解析', () => {
    const r = resolveToken('base.a', 'light', makeDoc());
    expect(r.ok && r.color === '#111111').toBe(true);
  });

  it('缺失引用返回错误而不是抛异常', () => {
    const doc = makeDoc();
    doc.themes.light['sem.broken'] = { kind: 'ref', ref: 'ghost.token' };
    const r = resolveToken('sem.broken', 'light', doc);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.error).toEqual({ type: 'missing', missingRef: 'ghost.token' });
    }
  });
});

describe('依赖传播', () => {
  it('修改基础令牌后，直接与间接依赖的解析结果都更新', () => {
    const doc = makeDoc();
    const before = resolveTheme('light', doc);
    expect(before.get('sem.x')).toMatchObject({ ok: true, color: '#111111' });
    expect(before.get('sem.y')).toMatchObject({ ok: true, color: '#111111' });

    const next: ThemeDoc = { ...doc, base: { ...doc.base, 'base.a': '#ff0000' } };
    const after = resolveTheme('light', next);
    expect(after.get('sem.x')).toMatchObject({ ok: true, color: '#ff0000' });
    expect(after.get('sem.y')).toMatchObject({ ok: true, color: '#ff0000' });
    expect(after.get('sem.z')).toMatchObject({ ok: true, color: '#ff0000' });
    // 不相关的令牌不受影响
    expect(after.get('sem.solo')).toMatchObject({ ok: true, color: '#123456' });
  });

  it('getDependents 找出直接与传递依赖，并标注深度', () => {
    const deps = getDependents(makeDoc(), 'base.a');
    const byId = new Map(deps.map((d) => [`${d.theme}:${d.id}`, d.depth]));
    expect(byId.get('light:sem.x')).toBe(1);
    expect(byId.get('light:sem.z')).toBe(1);
    expect(byId.get('light:sem.y')).toBe(2); // 经由 sem.x 间接依赖
    expect(byId.has('dark:sem.x')).toBe(false); // 深色主题引用的是 base.b
  });

  it('对语义令牌也能找出其下游依赖', () => {
    const deps = getDependents(makeDoc(), 'sem.x');
    expect(deps.map((d) => `${d.theme}:${d.id}`).sort()).toEqual(['dark:sem.y', 'light:sem.y']);
  });
});

describe('循环依赖', () => {
  it('解析遇到循环时返回环路径而不是死循环', () => {
    const doc = makeDoc();
    doc.themes.light['loop.a'] = { kind: 'ref', ref: 'loop.b' };
    doc.themes.light['loop.b'] = { kind: 'ref', ref: 'loop.a' };
    const r = resolveToken('loop.a', 'light', doc);
    expect(r.ok).toBe(false);
    if (!r.ok && r.error.type === 'cycle') {
      expect(r.error.cycle).toEqual(['loop.a', 'loop.b', 'loop.a']);
    } else {
      throw new Error('应返回循环错误');
    }
  });

  it('自引用也被识别为循环', () => {
    const doc = makeDoc();
    doc.themes.light['loop.self'] = { kind: 'ref', ref: 'loop.self' };
    const r = resolveToken('loop.self', 'light', doc);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.type).toBe('cycle');
  });

  it('wouldCreateCycle 预判会成环的修改并给出环路径', () => {
    const doc = makeDoc();
    // sem.y -> sem.x -> base.a；若把 sem.x 改为引用 sem.y 则成环
    expect(wouldCreateCycle(doc, 'light', 'sem.x', 'sem.y')).toEqual(['sem.x', 'sem.y', 'sem.x']);
    // 改成引用 base.b 不成环
    expect(wouldCreateCycle(doc, 'light', 'sem.x', 'base.b')).toBeNull();
  });

  it('findProblems 报告循环（按环去重）与缺失引用（定位到持有者）', () => {
    const doc = makeDoc();
    doc.themes.light['loop.a'] = { kind: 'ref', ref: 'loop.b' };
    doc.themes.light['loop.b'] = { kind: 'ref', ref: 'loop.a' };
    doc.themes.dark['sem.broken'] = { kind: 'ref', ref: 'ghost.token' };
    const { cycles, missing } = findProblems(doc);
    expect(cycles).toHaveLength(1);
    expect(cycles[0].theme).toBe('light');
    expect(cycles[0].cycle).toContain('loop.a');
    expect(cycles[0].cycle).toContain('loop.b');
    expect(missing).toEqual([{ theme: 'dark', token: 'sem.broken', missingRef: 'ghost.token' }]);
  });
});

describe('主题覆盖', () => {
  it('同一语义令牌在浅色/深色下解析为不同颜色', () => {
    const doc = makeDoc();
    expect(resolveToken('sem.x', 'light', doc)).toMatchObject({ ok: true, color: '#111111' });
    expect(resolveToken('sem.x', 'dark', doc)).toMatchObject({ ok: true, color: '#eeeeee' });
  });

  it('修改深色主题映射不影响浅色主题', () => {
    const doc = makeDoc();
    const next: ThemeDoc = {
      ...doc,
      themes: { ...doc.themes, dark: { ...doc.themes.dark, 'sem.x': { kind: 'color', color: '#00ff00' } } },
    };
    expect(resolveToken('sem.x', 'dark', next)).toMatchObject({ ok: true, color: '#00ff00' });
    expect(resolveToken('sem.x', 'light', next)).toMatchObject({ ok: true, color: '#111111' });
    // 经由 sem.x 的链也只在深色下变化
    expect(resolveToken('sem.y', 'dark', next)).toMatchObject({ ok: true, color: '#00ff00' });
    expect(resolveToken('sem.y', 'light', next)).toMatchObject({ ok: true, color: '#111111' });
  });
});
