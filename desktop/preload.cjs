// Sandboxed preload: byte-level access to the files this window was launched with, nothing more.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hwpwordDesktop', {
  getLaunchFiles: () => ipcRenderer.invoke('hwpword:get-launch-files'),
  readFile: (token) => ipcRenderer.invoke('hwpword:read-file', token),
  writeFile: (token, bytes) => ipcRenderer.invoke('hwpword:write-file', token, bytes),
  isOnlyWindow: () => ipcRenderer.invoke('hwpword:is-only-window'),
  paste: () => ipcRenderer.invoke('hwpword:paste'),
});
