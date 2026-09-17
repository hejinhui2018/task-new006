import { describe, expect, it } from 'vitest';
import {
  contrastRatio,
  hexToRgb,
  isLargeText,
  normalizeHex,
  relativeLuminance,
  wcagLevel,
} from './contrast';

describe('颜色解析与归一化', () => {
  it('接受 #rgb 与 #rrggbb 并归一化为小写六位', () => {
    expect(normalizeHex('#ABC')).toBe('#aabbcc');
    expect(normalizeHex('#A1B2C3')).toBe('#a1b2c3');
    expect(normalizeHex('ff0000')).toBe('#ff0000');
  });

  it('拒绝非法输入', () => {
    expect(normalizeHex('#abcd')).toBeNull();
    expect(normalizeHex('#gg0000')).toBeNull();
    expect(normalizeHex('red')).toBeNull();
    expect(normalizeHex('')).toBeNull();
  });

  it('hexToRgb 分解通道', () => {
    expect(hexToRgb('#ff8000')).toEqual({ r: 255, g: 128, b: 0 });
    expect(hexToRgb('oops')).toBeNull();
  });
});

describe('WCAG 对比度', () => {
  it('黑/白极值：白亮度为 1，黑亮度为 0，黑白比值为 21', () => {
    expect(relativeLuminance('#ffffff')).toBeCloseTo(1, 5);
    expect(relativeLuminance('#000000')).toBeCloseTo(0, 5);
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
  });

  it('同色比值为 1，且与前景背景顺序无关', () => {
    expect(contrastRatio('#3b82f6', '#3b82f6')).toBeCloseTo(1, 5);
    expect(contrastRatio('#2563eb', '#ffffff')).toBeCloseTo(contrastRatio('#ffffff', '#2563eb'), 10);
  });

  it('已知参考值：#2563eb 对白色约 5.17', () => {
    expect(contrastRatio('#2563eb', '#ffffff')).toBeCloseTo(5.17, 1);
  });

  it('大字号判定：>=24px 或 >=18.66px 且粗体', () => {
    expect(isLargeText(24, 400)).toBe(true);
    expect(isLargeText(18.66, 700)).toBe(true);
    expect(isLargeText(18.66, 400)).toBe(false);
    expect(isLargeText(16, 700)).toBe(false);
  });

  it('等级阈值：7 / 4.5 / 大字号 3', () => {
    expect(wcagLevel(7, 16, 400)).toBe('AAA');
    expect(wcagLevel(6.9, 16, 400)).toBe('AA');
    expect(wcagLevel(4.5, 16, 400)).toBe('AA');
    expect(wcagLevel(4.4, 16, 400)).toBe('fail');
    expect(wcagLevel(3.5, 24, 700)).toBe('AA-large');
    expect(wcagLevel(3.5, 14, 400)).toBe('fail');
    expect(wcagLevel(2.9, 24, 700)).toBe('fail');
  });
});
