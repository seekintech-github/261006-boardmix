/* Run after npm run build: DISPLAY=:99 node tests/electron-smoke.cjs */
const { _electron: electron, expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');

async function main() {
  const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'zhitu-desktop-smoke-'));
  const launchEnvironment = { ...process.env };
  delete launchEnvironment.VITE_DEV_SERVER_URL;
  delete launchEnvironment.ELECTRON_RUN_AS_NODE;
  const application = await electron.launch({
    args: ['--no-sandbox', `--user-data-dir=${path.join(temporaryDirectory, 'profile')}`, '.'],
    cwd: path.resolve(__dirname, '..'),
    env: launchEnvironment,
    timeout: 30000,
  });
  try {
    const page = await application.firstWindow();
    const runtimeErrors = [];
    page.on('pageerror', (error) => runtimeErrors.push(error.message));
    await expect(page.locator('.react-flow__node')).toHaveCount(13);
    assert.match(page.url(), /^file:\/\//);
    const companyName = '上海熙进电子科技有限公司';
    assert.deepEqual(
      await application.evaluate(({ app, BrowserWindow }) => ({
        name: app.getName(),
        title: BrowserWindow.getAllWindows()[0].getTitle(),
      })),
      { name: '知图 ZhiTu', title: `知图 · ${companyName}` },
    );
    // Branding must not change the application identity used by existing profiles.
    const aboutDialog = await application.evaluate(({ dialog, Menu, nativeImage }) => {
      const helpMenu = Menu.getApplicationMenu().items.find((item) => item.label === '帮助');
      const aboutMenuItem = helpMenu.submenu.items.find((item) => item.label === '关于知图');
      const originalShowMessageBox = dialog.showMessageBox;
      let capturedOptions;
      dialog.showMessageBox = async (_window, options) => {
        const icon =
          typeof options.icon === 'string'
            ? nativeImage.createFromPath(options.icon)
            : options.icon;
        capturedOptions = {
          title: options.title,
          message: options.message,
          detail: options.detail,
          iconEmpty: !icon || icon.isEmpty(),
        };
        return { response: 0 };
      };
      try {
        aboutMenuItem.click();
        return capturedOptions;
      } finally {
        dialog.showMessageBox = originalShowMessageBox;
      }
    });
    assert.equal(aboutDialog.title, '关于知图');
    assert.match(aboutDialog.message, /^知图 ZhiTu · \d+\.\d+\.\d+/);
    assert.ok(aboutDialog.detail.includes(`${companyName} 开发`));
    assert.equal(aboutDialog.iconEmpty, false);
    assert.deepEqual(
      await page.evaluate(() => ({
        methods: Object.keys(window.desktop).sort(),
        nodeExposed: typeof window.require !== 'undefined' || typeof window.process !== 'undefined',
      })),
      { methods: ['openFile', 'saveFile'], nodeExposed: false },
    );
    const preferences = await application.evaluate(({ BrowserWindow }) => {
      const settings = BrowserWindow.getAllWindows()[0].webContents.getLastWebPreferences();
      return Object.fromEntries(
        ['contextIsolation', 'nodeIntegration', 'sandbox', 'webSecurity'].map((key) => [
          key,
          settings[key],
        ]),
      );
    });
    assert.deepEqual(preferences, {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    });

    // Local assets and editor must continue to load with network unavailable.
    await page.context().setOffline(true);
    await page.reload();
    await expect(page.locator('.react-flow__node')).toHaveCount(13);
    await expect(page.locator('.react-flow__edge')).toHaveCount(12);
    for (const selector of ['.brand', '.canvas-brandmark', '.company-credit']) {
      const brandedArea = page.locator(selector);
      await expect(brandedArea).toBeVisible();
      await expect(brandedArea).toContainText(companyName);
      const logo = brandedArea.getByRole('img', { name: 'Seekin 公司 Logo' });
      await expect(logo).toBeVisible();
      await expect(logo).toHaveJSProperty('complete', true);
      assert.ok(await logo.evaluate((image) => image.naturalWidth > 0 && image.naturalHeight > 0));
    }

    async function saveDialog(filePath) {
      await application.evaluate(({ dialog }, destination) => {
        dialog.showSaveDialog = async (_window, options) => {
          globalThis.lastSaveOptions = options;
          return destination ? { canceled: false, filePath: destination } : { canceled: true };
        };
      }, filePath);
    }

    async function openDialog(filePath) {
      await application.evaluate(({ dialog }, source) => {
        dialog.showOpenDialog = async () =>
          source ? { canceled: false, filePaths: [source] } : { canceled: true, filePaths: [] };
      }, filePath);
    }

    const documentPath = path.join(temporaryDirectory, '个人成长计划.zhitu');
    await saveDialog(documentPath);
    await page.getByRole('button', { name: '保存文件', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('画布文件已保存');
    const serializedDocument = await fs.readFile(documentPath, 'utf8');
    const document = JSON.parse(serializedDocument);
    assert.equal(document.schemaVersion, 1);
    assert.equal(document.board.name, '个人成长计划');
    assert.equal(document.board.nodes.length, 13);
    assert.ok(document.board.nodes.every((node) => !Object.hasOwn(node, 'selected')));

    // Replacing an existing backup must succeed without leaving temporary files.
    const replacementPath = path.join(temporaryDirectory, 'existing.zhitu');
    await fs.writeFile(replacementPath, 'the original backup', 'utf8');
    await saveDialog(replacementPath);
    assert.deepEqual(
      await page.evaluate(
        (content) => window.desktop.saveFile({ name: 'existing.zhitu', content }),
        serializedDocument,
      ),
      {
        saved: true,
        path: replacementPath,
      },
    );
    assert.equal(await fs.readFile(replacementPath, 'utf8'), serializedDocument);

    // Simulate a disk error after a partial write, exercising the real IPC path.
    await application.evaluate(() => {
      const filesystem = process.getBuiltinModule('node:fs/promises');
      globalThis.originalFsOpen = filesystem.open;
      filesystem.open = async (...args) => {
        const handle = await globalThis.originalFsOpen(...args);
        if (String(args[0]).includes('.zhitu-') && args[1] === 'wx') {
          const writeFile = handle.writeFile.bind(handle);
          handle.writeFile = async () => {
            await writeFile('partial write');
            throw Object.assign(new Error('Simulated disk full'), { code: 'ENOSPC' });
          };
        }
        return handle;
      };
    });
    try {
      assert.match(
        await page.evaluate(async () => {
          try {
            await window.desktop.saveFile({
              name: 'existing.zhitu',
              content: 'replacement that cannot be completed',
            });
            return '';
          } catch (error) {
            return error.message;
          }
        }),
        /原文件已保留/,
      );
      assert.equal(await fs.readFile(replacementPath, 'utf8'), serializedDocument);
    } finally {
      await application.evaluate(() => {
        process.getBuiltinModule('node:fs/promises').open = globalThis.originalFsOpen;
        delete globalThis.originalFsOpen;
      });
    }
    assert.deepEqual(
      (await fs.readdir(temporaryDirectory)).filter((name) => name.startsWith('.zhitu-')),
      [],
    );

    await openDialog(documentPath);
    assert.deepEqual(await page.evaluate(() => window.desktop.openFile()), {
      name: '个人成长计划.zhitu',
      content: serializedDocument,
    });
    await page.getByRole('button', { name: /导入本地文件/ }).click();
    await expect(page.getByRole('status')).toContainText('已导入');
    await expect(
      page.getByRole('navigation', { name: '我的画布' }).getByRole('button'),
    ).toHaveCount(3);
    await expect(page.locator('.react-flow__node')).toHaveCount(13);

    for (const format of ['svg', 'png']) {
      const outputPath = path.join(temporaryDirectory, `diagram.${format}`);
      await saveDialog(outputPath);
      await page.getByRole('button', { name: '导出', exact: true }).click();
      await page
        .getByRole('button', { name: format === 'svg' ? /SVG 矢量图/ : /PNG 图片/ })
        .click();
      await expect(page.getByRole('status')).toContainText(`${format.toUpperCase()} 图片已导出`);
      const bytes = await fs.readFile(outputPath);
      if (format === 'svg') {
        assert.match(bytes.toString('utf8'), /<svg xmlns="http:\/\/www.w3.org\/2000\/svg"/);
        assert.match(bytes.toString('utf8'), /个人成长计划/);
        assert.doesNotMatch(bytes.toString('utf8'), /(?:href|src)=["']https?:/);
      } else {
        assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        assert.ok(bytes.byteLength > 10000);
      }
    }

    await saveDialog(null);
    for (const options of [
      { name: 'cancel.zhitu', content: serializedDocument },
      { name: 'cancel.svg', content: '<svg/>', filters: [{ name: 'SVG', extensions: ['svg'] }] },
      {
        name: 'cancel.png',
        content: 'aGVsbG8=',
        encoding: 'base64',
        filters: [{ name: 'PNG', extensions: ['png'] }],
      },
    ]) {
      assert.deepEqual(await page.evaluate((input) => window.desktop.saveFile(input), options), {
        saved: false,
      });
    }
    await openDialog(null);
    assert.equal(await page.evaluate(() => window.desktop.openFile()), null);

    for (const options of [
      { content: 23 },
      { content: 'abc', encoding: 'utf16' },
      { content: 'not base64!', encoding: 'base64' },
      { content: 'abc', filters: [{ name: 'bad', extensions: ['../js'] }] },
    ]) {
      assert.equal(
        await page.evaluate(async (input) => {
          try {
            await window.desktop.saveFile(input);
            return false;
          } catch {
            return true;
          }
        }, options),
        true,
      );
    }
    await openDialog(path.join(temporaryDirectory, 'diagram.svg'));
    assert.match(
      await page.evaluate(async () => {
        try {
          await window.desktop.openFile();
          return '';
        } catch (error) {
          return error.message;
        }
      }),
      /请选择 .zhitu 或 .json/,
    );
    assert.deepEqual(runtimeErrors, []);
    console.log(
      'Electron smoke passed: stable application identity, company window title and native About logo, offline company branding, 13 nodes, isolated preload, native document round trip, atomic overwrite and disk failure recovery, SVG/PNG bytes, dialog cancellation, invalid IPC payloads.',
    );
  } finally {
    await application.close();
    await fs.rm(temporaryDirectory, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
