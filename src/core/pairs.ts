import { contrastRatio, wcagLevel, type WcagLevel } from './contrast';
import { resolveToken, THEME_IDS, type Resolution, type ThemeDoc, type ThemeId } from './tokens';

/**
 * 对比度检查对：把“哪段文字放在哪种背景上”登记为数据，
 * 前景/背景都只能是语义令牌 id —— 检查器沿依赖图解析出实际颜色再计算。
 */
export interface ContrastPair {
  id: string;
  /** 场景名，例如“主要按钮 · 悬停” */
  label: string;
  /** 使用位置，例如“页面正文”“按钮组件” */
  usage: string;
  fg: string;
  bg: string;
  fontSize: number;
  fontWeight: number;
  /** 诊断面板里实际渲染的示例文本 */
  sample: string;
  /** WCAG 豁免（如禁用态），仍显示比值但不计为问题 */
  exempt?: boolean;
}

export const CONTRAST_PAIRS: ContrastPair[] = [
  { id: 'heading', label: '页面标题', usage: '页面头部', fg: 'color.text.heading', bg: 'color.bg.canvas', fontSize: 24, fontWeight: 700, sample: '本月品牌数据总览' },
  { id: 'body', label: '正文文字', usage: '文章 / 列表页', fg: 'color.text.primary', bg: 'color.bg.canvas', fontSize: 16, fontWeight: 400, sample: '品牌色更新后将同步到全部页面。' },
  { id: 'secondary', label: '次级说明文字', usage: '表单说明 / 卡片摘要', fg: 'color.text.secondary', bg: 'color.bg.canvas', fontSize: 14, fontWeight: 400, sample: '最后更新于 2026-09-17，共 12 个页面引用。' },
  { id: 'link', label: '正文链接', usage: '文章页', fg: 'color.text.link', bg: 'color.bg.canvas', fontSize: 16, fontWeight: 400, sample: '查看《品牌色使用规范》' },
  { id: 'card-body', label: '卡片正文', usage: '数据卡片', fg: 'color.text.primary', bg: 'color.bg.surface', fontSize: 14, fontWeight: 400, sample: '主按钮点击率 4.8%，环比上升 0.6%。' },
  { id: 'btn-primary', label: '主要按钮', usage: '按钮组件', fg: 'color.text.on-accent', bg: 'color.accent.default', fontSize: 14, fontWeight: 600, sample: '保存更改' },
  { id: 'btn-primary-hover', label: '主要按钮 · 悬停', usage: '按钮组件', fg: 'color.text.on-accent', bg: 'color.accent.hover', fontSize: 14, fontWeight: 600, sample: '保存更改' },
  { id: 'btn-secondary', label: '次要按钮', usage: '按钮组件', fg: 'color.accent.text', bg: 'color.accent.subtle', fontSize: 14, fontWeight: 600, sample: '查看详情' },
  { id: 'btn-danger', label: '危险按钮', usage: '按钮组件', fg: 'color.text.on-danger', bg: 'color.danger.default', fontSize: 14, fontWeight: 600, sample: '删除页面' },
  { id: 'btn-disabled', label: '禁用按钮（WCAG 豁免）', usage: '按钮组件', fg: 'color.text.disabled', bg: 'color.bg.disabled', fontSize: 14, fontWeight: 600, sample: '保存更改', exempt: true },
  { id: 'placeholder', label: '输入框占位文字', usage: '表单组件', fg: 'color.text.placeholder', bg: 'color.bg.surface', fontSize: 14, fontWeight: 400, sample: '请输入页面名称' },
  { id: 'badge', label: '状态徽章', usage: '列表页', fg: 'color.badge.text', bg: 'color.badge.bg', fontSize: 12, fontWeight: 600, sample: '已发布' },
  { id: 'alert-error', label: '错误提示', usage: '表单 / 操作反馈', fg: 'color.danger.text', bg: 'color.danger.surface', fontSize: 14, fontWeight: 400, sample: '保存失败：页面名称不能为空。' },
  { id: 'alert-success', label: '成功提示', usage: '操作反馈', fg: 'color.success.text', bg: 'color.success.surface', fontSize: 14, fontWeight: 400, sample: '主题已发布，12 个页面已更新。' },
  { id: 'nav-inverse', label: '反色导航文字', usage: '顶部导航', fg: 'color.text.inverse', bg: 'color.bg.inverse', fontSize: 14, fontWeight: 500, sample: '产品 · 文档 · 关于我们' },
];

export interface PairResult {
  pair: ContrastPair;
  theme: ThemeId;
  fg: Resolution;
  bg: Resolution;
  /** 令牌解析失败时为 undefined */
  ratio?: number;
  level?: WcagLevel;
}

/** 对全部主题评估所有检查对。 */
export function evaluatePairs(doc: ThemeDoc): PairResult[] {
  const results: PairResult[] = [];
  for (const theme of THEME_IDS) {
    for (const pair of CONTRAST_PAIRS) {
      const fg = resolveToken(pair.fg, theme, doc);
      const bg = resolveToken(pair.bg, theme, doc);
      if (fg.ok && bg.ok) {
        const ratio = contrastRatio(fg.color, bg.color);
        results.push({ pair, theme, fg, bg, ratio, level: wcagLevel(ratio, pair.fontSize, pair.fontWeight) });
      } else {
        results.push({ pair, theme, fg, bg });
      }
    }
  }
  return results;
}

/** 该检查对是否受指定令牌影响（用于编辑器里的“影响面”提示）。 */
export function pairDependsOn(result: PairResult, tokenId: string): boolean {
  return result.fg.chain.includes(tokenId) || result.bg.chain.includes(tokenId);
}
