const { app, BrowserWindow, ipcMain, dialog, Menu } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const CertificateManager = require('./certificate-manager');
const HostsManager = require('./hosts-manager');

class MainApp {
  constructor() {
    this.mainWindow = null;
    this.certificateManager = new CertificateManager();
    this.hostsManager = new HostsManager();
    
    this.setupApp();
    this.setupIPC();
  }

  setupApp() {
    app.whenReady().then(() => {
      // Establecer un menú vacío para eliminar completamente la barra de menú
      Menu.setApplicationMenu(null);
      
      this.createWindow();
      
      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
          this.createWindow();
        }
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') {
        app.quit();
      }
    });
  }

  createWindow() {
    this.mainWindow = new BrowserWindow({
      width: 1200,
      height: 800,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        preload: path.join(__dirname, 'preload.js')
      },
      autoHideMenuBar: true, // Ocultar la barra de menú automáticamente
      menuBarVisible: false,  // Hacer la barra de menú invisible
      frame: true             // Mantener el marco de la ventana pero sin menú
    });

    // Asegurar que no hay menú en esta ventana específica
    this.mainWindow.setMenuBarVisibility(false);
    this.mainWindow.setAutoHideMenuBar(true);

    this.mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

    if (process.argv.includes('--dev')) {
      this.mainWindow.webContents.openDevTools();
    }
  }

  setupIPC() {
    // Gestión de certificados
    ipcMain.handle('certificates:list', async () => {
      try {
        return await this.certificateManager.listCertificates();
      } catch (error) {
        console.error('Error listing certificates:', error);
        throw error;
      }
    });

    ipcMain.handle('certificates:create', async (event, { domain, sans = [], duration = 365 }) => {
      try {
        return await this.certificateManager.createCertificate(domain, sans, duration);
      } catch (error) {
        console.error('Error creating certificate:', error);
        throw error;
      }
    });

    ipcMain.handle('certificates:delete', async (event, domain) => {
      try {
        return await this.certificateManager.deleteCertificate(domain);
      } catch (error) {
        console.error('Error deleting certificate:', error);
        throw error;
      }
    });

    ipcMain.handle('certificates:export', async (event, domain) => {
      try {
        const result = await dialog.showSaveDialog(this.mainWindow, {
          title: 'Exportar certificado',
          defaultPath: `${domain}.zip`,
          filters: [
            { name: 'Archivo ZIP', extensions: ['zip'] }
          ]
        });

        if (!result.canceled) {
          return await this.certificateManager.exportCertificate(domain, result.filePath);
        }
        return { success: false, message: 'Exportación cancelada' };
      } catch (error) {
        console.error('Error exporting certificate:', error);
        throw error;
      }
    });

    ipcMain.handle('certificates:regenerate', async (event, { domain, sans = [], duration = 365 }) => {
      try {
        return await this.certificateManager.regenerateCertificate(domain, sans, duration);
      } catch (error) {
        console.error('Error regenerating certificate:', error);
        throw error;
      }
    });

    ipcMain.handle('certificates:get-paths', async (event, domain) => {
      try {
        return await this.certificateManager.getCertificatePaths(domain);
      } catch (error) {
        console.error('Error getting certificate paths:', error);
        throw error;
      }
    });

    ipcMain.handle('certificates:copy-paths', async (event, domain) => {
      try {
        const result = await this.certificateManager.getCertificatePaths(domain);
        
        if (result.success) {
          // Copiar al clipboard
          const { clipboard } = require('electron');
          const pathsText = `# Rutas de certificados para ${domain}
Certificado: ${result.paths.certificate}
Clave privada: ${result.paths.privateKey}
Cadena completa: ${result.paths.fullchain}
CA: ${result.paths.caCertificate}

${result.nginxConfig}`;
          
          clipboard.writeText(pathsText);
          return { 
            success: true, 
            message: 'Rutas copiadas al portapapeles',
            paths: result.paths,
            nginxConfig: result.nginxConfig
          };
        }
        
        return result;
      } catch (error) {
        console.error('Error copying certificate paths:', error);
        throw error;
      }
    });

    // Gestión de hosts
    ipcMain.handle('hosts:add', async (event, { domain, ip = '127.0.0.1' }) => {
      try {
        return await this.hostsManager.addHost(domain, ip);
      } catch (error) {
        console.error('Error adding host:', error);
        
        // Si el error está relacionado con permisos, proporcionar información útil
        if (error.message.includes('pkexec') || error.message.includes('permission') || error.message.includes('Permission')) {
          throw new Error('Se requieren permisos de administrador para modificar el archivo /etc/hosts. Se mostrará un diálogo de autenticación.');
        }
        
        throw error;
      }
    });

    ipcMain.handle('hosts:remove', async (event, domain) => {
      try {
        return await this.hostsManager.removeHost(domain);
      } catch (error) {
        console.error('Error removing host:', error);
        
        // Si el error está relacionado con permisos, proporcionar información útil
        if (error.message.includes('pkexec') || error.message.includes('permission') || error.message.includes('Permission')) {
          throw new Error('Se requieren permisos de administrador para modificar el archivo /etc/hosts. Se mostrará un diálogo de autenticación.');
        }
        
        throw error;
      }
    });

    ipcMain.handle('hosts:list-backups', async () => {
      try {
        return await this.hostsManager.listBackups();
      } catch (error) {
        console.error('Error listing backups:', error);
        throw error;
      }
    });

    ipcMain.handle('hosts:cleanup-duplicates', async () => {
      try {
        return await this.hostsManager.cleanupDuplicates();
      } catch (error) {
        console.error('Error cleaning up duplicates:', error);
        throw error;
      }
    });

    ipcMain.handle('hosts:restore-backup', async (event, backupPath) => {
      try {
        return await this.hostsManager.restoreBackup(backupPath);
      } catch (error) {
        console.error('Error restoring backup:', error);
        throw error;
      }
    });

    // Instalación de CA
    ipcMain.handle('ca:install', async () => {
      try {
        return await this.certificateManager.installCA();
      } catch (error) {
        console.error('Error installing CA:', error);
        throw error;
      }
    });

    ipcMain.handle('ca:install-chrome', async () => {
      try {
        return await this.certificateManager.installCAInChrome();
      } catch (error) {
        console.error('Error installing CA in Chrome:', error);
        throw error;
      }
    });

    // Gestión del CA
    ipcMain.handle('ca:get-info', async () => {
      try {
        return await this.certificateManager.getCAInfo();
      } catch (error) {
        console.error('Error getting CA info:', error);
        throw error;
      }
    });

    ipcMain.handle('ca:regenerate', async () => {
      try {
        return await this.certificateManager.regenerateCA();
      } catch (error) {
        console.error('Error regenerating CA:', error);
        throw error;
      }
    });

    ipcMain.handle('ca:status', async () => {
      try {
        return await this.certificateManager.getCAStatus();
      } catch (error) {
        console.error('Error getting CA status:', error);
        throw error;
      }
    });

    // Sistema
    ipcMain.handle('system:open-config-dir', async () => {
      try {
        const { shell } = require('electron');
        const configDir = this.certificateManager.getConfigDir();
        await shell.openPath(configDir);
        return { success: true };
      } catch (error) {
        console.error('Error opening config directory:', error);
        throw error;
      }
    });
  }
}

// Inicializar la aplicación
new MainApp();
