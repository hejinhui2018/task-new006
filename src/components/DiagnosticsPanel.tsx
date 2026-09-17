import { useMemo, useState } from 'react';
import { WCAG_LEVEL_LABELS } from '../core/contrast';
import type { PairResult } from '../core/pairs';
import {
  THEME_LABELS,
  type CycleProblem,
  type MissingProblem,
  type ThemeId,
} from '../core/tokens';

interface DiagnosticsPanelProps {
  problems: { cycles: CycleProblem[]; missing: MissingProblem[] };
  results: PairResult[];
  onSelectToken: (id: string, theme: ThemeId) => void;
}

type ThemeFilter = 'all' | ThemeId;

/** 排序权重：不达标 > 无法评估 > AA大字号 > AA > AAA；豁免项永远垫底 */
function sortWeight(r: PairResult): number {
  if (r.pair.exempt) return 99;
  if (r.level === 'fail') return 0;
  if (r.level === undefined) return 1;
  if (r.level === 'AA-large') return 2;
  if (r.level === 'AA') return 3;
  return 4;
}

/** 右侧面板：循环依赖、缺失引用、对比度检查。 */
export function DiagnosticsPanel({ problems, results, onSelectToken }: DiagnosticsPanelProps) {
  const [themeFilter, setThemeFilter] = useState<ThemeFilter>('all');
  const [onlyFailures, setOnlyFailures] = useState(false);

  const { cycles, missing } = problems;

  const contrastFailures = results.filter((r) => !r.pair.exempt && r.level === 'fail').length;
  const unevaluable = results.filter((r) => !r.pair.exempt && r.level === undefined).length;

  const visible = useMemo(() => {
    return results
      .filter((r) => themeFilter === 'all' || r.theme === themeFilter)
      .filter((r) => !onlyFailures || (!r.pair.exempt && r.level !== 'AAA' && r.level !== 'AA' && r.level !== 'AA-large'))
      .slice()
      .sort((a, b) => sortWeight(a) - sortWeight(b) || (a.ratio ?? 0) - (b.ratio ?? 0));
  }, [results, themeFilter, onlyFailures]);

  const filteredCycles = cycles.filter((c) => themeFilter === 'all' || c.theme === themeFilter);
  const filteredMissing = missing.filter((m) => themeFilter === 'all' || m.theme === themeFilter);

  const allClear = cycles.length === 0 && missing.length === 0 && contrastFailures === 0 && unevaluable === 0;

  return (
    <aside className="panel panel-right">
      <div className="panel-toolbar">
        <span className="panel-title">诊断</span>
        <span className={`summary ${allClear ? 'is-clear' : 'has-issues'}`}>
          {allClear
            ? '✓ 未发现问题'
            : `循环 ${cycles.length} · 缺失 ${missing.length} · 对比度未达标 ${contrastFailures}`}
        </span>
      </div>

      <div className="panel-toolbar panel-toolbar-sub">
        <div className="seg seg-sm">
          {(
            [
              ['all', '全部主题'],
              ['light', '浅色'],
              ['dark', '深色'],
            ] as const
          ).map(([v, label]) => (
            <button key={v} className={themeFilter === v ? 'active' : ''} onClick={() => setThemeFilter(v)}>
              {label}
            </button>
          ))}
        </div>
        <label className="check">
          <input type="checkbox" checked={onlyFailures} onChange={(e) => setOnlyFailures(e.target.checked)} />
          仅看未达标
        </label>
      </div>

      <div className="panel-scroll">
        <div className="section-head">
          <span>循环依赖</span>
          <span className={`count ${filteredCycles.length ? 'is-bad' : ''}`}>{filteredCycles.length}</span>
        </div>
        {filteredCycles.length === 0 ? (
          <div className="ok-line">✓ 无循环依赖</div>
        ) : (
          filteredCycles.map((c, i) => (
            <div key={i} className="issue-card">
              <div className="issue-row">
                <span className="theme-tag">{THEME_LABELS[c.theme]}</span>
                {c.cycle.map((id, j) => (
                  <span key={j} className="chain-item">
                    {j > 0 && <span className="chain-arrow">→</span>}
                    <button className="chip chip-danger" onClick={() => onSelectToken(id, c.theme)}>
                      {id}
                    </button>
                  </span>
                ))}
              </div>
              <div className="issue-note">这些令牌互相引用，无法解析，预览中以品红兜底显示。</div>
            </div>
          ))
        )}

        <div className="section-head">
          <span>缺失引用</span>
          <span className={`count ${filteredMissing.length ? 'is-bad' : ''}`}>{filteredMissing.length}</span>
        </div>
        {filteredMissing.length === 0 ? (
          <div className="ok-line">✓ 无缺失引用</div>
        ) : (
          filteredMissing.map((m, i) => (
            <div key={i} className="issue-card">
              <div className="issue-row">
                <span className="theme-tag">{THEME_LABELS[m.theme]}</span>
                <button className="chip chip-danger" onClick={() => onSelectToken(m.token, m.theme)}>
                  {m.token}
                </button>
                <span className="chain-arrow">→</span>
                <code className="missing-ref">{m.missingRef}</code>
              </div>
              <div className="issue-note">引用的令牌不存在，请改为存在的令牌或补上该基础令牌。</div>
            </div>
          ))
        )}

        <div className="section-head">
          <span>对比度检查</span>
          <span className={`count ${contrastFailures ? 'is-bad' : ''}`}>
            {contrastFailures} 项未达标
          </span>
        </div>
        {unevaluable > 0 && (
          <div className="issue-note note-block">⚠ {unevaluable} 项因令牌无法解析而不能评估，请先修复循环 / 缺失引用。</div>
        )}
        <div className="pair-list">
          {visible.map((r) => (
            <PairRow key={`${r.theme}:${r.pair.id}`} result={r} onSelectToken={onSelectToken} />
          ))}
          {visible.length === 0 && <div className="ok-line">✓ 当前筛选下没有问题</div>}
        </div>
      </div>
    </aside>
  );
}

function PairRow({
  result,
  onSelectToken,
}: {
  result: PairResult;
  onSelectToken: (id: string, theme: ThemeId) => void;
}) {
  const { pair, theme, fg, bg, ratio, level } = result;
  const evaluable = fg.ok && bg.ok && ratio !== undefined && level !== undefined;

  return (
    <div className={`pair-row level-${level ?? 'error'} ${pair.exempt ? 'is-exempt' : ''}`}>
      {evaluable ? (
        <div
          className="pair-sample"
          style={{
            background: bg.ok ? bg.color : undefined,
            color: fg.ok ? fg.color : undefined,
            fontSize: pair.fontSize,
            fontWeight: pair.fontWeight,
          }}
          title={`${pair.fontSize}px / ${pair.fontWeight}`}
        >
          {pair.sample}
        </div>
      ) : (
        <div className="pair-sample pair-sample-error">无法评估</div>
      )}

      <div className="pair-info">
        <div className="pair-head">
          <span className="pair-label">{pair.label}</span>
          <span className="pair-usage">{pair.usage}</span>
          <span className="theme-tag">{THEME_LABELS[theme]}</span>
          {pair.exempt && <span className="exempt-tag">豁免</span>}
        </div>
        <div className="pair-tokens">
          <button className="tok" title="查看该令牌来源链" onClick={() => onSelectToken(pair.fg, theme)}>
            {pair.fg}
          </button>
          <span className="pair-hex">{fg.ok ? fg.color : '?'}</span>
          <span className="pair-on">on</span>
          <button className="tok" title="查看该令牌来源链" onClick={() => onSelectToken(pair.bg, theme)}>
            {pair.bg}
          </button>
          <span className="pair-hex">{bg.ok ? bg.color : '?'}</span>
          <span className="pair-font">
            {pair.fontSize}px / {pair.fontWeight}
          </span>
        </div>
      </div>

      <div className="pair-verdict">
        {evaluable ? (
          <>
            <span className="ratio">{ratio.toFixed(2)}:1</span>
            <span className={`level-badge badge-${level}`}>{WCAG_LEVEL_LABELS[level]}</span>
          </>
        ) : (
          <span className="level-badge badge-error">⚠ 解析失败</span>
        )}
      </div>
    </div>
  );
}
