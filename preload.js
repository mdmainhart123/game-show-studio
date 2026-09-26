const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  loadData: () => ipcRenderer.invoke('data:load'),
  saveData: (data) => ipcRenderer.invoke('data:save', data),
  openDataFolder: () => ipcRenderer.invoke('data:folder'),
  openTextFile: (opts) => ipcRenderer.invoke('file:openText', opts),
  saveTextFile: (opts) => ipcRenderer.invoke('file:saveText', opts),
  toggleFullscreen: () => ipcRenderer.invoke('win:fullscreen'),
});
