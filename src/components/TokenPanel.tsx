import { useEffect, useMemo, useState } from 'react';
import {
  getDependents,
  resolveTheme,
  resolveToken,
  THEME_LABELS,
  type ThemeDoc,
  type ThemeId,
} from '../core/tokens';
import type { Selection } from '../App';
import type { EditTarget } from './TokenEditor';

interface TokenPanelProps {
  doc: ThemeDoc;
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
  onEdit: (t: EditTarget) => void;
}

function Swatch({ color, broken }: { color?: string; broken?: boolean }) {
  if (broken || !color) return <span className="swatch swatch-broken" title="无法解析">!</span>;
  return <span className="swatch" style={{ background: color }} />;
}

/** 左侧面板：基础令牌与语义令牌的依赖关系、来源链与“被引用于”。 */
export function TokenPanel({ doc, selection, onSelect, onEdit }: TokenPanelProps) {
  const [semTheme, setSemTheme] = useState<ThemeId>('light');
  const [filter, setFilter] = useState('');

  // 从诊断面板选中语义令牌时，同步切换到对应主题页签
  useEffect(() => {
    if (selection?.kind === 'semantic') setSemTheme(selection.theme);
  }, [selection]);

  const resolutions = useMemo(() => resolveTheme(semTheme, doc), [doc, semTheme]);

  /** 每个令牌被直接引用的次数（两个主题合计），用于基础令牌行的徽标 */
  const directRefCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const theme of ['light', 'dark'] as const) {
      for (const value of Object.values(doc.themes[theme])) {
        if (value.kind === 'ref') counts.set(value.ref, (counts.get(value.ref) ?? 0) + 1);
      }
    }
    return counts;
  }, [doc]);

  /** 选中基础令牌时：所有（传递）依赖它的语义令牌，用于高亮 */
  const dependentSet = useMemo(() => {
    if (selection?.kind !== 'base') return null;
    return new Set(getDependents(doc, selection.id).map((d) => `${d.theme}:${d.id}`));
  }, [doc, selection]);

  /** 选中语义令牌时：其来源链上的所有令牌 id，用于高亮 */
  const chainSet = useMemo(() => {
    if (selection?.kind !== 'semantic') return null;
    const r = resolveToken(selection.id, selection.theme, doc);
    return new Set(r.chain);
  }, [doc, selection]);

  const q = filter.trim().toLowerCase();
  const match = (id: string) => !q || id.toLowerCase().includes(q);

  const baseIds = Object.keys(doc.base).filter(match);
  const semanticIds = Object.keys(doc.themes[semTheme]).filter(match);

  return (
    <aside className="panel panel-left">
      <div className="panel-toolbar">
        <span className="panel-title">令牌依赖</span>
        <input
          className="filter-input"
          placeholder="筛选令牌…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
      </div>

      <div className="panel-scroll">
        <div className="section-head">
          <span>基础令牌</span>
          <span className="section-hint">跨主题共享</span>
        </div>
        <div className="token-list">
          {baseIds.map((id) => {
            const inChain = chainSet?.has(id) ?? false;
            const selected = selection?.kind === 'base' && selection.id === id;
            return (
              <div
                key={id}
                className={`token-row ${selected ? 'is-selected' : ''} ${inChain ? 'is-linked' : ''}`}
                onClick={() => onSelect(selected ? null : { kind: 'base', id })}
              >
                <Swatch color={doc.base[id]} />
                <span className="token-id">{id}</span>
                <code className="token-val">{doc.base[id]}</code>
                <span className="token-meta" title="被直接引用次数（两个主题合计）">
                  ×{directRefCounts.get(id) ?? 0}
                </span>
                <button
                  className="row-edit"
                  title="编辑该基础令牌"
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit({ kind: 'base', id });
                  }}
                >
                  ✎
                </button>
              </div>
            );
          })}
          {baseIds.length === 0 && <div className="empty-hint">无匹配的基础令牌</div>}
        </div>

        <div className="section-head">
          <span>语义令牌</span>
          <div className="seg seg-sm">
            {(['light', 'dark'] as const).map((t) => (
              <button key={t} className={semTheme === t ? 'active' : ''} onClick={() => setSemTheme(t)}>
                {THEME_LABELS[t]}
              </button>
            ))}
          </div>
        </div>
        <div className="token-list">
          {semanticIds.map((id) => {
            const value = doc.themes[semTheme][id];
            const r = resolutions.get(id);
            const selected =
              selection?.kind === 'semantic' && selection.id === id && selection.theme === semTheme;
            const highlighted =
              (dependentSet?.has(`${semTheme}:${id}`) ?? false) || (chainSet?.has(id) ?? false);
            return (
              <div
                key={id}
                className={`token-row ${selected ? 'is-selected' : ''} ${highlighted ? 'is-linked' : ''} ${r && !r.ok ? 'has-error' : ''}`}
                onClick={() => onSelect(selected ? null : { kind: 'semantic', id, theme: semTheme })}
              >
                <Swatch color={r?.ok ? r.color : undefined} broken={r ? !r.ok : false} />
                <span className="token-id">{id}</span>
                <code className="token-val">
                  {value.kind === 'ref' ? `→ ${value.ref}` : value.color}
                </code>
                {r && !r.ok && (
                  <span className="token-warn" title={r.error.type === 'cycle' ? '存在循环依赖' : '引用了不存在的令牌'}>
                    ⚠
                  </span>
                )}
                <button
                  className="row-edit"
                  title={`编辑${THEME_LABELS[semTheme]}主题下的该令牌`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onEdit({ kind: 'semantic', id, theme: semTheme });
                  }}
                >
                  ✎
                </button>
              </div>
            );
          })}
          {semanticIds.length === 0 && <div className="empty-hint">无匹配的语义令牌</div>}
        </div>

        <SelectionDetail doc={doc} selection={selection} onSelect={onSelect} />
      </div>
    </aside>
  );
}

/** 选中令牌的详情：语义令牌显示来源链，基础令牌显示“被引用于”。 */
function SelectionDetail({
  doc,
  selection,
  onSelect,
}: {
  doc: ThemeDoc;
  selection: Selection | null;
  onSelect: (s: Selection | null) => void;
}) {
  if (!selection) {
    return (
      <div className="detail-card is-empty">
        点击令牌查看来源链与被引用关系；点击 ✎ 编辑。修改基础令牌会沿依赖图传播到所有组件、主题与状态。
      </div>
    );
  }

  if (selection.kind === 'base') {
    const color = doc.base[selection.id];
    if (color === undefined) return <div className="detail-card is-empty">令牌已不存在</div>;
    const dependents = getDependents(doc, selection.id);
    return (
      <div className="detail-card">
        <div className="detail-title">
          <Swatch color={color} />
          <span className="detail-id">{selection.id}</span>
          <code>{color}</code>
        </div>
        <div className="detail-sub">被引用于（{dependents.length} 个语义令牌，含间接依赖）</div>
        <div className="chip-list">
          {dependents.length === 0 && <span className="empty-hint">没有令牌引用它</span>}
          {dependents.map((d) => (
            <button
              key={`${d.theme}:${d.id}`}
              className="chip"
              title={d.depth === 1 ? '直接引用' : `间接依赖（${d.depth} 层）`}
              onClick={() => onSelect({ kind: 'semantic', id: d.id, theme: d.theme })}
            >
              <span className="chip-theme">{THEME_LABELS[d.theme]}</span>
              {d.id}
              {d.depth > 1 && <span className="chip-depth">↳{d.depth}</span>}
            </button>
          ))}
        </div>
      </div>
    );
  }

  const r = resolveToken(selection.id, selection.theme, doc);
  const dependents = getDependents(doc, selection.id).filter(
    (d) => d.theme === selection.theme && d.depth === 1,
  );
  return (
    <div className="detail-card">
      <div className="detail-title">
        <Swatch color={r.ok ? r.color : undefined} broken={!r.ok} />
        <span className="detail-id">{selection.id}</span>
        <span className="chip-theme">{THEME_LABELS[selection.theme]}</span>
      </div>
      <div className="detail-sub">来源链</div>
      <div className="chain">
        {r.chain.map((id, i) => {
          const isLast = i === r.chain.length - 1;
          const inBase = id in doc.base;
          return (
            <span key={`${id}-${i}`} className="chain-item">
              {i > 0 && <span className="chain-arrow">→</span>}
              <button
                className="chip"
                onClick={() =>
                  inBase && !(id in doc.themes[selection.theme])
                    ? onSelect({ kind: 'base', id })
                    : onSelect({ kind: 'semantic', id, theme: selection.theme })
                }
              >
                {id}
              </button>
              {isLast && r.ok && <code className="chain-color">{r.color}</code>}
            </span>
          );
        })}
      </div>
      {!r.ok && (
        <div className="detail-error">
          {r.error.type === 'cycle'
            ? `循环依赖：${r.error.cycle.join(' → ')}`
            : `缺失引用：${r.error.missingRef} 不存在`}
        </div>
      )}
      {dependents.length > 0 && (
        <>
          <div className="detail-sub">被引用于（同主题 · 直接）</div>
          <div className="chip-list">
            {dependents.map((d) => (
              <button
                key={d.id}
                className="chip"
                onClick={() => onSelect({ kind: 'semantic', id: d.id, theme: d.theme })}
              >
                {d.id}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
