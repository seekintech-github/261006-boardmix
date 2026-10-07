import { test, expect, type Locator } from '@playwright/test';

const companyName = '上海熙进电子科技有限公司';

async function expectLoadedLogo(container: Locator) {
  const logo = container.getByRole('img', { name: 'Seekin 公司 Logo' });
  await expect(logo).toBeVisible();
  await expect
    .poll(() =>
      logo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
}

async function expectContainedText(text: Locator, container: Locator) {
  await expect(text).toBeVisible();
  const textBox = await text.boundingBox();
  const containerBox = await container.boundingBox();
  expect(textBox).not.toBeNull();
  expect(containerBox).not.toBeNull();
  expect(textBox!.x).toBeGreaterThanOrEqual(containerBox!.x);
  expect(textBox!.x + textBox!.width).toBeLessThanOrEqual(containerBox!.x + containerBox!.width);
  expect(textBox!.y + textBox!.height).toBeLessThanOrEqual(containerBox!.y + containerBox!.height);
  expect(await text.evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
}

test('company identity remains available offline in both board modes and with the sidebar closed', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page.locator('.react-flow__node')).toHaveCount(13);
  const brand = page.locator('.sidebar .brand');
  await expectLoadedLogo(brand);
  await expect(brand).toContainText(companyName);

  await context.setOffline(true);
  await page
    .getByRole('navigation', { name: '我的画布' })
    .getByRole('button', { name: /灵感落地流程/ })
    .click();
  await expect(page.locator('.react-flow__node')).toHaveCount(9);
  await expectLoadedLogo(brand);
  await page.getByRole('button', { name: '收起侧栏', exact: true }).click();
  await expect(page.locator('.sidebar')).toHaveCount(0);
  for (const container of [
    page.locator('.statusbar .company-credit'),
    page.locator('.canvas-brandmark'),
  ]) {
    await expectLoadedLogo(container);
    await expect(container).toContainText(companyName);
  }
  await page.getByRole('button', { name: '显示缩略图', exact: true }).click();
  await expect(page.locator('.react-flow__minimap')).toBeVisible();
  await expect(page.locator('.canvas-brandmark')).toHaveCount(0);
  await expect(page.locator('.statusbar .company-credit')).toContainText(companyName);
});

test('new-board, help, and about dialogs identify the developer with the company logo', async ({
  page,
}) => {
  await page.goto('/');
  for (const [button, dialogName] of [
    ['新建画布', '新建画布'],
    ['使用帮助与快捷键', '使用帮助'],
    ['关于知图', '关于知图'],
  ]) {
    await page.getByRole('button', { name: new RegExp(button) }).click();
    const dialog = page.getByRole('dialog', { name: dialogName, exact: true });
    await expect(dialog).toBeVisible();
    const credit = dialog.locator('.modal-company-footer');
    await expectLoadedLogo(credit);
    await expect(credit).toHaveText(`由 ${companyName} 开发`);
    if (dialogName === '关于知图') {
      await expectLoadedLogo(dialog.locator('.about-content'));
      await expect(dialog.locator('.about-developer')).toContainText(`设计与开发${companyName}`);
    }
    await dialog.getByRole('button', { name: '关闭对话框', exact: true }).click();
  }
  await expect(page.locator('.app-version')).toHaveAccessibleName('关于知图');
});

test('full company names fit the minimum desktop window and the watermark leaves canvas controls clear', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.goto('/');
  await expect(page.locator('.react-flow__node')).toHaveCount(13);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024);
  await expectContainedText(page.locator('.brand-company-name'), page.locator('.brand'));
  await expect(page.getByRole('button', { name: '关于知图', exact: true })).toBeInViewport();
  await expectContainedText(
    page.locator('.company-credit > span').first(),
    page.locator('.company-credit'),
  );
  await expectContainedText(
    page.locator('.canvas-brandmark strong'),
    page.locator('.canvas-brandmark'),
  );
  const watermark = await page.locator('.canvas-brandmark').boundingBox();
  const controls = await page.locator('.zoom-control').boundingBox();
  expect(watermark).not.toBeNull();
  expect(controls).not.toBeNull();
  expect(watermark!.y + watermark!.height).toBeLessThanOrEqual(controls!.y);
  await page.locator('.react-flow__node[data-id="growth"]').click();
  const inspector = page.locator('.inspector');
  await expect(inspector).toBeVisible();
  const inspectorBox = await inspector.boundingBox();
  const selectedWatermark = await page.locator('.canvas-brandmark').boundingBox();
  expect(inspectorBox).not.toBeNull();
  expect(selectedWatermark).not.toBeNull();
  expect(selectedWatermark!.x + selectedWatermark!.width).toBeLessThanOrEqual(inspectorBox!.x);
  expect(inspectorBox!.y + inspectorBox!.height).toBeLessThanOrEqual(700 - 34);

  for (const [button, dialogName] of [
    ['新建画布', '新建画布'],
    ['使用帮助与快捷键', '使用帮助'],
    ['关于知图', '关于知图'],
  ]) {
    await page.getByRole('button', { name: new RegExp(button) }).click();
    const dialog = page.getByRole('dialog', { name: dialogName, exact: true });
    await expectContainedText(dialog.locator('.modal-company-footer span'), dialog);
    if (dialogName === '关于知图') {
      await expectContainedText(dialog.locator('.about-developer strong'), dialog);
    }
    await dialog.getByRole('button', { name: '关闭对话框', exact: true }).click();
  }
});
