import { normalizeHex } from './contrast';
import { wouldCreateCycle, type ThemeDoc, type ThemeId, type TokenValue } from './tokens';

/**
 * 主题文档的唯一修改入口。
 * 所有编辑都经过 applyEdit 校验（非法颜色 / 缺失引用 / 循环依赖一律拒绝），
 * 再通过历史栈包装获得撤销 / 重做能力。UI 层不直接改文档。
 */

export type Edit =
  | { type: 'set-base'; id: string; color: string }
  | { type: 'set-semantic'; theme: ThemeId; id: string; value: TokenValue }
  | { type: 'replace-doc'; doc: ThemeDoc };

export interface EditOutcome {
  doc: ThemeDoc;
  /** 拒绝原因；成功时为 undefined，doc 为新对象 */
  error?: string;
}

/** 应用一次编辑。被拒绝的编辑返回原文档与错误信息，不会产生部分修改。 */
export function applyEdit(doc: ThemeDoc, edit: Edit): EditOutcome {
  switch (edit.type) {
    case 'set-base': {
      const hex = normalizeHex(edit.color);
      if (!hex) return { doc, error: `无效的颜色值：“${edit.color}”，请使用 #rgb 或 #rrggbb` };
      if (!(edit.id in doc.base)) return { doc, error: `基础令牌不存在：${edit.id}` };
      if (doc.base[edit.id] === hex) return { doc };
      return { doc: { ...doc, base: { ...doc.base, [edit.id]: hex } } };
    }
    case 'set-semantic': {
      const table = doc.themes[edit.theme];
      if (!(edit.id in table)) return { doc, error: `语义令牌不存在：${edit.id}` };
      if (edit.value.kind === 'color') {
        const hex = normalizeHex(edit.value.color);
        if (!hex) return { doc, error: `无效的颜色值：“${edit.value.color}”，请使用 #rgb 或 #rrggbb` };
        const next: ThemeDoc = {
          ...doc,
          themes: { ...doc.themes, [edit.theme]: { ...table, [edit.id]: { kind: 'color', color: hex } } },
        };
        return { doc: next };
      }
      const target = edit.value.ref;
      if (!(target in table) && !(target in doc.base)) {
        return { doc, error: `引用的令牌不存在：${target}` };
      }
      const cycle = wouldCreateCycle(doc, edit.theme, edit.id, target);
      if (cycle) {
        return { doc, error: `循环依赖被拒绝：${cycle.join(' → ')}` };
      }
      const next: ThemeDoc = {
        ...doc,
        themes: { ...doc.themes, [edit.theme]: { ...table, [edit.id]: { kind: 'ref', ref: target } } },
      };
      return { doc: next };
    }
    case 'replace-doc': {
      return { doc: edit.doc };
    }
  }
}

export interface HistoryState {
  doc: ThemeDoc;
  past: ThemeDoc[];
  future: ThemeDoc[];
}

export const HISTORY_LIMIT = 100;

export function initHistory(doc: ThemeDoc): HistoryState {
  return { doc, past: [], future: [] };
}

/** 应用编辑并压入历史。被拒绝的编辑不改变历史。 */
export function applyWithHistory(
  state: HistoryState,
  edit: Edit,
): { state: HistoryState; error?: string } {
  const { doc, error } = applyEdit(state.doc, edit);
  if (error || doc === state.doc) return { state, error };
  const past = [...state.past, state.doc].slice(-HISTORY_LIMIT);
  return { state: { doc, past, future: [] } };
}

export function canUndo(state: HistoryState): boolean {
  return state.past.length > 0;
}

export function canRedo(state: HistoryState): boolean {
  return state.future.length > 0;
}

export function undo(state: HistoryState): HistoryState {
  if (!canUndo(state)) return state;
  const previous = state.past[state.past.length - 1];
  return { doc: previous, past: state.past.slice(0, -1), future: [state.doc, ...state.future] };
}

export function redo(state: HistoryState): HistoryState {
  if (!canRedo(state)) return state;
  const next = state.future[0];
  return { doc: next, past: [...state.past, state.doc], future: state.future.slice(1) };
}

/* ---------------- 浏览器本地持久化（仅 localStorage） ---------------- */

const STORAGE_KEY = 'theme-release-station:v1';

export interface PersistedState {
  doc: ThemeDoc;
  exampleId: string | null;
}

function isValidDoc(value: unknown): value is ThemeDoc {
  if (typeof value !== 'object' || value === null) return false;
  const doc = value as ThemeDoc;
  if (typeof doc.name !== 'string') return false;
  if (typeof doc.base !== 'object' || doc.base === null) return false;
  if (typeof doc.themes !== 'object' || doc.themes === null) return false;
  const { light, dark } = doc.themes;
  if (typeof light !== 'object' || light === null) return false;
  if (typeof dark !== 'object' || dark === null) return false;
  return true;
}

export function loadPersisted(): PersistedState | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!isValidDoc(parsed.doc)) return null;
    return { doc: parsed.doc, exampleId: typeof parsed.exampleId === 'string' ? parsed.exampleId : null };
  } catch {
    return null;
  }
}

export function persist(state: PersistedState): void {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 隐私模式等场景下写入失败：忽略，不影响编辑
  }
}
