import { useMemo, type CSSProperties } from 'react';
import { resolveTheme, THEME_LABELS, type ThemeDoc, type ThemeId } from '../core/tokens';

export type PreviewMode = 'light' | 'dark' | 'both';

/** 令牌 id -> CSS 变量名，例如 color.accent.default -> --t-color-accent-default */
export function tokenVar(id: string): string {
  return '--t-' + id.replace(/[^a-zA-Z0-9]+/g, '-');
}

/** 无法解析（循环/缺失）的令牌用醒目的品红兜底，让问题在预览中一眼可见 */
const BROKEN_COLOR = '#ff00ff';

/**
 * 把解析结果摊平成 CSS 变量。预览组件只引用这些变量（见 preview.css），
 * 没有任何绕开依赖图的硬编码颜色。
 */
function buildVars(doc: ThemeDoc, theme: ThemeId): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const [id, color] of Object.entries(doc.base)) vars[tokenVar(id)] = color;
  for (const [id, r] of resolveTheme(theme, doc)) {
    vars[tokenVar(id)] = r.ok ? r.color : BROKEN_COLOR;
  }
  return vars;
}

interface PreviewPanelProps {
  doc: ThemeDoc;
  mode: PreviewMode;
  onModeChange: (m: PreviewMode) => void;
}

export function PreviewPanel({ doc, mode, onModeChange }: PreviewPanelProps) {
  return (
    <section className="panel panel-center">
      <div className="panel-toolbar">
        <span className="panel-title">组件预览</span>
        <div className="seg">
          {(
            [
              ['light', '浅色'],
              ['dark', '深色'],
              ['both', '上下对比'],
            ] as const
          ).map(([m, label]) => (
            <button key={m} className={mode === m ? 'active' : ''} onClick={() => onModeChange(m)}>
              {label}
            </button>
          ))}
        </div>
        <span className="toolbar-hint">全部颜色来自令牌解析；悬停可交互，另附静态状态变体</span>
      </div>
      <div className="preview-scroll">
        {(mode === 'light' || mode === 'both') && <PreviewSurface doc={doc} theme="light" />}
        {(mode === 'dark' || mode === 'both') && <PreviewSurface doc={doc} theme="dark" />}
      </div>
    </section>
  );
}

function PreviewSurface({ doc, theme }: { doc: ThemeDoc; theme: ThemeId }) {
  const vars = useMemo(() => buildVars(doc, theme), [doc, theme]);
  return (
    <div className="preview-item">
      <div className="preview-item-label">{THEME_LABELS[theme]}主题</div>
      <div className="pv-scope" style={vars as CSSProperties}>
        <div className="pv-nav">
          <span className="pv-nav-brand">◆ 品牌官网</span>
          <span className="pv-nav-links">产品　文档　关于我们</span>
          <button className="pv-btn pv-btn-primary pv-btn-sm">开始使用</button>
        </div>

        <div className="pv-body">
          <section className="pv-section">
            <h1 className="pv-h1">本月品牌数据总览</h1>
            <p className="pv-text">
              品牌色更新后将同步到全部页面。这是一段正文文字，用于检查正文字色与画布背景的对比度表现。
            </p>
            <p className="pv-text-secondary">最后更新于 2026-09-17，共 12 个页面引用该主题。</p>
            <p className="pv-text">
              <a className="pv-link" href="#" onClick={(e) => e.preventDefault()}>
                查看《品牌色使用规范》
              </a>
            </p>
          </section>

          <section className="pv-section">
            <div className="pv-label">按钮 · 四种状态</div>
            <div className="pv-row">
              <StateButton className="pv-btn-primary" label="主要" />
              <StateButton className="pv-btn-secondary" label="次要" />
              <StateButton className="pv-btn-danger" label="危险" />
            </div>
          </section>

          <section className="pv-section">
            <div className="pv-label">徽章与提示</div>
            <div className="pv-row">
              <span className="pv-badge">已发布</span>
              <span className="pv-badge">审核中</span>
            </div>
            <div className="pv-alert pv-alert-error">保存失败：页面名称不能为空。</div>
            <div className="pv-alert pv-alert-success">主题已发布，12 个页面已更新。</div>
          </section>

          <section className="pv-section">
            <div className="pv-label">卡片</div>
            <div className="pv-card">
              <div className="pv-card-title">主按钮点击率</div>
              <div className="pv-card-metric">4.8%</div>
              <div className="pv-card-sub">环比上升 0.6%，主要来自移动端。</div>
              <div className="pv-row">
                <button className="pv-btn pv-btn-primary pv-btn-sm">查看报告</button>
                <button className="pv-btn pv-btn-secondary pv-btn-sm">导出</button>
              </div>
            </div>
          </section>

          <section className="pv-section">
            <div className="pv-label">表单</div>
            <label className="pv-field">
              <span className="pv-field-label">页面名称</span>
              <input className="pv-input" placeholder="请输入页面名称" />
            </label>
            <label className="pv-field">
              <span className="pv-field-label">禁用输入框</span>
              <input className="pv-input" placeholder="不可编辑" disabled />
            </label>
            <p className="pv-help">名称将用于页面标题与分享链接。</p>
          </section>
        </div>
      </div>
    </div>
  );
}

/** 同一按钮的 默认/悬停/按下/禁用 四个静态变体（另支持真实悬停）。 */
function StateButton({ className, label }: { className: string; label: string }) {
  return (
    <div className="pv-state-group">
      <div className="pv-row">
        <button className={`pv-btn ${className}`}>{label}</button>
        <button className={`pv-btn ${className} is-hover`}>悬停</button>
        <button className={`pv-btn ${className} is-active`}>按下</button>
        <button className={`pv-btn ${className}`} disabled>
          禁用
        </button>
      </div>
    </div>
  );
}
