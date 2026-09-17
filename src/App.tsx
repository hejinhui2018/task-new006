import { useEffect, useMemo, useRef, useState } from 'react';
import { EXAMPLES, getExample } from './core/examples';
import { evaluatePairs } from './core/pairs';
import {
  applyWithHistory,
  canRedo,
  canUndo,
  initHistory,
  loadPersisted,
  persist,
  redo,
  undo,
  type Edit,
  type HistoryState,
} from './core/store';
import { findProblems, type ThemeDoc, type ThemeId } from './core/tokens';
import { DiagnosticsPanel } from './components/DiagnosticsPanel';
import { PreviewPanel, type PreviewMode } from './components/PreviewPanel';
import { TokenEditor, type EditTarget } from './components/TokenEditor';
import { TokenPanel } from './components/TokenPanel';

export type Selection =
  | { kind: 'base'; id: string }
  | { kind: 'semantic'; id: string; theme: ThemeId };

interface AppState {
  history: HistoryState;
  exampleId: string | null;
}

function initApp(): { state: AppState; pristine: ThemeDoc | null } {
  const persisted = loadPersisted();
  if (persisted) {
    // 从本地恢复：无法确定相对示例是否被改过，保守地允许“恢复示例”
    return { state: { history: initHistory(persisted.doc), exampleId: persisted.exampleId }, pristine: null };
  }
  const ex = getExample('default')!;
  const doc = ex.build();
  return { state: { history: initHistory(doc), exampleId: ex.id }, pristine: doc };
}

export default function App() {
  const [initial] = useState(initApp);
  const [appState, setAppState] = useState<AppState>(initial.state);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('both');

  const stateRef = useRef(appState);
  stateRef.current = appState;
  /** 当前示例的原始文档；从 localStorage 恢复时为 null（视为已修改） */
  const pristineRef = useRef<ThemeDoc | null>(initial.pristine);

  const doc = appState.history.doc;
  const problems = useMemo(() => findProblems(doc), [doc]);
  const pairResults = useMemo(() => evaluatePairs(doc), [doc]);

  // 数据只保存在浏览器本地
  useEffect(() => {
    persist({ doc, exampleId: appState.exampleId });
  }, [doc, appState.exampleId]);

  const applyEditAction = (edit: Edit): string | null => {
    const { state: next, error } = applyWithHistory(stateRef.current.history, edit);
    if (error) return error;
    setAppState((s) => ({ ...s, history: next }));
    return null;
  };

  const loadExample = (id: string) => {
    const ex = getExample(id);
    if (!ex) return;
    const fresh = ex.build();
    pristineRef.current = fresh;
    setAppState((s) => ({
      exampleId: id,
      history: applyWithHistory(s.history, { type: 'replace-doc', doc: fresh }).state,
    }));
  };

  const dirty = pristineRef.current === null || doc !== pristineRef.current;

  // Ctrl/⌘+Z 撤销，Ctrl/⌘+Shift+Z 重做（输入框内不拦截）
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== 'z') return;
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      e.preventDefault();
      setAppState((s) => ({ ...s, history: e.shiftKey ? redo(s.history) : undo(s.history) }));
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark">◆</span>
          <div>
            <div className="brand-title">主题发布台</div>
            <div className="brand-sub">品牌令牌依赖与对比度检查</div>
          </div>
        </div>

        <div className="header-group">
          <span className="header-label">示例</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex.id}
              className={`hbtn ${appState.exampleId === ex.id && !dirty ? 'is-active' : ''}`}
              title={`${ex.description}（加载会替换当前文档，可撤销）`}
              onClick={() => loadExample(ex.id)}
            >
              {ex.label}
            </button>
          ))}
          <button
            className="hbtn"
            disabled={!dirty || !appState.exampleId}
            title="放弃当前修改，恢复该示例的初始状态（可撤销）"
            onClick={() => appState.exampleId && loadExample(appState.exampleId)}
          >
            恢复示例
          </button>
        </div>

        <div className="header-group">
          <button className="hbtn" disabled={!canUndo(appState.history)} title="撤销（Ctrl/⌘+Z）" onClick={() => setAppState((s) => ({ ...s, history: undo(s.history) }))}>
            ↶ 撤销
          </button>
          <button className="hbtn" disabled={!canRedo(appState.history)} title="重做（Ctrl/⌘+Shift+Z）" onClick={() => setAppState((s) => ({ ...s, history: redo(s.history) }))}>
            ↷ 重做
          </button>
        </div>

        <div className="header-spacer" />
        <span className="save-hint">更改自动保存在浏览器本地</span>
      </header>

      <div className="app-body">
        <TokenPanel doc={doc} selection={selection} onSelect={setSelection} onEdit={setEditing} />
        <PreviewPanel doc={doc} mode={previewMode} onModeChange={setPreviewMode} />
        <DiagnosticsPanel
          problems={problems}
          results={pairResults}
          onSelectToken={(id, theme) => setSelection({ kind: 'semantic', id, theme })}
        />
      </div>

      {editing && (
        <TokenEditor
          target={editing}
          doc={doc}
          pairResults={pairResults}
          onApply={applyEditAction}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}
