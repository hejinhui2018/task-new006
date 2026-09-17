/**
 * 令牌依赖图引擎。
 *
 * 令牌分两层：
 *  - 基础令牌（base）：直接持有颜色值，跨主题共享，例如 `blue.600 -> #2563eb`。
 *  - 语义令牌（semantic）：按主题（light/dark）定义，值可以是直接颜色，
 *    也可以是对其他令牌的引用（基础令牌或同主题下的语义令牌）。
 *
 * 组件只允许绑定语义令牌，所有颜色都必须沿引用链解析到基础令牌，
 * 因此改动一个基础令牌会沿依赖图传播到所有组件、主题与状态。
 */

export type ThemeId = 'light' | 'dark';
export const THEME_IDS: readonly ThemeId[] = ['light', 'dark'];
export const THEME_LABELS: Record<ThemeId, string> = { light: '浅色', dark: '深色' };

export type TokenValue =
  | { kind: 'color'; color: string }
  | { kind: 'ref'; ref: string };

export interface ThemeDoc {
  name: string;
  /** 基础令牌：id -> 归一化后的 #rrggbb */
  base: Record<string, string>;
  /** 语义令牌：按主题分组 */
  themes: Record<ThemeId, Record<string, TokenValue>>;
}

export type ResolveError =
  | { type: 'missing'; missingRef: string }
  | { type: 'cycle'; cycle: string[] };

export interface Resolved {
  ok: true;
  id: string;
  /** 解析出的最终颜色（#rrggbb） */
  color: string;
  /** 来源链：从起点令牌到最终持有颜色的令牌，例如 ['color.accent.default', 'blue.600'] */
  chain: string[];
}

export interface Unresolved {
  ok: false;
  id: string;
  chain: string[];
  error: ResolveError;
}

export type Resolution = Resolved | Unresolved;

/**
 * 解析单个令牌。语义令牌优先于同名基础令牌。
 * 循环与缺失引用都会以错误形式返回，绝不死循环。
 */
export function resolveToken(id: string, theme: ThemeId, doc: ThemeDoc): Resolution {
  const chain: string[] = [];
  const seenAt = new Map<string, number>();
  let current = id;
  for (;;) {
    const at = seenAt.get(current);
    if (at !== undefined) {
      return {
        ok: false,
        id,
        chain: [...chain],
        error: { type: 'cycle', cycle: [...chain.slice(at), current] },
      };
    }
    seenAt.set(current, chain.length);
    chain.push(current);

    const semantic = doc.themes[theme][current];
    if (semantic) {
      if (semantic.kind === 'color') {
        return { ok: true, id, color: semantic.color, chain };
      }
      current = semantic.ref;
      continue;
    }
    const baseColor = doc.base[current];
    if (baseColor !== undefined) {
      return { ok: true, id, color: baseColor, chain };
    }
    return { ok: false, id, chain, error: { type: 'missing', missingRef: current } };
  }
}

/** 解析某主题下全部语义令牌。 */
export function resolveTheme(theme: ThemeId, doc: ThemeDoc): Map<string, Resolution> {
  const out = new Map<string, Resolution>();
  for (const id of Object.keys(doc.themes[theme])) {
    out.set(id, resolveToken(id, theme, doc));
  }
  return out;
}

export interface CycleProblem {
  theme: ThemeId;
  /** 首尾相同的闭环路径，例如 ['a', 'b', 'a'] */
  cycle: string[];
}

export interface MissingProblem {
  theme: ThemeId;
  /** 直接持有坏引用的令牌 */
  token: string;
  missingRef: string;
}

/** 把环归一化（从字典序最小的节点开始、去掉重复的尾节点），用于去重。 */
function canonicalCycle(cycle: string[]): string {
  const nodes = cycle.slice(0, -1);
  if (nodes.length === 0) return cycle.join('>');
  let start = 0;
  for (let i = 1; i < nodes.length; i++) {
    if (nodes[i] < nodes[start]) start = i;
  }
  const rotated = [...nodes.slice(start), ...nodes.slice(0, start)];
  return rotated.join('>');
}

/**
 * 扫描整份文档，找出所有循环依赖与缺失引用。
 * 缺失引用按“直接持有坏引用的令牌”精确定位；循环按环去重。
 */
export function findProblems(doc: ThemeDoc): { cycles: CycleProblem[]; missing: MissingProblem[] } {
  const cycles: CycleProblem[] = [];
  const missing: MissingProblem[] = [];
  const seenCycles = new Set<string>();

  for (const theme of THEME_IDS) {
    const table = doc.themes[theme];
    // 缺失引用：直接检查每条引用边，精确定位到持有它的令牌
    for (const [id, value] of Object.entries(table)) {
      if (value.kind === 'ref' && !(value.ref in table) && !(value.ref in doc.base)) {
        missing.push({ theme, token: id, missingRef: value.ref });
      }
    }
    // 循环：解析每个令牌，收集环并按环去重
    for (const id of Object.keys(table)) {
      const r = resolveToken(id, theme, doc);
      if (!r.ok && r.error.type === 'cycle') {
        const key = `${theme}:${canonicalCycle(r.error.cycle)}`;
        if (!seenCycles.has(key)) {
          seenCycles.add(key);
          cycles.push({ theme, cycle: r.error.cycle });
        }
      }
    }
  }
  return { cycles, missing };
}

export interface Dependent {
  theme: ThemeId;
  id: string;
  /** 1 = 直接引用目标令牌，>1 = 经由其他语义令牌间接依赖 */
  depth: number;
}

/**
 * 反向可达性：找出所有（直接或间接）依赖指定令牌的语义令牌。
 * 用于“改动这个基础令牌会影响谁”的高亮与影响面统计。
 */
export function getDependents(doc: ThemeDoc, tokenId: string): Dependent[] {
  // 反向邻接表：被引用者 -> 引用者
  const reverse = new Map<string, { theme: ThemeId; id: string }[]>();
  for (const theme of THEME_IDS) {
    for (const [id, value] of Object.entries(doc.themes[theme])) {
      if (value.kind === 'ref') {
        const key = `${theme}:${value.ref}`;
        const list = reverse.get(key) ?? [];
        list.push({ theme, id });
        reverse.set(key, list);
      }
    }
  }
  const out: Dependent[] = [];
  const visited = new Set<string>();
  let frontier: { theme: ThemeId; id: string }[] = THEME_IDS.map((theme) => ({ theme, id: tokenId }));
  let depth = 0;
  while (frontier.length > 0) {
    depth += 1;
    const next: { theme: ThemeId; id: string }[] = [];
    for (const node of frontier) {
      for (const dep of reverse.get(`${node.theme}:${node.id}`) ?? []) {
        const key = `${dep.theme}:${dep.id}`;
        if (visited.has(key)) continue;
        visited.add(key);
        out.push({ theme: dep.theme, id: dep.id, depth });
        next.push(dep);
      }
    }
    frontier = next;
  }
  return out;
}

/**
 * 模拟“把 theme 下的 id 改为引用 newRef”，若会产生循环则返回环路径，否则返回 null。
 * 编辑器用它拒绝会制造循环的修改。
 */
export function wouldCreateCycle(
  doc: ThemeDoc,
  theme: ThemeId,
  id: string,
  newRef: string,
): string[] | null {
  const trial: ThemeDoc = {
    ...doc,
    themes: {
      ...doc.themes,
      [theme]: { ...doc.themes[theme], [id]: { kind: 'ref', ref: newRef } },
    },
  };
  const r = resolveToken(id, theme, trial);
  return !r.ok && r.error.type === 'cycle' ? r.error.cycle : null;
}

/** 深拷贝一份文档（示例加载、历史记录都基于不可变更新，这里主要用于构建示例）。 */
export function cloneDoc(doc: ThemeDoc): ThemeDoc {
  return {
    name: doc.name,
    base: { ...doc.base },
    themes: {
      light: { ...doc.themes.light },
      dark: { ...doc.themes.dark },
    },
  };
}
