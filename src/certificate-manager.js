const forge = require("node-forge");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");

class CertificateManager {
  constructor() {
    this.configDir = path.join(os.homedir(), ".config", "doble-seal");
    this.caDir = path.join(this.configDir, "ca");
    this.certsDir = path.join(this.configDir, "certificates");
    this.metadataFile = path.join(this.configDir, "metadata.json");

    this.initDirectories();
  }

  async initDirectories() {
    try {
      await fs.ensureDir(this.configDir);
      await fs.ensureDir(this.caDir);
      await fs.ensureDir(this.certsDir);

      // Inicializar archivo de metadatos si no existe
      if (!(await fs.pathExists(this.metadataFile))) {
        await fs.writeJson(this.metadataFile, { certificates: {} });
      }
    } catch (error) {
      console.error("Error initializing directories:", error);
      throw error;
    }
  }

  getConfigDir() {
    return this.configDir;
  }

  async generateCA() {
    try {
      console.log("Generando CA local...");

      // Generar clave privada del CA
      const caKeyPair = forge.pki.rsa.generateKeyPair(2048);

      // Crear certificado del CA
      const caCert = forge.pki.createCertificate();
      caCert.publicKey = caKeyPair.publicKey;
      caCert.serialNumber = "01";
      caCert.validity.notBefore = new Date();
      caCert.validity.notAfter = new Date();
      caCert.validity.notAfter.setFullYear(
        caCert.validity.notBefore.getFullYear() + 10
      );

      const caAttrs = [
        { name: "commonName", value: "DobleSeal Local CA" },
        { name: "countryName", value: "ES" },
        { name: "stateOrProvinceName", value: "Local" },
        { name: "localityName", value: "Local" },
        { name: "organizationName", value: "DobleSeal" },
        { name: "organizationalUnitName", value: "Local Development" },
      ];

      caCert.setSubject(caAttrs);
      caCert.setIssuer(caAttrs);

      caCert.setExtensions([
        {
          name: "basicConstraints",
          cA: true,
          critical: true,
        },
        {
          name: "keyUsage",
          keyCertSign: true,
          cRLSign: true,
          critical: true,
        },
      ]);

      // Firmar el certificado del CA
      caCert.sign(caKeyPair.privateKey, forge.md.sha256.create());

      // Guardar archivos del CA
      const caKeyPem = forge.pki.privateKeyToPem(caKeyPair.privateKey);
      const caCertPem = forge.pki.certificateToPem(caCert);

      await fs.writeFile(path.join(this.caDir, "ca-key.pem"), caKeyPem);
      await fs.writeFile(path.join(this.caDir, "ca-cert.pem"), caCertPem);

      console.log("CA generado correctamente");
      return { success: true, message: "CA generado correctamente" };
    } catch (error) {
      console.error("Error generating CA:", error);
      throw error;
    }
  }

  async loadCA() {
    try {
      const caKeyPath = path.join(this.caDir, "ca-key.pem");
      const caCertPath = path.join(this.caDir, "ca-cert.pem");

      if (
        !(await fs.pathExists(caKeyPath)) ||
        !(await fs.pathExists(caCertPath))
      ) {
        await this.generateCA();
      }

      const caKeyPem = await fs.readFile(caKeyPath, "utf8");
      const caCertPem = await fs.readFile(caCertPath, "utf8");

      const caKey = forge.pki.privateKeyFromPem(caKeyPem);
      const caCert = forge.pki.certificateFromPem(caCertPem);

      return { caKey, caCert };
    } catch (error) {
      console.error("Error loading CA:", error);
      throw error;
    }
  }

  async regenerateCA() {
    try {
      console.log("Regenerando CA root...");
      
      // Crear un backup del CA actual si existe
      const caKeyPath = path.join(this.caDir, "ca-key.pem");
      const caCertPath = path.join(this.caDir, "ca-cert.pem");
      
      if (await fs.pathExists(caKeyPath) && await fs.pathExists(caCertPath)) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupDir = path.join(this.caDir, 'backups');
        await fs.ensureDir(backupDir);
        
        // Crear backup del CA anterior
        await fs.copy(caKeyPath, path.join(backupDir, `ca-key-${timestamp}.pem`));
        await fs.copy(caCertPath, path.join(backupDir, `ca-cert-${timestamp}.pem`));
        
        console.log(`CA anterior respaldado con timestamp: ${timestamp}`);
      }
      
      // Regenerar el CA
      await this.generateCA();
      
      // Obtener información del nuevo CA
      const caCertPem = await fs.readFile(caCertPath, "utf8");
      const caCert = forge.pki.certificateFromPem(caCertPem);
      
      const caInfo = {
        subject: caCert.subject.attributes.find(attr => attr.name === 'commonName')?.value || 'Cert-Linux CA',
        validFrom: caCert.validity.notBefore,
        validTo: caCert.validity.notAfter,
        serialNumber: caCert.serialNumber
      };
      
      console.log("CA regenerado exitosamente");
      return { 
        success: true, 
        message: "CA root regenerado exitosamente",
        caInfo: caInfo
      };
    } catch (error) {
      console.error("Error regenerating CA:", error);
      throw error;
    }
  }

  async getCAInfo() {
    try {
      const caCertPath = path.join(this.caDir, "ca-cert.pem");
      
      if (!(await fs.pathExists(caCertPath))) {
        return null;
      }
      
      const caCertPem = await fs.readFile(caCertPath, "utf8");
      const caCert = forge.pki.certificateFromPem(caCertPem);
      
      const isExpired = new Date() > caCert.validity.notAfter;
      const daysUntilExpiry = Math.ceil((caCert.validity.notAfter - new Date()) / (1000 * 60 * 60 * 24));
      
      return {
        subject: caCert.subject.attributes.find(attr => attr.name === 'commonName')?.value || 'Cert-Linux CA',
        validFrom: caCert.validity.notBefore,
        validTo: caCert.validity.notAfter,
        serialNumber: caCert.serialNumber,
        isExpired: isExpired,
        daysUntilExpiry: daysUntilExpiry,
        isExpiringSoon: daysUntilExpiry <= 30 && daysUntilExpiry > 0
      };
    } catch (error) {
      console.error("Error getting CA info:", error);
      return null;
    }
  }

  validateDomain(domain) {
    // Validación estricta de nombres de dominio
    const domainRegex =
      /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

    if (!domainRegex.test(domain)) {
      throw new Error(`Nombre de dominio inválido: ${domain}`);
    }

    // Verificar que no contenga caracteres peligrosos
    const dangerousChars = /[;&|`$(){}[\]<>]/;
    if (dangerousChars.test(domain)) {
      throw new Error(
        `Nombre de dominio contiene caracteres no permitidos: ${domain}`
      );
    }

    return true;
  }

  async createCertificate(domain, sans = [], duration = 365) {
    try {
      // Validar dominio principal
      this.validateDomain(domain);

      // Validar SANs
      sans.forEach((san) => this.validateDomain(san));

      console.log(`Creando certificado para ${domain}...`);

      const { caKey, caCert } = await this.loadCA();

      // Generar clave privada para el certificado
      const keyPair = forge.pki.rsa.generateKeyPair(2048);

      // Crear certificado
      const cert = forge.pki.createCertificate();
      cert.publicKey = keyPair.publicKey;
      cert.serialNumber = Date.now().toString();
      cert.validity.notBefore = new Date();
      cert.validity.notAfter = new Date();
      cert.validity.notAfter.setDate(
        cert.validity.notBefore.getDate() + duration
      );

      const attrs = [
        { name: "commonName", value: domain },
        { name: "countryName", value: "ES" },
        { name: "stateOrProvinceName", value: "Local" },
        { name: "localityName", value: "Local" },
        { name: "organizationName", value: "Local Development" },
      ];

      cert.setSubject(attrs);
      cert.setIssuer(caCert.subject.attributes);

      // Preparar extensiones
      const extensions = [
        {
          name: "basicConstraints",
          cA: false,
        },
        {
          name: "keyUsage",
          keyEncipherment: true,
          digitalSignature: true,
        },
        {
          name: "extKeyUsage",
          serverAuth: true,
          clientAuth: true,
        },
      ];

      // Añadir SAN (Subject Alternative Names)
      const altNames = [{ type: 2, value: domain }]; // DNS name
      sans.forEach((san) => {
        altNames.push({ type: 2, value: san });
      });

      extensions.push({
        name: "subjectAltName",
        altNames: altNames,
      });

      cert.setExtensions(extensions);

      // Firmar certificado con CA
      cert.sign(caKey, forge.md.sha256.create());

      // Convertir a PEM
      const keyPem = forge.pki.privateKeyToPem(keyPair.privateKey);
      const certPem = forge.pki.certificateToPem(cert);

      // Crear directorio para el dominio
      const domainDir = path.join(this.certsDir, domain);
      await fs.ensureDir(domainDir);

      // Guardar archivos
      await fs.writeFile(path.join(domainDir, "private-key.pem"), keyPem);
      await fs.writeFile(path.join(domainDir, "certificate.pem"), certPem);
      await fs.writeFile(path.join(domainDir, "fullchain.pem"), certPem);

      // Generar documentación
      await this.generateDocumentation(domain, sans, duration);

      // Actualizar metadatos
      const metadata = await fs.readJson(this.metadataFile);
      metadata.certificates[domain] = {
        created: new Date().toISOString(),
        sans: sans,
        duration: duration,
        expiresAt: cert.validity.notAfter.toISOString(),
      };
      await fs.writeJson(this.metadataFile, metadata, { spaces: 2 });

      console.log(`Certificado creado para ${domain}`);
      return {
        success: true,
        message: `Certificado creado correctamente para ${domain}`,
        data: metadata.certificates[domain],
      };
    } catch (error) {
      console.error("Error creating certificate:", error);
      throw error;
    }
  }

  async listCertificates() {
    try {
      const metadata = await fs.readJson(this.metadataFile);
      return { success: true, certificates: metadata.certificates };
    } catch (error) {
      console.error("Error listing certificates:", error);
      return { success: true, certificates: {} };
    }
  }

  async deleteCertificate(domain) {
    try {
      this.validateDomain(domain);

      const domainDir = path.join(this.certsDir, domain);

      if (await fs.pathExists(domainDir)) {
        await fs.remove(domainDir);
      }

      // Actualizar metadatos
      const metadata = await fs.readJson(this.metadataFile);
      delete metadata.certificates[domain];
      await fs.writeJson(this.metadataFile, metadata, { spaces: 2 });

      return { success: true, message: `Certificado eliminado para ${domain}` };
    } catch (error) {
      console.error("Error deleting certificate:", error);
      throw error;
    }
  }

  async exportCertificate(domain, exportPath) {
    try {
      this.validateDomain(domain);

      const domainDir = path.join(this.certsDir, domain);

      if (!(await fs.pathExists(domainDir))) {
        throw new Error(`Certificado no encontrado para ${domain}`);
      }

      // Crear archivo ZIP usando comando del sistema
      return new Promise((resolve, reject) => {
        const zipProcess = spawn("zip", ["-r", exportPath, domain], {
          cwd: this.certsDir,
        });

        zipProcess.on("close", (code) => {
          if (code === 0) {
            resolve({
              success: true,
              message: `Certificado exportado a ${exportPath}`,
            });
          } else {
            reject(new Error(`Error al crear archivo ZIP (código: ${code})`));
          }
        });

        zipProcess.on("error", (error) => {
          reject(error);
        });
      });
    } catch (error) {
      console.error("Error exporting certificate:", error);
      throw error;
    }
  }

  async regenerateCertificate(domain, sans = [], duration = 365) {
    try {
      // Eliminar certificado existente
      await this.deleteCertificate(domain);

      // Crear nuevo certificado
      return await this.createCertificate(domain, sans, duration);
    } catch (error) {
      console.error("Error regenerating certificate:", error);
      throw error;
    }
  }

  async getCertificatePaths(domain) {
    try {
      this.validateDomain(domain);

      const domainDir = path.join(this.certsDir, domain);

      if (!(await fs.pathExists(domainDir))) {
        throw new Error(`Certificado no encontrado para ${domain}`);
      }

      const paths = {
        certificate: path.join(domainDir, "certificate.pem"),
        privateKey: path.join(domainDir, "private-key.pem"),
        fullchain: path.join(domainDir, "fullchain.pem"),
        caCertificate: path.join(this.caDir, "ca-cert.pem"),
      };

      // Verificar que los archivos existan
      for (const [key, filePath] of Object.entries(paths)) {
        if (!(await fs.pathExists(filePath))) {
          throw new Error(`Archivo ${key} no encontrado: ${filePath}`);
        }
      }

      return {
        success: true,
        paths: paths,
        nginxConfig: this.generateNginxConfig(domain, paths),
      };
    } catch (error) {
      console.error("Error getting certificate paths:", error);
      throw error;
    }
  }

  generateNginxConfig(domain, paths) {
    return `# Configuración SSL para ${domain}
server {
    listen 443 ssl;
    listen [::]:443 ssl;
    http2 on;
    server_name ${domain};

    ssl_certificate ${paths.certificate};
    ssl_certificate_key ${paths.privateKey};
    
    # Configuración SSL recomendada
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384;
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Tu configuración de aplicación aquí
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# Redirección HTTP a HTTPS
server {
    listen 80;
    listen [::]:80;
    server_name ${domain};
    return 301 https://$server_name$request_uri;
}`;
  }

  async getCAStatus() {
    try {
      const caCertPath = path.join(this.caDir, "ca-cert.pem");

      if (!(await fs.pathExists(caCertPath))) {
        return { exists: false, installed: false };
      }

      // Verificar si está instalado en el sistema
      return new Promise((resolve) => {
        const checkProcess = spawn("ls", ["/etc/ssl/certs/"], {
          stdio: "pipe",
        });
        let output = "";

        checkProcess.stdout.on("data", (data) => {
          output += data.toString();
        });

        checkProcess.on("close", () => {
          const installed =
            output.includes("doble-seal-ca") || output.includes("DobleSeal");
          resolve({ exists: true, installed });
        });

        checkProcess.on("error", () => {
          resolve({ exists: true, installed: false });
        });
      });
    } catch (error) {
      console.error("Error getting CA status:", error);
      return { exists: false, installed: false };
    }
  }

  async installCA() {
    try {
      const caCertPath = path.join(this.caDir, "ca-cert.pem");

      if (!(await fs.pathExists(caCertPath))) {
        await this.generateCA();
      }

      // Detectar distribución
      const osRelease = await fs.readFile("/etc/os-release", "utf8");
      const isUbuntu =
        osRelease.includes("ubuntu") || osRelease.includes("debian");

      return new Promise((resolve, reject) => {
        let command;
        let args;

        if (isUbuntu) {
          // Ubuntu/Debian
          command = "pkexec";
          args = [
            "bash",
            "-c",
            `cp "${caCertPath}" /usr/local/share/ca-certificates/doble-seal-ca.crt && update-ca-certificates`,
          ];
        } else {
          // Fedora/RHEL/CentOS
          command = "pkexec";
          args = [
            "bash",
            "-c",
            `cp "${caCertPath}" /etc/pki/ca-trust/source/anchors/doble-seal-ca.crt && update-ca-trust extract`,
          ];
        }

        const installProcess = spawn(command, args, {
          stdio: ["pipe", "pipe", "pipe"],
        });

        let stdout = "";
        let stderr = "";

        installProcess.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        installProcess.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        installProcess.on("close", (code) => {
          if (code === 0) {
            console.log("CA installed successfully");
            // Intentar instalar también en Chrome
            this.installCAInChrome()
              .then(() => {
                resolve({
                  success: true,
                  message: "CA instalado correctamente en el sistema y Chrome",
                });
              })
              .catch(() => {
                resolve({
                  success: true,
                  message:
                    "CA instalado correctamente en el sistema (Chrome no disponible)",
                });
              });
          } else {
            console.error("Error installing CA:", stderr);
            reject(
              new Error(`Error instalando CA (código ${code}): ${stderr}`)
            );
          }
        });

        installProcess.on("error", (error) => {
          console.error("Error launching install process:", error);
          reject(error);
        });
      });
    } catch (error) {
      console.error("Error installing CA:", error);
      throw error;
    }
  }

  async installCAInChrome() {
    try {
      const caCertPath = path.join(this.caDir, "ca-cert.pem");

      // Buscar instalaciones de Chrome/Chromium
      const chromePaths = [
        "/opt/google/chrome/chrome",
        "/usr/bin/google-chrome",
        "/usr/bin/google-chrome-stable",
        "/usr/bin/chromium",
        "/usr/bin/chromium-browser",
        "/snap/bin/chromium",
      ];

      let chromeInstalled = false;
      for (const chromePath of chromePaths) {
        if (await fs.pathExists(chromePath)) {
          chromeInstalled = true;
          break;
        }
      }

      if (!chromeInstalled) {
        throw new Error("Chrome/Chromium no encontrado");
      }

      // Directorio de certificados de Chrome para el usuario actual
      const chromeDir = path.join(os.homedir(), ".pki", "nssdb");

      // Verificar si NSS está disponible
      const certutilPaths = ["/usr/bin/certutil", "/usr/local/bin/certutil"];
      let certutilPath = null;

      for (const cPath of certutilPaths) {
        if (await fs.pathExists(cPath)) {
          certutilPath = cPath;
          break;
        }
      }

      if (!certutilPath) {
        throw new Error("certutil no encontrado. Instalar libnss3-tools");
      }

      // Crear directorio NSS si no existe
      if (!(await fs.pathExists(chromeDir))) {
        await fs.ensureDir(chromeDir);

        // Inicializar base de datos NSS
        await new Promise((resolve, reject) => {
          const initProcess = spawn(
            certutilPath,
            ["-N", "-d", `sql:${chromeDir}`, "--empty-password"],
            {
              stdio: ["pipe", "pipe", "pipe"],
            }
          );

          initProcess.on("close", (code) => {
            if (code === 0 || code === 255) {
              // 255 puede indicar que ya existe
              resolve();
            } else {
              reject(
                new Error(`Error inicializando NSS database (código ${code})`)
              );
            }
          });

          initProcess.on("error", reject);
        });
      }

      // Remover certificado existente si está
      await new Promise((resolve) => {
        const deleteProcess = spawn(
          certutilPath,
          ["-D", "-n", "DobleSeal Local CA", "-d", `sql:${chromeDir}`],
          {
            stdio: ["pipe", "pipe", "pipe"],
          }
        );

        deleteProcess.on("close", () => {
          resolve();
        });

        deleteProcess.on("error", () => {
          resolve();
        });
      });

      // Agregar certificado CA a Chrome
      return new Promise((resolve, reject) => {
        const addCertProcess = spawn(
          certutilPath,
          [
            "-A",
            "-n",
            "DobleSeal Local CA",
            "-t",
            "CT,C,C",
            "-i",
            caCertPath,
            "-d",
            `sql:${chromeDir}`,
          ],
          {
            stdio: ["pipe", "pipe", "pipe"],
          }
        );

        let stdout = "";
        let stderr = "";

        addCertProcess.stdout.on("data", (data) => {
          stdout += data.toString();
        });

        addCertProcess.stderr.on("data", (data) => {
          stderr += data.toString();
        });

        addCertProcess.on("close", (code) => {
          if (code === 0) {
            console.log("CA added to Chrome successfully");
            resolve({
              success: true,
              message: "CA añadido a Chrome correctamente",
            });
          } else {
            console.error("Error adding CA to Chrome:", stderr);
            reject(
              new Error(
                `Error añadiendo CA a Chrome (código ${code}): ${stderr}`
              )
            );
          }
        });

        addCertProcess.on("error", (error) => {
          console.error("Error launching certutil:", error);
          reject(error);
        });
      });
    } catch (error) {
      console.error("Error installing CA in Chrome:", error);
      throw error;
    }
  }

  async generateDocumentation(domain, sans = [], duration = 365) {
    try {
      const domainDir = path.join(this.certsDir, domain);
      const readmeFile = path.join(domainDir, "README.md");
      
      const certPath = path.join(domainDir, "certificate.pem");
      const keyPath = path.join(domainDir, "private-key.pem");
      
      const createdDate = new Date().toLocaleString('es-ES');
      const expiryDate = new Date(Date.now() + duration * 24 * 60 * 60 * 1000).toLocaleString('es-ES');
      
      const sansText = sans.length > 0 ? sans.join(', ') : 'Ninguno';
      
      const documentation = `# Certificado SSL para ${domain}

## Información del Certificado

- **Dominio Principal**: ${domain}
- **Dominios Alternativos (SAN)**: ${sansText}
- **Fecha de Creación**: ${createdDate}
- **Duración**: ${duration} días
- **Fecha de Expiración**: ${expiryDate}
- **Algoritmo**: RSA 2048 bits
- **Firmado por**: DobleSeal CA

## Archivos Generados

### certificate.pem
Certificado público en formato PEM. Este archivo contiene la clave pública y la información del certificado.

### private-key.pem
Clave privada en formato PEM. **¡MANTÉN ESTE ARCHIVO SEGURO!** No lo compartas nunca.

### fullchain.pem
Cadena completa del certificado (actualmente igual al certificado.pem).

## Configuración en Servidor Web

### Apache
\`\`\`apache
<VirtualHost *:443>
    ServerName ${domain}
    ${sans.map(san => `ServerAlias ${san}`).join('\n    ')}
    
    SSLEngine on
    SSLCertificateFile ${certPath}
    SSLCertificateKeyFile ${keyPath}
    
    DocumentRoot /var/www/${domain}
</VirtualHost>
\`\`\`

### Nginx
\`\`\`nginx
server {
    listen 443 ssl;
    server_name ${domain}${sans.length > 0 ? ' ' + sans.join(' ') : ''};
    
    ssl_certificate ${certPath};
    ssl_certificate_key ${keyPath};
    
    root /var/www/${domain};
    index index.html index.php;
}
\`\`\`

### Node.js (Express)
\`\`\`javascript
const https = require('https');
const fs = require('fs');
const express = require('express');

const app = express();

const options = {
    key: fs.readFileSync('${keyPath}'),
    cert: fs.readFileSync('${certPath}')
};

https.createServer(options, app).listen(443, () => {
    console.log('Servidor HTTPS ejecutándose en puerto 443');
});
\`\`\`

### Docker Compose
\`\`\`yaml
version: '3.8'
services:
  web:
    image: nginx:alpine
    ports:
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
      - ${certPath}:/etc/ssl/certs/certificate.pem
      - ${keyPath}:/etc/ssl/private/private-key.pem
\`\`\`

## Configuración del Sistema

### Agregar al archivo hosts
Para que el dominio resuelva a localhost, agrega esta línea a \`/etc/hosts\`:
\`\`\`
127.0.0.1 ${domain}${sans.map(san => ` ${san}`).join('')}
\`\`\`

### Instalar CA en el sistema
Para que el navegador confíe en este certificado, instala la CA:
\`\`\`bash
# Instalar CA en el sistema
sudo cp ~/.config/doble-seal/ca/ca.crt /usr/local/share/ca-certificates/doble-seal-ca.crt
sudo update-ca-certificates

# Para Chrome/Chromium
certutil -d sql:$HOME/.pki/nssdb -A -t "C,," -n "DobleSeal CA" -i ~/.config/doble-seal/ca/ca.crt
\`\`\`

## Verificación

### Verificar certificado
\`\`\`bash
openssl x509 -in ${certPath} -text -noout
\`\`\`

### Probar conexión
\`\`\`bash
curl -v https://${domain}
\`\`\`

### Verificar en navegador
Visita \`https://${domain}\` en tu navegador. Si la CA está instalada correctamente, verás un candado verde.

## Renovación

Este certificado expira el **${expiryDate}**. Para renovarlo:

1. Abre DobleSeal
2. Encuentra el certificado para \`${domain}\`
3. Haz clic en "Regenerar"
4. Reinicia tu servidor web

## Soporte

- **Documentación**: [DobleSeal GitHub](https://github.com/danidoble/doble-seal)
- **Problemas**: Abre un issue en GitHub
- **Configuración**: \`~/.config/doble-seal/\`

---
*Generado automáticamente por DobleSeal el ${createdDate}*
`;

      await fs.writeFile(readmeFile, documentation);
      console.log(`Documentación generada: ${readmeFile}`);
      
    } catch (error) {
      console.error('Error generating documentation:', error);
      // No lanzar error para no interrumpir la creación del certificado
    }
  }
}

module.exports = CertificateManager;
