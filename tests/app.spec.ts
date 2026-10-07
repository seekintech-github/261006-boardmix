import { readFile } from 'node:fs/promises';
import { test, expect, type Download, type Page } from '@playwright/test';
import type { Board } from '../src/model';

const nodes = (page: Page) => page.locator('.react-flow__node');
const edges = (page: Page) => page.locator('.react-flow__edge');
const node = (page: Page, id: string) => page.locator(`.react-flow__node[data-id="${id}"]`);

async function savedBoard(page: Page): Promise<Board> {
  return page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('zhitu.workspace.v1')!);
    return workspace.boards.find((board: { id: string }) => board.id === workspace.activeId);
  });
}

async function downloadedBytes(download: Download): Promise<Buffer> {
  expect(await download.failure()).toBeNull();
  const path = await download.path();
  expect(path).toBeTruthy();
  return readFile(path!);
}

async function editLabel(page: Page, id: string, label: string) {
  await node(page, id).dblclick();
  const editor = page.getByRole('textbox', { name: '编辑节点文字' });
  await editor.fill(label);
  await editor.press('Enter');
  await expect(node(page, id).locator('.node-label')).toHaveText(label);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(nodes(page)).toHaveCount(13);
  await expect(node(page, 'growth')).toBeVisible();
});

test('opens the complete demo mindmap and switches to the flowchart', async ({ page }) => {
  await expect(edges(page)).toHaveCount(12);
  await expect(page.locator('.title-button')).toHaveText('个人成长计划');
  await expect(page.getByRole('navigation', { name: '我的画布' }).getByRole('button')).toHaveCount(
    2,
  );
  await expect(node(page, 'books')).toContainText('每月读 2 本书');
  await page
    .getByRole('navigation', { name: '我的画布' })
    .getByRole('button', { name: /灵感落地流程/ })
    .click();
  await expect(nodes(page)).toHaveCount(9);
  await expect(edges(page)).toHaveCount(10);
  await expect(node(page, 'worth').locator('.board-node')).toHaveClass(/kind-decision/);
  await expect(page.locator('.title-button')).toHaveText('灵感落地流程');
});

test('edits Chinese text, undoes and redoes it, and restores it after reload', async ({ page }) => {
  await editLabel(page, 'growth', '我的学习与成长 <2026>');
  await page.keyboard.press('Control+z');
  await expect(node(page, 'growth').locator('.node-label')).toHaveText('个人成长计划');
  await page.keyboard.press('Control+Shift+z');
  await expect(node(page, 'growth').locator('.node-label')).toHaveText('我的学习与成长 <2026>');
  await expect
    .poll(async () => (await savedBoard(page)).nodes.find((n) => n.id === 'growth')?.data.label)
    .toBe('我的学习与成长 <2026>');
  await page.reload();
  await expect(nodes(page)).toHaveCount(13);
  await expect(node(page, 'growth').locator('.node-label')).toHaveText('我的学习与成长 <2026>');
});

test('Tab creates a child, Enter creates a sibling, and deletion can be undone', async ({
  page,
}) => {
  await node(page, 'learn').click();
  await page.keyboard.press('Tab');
  await expect(nodes(page)).toHaveCount(14);
  const child = (await savedBoard(page)).nodes.find((n) => n.selected)!;
  expect(child.data.label).toBe('新主题');
  expect(
    (await savedBoard(page)).edges.some((e) => e.source === 'learn' && e.target === child.id),
  ).toBe(true);
  await page.keyboard.press('Enter');
  await expect(nodes(page)).toHaveCount(15);
  const sibling = (await savedBoard(page)).nodes.find((n) => n.selected)!;
  expect(sibling.id).not.toBe(child.id);
  expect(
    (await savedBoard(page)).edges.some((e) => e.source === 'learn' && e.target === sibling.id),
  ).toBe(true);
  await expect(edges(page)).toHaveCount(14);
  await page.keyboard.press('Delete');
  await expect(nodes(page)).toHaveCount(14);
  await expect(node(page, sibling.id)).toHaveCount(0);
  await expect(edges(page)).toHaveCount(13);
  await page.keyboard.press('Control+z');
  await expect(node(page, sibling.id)).toHaveCount(1);
  await expect(nodes(page)).toHaveCount(15);
  await expect(edges(page)).toHaveCount(14);
  await page.keyboard.press('Control+Shift+z');
  await expect(nodes(page)).toHaveCount(14);
});

test('creates a named flowchart and saves an editable document', async ({ page }) => {
  await page.getByRole('button', { name: /新建画布/ }).click();
  const dialog = page.getByRole('dialog', { name: '新建画布' });
  await dialog.getByRole('button', { name: /流程图/ }).click();
  await dialog.getByLabel('给画布起个名字').fill('周末出行流程');
  await dialog.getByRole('button', { name: '创建画布' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator('.title-button')).toHaveText('周末出行流程');
  await expect(nodes(page)).toHaveCount(1);
  await expect(nodes(page).first()).toContainText('开始');
  await expect(page.getByRole('navigation', { name: '我的画布' }).getByRole('button')).toHaveCount(
    3,
  );
  expect((await savedBoard(page)).kind).toBe('flow');

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存文件', exact: true }).click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe('周末出行流程.zhitu');
  const document = JSON.parse((await downloadedBytes(download)).toString('utf8'));
  expect(document.schemaVersion).toBe(1);
  expect(document.board).toMatchObject({ name: '周末出行流程', kind: 'flow' });
  expect(document.board.nodes).toHaveLength(1);
  expect(document.board.nodes[0]).not.toHaveProperty('selected');
});

test('rejects a malformed file without changing the board, then imports a valid backup', async ({
  page,
}) => {
  const before = await savedBoard(page);
  const input = page.getByLabel('导入画布文件');
  await input.setInputFiles({
    name: '损坏文件.zhitu',
    mimeType: 'application/json',
    buffer: Buffer.from('{invalid JSON'),
  });
  await expect(page.getByRole('status')).toContainText('无法导入白板');
  await expect(nodes(page)).toHaveCount(13);
  expect((await savedBoard(page)).id).toBe(before.id);
  expect((await savedBoard(page)).nodes.map((n) => n.data.label)).toEqual(
    before.nodes.map((n) => n.data.label),
  );
  await expect(page.getByRole('navigation', { name: '我的画布' }).getByRole('button')).toHaveCount(
    2,
  );

  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: '保存文件', exact: true }).click();
  const exported = await downloadedBytes(await pending);
  await input.setInputFiles({
    name: '恢复备份.zhitu',
    mimeType: 'application/json',
    buffer: exported,
  });
  await expect(page.getByRole('status')).toContainText('已导入');
  await expect(page.getByRole('navigation', { name: '我的画布' }).getByRole('button')).toHaveCount(
    3,
  );
  await expect(nodes(page)).toHaveCount(13);
  expect((await savedBoard(page)).id).not.toBe(before.id);
  expect((await savedBoard(page)).nodes.map((n) => n.data.label)).toEqual(
    before.nodes.map((n) => n.data.label),
  );
});

test('exports SVG and PNG while offline', async ({ page, context }) => {
  await context.setOffline(true);
  await page.getByRole('button', { name: '导出', exact: true }).click();
  const svgPending = page.waitForEvent('download');
  await page.getByRole('button', { name: /SVG 矢量图/ }).click();
  const svgDownload = await svgPending;
  expect(svgDownload.suggestedFilename()).toBe('个人成长计划.svg');
  const svg = (await downloadedBytes(svgDownload)).toString('utf8');
  expect(svg).toContain('<svg xmlns="http://www.w3.org/2000/svg"');
  expect(svg).toContain('个人成长计划');
  expect(svg).toContain('每月读 2 本书');
  expect(svg).not.toContain('<foreignObject');
  expect(svg).not.toMatch(/(?:href|src)=["']https?:/);

  await page.getByRole('button', { name: '导出', exact: true }).click();
  const pngPending = page.waitForEvent('download');
  await page.getByRole('button', { name: /PNG 图片/ }).click();
  const pngDownload = await pngPending;
  expect(pngDownload.suggestedFilename()).toBe('个人成长计划.png');
  const png = await downloadedBytes(pngDownload);
  expect([...png.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(png.length).toBeGreaterThan(10_000);
  expect(png.readUInt32BE(16)).toBeGreaterThan(600);
  expect(png.readUInt32BE(20)).toBeGreaterThan(300);
});

test('dragging moves a node and one undo restores its original position', async ({ page }) => {
  const original = (await savedBoard(page)).nodes.find((n) => n.id === 'growth')!.position;
  const element = node(page, 'growth');
  const box = await element.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 75, y + 45, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await savedBoard(page)).nodes.find((n) => n.id === 'growth')!.position.x)
    .not.toBe(original.x);
  const moved = (await savedBoard(page)).nodes.find((n) => n.id === 'growth')!.position;
  expect(moved.y).not.toBe(original.y);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await savedBoard(page)).nodes.find((n) => n.id === 'growth')!.position)
    .toEqual(original);
  await page.keyboard.press('Control+Shift+z');
  await expect
    .poll(async () => (await savedBoard(page)).nodes.find((n) => n.id === 'growth')!.position)
    .toEqual(moved);
});

test('dragging between connection handles creates an editable edge', async ({ page }) => {
  const source = node(page, 'growth').locator('.react-flow__handle[data-handleid="right"]');
  const target = node(page, 'books').locator('.react-flow__handle[data-handleid="left"]');
  await node(page, 'growth').hover();
  const start = await source.boundingBox();
  const end = await target.boundingBox();
  expect(start).not.toBeNull();
  expect(end).not.toBeNull();
  await page.mouse.move(start!.x + start!.width / 2, start!.y + start!.height / 2);
  await page.mouse.down();
  await page.mouse.move(end!.x + end!.width / 2, end!.y + end!.height / 2, { steps: 20 });
  await page.mouse.up();
  await expect(edges(page)).toHaveCount(13);
  await expect
    .poll(async () =>
      (await savedBoard(page)).edges.some(
        (edge) => edge.source === 'growth' && edge.target === 'books',
      ),
    )
    .toBe(true);
  await page.keyboard.press('Control+z');
  await expect(edges(page)).toHaveCount(12);
  await page.keyboard.press('Control+Shift+z');
  await expect(edges(page)).toHaveCount(13);
});

test('focusing a node property without editing preserves redo', async ({ page }) => {
  await editLabel(page, 'growth', '可以重做的修改');
  await page.keyboard.press('Control+z');
  await expect(node(page, 'growth').locator('.node-label')).toHaveText('个人成长计划');
  const redo = page.getByRole('button', { name: '重做 (Ctrl+Shift+Z)' });
  await expect(redo).toBeEnabled();
  await node(page, 'growth').click();
  await page.getByRole('textbox', { name: '节点内容' }).click();
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect(node(page, 'growth').locator('.node-label')).toHaveText('可以重做的修改');
});

test('recovers the intact board, backs up damaged storage, and keeps saving new boards', async ({
  page,
}) => {
  const original = await page.evaluate(() => {
    const workspace = JSON.parse(localStorage.getItem('zhitu.workspace.v1')!);
    workspace.boards[0].nodes[0].type = 'unsupportedNode';
    const raw = JSON.stringify(workspace);
    localStorage.setItem('zhitu.workspace.v1', raw);
    return { raw, intactId: workspace.boards[1].id };
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('已备份原始数据，并恢复 1 个有效画布');
  await expect(page.locator('.title-button')).toHaveText('灵感落地流程');
  await expect(nodes(page)).toHaveCount(9);
  await expect(edges(page)).toHaveCount(10);
  expect((await savedBoard(page)).id).toBe(original.intactId);
  expect(
    await page.evaluate(() =>
      Object.keys(localStorage)
        .filter((key) => key.startsWith('zhitu.workspace.v1.recovery.'))
        .map((key) => localStorage.getItem(key)),
    ),
  ).toContain(original.raw);

  await page.getByRole('button', { name: /新建画布/ }).click();
  const dialog = page.getByRole('dialog', { name: '新建画布' });
  await dialog.getByLabel('给画布起个名字').fill('恢复后的新画布');
  await dialog.getByRole('button', { name: '创建画布' }).click();
  await expect(page.locator('.title-button')).toHaveText('恢复后的新画布');
  await expect.poll(async () => (await savedBoard(page)).name).toBe('恢复后的新画布');
  await page.reload();
  await expect(page.locator('.title-button')).toHaveText('恢复后的新画布');
  await expect(nodes(page)).toHaveCount(1);
  await expect(page.getByRole('navigation', { name: '我的画布' }).getByRole('button')).toHaveCount(
    2,
  );
  await page
    .getByRole('navigation', { name: '我的画布' })
    .getByRole('button', { name: /灵感落地流程/ })
    .click();
  await expect(nodes(page)).toHaveCount(9);
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('duplicates a 120-character imported title without losing boards on reload', async ({
  page,
}) => {
  const before = await savedBoard(page);
  const longName = '长'.repeat(120);
  await page.getByLabel('导入画布文件').setInputFiles({
    name: '长标题.zhitu',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, board: { ...before, name: longName } })),
  });
  await expect(page.locator('.title-button')).toHaveText(longName);
  const importedId = (await savedBoard(page)).id;
  await page.getByRole('button', { name: '画布菜单' }).click();
  await page.getByRole('button', { name: '复制画布', exact: true }).click();
  const copy = await savedBoard(page);
  expect(copy.id).not.toBe(importedId);
  expect(copy.name).toBe(`${longName.slice(0, 115)} · 副本`);
  expect(copy.name.length).toBeLessThanOrEqual(120);
  await expect(page.getByRole('navigation', { name: '我的画布' }).getByRole('button')).toHaveCount(
    4,
  );
  await page.reload();
  await expect(page.getByRole('navigation', { name: '我的画布' }).getByRole('button')).toHaveCount(
    4,
  );
  await expect(page.locator('.title-button')).toHaveText(copy.name);
  await expect(nodes(page)).toHaveCount(13);
  await expect(page.getByRole('alert')).toHaveCount(0);
  const persisted = await page.evaluate(
    () => JSON.parse(localStorage.getItem('zhitu.workspace.v1')!).boards as Board[],
  );
  expect(persisted.map((board) => board.id)).toContain(importedId);
  expect(persisted.find((board) => board.id === importedId)?.name).toBe(longName);
});

test('imports a document, renames it, and preserves it while switching and reloading', async ({
  page,
}) => {
  const imported = await savedBoard(page);
  imported.name = '从文件恢复的导图';
  imported.nodes[0].data.label = '文件中的中心主题';
  await page.getByLabel('导入画布文件').setInputFiles({
    name: '恢复导图.zhitu',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 1, board: imported })),
  });
  await expect(page.locator('.title-button')).toHaveText('从文件恢复的导图');
  await expect(node(page, 'growth').locator('.node-label')).toHaveText('文件中的中心主题');
  const importedId = (await savedBoard(page)).id;
  await page.locator('.title-button').click();
  const dialog = page.getByRole('dialog', { name: '重命名画布' });
  await dialog.getByRole('textbox', { name: '画布名称' }).fill('我的离线学习图');
  await dialog.getByRole('button', { name: '保存名称' }).click();
  await expect(page.locator('.title-button')).toHaveText('我的离线学习图');
  const navigation = page.getByRole('navigation', { name: '我的画布' });
  await navigation.getByRole('button', { name: /灵感落地流程/ }).click();
  await expect(nodes(page)).toHaveCount(9);
  await navigation.getByRole('button', { name: /我的离线学习图/ }).click();
  await expect(node(page, 'growth').locator('.node-label')).toHaveText('文件中的中心主题');
  await page.reload();
  await expect(page.locator('.title-button')).toHaveText('我的离线学习图');
  await expect(nodes(page)).toHaveCount(13);
  expect((await savedBoard(page)).id).toBe(importedId);
  await expect(navigation.getByRole('button')).toHaveCount(3);
  await navigation.getByRole('button', { name: /个人成长计划/ }).click();
  await expect(node(page, 'growth').locator('.node-label')).toHaveText('个人成长计划');
});

test('resizing a node persists its dimensions and can be undone in one step', async ({ page }) => {
  const original = (await savedBoard(page)).nodes.find((n) => n.id === 'growth')!;
  await node(page, 'growth').click();
  const handle = node(page, 'growth').locator('.react-flow__resize-control.handle.bottom.right');
  await expect(handle).toBeVisible();
  const box = await handle.boundingBox();
  expect(box).not.toBeNull();
  const x = box!.x + box!.width / 2;
  const y = box!.y + box!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 70, y + 40, { steps: 12 });
  await page.mouse.up();
  await expect
    .poll(async () => (await savedBoard(page)).nodes.find((n) => n.id === 'growth')!.width)
    .toBeGreaterThan(original.width!);
  const resized = (await savedBoard(page)).nodes.find((n) => n.id === 'growth')!;
  expect(resized.height).toBeGreaterThan(original.height!);
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => {
      const current = (await savedBoard(page)).nodes.find((n) => n.id === 'growth')!;
      return { width: current.width, height: current.height, position: current.position };
    })
    .toEqual({ width: original.width, height: original.height, position: original.position });
  await page.keyboard.press('Control+Shift+z');
  await expect
    .poll(async () => (await savedBoard(page)).nodes.find((n) => n.id === 'growth')!.width)
    .toBe(resized.width);
  await page.reload();
  await expect(nodes(page)).toHaveCount(13);
  const restored = (await savedBoard(page)).nodes.find((n) => n.id === 'growth')!;
  expect(restored.width).toBe(resized.width);
  expect(restored.height).toBe(resized.height);
});
