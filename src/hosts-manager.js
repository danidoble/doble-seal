const fs = require('fs-extra');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

class HostsManager {
  constructor() {
    this.configDir = path.join(os.homedir(), '.config', 'doble-seal');
    this.backupsDir = path.join(this.configDir, 'hosts-backups');
    this.localHelperPath = path.join(this.configDir, 'hosts-helper.sh');
    this.systemHelperPath = '/usr/local/bin/doble-seal-hosts-helper';
    this.helperPath = this.systemHelperPath; // Inicialmente intentar el sistema
    
    this.initDirectories();
    this.initHelper();
  }

  async initDirectories() {
    try {
      await fs.ensureDir(this.backupsDir);
    } catch (error) {
      console.error('Error initializing hosts manager directories:', error);
      throw error;
    }
  }

  async initHelper() {
    try {
      // Verificar y posiblemente actualizar el helper del sistema
      await this.checkAndUpdateSystemHelper();
      
      // Primero verificar si el helper del sistema ya está instalado
      if (await fs.pathExists(this.systemHelperPath)) {
        this.helperPath = this.systemHelperPath;
        return;
      }

      // Si no está en el sistema, intentar usar la copia local en .config
      if (await fs.pathExists(this.localHelperPath)) {
        this.helperPath = this.localHelperPath;
        return;
      }

      // Si no existe en ningún lado, intentar crear la copia local
      const helperSource = this.getHelperSourcePath();
      
      if (helperSource && await fs.pathExists(helperSource)) {
        await this.installHelperLocally(helperSource);
      } else {
        console.warn('Helper script no encontrado en las ubicaciones esperadas');
      }
    } catch (error) {
      console.warn('No se pudo inicializar el helper automáticamente:', error.message);
    }
  }

  getHelperSourcePath() {
    // Detectar si estamos ejecutando desde un AppImage/DEB empaquetado
    const isPackaged = process.env.APPIMAGE || process.resourcesPath;
    
    if (isPackaged) {
      // En ejecutable empaquetado con Electron, el helper está en resources/
      if (process.resourcesPath) {
        return path.join(process.resourcesPath, 'hosts-helper.sh');
      }
      
      // En AppImage, buscar en las ubicaciones típicas
      if (process.env.APPIMAGE) {
        // Primero intentar desde APPDIR si está disponible
        if (process.env.APPDIR) {
          return path.join(process.env.APPDIR, 'resources', 'hosts-helper.sh');
        }
        
        // Si no, intentar desde la ubicación relativa al ejecutable
        const appDir = path.dirname(process.execPath);
        const possiblePaths = [
          path.join(appDir, 'resources', 'hosts-helper.sh'),
          path.join(appDir, '..', 'resources', 'hosts-helper.sh'),
          path.join(appDir, 'usr', 'share', 'doble-seal', 'hosts-helper.sh')
        ];
        
        // Buscar en las ubicaciones posibles
        for (const possiblePath of possiblePaths) {
          const fs = require('fs');
          if (fs.existsSync(possiblePath)) {
            return possiblePath;
          }
        }
        
        // Fallback para AppImage
        return path.join(appDir, 'resources', 'hosts-helper.sh');
      }
    } else {
      // En desarrollo, usar la ubicación del código fuente
      return path.join(__dirname, 'helpers', 'hosts-helper.sh');
    }
  }

  async installHelperLocally(sourcePath) {
    try {
      console.log('Instalando helper en directorio local...');
      
      // Copiar el helper al directorio de configuración local
      await fs.copy(sourcePath, this.localHelperPath);
      
      // Dar permisos de ejecución
      await new Promise((resolve, reject) => {
        const chmod = spawn('chmod', ['+x', this.localHelperPath], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        chmod.on('close', (code) => {
          if (code === 0) {
            console.log('Helper instalado localmente');
            this.helperPath = this.localHelperPath;
            resolve();
          } else {
            reject(new Error(`chmod falló con código ${code}`));
          }
        });

        chmod.on('error', reject);
      });

    } catch (error) {
      console.error('Error instalando helper localmente:', error);
      throw new Error(`No se pudo instalar el helper localmente: ${error.message}`);
    }
  }

  async checkAndUpdateSystemHelper() {
    try {
      // Verificar si el helper del sistema existe
      if (!(await fs.pathExists(this.systemHelperPath))) {
        return; // No hay helper instalado, no necesitamos actualizarlo
      }

      // Obtener la versión actual del helper instalado
      const currentVersion = await this.getHelperVersion(this.systemHelperPath);
      
      // Obtener la versión de la nueva aplicación
      const newHelperSource = this.getHelperSourcePath();
      if (!newHelperSource || !(await fs.pathExists(newHelperSource))) {
        return; // No hay nueva versión disponible
      }

      const newVersion = await this.getHelperVersionFromFile(newHelperSource);
      
      // Comparar versiones
      if (this.compareVersions(newVersion, currentVersion) > 0) {
        console.log(`Actualizando helper de v${currentVersion} a v${newVersion}`);
        await this.updateSystemHelper(newHelperSource);
        
        // Notificar a la interfaz sobre la actualización
        if (typeof window !== 'undefined' && window.electronAPI) {
          window.electronAPI.showNotification({
            type: 'info',
            title: 'Helper Actualizado',
            message: `El componente del sistema se actualizó de v${currentVersion} a v${newVersion}`
          });
        }
        
        return { updated: true, from: currentVersion, to: newVersion };
      }
      
      return { updated: false, version: currentVersion };
    } catch (error) {
      console.warn('Error verificando versión del helper:', error.message);
      return { updated: false, error: error.message };
    }
  }

  async getHelperVersion(helperPath) {
    try {
      const result = await this.runHelperCommand({ action: 'version' }, helperPath);
      if (result.success && result.version) {
        return result.version;
      }
      return '1.0.0'; // Versión por defecto si no se puede determinar
    } catch (error) {
      return '1.0.0'; // Versión por defecto en caso de error
    }
  }

  async getHelperVersionFromFile(helperPath) {
    try {
      const content = await fs.readFile(helperPath, 'utf8');
      const versionMatch = content.match(/HELPER_VERSION="([^"]+)"/);
      return versionMatch ? versionMatch[1] : '1.0.0';
    } catch (error) {
      return '1.0.0';
    }
  }

  compareVersions(version1, version2) {
    const v1parts = version1.split('.').map(Number);
    const v2parts = version2.split('.').map(Number);
    
    for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
      const v1part = v1parts[i] || 0;
      const v2part = v2parts[i] || 0;
      
      if (v1part > v2part) return 1;
      if (v1part < v2part) return -1;
    }
    return 0;
  }

  async updateSystemHelper(sourcePath) {
    try {
      // Intentar actualizar el helper del sistema
      const result = await new Promise((resolve, reject) => {
        const cp = spawn('pkexec', ['cp', sourcePath, this.systemHelperPath], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let output = '';
        cp.stdout.on('data', (data) => {
          output += data.toString();
        });

        cp.stderr.on('data', (data) => {
          output += data.toString();
        });

        cp.on('close', (code) => {
          if (code === 0) {
            resolve({ success: true, output });
          } else {
            reject(new Error(`Error actualizando helper: código ${code}, salida: ${output}`));
          }
        });

        cp.on('error', reject);
      });

      // Dar permisos de ejecución
      await new Promise((resolve, reject) => {
        const chmod = spawn('pkexec', ['chmod', '+x', this.systemHelperPath], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        chmod.on('close', (code) => {
          if (code === 0) {
            console.log('Helper del sistema actualizado exitosamente');
            resolve();
          } else {
            reject(new Error(`chmod falló con código ${code}`));
          }
        });

        chmod.on('error', reject);
      });
      
    } catch (error) {
      console.warn('No se pudo actualizar el helper del sistema:', error.message);
    }
  }

  async installHelperSystem(sourcePath) {
    try {
      console.log('Instalando helper en el sistema...');
      
      // Intentar instalar en el sistema usando pkexec
      await new Promise((resolve, reject) => {
        const installProcess = spawn('pkexec', ['cp', sourcePath, this.systemHelperPath], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        installProcess.on('close', (code) => {
          if (code === 0) {
            console.log('Helper copiado al sistema');
            resolve();
          } else {
            reject(new Error(`cp falló con código ${code}`));
          }
        });

        installProcess.on('error', reject);
      });
      
      // Dar permisos de ejecución
      await new Promise((resolve, reject) => {
        const chmod = spawn('pkexec', ['chmod', '+x', this.systemHelperPath], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        chmod.on('close', (code) => {
          if (code === 0) {
            console.log('Helper instalado correctamente en el sistema');
            this.helperPath = this.systemHelperPath;
            resolve();
          } else {
            reject(new Error(`chmod falló con código ${code}`));
          }
        });

        chmod.on('error', reject);
      });

    } catch (error) {
      console.error('Error instalando helper en el sistema:', error);
      // Si falla la instalación del sistema, intentar local como fallback
      await this.installHelperLocally(sourcePath);
    }
  }

  validateDomain(domain) {
    // Validación estricta de nombres de dominio
    const domainRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    
    if (!domainRegex.test(domain)) {
      throw new Error(`Nombre de dominio inválido: ${domain}`);
    }
    
    // Verificar que no contenga caracteres peligrosos
    const dangerousChars = /[;&|`$(){}[\]<>]/;
    if (dangerousChars.test(domain)) {
      throw new Error(`Nombre de dominio contiene caracteres no permitidos: ${domain}`);
    }
    
    return true;
  }

  validateIP(ip) {
    // Validación básica de IP
    const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    
    if (!ipRegex.test(ip)) {
      throw new Error(`Dirección IP inválida: ${ip}`);
    }
    
    return true;
  }

  async runHelperCommand(action, helperPath = null) {
    const targetHelper = helperPath || this.helperPath;
    
    return new Promise((resolve, reject) => {
      const helperProcess = spawn('pkexec', [targetHelper], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Enviar comando al helper
      helperProcess.stdin.write(JSON.stringify(action));
      helperProcess.stdin.end();

      let stdout = '';
      let stderr = '';

      helperProcess.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      helperProcess.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      helperProcess.on('close', (code) => {
        if (code === 0) {
          try {
            const result = JSON.parse(stdout);
            resolve(result);
          } catch (error) {
            resolve({ success: true, message: stdout.trim() });
          }
        } else {
          reject(new Error(`Helper falló: ${stderr.trim() || 'Error desconocido'}`));
        }
      });

      helperProcess.on('error', (error) => {
        reject(new Error(`Error ejecutando helper: ${error.message}`));
      });
    });
  }

  async callHelper(action) {
    return new Promise(async (resolve, reject) => {
      try {
        // Verificar si el helper existe en alguna de las ubicaciones
        let helperFound = false;
        
        // Verificar primero el helper del sistema
        if (fs.existsSync(this.systemHelperPath)) {
          this.helperPath = this.systemHelperPath;
          helperFound = true;
        }
        // Luego verificar el helper local
        else if (fs.existsSync(this.localHelperPath)) {
          this.helperPath = this.localHelperPath;
          helperFound = true;
        }
        
        // Si no se encontró, intentar instalarlo
        if (!helperFound) {
          console.log('Helper no encontrado, intentando instalación...');
          const helperSource = this.getHelperSourcePath();
          
          if (helperSource && fs.existsSync(helperSource)) {
            // Intentar primero instalación en el sistema, luego local como fallback
            try {
              await this.installHelperSystem(helperSource);
            } catch (systemError) {
              console.log('Instalación del sistema falló, usando ubicación local');
              await this.installHelperLocally(helperSource);
            }
          } else {
            reject(new Error('Helper no disponible y no se pudo instalar automáticamente.'));
            return;
          }
        }

        const helperProcess = spawn('pkexec', [this.helperPath], {
          stdio: ['pipe', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        helperProcess.stdout.on('data', (data) => {
          stdout += data.toString();
        });

        helperProcess.stderr.on('data', (data) => {
          stderr += data.toString();
        });

        helperProcess.on('close', (code) => {
          if (code === 0) {
            try {
              const result = JSON.parse(stdout);
              resolve(result);
            } catch (error) {
              resolve({ success: true, message: stdout.trim() });
            }
          } else {
            reject(new Error(`Helper error (código ${code}): ${stderr}`));
          }
        });

        helperProcess.on('error', (error) => {
          reject(error);
        });

        // Enviar datos JSON al helper
        helperProcess.stdin.write(JSON.stringify(action));
        helperProcess.stdin.end();
        
      } catch (error) {
        reject(error);
      }
    });
  }

  async addHost(domain, ip = '127.0.0.1') {
    try {
      // Validar entrada
      this.validateDomain(domain);
      this.validateIP(ip);

      console.log(`Añadiendo ${domain} -> ${ip} al archivo hosts...`);

      const action = {
        action: 'add',
        domain: domain,
        ip: ip
      };

      const result = await this.callHelper(action);
      console.log(`Host añadido: ${domain} -> ${ip}`);
      
      return {
        success: true,
        message: `Dominio ${domain} añadido al archivo hosts`,
        ...result
      };
    } catch (error) {
      console.error('Error adding host:', error);
      throw error;
    }
  }

  async removeHost(domain) {
    try {
      // Validar entrada
      this.validateDomain(domain);

      console.log(`Eliminando ${domain} del archivo hosts...`);

      const action = {
        action: 'remove',
        domain: domain
      };

      const result = await this.callHelper(action);
      console.log(`Host eliminado: ${domain}`);
      
      return {
        success: true,
        message: `Dominio ${domain} eliminado del archivo hosts`,
        ...result
      };
    } catch (error) {
      console.error('Error removing host:', error);
      throw error;
    }
  }

  async listBackups() {
    try {
      const backupFiles = await fs.readdir(this.backupsDir);
      const backups = [];

      for (const file of backupFiles) {
        if (file.startsWith('hosts.backup.')) {
          const filePath = path.join(this.backupsDir, file);
          const stats = await fs.stat(filePath);
          const timestamp = file.replace('hosts.backup.', '').replace('.txt', '');
          
          backups.push({
            filename: file,
            timestamp: timestamp,
            date: stats.mtime,
            size: stats.size,
            path: filePath
          });
        }
      }

      // Ordenar por fecha, más reciente primero
      backups.sort((a, b) => b.date - a.date);

      return {
        success: true,
        backups: backups
      };
    } catch (error) {
      console.error('Error listing backups:', error);
      return { success: true, backups: [] };
    }
  }

  async getManagedHosts() {
    try {
      const action = {
        action: 'list'
      };

      const result = await this.callHelper(action);
      return result;
    } catch (error) {
      console.error('Error getting managed hosts:', error);
      return { success: true, hosts: [] };
    }
  }

  async cleanupDuplicates() {
    try {
      console.log('Limpiando duplicados en archivo hosts...');

      const action = {
        action: 'cleanup'
      };

      const result = await this.callHelper(action);
      console.log('Duplicados eliminados');
      
      return {
        success: true,
        message: 'Duplicados eliminados del archivo hosts',
        ...result
      };
    } catch (error) {
      console.error('Error cleaning up duplicates:', error);
      throw error;
    }
  }

  async restoreBackup(backupPath) {
    try {
      console.log('Restaurando backup:', backupPath);

      const action = {
        action: 'restore',
        backupFile: backupPath
      };

      const result = await this.callHelper(action);
      console.log('Backup restaurado');
      
      return {
        success: true,
        message: 'Archivo hosts restaurado desde backup',
        ...result
      };
    } catch (error) {
      console.error('Error restoring backup:', error);
      throw error;
    }
  }
}

module.exports = HostsManager;
