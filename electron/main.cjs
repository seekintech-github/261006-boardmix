const { app, BrowserWindow, dialog, ipcMain, Menu } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_FILE_BYTES = 64 * 1024 * 1024;
const DEFAULT_FILTERS = [{ name: '知图文档', extensions: ['zhitu', 'json'] }];
const APP_TITLE = '知图 ZhiTu';
let mainWindow;

function getDevServerUrl() {
  if (app.isPackaged || !process.env.VITE_DEV_SERVER_URL) return null;
  const url = new URL(process.env.VITE_DEV_SERVER_URL);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('VITE_DEV_SERVER_URL must use HTTP or HTTPS.');
  }
  return url.href;
}

function requireMainFrame(event) {
  if (
    !mainWindow ||
    event.sender !== mainWindow.webContents ||
    event.senderFrame !== mainWindow.webContents.mainFrame
  ) {
    throw new Error('此操作仅供知图主窗口使用。');
  }
}

function safeFilename(value) {
  const name = typeof value === 'string' ? value : '未命名画布.zhitu';
  return (
    path
      .basename(name.replace(/\\/g, '/'))
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
      .replace(/[. ]+$/, '')
      .slice(0, 180) || '未命名画布.zhitu'
  );
}

function safeFilters(filters) {
  if (!Array.isArray(filters) || filters.length === 0) return DEFAULT_FILTERS;
  if (filters.length > 10) throw new Error('文件类型过多。');
  return filters.map((filter) => {
    if (
      !filter ||
      typeof filter.name !== 'string' ||
      !Array.isArray(filter.extensions) ||
      filter.extensions.length === 0 ||
      filter.extensions.length > 10 ||
      !filter.extensions.every(
        (extension) => typeof extension === 'string' && /^[a-zA-Z0-9]{1,12}$/.test(extension),
      )
    ) {
      throw new Error('文件类型无效。');
    }
    return { name: filter.name.slice(0, 80), extensions: filter.extensions };
  });
}

function decodeContent(options) {
  if (!options || typeof options !== 'object' || typeof options.content !== 'string') {
    throw new Error('文件内容无效。');
  }
  const encoding = options.encoding ?? 'utf8';
  if (!['utf8', 'base64'].includes(encoding)) throw new Error('文件编码无效。');
  if (Buffer.byteLength(options.content, 'utf8') > MAX_FILE_BYTES * 1.4) {
    throw new Error('文件超过 64 MB，无法保存。');
  }
  if (
    encoding === 'base64' &&
    (options.content.length % 4 !== 0 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(options.content))
  ) {
    throw new Error('文件的 Base64 编码无效。');
  }
  const content = Buffer.from(options.content, encoding);
  if (content.byteLength > MAX_FILE_BYTES) throw new Error('文件超过 64 MB，无法保存。');
  return content;
}

async function writeFileAtomically(filePath, content) {
  // A sibling temporary file keeps replacement on the same filesystem. Never
  // truncate the selected document before its replacement is completely written.
  const temporaryPath = path.join(path.dirname(filePath), `.zhitu-${randomUUID()}.tmp`);
  let handle;
  let temporaryFileExists = false;
  try {
    handle = await fs.open(temporaryPath, 'wx', 0o600);
    temporaryFileExists = true;
    await handle.writeFile(content);
    await handle.sync();
    await handle.close();
    handle = null;
    await fs.rename(temporaryPath, filePath);
    temporaryFileExists = false;
  } finally {
    if (handle) await handle.close().catch(() => {});
    if (temporaryFileExists) await fs.unlink(temporaryPath).catch(() => {});
  }
}

function registerFileHandlers() {
  ipcMain.handle('zhitu:save-file', async (event, options) => {
    requireMainFrame(event);
    const content = decodeContent(options);
    const filters = safeFilters(options.filters);
    const result = await dialog.showSaveDialog(mainWindow, {
      title: '保存到本机',
      defaultPath: path.join(app.getPath('documents'), safeFilename(options.name)),
      filters,
      properties: ['createDirectory', 'showOverwriteConfirmation'],
    });
    if (result.canceled || !result.filePath) return { saved: false };
    try {
      await writeFileAtomically(result.filePath, content);
    } catch {
      throw new Error('无法保存文件，原文件已保留。请检查文件夹的写入权限和可用空间。');
    }
    return { saved: true, path: result.filePath };
  });

  ipcMain.handle('zhitu:open-file', async (event) => {
    requireMainFrame(event);
    const result = await dialog.showOpenDialog(mainWindow, {
      title: '打开知图文档',
      filters: DEFAULT_FILTERS,
      properties: ['openFile'],
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    const filePath = result.filePaths[0];
    if (!['.zhitu', '.json'].includes(path.extname(filePath).toLowerCase())) {
      throw new Error('请选择 .zhitu 或 .json 格式的知图文档。');
    }
    try {
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) throw new Error('NOT_FILE');
      if (stat.size > MAX_FILE_BYTES) throw new Error('FILE_TOO_LARGE');
      const content = await fs.readFile(filePath, 'utf8');
      return { name: path.basename(filePath), content };
    } catch (error) {
      if (error.message === 'FILE_TOO_LARGE') throw new Error('文件超过 64 MB，无法打开。');
      throw new Error('无法读取文件，请检查文件是否存在以及读取权限。');
    }
  });
}

function createMenu() {
  const menu = [
    {
      label: '文件',
      submenu: [{ label: '关闭窗口', role: 'close' }],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '切换全屏', role: 'togglefullscreen', accelerator: 'F11' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '关于知图',
          click: () =>
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: `关于${APP_TITLE}`,
              message: APP_TITLE,
              detail: `版本 ${app.getVersion()}\n用于个人创作的离线流程图与思维导图工具。\n文档保存在本机，无需账号。`,
              buttons: ['知道了'],
            }),
        },
      ],
    },
  ];
  if (process.platform === 'darwin') menu.unshift({ role: 'appMenu' });
  Menu.setApplicationMenu(Menu.buildFromTemplate(menu));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1024,
    minHeight: 700,
    title: APP_TITLE,
    backgroundColor: '#f7f8fb',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      spellcheck: false,
    },
  });
  // The editor stays local: document links cannot replace its trusted renderer.
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.webContents.on('will-navigate', (event) => event.preventDefault());
  mainWindow.webContents.on('will-attach-webview', (event) => event.preventDefault());
  mainWindow.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
    callback(false),
  );
  mainWindow.webContents.session.setPermissionCheckHandler(() => false);
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  const devServerUrl = getDevServerUrl();
  if (devServerUrl) mainWindow.loadURL(devServerUrl);
  else mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
}

app.setName(APP_TITLE);
app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.zhitu.desktop');
  registerFileHandlers();
  createMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
