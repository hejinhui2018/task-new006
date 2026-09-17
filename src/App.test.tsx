// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import App from './App';

/** 应用级冒烟测试：渲染、示例切换、编辑传播、循环拒绝、撤销、本地持久化。 */

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

function openBaseEditor(tokenId: string) {
  const row = screen.getByText(tokenId).closest('.token-row')!;
  fireEvent.click(row.querySelector('.row-edit')!);
}

/** 令牌 id 可能同时出现在诊断面板，这里只取左侧令牌列表里的那一行 */
function tokenRow(tokenId: string): HTMLElement {
  const row = screen
    .getAllByText(tokenId)
    .map((el) => el.closest('.token-row'))
    .find((r): r is HTMLElement => r !== null);
  if (!row) throw new Error(`找不到令牌行：${tokenId}`);
  return row;
}

describe('主题发布台（UI 冒烟）', () => {
  it('渲染三栏布局，默认示例无任何诊断问题', () => {
    render(<App />);
    expect(screen.getByText('主题发布台')).toBeTruthy();
    expect(screen.getByText('令牌依赖')).toBeTruthy();
    expect(screen.getByText('组件预览')).toBeTruthy();
    expect(screen.getByText('诊断')).toBeTruthy();
    expect(screen.getByText('✓ 未发现问题')).toBeTruthy();
    // 浅色 + 深色两块预览同时渲染
    expect(document.querySelectorAll('.pv-scope')).toHaveLength(2);
  });

  it('加载问题场景后诊断面板列出问题，撤销后恢复干净', () => {
    render(<App />);
    fireEvent.click(screen.getByText('高对比 · 问题场景'));
    expect(screen.queryByText('✓ 未发现问题')).toBeNull();
    expect(screen.getByText(/循环 2 · 缺失 1 · 对比度未达标 [1-9]/)).toBeTruthy();
    fireEvent.click(screen.getByText('↶ 撤销'));
    expect(screen.getByText('✓ 未发现问题')).toBeTruthy();
    fireEvent.click(screen.getByText('↷ 重做'));
    expect(screen.queryByText('✓ 未发现问题')).toBeNull();
  });

  it('编辑基础令牌后，预览的 CSS 变量与诊断即时更新', () => {
    render(<App />);
    openBaseEditor('blue.600');
    expect(screen.getByText('编辑基础令牌 blue.600')).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText('#rrggbb'), { target: { value: '#ff0000' } });
    fireEvent.click(screen.getByText('应用'));
    const scope = document.querySelector('.pv-scope') as HTMLElement;
    expect(scope.style.getPropertyValue('--t-color-accent-default')).toBe('#ff0000');
    // 白字 on #ff0000 ≈ 4.0:1，主要按钮从 AA 变为不达标
    expect(screen.getByText(/对比度未达标 [1-9]/)).toBeTruthy();
  });

  it('编辑器拒绝制造循环依赖，并展示原因', () => {
    render(<App />);
    // color.text.muted 已引用 color.text.secondary；把 secondary 改为引用 muted 将成环
    fireEvent.click(tokenRow('color.text.secondary').querySelector('.row-edit')!);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'color.text.muted' } });
    fireEvent.click(screen.getByText('应用'));
    expect(screen.getByText(/循环依赖被拒绝/)).toBeTruthy();
    // 弹窗未关闭，文档未变
    expect(screen.getByText(/编辑语义令牌 color\.text\.secondary/)).toBeTruthy();
    fireEvent.click(screen.getByText('取消'));
  });

  it('编辑结果持久化到 localStorage', () => {
    render(<App />);
    openBaseEditor('blue.600');
    fireEvent.change(screen.getByPlaceholderText('#rrggbb'), { target: { value: '#123456' } });
    fireEvent.click(screen.getByText('应用'));
    const saved = JSON.parse(localStorage.getItem('theme-release-station:v1')!);
    expect(saved.doc.base['blue.600']).toBe('#123456');
    expect(saved.exampleId).toBe('default');
  });

  it('从 localStorage 恢复上次的文档', () => {
    localStorage.setItem(
      'theme-release-station:v1',
      JSON.stringify({
        exampleId: 'default',
        doc: {
          name: 'restored',
          base: { 'ink.1': '#111111' },
          themes: { light: {}, dark: {} },
        },
      }),
    );
    render(<App />);
    expect(screen.getByText('ink.1')).toBeTruthy();
  });
});
