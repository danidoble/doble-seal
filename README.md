# DobleSeal

Aplicación de escritorio para gestión de certificados autofirmados en Linux.

## Acerca de

DobleSeal es una aplicación de escritorio construida con Electron que facilita la creación y gestión de certificados SSL autofirmados en sistemas Linux. Ideal para desarrolladores web que necesitan certificados para entornos de desarrollo local.

### ✨ Nuevas funcionalidades v1.1

- **📄 Ver Rutas**: Copia rutas de archivos de certificados para configurar Nginx, Apache, etc.
- **🌐 CA en Chrome**: Instala automáticamente el CA en Chrome/Chromium para desarrollo
- **📋 Configuración Nginx**: Genera configuración SSL completa lista para usar
- **➕ Agregar Dominios**: Añade nuevos dominios (SANs) a certificados existentes sin recrearlos

### Primer uso

1. **Instalar CA**: Al abrir la aplicación, instala el CA local en el sistema
2. **Crear certificado**: Crea tu primer certificado especificando el dominio
3. **Añadir a hosts**: Añade el dominio al archivo `/etc/hosts`

## Características

- 🔒 **Generación de certificados SSL**: Crea certificados autofirmados con CA local
- 🏛️ **Gestión de CA**: Instala automáticamente el CA en el sistema y Chrome
- 📄 **Rutas de certificados**: Copia rutas para configuraciones de Nginx y otros servidores
- ➕ **Agregar dominios**: Añade nuevos dominios a certificados existentes sin recrearlos
- 🌐 **Gestión de hosts**: Modifica /etc/hosts de forma segura
- 💾 **Backups automáticos**: Crea backups antes de modificar archivos del sistema
- 🔐 **Seguridad**: Elevación puntual de privilegios sin ejecutar toda la app como root
- 📦 **Exportación**: Exporta certificados en formato ZIP

## Instalación

### Requisitos previos

- Node.js 16 o superior
- npm o yarn
- Linux (Ubuntu, Debian, Fedora, RHEL, CentOS)

### Desde código fuente

- Clona el repositorio:

```bash
git clone <repository-url>
cd doble-seal
```

- Instala las dependencias:

```bash
npm install
```

- Instala el helper privilegiado:

```bash
npm run install-helper
```

- Ejecuta la aplicación:

```bash
npm start
```

### Desde paquete

Descarga el archivo `.deb` o `.AppImage` desde las releases y ejecuta:

```bash
# Para .deb
sudo dpkg -i doble-seal_1.0.0_amd64.deb

# Para AppImage
chmod +x doble-seal-1.0.0.AppImage
./doble-seal-1.0.0.AppImage
```

## Uso

### Primera vez

1. **Instalar CA**: Al abrir la aplicación, instala el CA local en el sistema
2. **Crear certificado**: Crea tu primer certificado especificando el dominio
3. **Añadir a hosts**: Añade el dominio al archivo `/etc/hosts`

### Gestión de certificados

- **Crear**: Especifica dominio, SANs opcionales y duración
- **Regenerar**: Renueva un certificado manteniendo la misma configuración
- **Exportar**: Descarga los archivos del certificado en ZIP
- **Eliminar**: Elimina certificado y archivos asociados

### Gestión de hosts

- **Añadir**: Añade dominio al `/etc/hosts` apuntando a `127.0.0.1`
- **Eliminar**: Elimina entrada del archivo hosts
- **Backups**: Ve el historial de backups automáticos

### Gestión del CA Root

- **Información del CA**: Visualiza el estado, fecha de expiración y días restantes del certificado CA
- **Regenerar CA**: Regenera el certificado CA raíz cuando esté próximo a caducar o sea necesario
- **Alertas de expiración**: Notificaciones cuando el CA está próximo a expirar (30 días o menos)
- **Backup automático**: Al regenerar el CA, se crea automáticamente un backup del CA anterior

## Arquitectura

### Componentes principales

- **Main Process** (`src/main.js`): Proceso principal de Electron
- **Certificate Manager** (`src/certificate-manager.js`): Gestión de certificados y CA
- **Hosts Manager** (`src/hosts-manager.js`): Gestión del archivo hosts
- **Helper Privilegiado** (`src/helpers/hosts-helper.sh`): Script para modificar `/etc/hosts`
- **Renderer** (`src/renderer/`): Interfaz de usuario

### Sistema de actualización automática

El helper privilegiado se actualiza automáticamente cuando:

1. **Detección de versión**: Al iniciar la aplicación, se compara la versión del helper instalado con la versión incluida en la app
2. **Actualización automática**: Si hay una versión más nueva, se actualiza automáticamente usando `pkexec`
3. **Ubicaciones del helper**:
   - **Sistema**: `/usr/local/bin/doble-seal-hosts-helper` (preferido)
   - **Local**: `~/.config/doble-seal/hosts-helper.sh` (fallback)
   - **Desarrollo**: `src/helpers/hosts-helper.sh`

4. **Versionado**: Cada helper incluye su versión en el formato `HELPER_VERSION="X.Y.Z"`

### Seguridad

- **Validación estricta**: Los nombres de dominio se validan con regex
- **Sanitización**: Se previenen inyecciones de comandos
- **Privilegios mínimos**: Solo se eleva cuando es necesario
- **Backups automáticos**: Se crea backup antes de cada modificación

### Estructura de archivos

```txt
~/.config/doble-seal/
├── ca/
│   ├── ca-cert.pem         # Certificado del CA
│   └── ca-key.pem          # Clave privada del CA
├── certificates/
│   └── <dominio>/
│       ├── certificate.pem  # Certificado público
│       ├── private-key.pem  # Clave privada
│       └── fullchain.pem    # Cadena completa
├── hosts-backups/
│   └── hosts.backup.*.txt   # Backups con timestamp
└── metadata.json            # Metadatos de certificados
```

## Desarrollo

### Scripts disponibles

- `npm start`: Ejecuta la aplicación en modo desarrollo
- `npm run dev`: Ejecuta con DevTools abierto
- `npm run build`: Construye la aplicación
- `npm run dist`: Crea paquetes de distribución
- `npm run install-helper`: Instala el helper privilegiado

### Estructura del proyecto

```txt
src/
├── main.js                 # Proceso principal
├── preload.js             # Script de preload
├── certificate-manager.js # Gestión de certificados
├── hosts-manager.js       # Gestión de hosts
├── helpers/
│   └── hosts-helper.sh    # Helper privilegiado
└── renderer/
    ├── index.html         # UI principal
    ├── styles.css         # Estilos
    └── renderer.js        # Lógica de UI
```

## Contribuir

1. Fork del proyecto
2. Crea una rama para tu feature (`git checkout -b feature/nueva-caracteristica`)
3. Commit tus cambios (`git commit -am 'Añade nueva característica'`)
4. Push a la rama (`git push origin feature/nueva-caracteristica`)
5. Crea un Pull Request

## Licencia

MIT License - ve el archivo LICENSE para más detalles.

## Soporte

Si encuentras algún problema o tienes sugerencias:

1. Revisa los [issues existentes](../../issues)
2. Crea un [nuevo issue](../../issues/new) si es necesario
3. Proporciona información detallada sobre tu sistema y el problema

## Distribuciones soportadas

- ✅ Ubuntu 20.04+
- ✅ Debian 11+
- ✅ Fedora 35+
- ✅ RHEL/CentOS 8+
- ✅ openSUSE Leap 15.3+
- ✅ Arch Linux

Para otras distribuciones, la aplicación debería funcionar si tiene los comandos `update-ca-certificates` o `update-ca-trust`.
