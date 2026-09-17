import { describe, expect, it } from 'vitest';
import { buildBrokenExample, buildDefaultExample, EXAMPLES, getExample } from './examples';
import { evaluatePairs } from './pairs';
import { findProblems, resolveTheme } from './tokens';

describe('内置示例：默认主题', () => {
  const doc = buildDefaultExample();

  it('没有循环依赖与缺失引用', () => {
    const { cycles, missing } = findProblems(doc);
    expect(cycles).toEqual([]);
    expect(missing).toEqual([]);
  });

  it('全部语义令牌在两个主题下都可解析', () => {
    for (const theme of ['light', 'dark'] as const) {
      for (const [id, r] of resolveTheme(theme, doc)) {
        expect(r.ok, `${theme}:${id} 应可解析`).toBe(true);
      }
    }
  });

  it('浅/深两个主题下，所有非豁免检查对都达到 AA', () => {
    const failures = evaluatePairs(doc).filter(
      (r) => !r.pair.exempt && (r.level === undefined || r.level === 'fail'),
    );
    expect(
      failures.map((f) => `${f.theme}/${f.pair.id}: ${f.ratio?.toFixed(2) ?? '无法解析'}`),
    ).toEqual([]);
  });
});

describe('内置示例：高对比 · 问题场景', () => {
  const doc = buildBrokenExample();

  it('包含至少一个循环依赖', () => {
    const { cycles } = findProblems(doc);
    expect(cycles.length).toBeGreaterThanOrEqual(1);
    const flat = cycles.flatMap((c) => c.cycle);
    expect(flat).toContain('color.badge.bg');
    expect(flat).toContain('color.badge.text');
  });

  it('包含缺失引用并定位到持有者', () => {
    const { missing } = findProblems(doc);
    expect(missing).toContainEqual({ theme: 'light', token: 'color.text.muted', missingRef: 'neutral.450' });
  });

  it('包含多处对比度不达标（两个主题都有）', () => {
    const failures = evaluatePairs(doc).filter((r) => !r.pair.exempt && r.level === 'fail');
    expect(failures.length).toBeGreaterThanOrEqual(4);
    expect(failures.some((f) => f.theme === 'light')).toBe(true);
    expect(failures.some((f) => f.theme === 'dark')).toBe(true);
  });

  it('豁免的禁用态不计入问题，但仍给出比值', () => {
    const disabled = evaluatePairs(doc).find((r) => r.pair.id === 'btn-disabled' && r.theme === 'light');
    expect(disabled?.pair.exempt).toBe(true);
    expect(disabled?.ratio).toBeGreaterThan(1);
  });
});

describe('示例注册表', () => {
  it('包含默认主题与问题场景，且每次构建都是全新副本', () => {
    expect(EXAMPLES.map((e) => e.id)).toEqual(['default', 'broken-contrast']);
    const a = getExample('default')!.build();
    const b = getExample('default')!.build();
    expect(a).not.toBe(b);
    a.base['blue.600'] = '#000000';
    expect(b.base['blue.600']).not.toBe('#000000');
  });
});
