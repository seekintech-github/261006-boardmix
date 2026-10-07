const { contextBridge, ipcRenderer } = require('electron');

// Expose only explicit file-dialog operations, never raw IPC or filesystem access.
contextBridge.exposeInMainWorld(
  'desktop',
  Object.freeze({
    saveFile: (options) => ipcRenderer.invoke('zhitu:save-file', options),
    openFile: () => ipcRenderer.invoke('zhitu:open-file'),
  }),
);
