import type { ThemeDoc, TokenValue } from './tokens';

/**
 * 内置示例。每个示例都是一份完整、自包含的 ThemeDoc：
 * 基础色板 + 浅/深两套语义映射。“恢复示例”即重新构建对应文档。
 */

const ref = (ref: string): TokenValue => ({ kind: 'ref', ref });
const color = (color: string): TokenValue => ({ kind: 'color', color });

/** 默认示例与问题场景共用同一套基础色板，问题出在语义映射层。 */
function basePalette(): Record<string, string> {
  return {
    'neutral.0': '#ffffff',
    'neutral.50': '#f8fafc',
    'neutral.100': '#f1f5f9',
    'neutral.200': '#e2e8f0',
    'neutral.300': '#cbd5e1',
    'neutral.400': '#94a3b8',
    'neutral.500': '#64748b',
    'neutral.600': '#475569',
    'neutral.700': '#334155',
    'neutral.800': '#1e293b',
    'neutral.900': '#0f172a',
    'blue.50': '#eff6ff',
    'blue.200': '#bfdbfe',
    'blue.300': '#93c5fd',
    'blue.400': '#60a5fa',
    'blue.500': '#3b82f6',
    'blue.600': '#2563eb',
    'blue.700': '#1d4ed8',
    'blue.800': '#1e40af',
    'blue.950': '#172554',
    'red.50': '#fef2f2',
    'red.400': '#f87171',
    'red.600': '#dc2626',
    'red.700': '#b91c1c',
    'red.950': '#450a0a',
    'green.50': '#f0fdf4',
    'green.400': '#4ade80',
    'green.800': '#166534',
    'green.950': '#052e16',
    'yellow.400': '#facc15',
    'yellow.500': '#eab308',
  };
}

function healthyLight(): Record<string, TokenValue> {
  return {
    'color.bg.canvas': ref('neutral.50'),
    'color.bg.surface': ref('neutral.0'),
    'color.bg.subtle': ref('neutral.100'),
    'color.bg.inverse': ref('neutral.900'),
    'color.bg.disabled': ref('neutral.100'),
    'color.text.heading': ref('neutral.900'),
    'color.text.primary': ref('neutral.700'),
    'color.text.secondary': ref('neutral.500'),
    'color.text.muted': ref('color.text.secondary'),
    'color.text.placeholder': ref('neutral.500'),
    'color.text.inverse': ref('neutral.0'),
    'color.text.link': ref('blue.600'),
    'color.text.on-accent': ref('neutral.0'),
    'color.text.on-danger': ref('neutral.0'),
    'color.text.disabled': ref('neutral.400'),
    'color.accent.default': ref('blue.600'),
    'color.accent.hover': ref('blue.700'),
    'color.accent.active': ref('blue.800'),
    'color.accent.subtle': ref('blue.50'),
    'color.accent.text': ref('blue.700'),
    'color.danger.default': ref('red.600'),
    'color.danger.hover': ref('red.700'),
    'color.danger.text': ref('red.700'),
    'color.danger.surface': ref('red.50'),
    'color.success.text': ref('green.800'),
    'color.success.surface': ref('green.50'),
    'color.badge.bg': ref('color.accent.subtle'),
    'color.badge.text': ref('color.accent.text'),
    'color.border.default': ref('neutral.200'),
    'color.border.strong': ref('neutral.300'),
    'color.border.focus': ref('blue.500'),
  };
}

function healthyDark(): Record<string, TokenValue> {
  return {
    'color.bg.canvas': ref('neutral.900'),
    'color.bg.surface': ref('neutral.800'),
    'color.bg.subtle': ref('neutral.700'),
    'color.bg.inverse': ref('neutral.50'),
    'color.bg.disabled': ref('neutral.800'),
    'color.text.heading': ref('neutral.0'),
    'color.text.primary': ref('neutral.200'),
    'color.text.secondary': ref('neutral.400'),
    'color.text.muted': ref('color.text.secondary'),
    'color.text.placeholder': ref('neutral.400'),
    'color.text.inverse': ref('neutral.900'),
    'color.text.link': ref('blue.400'),
    'color.text.on-accent': ref('neutral.900'),
    'color.text.on-danger': ref('neutral.0'),
    'color.text.disabled': ref('neutral.500'),
    'color.accent.default': ref('blue.400'),
    'color.accent.hover': ref('blue.300'),
    'color.accent.active': ref('blue.200'),
    'color.accent.subtle': ref('blue.950'),
    'color.accent.text': ref('blue.300'),
    'color.danger.default': ref('red.600'),
    'color.danger.hover': ref('red.700'),
    'color.danger.text': ref('red.400'),
    'color.danger.surface': ref('red.950'),
    'color.success.text': ref('green.400'),
    'color.success.surface': ref('green.950'),
    'color.badge.bg': ref('color.accent.subtle'),
    'color.badge.text': ref('color.accent.text'),
    'color.border.default': ref('neutral.700'),
    'color.border.strong': ref('neutral.500'),
    'color.border.focus': ref('blue.400'),
  };
}

export function buildDefaultExample(): ThemeDoc {
  return {
    name: '默认主题',
    base: basePalette(),
    themes: { light: healthyLight(), dark: healthyDark() },
  };
}

/**
 * 故意有问题的“高对比方案”：品牌组尝试提高对比度，但语义映射改错了——
 * 主色换成黄色后白字完全不可读、次级文字太浅、引用了不存在的令牌、
 * 徽章两个令牌互相引用形成循环。用于演示诊断面板能抓出哪些问题。
 */
export function buildBrokenExample(): ThemeDoc {
  const light: Record<string, TokenValue> = {
    ...healthyLight(),
    // 主色换成亮黄，白字对比度严重不足
    'color.accent.default': ref('yellow.400'),
    'color.accent.hover': ref('yellow.500'),
    'color.accent.active': ref('yellow.500'),
    'color.accent.text': ref('yellow.500'),
    // 语义令牌也可以直接持有颜色（不引用基础令牌）
    'color.accent.subtle': color('#fffbe6'),
    // 文字色过浅
    'color.text.secondary': ref('neutral.300'),
    'color.text.placeholder': ref('neutral.200'),
    'color.text.link': ref('yellow.500'),
    // 缺失引用：neutral.450 不存在
    'color.text.muted': ref('neutral.450'),
    // 循环依赖：两个徽章令牌互相引用
    'color.badge.bg': ref('color.badge.text'),
    'color.badge.text': ref('color.badge.bg'),
  };
  const dark: Record<string, TokenValue> = {
    ...healthyDark(),
    'color.accent.default': ref('yellow.400'),
    'color.accent.hover': ref('yellow.500'),
    'color.accent.active': ref('yellow.500'),
    'color.text.on-accent': ref('neutral.0'),
    'color.text.primary': ref('neutral.500'),
    'color.text.secondary': ref('neutral.600'),
    'color.text.link': ref('neutral.500'),
    'color.badge.bg': ref('color.badge.text'),
    'color.badge.text': ref('color.badge.bg'),
  };
  return {
    name: '高对比方案 · 问题场景',
    base: basePalette(),
    themes: { light, dark },
  };
}

export interface ExampleDef {
  id: string;
  label: string;
  description: string;
  build: () => ThemeDoc;
}

export const EXAMPLES: ExampleDef[] = [
  {
    id: 'default',
    label: '默认主题',
    description: '健康基线：浅/深主题全部通过对比度检查',
    build: buildDefaultExample,
  },
  {
    id: 'broken-contrast',
    label: '高对比 · 问题场景',
    description: '故意包含对比度不达标、缺失引用与循环依赖',
    build: buildBrokenExample,
  },
];

export function getExample(id: string): ExampleDef | undefined {
  return EXAMPLES.find((e) => e.id === id);
}
