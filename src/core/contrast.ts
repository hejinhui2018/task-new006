/**
 * WCAG 2.x 对比度计算。
 * 仅支持不透明 #rgb / #rrggbb 颜色（令牌系统不引入透明度，避免叠加后的对比度不可判定）。
 */

/** 归一化用户输入的十六进制颜色；非法输入返回 null。 */
export function normalizeHex(input: string): string | null {
  const m = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(m)) {
    return (
      '#' +
      m
        .split('')
        .map((c) => c + c)
        .join('')
        .toLowerCase()
    );
  }
  if (/^[0-9a-fA-F]{6}$/.test(m)) return '#' + m.toLowerCase();
  return null;
}

export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const n = normalizeHex(hex);
  if (!n) return null;
  return {
    r: parseInt(n.slice(1, 3), 16),
    g: parseInt(n.slice(3, 5), 16),
    b: parseInt(n.slice(5, 7), 16),
  };
}

/** WCAG 相对亮度，范围 0（黑）~1（白）。 */
export function relativeLuminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) throw new Error(`无法解析颜色：${hex}`);
  const f = (c: number): number => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(rgb.r) + 0.7152 * f(rgb.g) + 0.0722 * f(rgb.b);
}

/** 对比度比值，范围 1 ~ 21。 */
export function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relativeLuminance(fgHex);
  const l2 = relativeLuminance(bgHex);
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * WCAG “大字号”判定：>= 24px，或 >= 18.66px（14pt）且粗体（>=700）。
 */
export function isLargeText(fontSizePx: number, fontWeight: number): boolean {
  return fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);
}

export type WcagLevel = 'AAA' | 'AA' | 'AA-large' | 'fail';

export const WCAG_LEVEL_LABELS: Record<WcagLevel, string> = {
  AAA: 'AAA',
  AA: 'AA',
  'AA-large': 'AA（大字号）',
  fail: '不达标',
};

/** 根据比值与字号判定 WCAG 等级。 */
export function wcagLevel(ratio: number, fontSizePx: number, fontWeight: number): WcagLevel {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (isLargeText(fontSizePx, fontWeight) && ratio >= 3) return 'AA-large';
  return 'fail';
}
