import { useEffect, useMemo, useState } from 'react';
import { normalizeHex } from '../core/contrast';
import { pairDependsOn, type PairResult } from '../core/pairs';
import type { Edit } from '../core/store';
import { getDependents, resolveToken, THEME_LABELS, type ThemeDoc, type ThemeId } from '../core/tokens';

export type EditTarget =
  | { kind: 'base'; id: string }
  | { kind: 'semantic'; id: string; theme: ThemeId };

interface TokenEditorProps {
  target: EditTarget;
  doc: ThemeDoc;
  pairResults: PairResult[];
  /** 返回 null 表示成功，否则为拒绝原因（如循环依赖） */
  onApply: (edit: Edit) => string | null;
  onClose: () => void;
}

/** 令牌编辑弹窗：基础令牌改颜色；语义令牌改引用或直接颜色。 */
export function TokenEditor({ target, doc, pairResults, onApply, onClose }: TokenEditorProps) {
  const isBase = target.kind === 'base';
  const current = isBase
    ? ({ kind: 'color', color: doc.base[target.id] } as const)
    : doc.themes[target.theme][target.id];

  const [mode, setMode] = useState<'ref' | 'color'>(current?.kind === 'ref' ? 'ref' : 'color');
  const [hexText, setHexText] = useState(current?.kind === 'color' ? current.color : '#2563eb');
  const [refId, setRefId] = useState(current?.kind === 'ref' ? current.ref : '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const normalized = normalizeHex(hexText);

  /** 影响面：多少语义令牌、多少对比度检查与该令牌相关 */
  const impact = useMemo(() => {
    if (!isBase) return null;
    const dependents = getDependents(doc, target.id);
    const affected = pairResults.filter((r) => pairDependsOn(r, target.id));
    const failing = affected.filter((r) => !r.pair.exempt && r.level === 'fail').length;
    return { tokens: dependents.length, pairs: affected.length, failing };
  }, [doc, pairResults, target, isBase]);

  /** 语义令牌的可引用对象：全部基础令牌 + 同主题的其他语义令牌 */
  const refOptions = useMemo(() => {
    if (isBase) return { base: [] as string[], semantic: [] as string[] };
    return {
      base: Object.keys(doc.base),
      semantic: Object.keys(doc.themes[target.theme]).filter((id) => id !== target.id),
    };
  }, [doc, target, isBase]);

  const resolvedNow = !isBase ? resolveToken(target.id, target.theme, doc) : null;

  const submit = () => {
    let edit: Edit;
    if (isBase) {
      edit = { type: 'set-base', id: target.id, color: hexText };
    } else if (mode === 'ref') {
      edit = { type: 'set-semantic', theme: target.theme, id: target.id, value: { kind: 'ref', ref: refId } };
    } else {
      edit = { type: 'set-semantic', theme: target.theme, id: target.id, value: { kind: 'color', color: hexText } };
    }
    const err = onApply(edit);
    if (err) {
      setError(err); // 例如“循环依赖被拒绝”——留在弹窗内展示
    } else {
      onClose();
    }
  };

  const title = isBase
    ? `编辑基础令牌 ${target.id}`
    : `编辑语义令牌 ${target.id}（${THEME_LABELS[target.theme]}主题）`;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">{title}</div>

        {isBase && (
          <div className="impact-line">
            影响 {impact?.tokens ?? 0} 个语义令牌 · {impact?.pairs ?? 0} 项对比度检查
            {impact && impact.failing > 0 ? `（当前 ${impact.failing} 项不达标）` : ''}
            ，修改将同步到两个主题与所有状态。
          </div>
        )}

        {!isBase && (
          <div className="mode-switch">
            <label className={mode === 'ref' ? 'active' : ''}>
              <input type="radio" checked={mode === 'ref'} onChange={() => setMode('ref')} />
              引用令牌
            </label>
            <label className={mode === 'color' ? 'active' : ''}>
              <input type="radio" checked={mode === 'color'} onChange={() => setMode('color')} />
              直接指定颜色
            </label>
          </div>
        )}

        {(isBase || mode === 'color') && (
          <div className="field-row">
            <input
              type="color"
              value={normalized ?? '#000000'}
              onChange={(e) => {
                setHexText(e.target.value);
                setError(null);
              }}
            />
            <input
              className="hex-input"
              value={hexText}
              onChange={(e) => {
                setHexText(e.target.value);
                setError(null);
              }}
              placeholder="#rrggbb"
              spellCheck={false}
            />
            <span className={`hex-status ${normalized ? 'ok' : 'bad'}`}>
              {normalized ? `✓ ${normalized}` : '格式无效'}
            </span>
          </div>
        )}

        {!isBase && mode === 'ref' && (
          <div className="field-row">
            <select
              className="ref-select"
              value={refId}
              onChange={(e) => {
                setRefId(e.target.value);
                setError(null);
              }}
            >
              <option value="" disabled>
                选择要引用的令牌…
              </option>
              <optgroup label="基础令牌">
                {refOptions.base.map((id) => (
                  <option key={id} value={id}>
                    {id}（{doc.base[id]}）
                  </option>
                ))}
              </optgroup>
              <optgroup label={`语义令牌（${THEME_LABELS[target.theme]}）`}>
                {refOptions.semantic.map((id) => (
                  <option key={id} value={id}>
                    {id}
                  </option>
                ))}
              </optgroup>
            </select>
          </div>
        )}

        {!isBase && resolvedNow && (
          <div className="current-line">
            当前解析：
            {resolvedNow.ok ? (
              <>
                <span className="swatch" style={{ background: resolvedNow.color }} />
                <code>{resolvedNow.color}</code>
                <span className="current-chain">（{resolvedNow.chain.join(' → ')}）</span>
              </>
            ) : (
              <span className="detail-error">
                {resolvedNow.error.type === 'cycle' ? '存在循环依赖' : `缺失引用 ${resolvedNow.error.missingRef}`}
              </span>
            )}
          </div>
        )}

        {error && <div className="modal-error">⚠ {error}</div>}

        <div className="modal-actions">
          <button className="hbtn" onClick={onClose}>
            取消
          </button>
          <button
            className="hbtn is-primary"
            disabled={(isBase || mode === 'color') ? !normalized : !refId}
            onClick={submit}
          >
            应用
          </button>
        </div>
      </div>
    </div>
  );
}
