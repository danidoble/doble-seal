const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Gestión de certificados
  certificates: {
    list: () => ipcRenderer.invoke('certificates:list'),
    create: (data) => ipcRenderer.invoke('certificates:create', data),
    delete: (domain) => ipcRenderer.invoke('certificates:delete', domain),
    export: (domain) => ipcRenderer.invoke('certificates:export', domain),
    regenerate: (data) => ipcRenderer.invoke('certificates:regenerate', data),
    getPaths: (domain) => ipcRenderer.invoke('certificates:get-paths', domain),
    copyPaths: (domain) => ipcRenderer.invoke('certificates:copy-paths', domain)
  },

  // Gestión de hosts
  hosts: {
    add: (data) => ipcRenderer.invoke('hosts:add', data),
    remove: (domain) => ipcRenderer.invoke('hosts:remove', domain),
    listBackups: () => ipcRenderer.invoke('hosts:list-backups'),
    cleanupDuplicates: () => ipcRenderer.invoke('hosts:cleanup-duplicates'),
    restoreBackup: (backupPath) => ipcRenderer.invoke('hosts:restore-backup', backupPath)
  },

  // Gestión de CA
  ca: {
    install: () => ipcRenderer.invoke('ca:install'),
    installChrome: () => ipcRenderer.invoke('ca:install-chrome'),
    status: () => ipcRenderer.invoke('ca:status'),
    getInfo: () => ipcRenderer.invoke('ca:get-info'),
    regenerate: () => ipcRenderer.invoke('ca:regenerate')
  },

  // Sistema
  system: {
    openConfigDir: () => ipcRenderer.invoke('system:open-config-dir')
  }
});
