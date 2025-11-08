// Renderer process - UI logic
class DobleSealApp {
    constructor() {
        this.currentTab = 'certificates';
        this.certificates = {};
        this.hosts = [];
        this.backups = [];
        
        this.initializeApp();
        this.setupEventListeners();
        this.loadInitialData();
    }

    async initializeApp() {
        // Verificar estado del CA
        await this.checkCAStatus();
    }

    setupEventListeners() {
        // Tabs
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.switchTab(e.target.dataset.tab);
            });
        });

        // Botones principales
        document.getElementById('new-cert-btn').addEventListener('click', () => {
            this.showNewCertificateModal();
        });

        document.getElementById('install-ca-btn').addEventListener('click', () => {
            this.installCA();
        });

        document.getElementById('install-ca-chrome-btn').addEventListener('click', () => {
            this.installCAInChrome();
        });

        document.getElementById('regenerate-ca-btn').addEventListener('click', () => {
            this.regenerateCA();
        });

        document.getElementById('install-ca-banner-btn').addEventListener('click', () => {
            this.installCA();
        });

        document.getElementById('open-config-btn').addEventListener('click', () => {
            this.openConfigDirectory();
        });

        document.getElementById('cleanup-duplicates-btn').addEventListener('click', () => {
            this.cleanupDuplicates();
        });

        // Modal events
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('modal')) {
                this.hideAllModals();
            }
        });

        // Escape key para cerrar modales
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                this.hideAllModals();
            }
        });
    }

    async loadInitialData() {
        await this.loadCertificates();
        await this.loadHosts();
        await this.loadBackups();
    }

    // === TAB MANAGEMENT ===
    switchTab(tabName) {
        // Actualizar botones de tab
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
        });
        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');

        // Actualizar contenido
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.remove('active');
        });
        document.getElementById(`${tabName}-tab`).classList.add('active');

        this.currentTab = tabName;

        // Recargar datos si es necesario
        if (tabName === 'hosts') {
            this.loadHosts();
        } else if (tabName === 'backups') {
            this.loadBackups();
        }
    }

    // === CA MANAGEMENT ===
    async checkCAStatus() {
        try {
            const status = await window.electronAPI.ca.status();
            const banner = document.getElementById('ca-status');
            
            if (!status.installed) {
                banner.classList.remove('hidden', 'success');
                banner.querySelector('.status-text').textContent = 'CA no instalado en el sistema';
                banner.querySelector('.status-icon').textContent = '⚠️';
            } else {
                banner.classList.remove('hidden');
                banner.classList.add('success');
                banner.querySelector('.status-text').textContent = 'CA instalado correctamente';
                banner.querySelector('.status-icon').textContent = '✅';
                banner.querySelector('.btn').style.display = 'none';
            }

            // Cargar información del CA
            await this.loadCAInfo();
        } catch (error) {
            console.error('Error checking CA status:', error);
        }
    }

    async loadCAInfo() {
        try {
            const caInfo = await window.electronAPI.ca.getInfo();
            const caInfoPanel = document.getElementById('ca-info');
            
            if (caInfo) {
                // Mostrar panel de información
                caInfoPanel.classList.remove('hidden');
                
                // Actualizar información
                const validToElement = document.getElementById('ca-valid-to');
                const statusElement = document.getElementById('ca-status-text');
                const daysElement = document.getElementById('ca-days-remaining');
                
                // Formatear fecha
                const validToDate = new Date(caInfo.validTo);
                validToElement.textContent = validToDate.toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                
                // Estado y días restantes
                if (caInfo.isExpired) {
                    statusElement.textContent = 'Expirado';
                    statusElement.className = 'ca-info-value expired';
                    daysElement.textContent = 'Expirado';
                    daysElement.className = 'ca-info-value expired';
                } else if (caInfo.isExpiringSoon) {
                    statusElement.textContent = 'Expira pronto';
                    statusElement.className = 'ca-info-value expiring-soon';
                    daysElement.textContent = `${caInfo.daysUntilExpiry} días`;
                    daysElement.className = 'ca-info-value expiring-soon';
                } else {
                    statusElement.textContent = 'Válido';
                    statusElement.className = 'ca-info-value valid';
                    daysElement.textContent = `${caInfo.daysUntilExpiry} días`;
                    daysElement.className = 'ca-info-value valid';
                }
            } else {
                // Ocultar panel si no hay información
                caInfoPanel.classList.add('hidden');
            }
        } catch (error) {
            console.error('Error loading CA info:', error);
            document.getElementById('ca-info').classList.add('hidden');
        }
    }

    async regenerateCA() {
        // Mostrar confirmación
        const confirmed = await this.showConfirmDialog(
            'Regenerar CA Root',
            '¿Estás seguro de que quieres regenerar el certificado CA raíz?\n\nEsto invalidará todos los certificados existentes y será necesario reinstalar el CA en el sistema.',
            'Regenerar',
            'Cancelar'
        );

        if (!confirmed) return;

        this.showLoading('Regenerando CA root...');
        
        try {
            const result = await window.electronAPI.ca.regenerate();
            
            if (result.success) {
                this.showToast('success', 'CA Regenerado', result.message);
                
                // Recargar información del CA y estado
                await this.checkCAStatus();
                
                // Recargar certificados ya que pueden estar afectados
                await this.loadCertificates();
            } else {
                this.showToast('error', 'Error', result.message || 'Error al regenerar CA');
            }
        } catch (error) {
            console.error('Error regenerating CA:', error);
            this.showToast('error', 'Error', 'Error al regenerar CA: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async installCA() {
        this.showLoading('Instalando CA en el sistema...');
        
        try {
            const result = await window.electronAPI.ca.install();
            
            if (result.success) {
                this.showToast('success', 'CA Instalado', result.message);
                await this.checkCAStatus();
            } else {
                this.showToast('error', 'Error', result.message || 'Error al instalar CA');
            }
        } catch (error) {
            console.error('Error installing CA:', error);
            this.showToast('error', 'Error', 'Error al instalar CA: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async installCAInChrome() {
        this.showLoading('Instalando CA en Chrome...');
        
        try {
            const result = await window.electronAPI.ca.installChrome();
            
            if (result.success) {
                this.showToast('success', 'CA en Chrome', result.message);
            } else {
                this.showToast('error', 'Error', result.message || 'Error al instalar CA en Chrome');
            }
        } catch (error) {
            console.error('Error installing CA in Chrome:', error);
            
            if (error.message.includes('certutil no encontrado')) {
                this.showToast('warning', 'Dependencia faltante', 
                    'Para instalar CA en Chrome, instala: sudo apt install libnss3-tools');
            } else if (error.message.includes('Chrome/Chromium no encontrado')) {
                this.showToast('info', 'Chrome no encontrado', 
                    'Chrome/Chromium no está instalado en el sistema');
            } else {
                this.showToast('error', 'Error', 'Error al instalar CA en Chrome: ' + error.message);
            }
        } finally {
            this.hideLoading();
        }
    }

    // === CERTIFICATE MANAGEMENT ===
    async loadCertificates() {
        try {
            const result = await window.electronAPI.certificates.list();
            
            if (result.success) {
                this.certificates = result.certificates;
                this.renderCertificates();
            }
        } catch (error) {
            console.error('Error loading certificates:', error);
            this.showToast('error', 'Error', 'Error al cargar certificados');
        }
    }

    renderCertificates() {
        const container = document.getElementById('certificates-list');
        const emptyState = document.getElementById('no-certificates');
        
        const certCount = Object.keys(this.certificates).length;
        
        if (certCount === 0) {
            container.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }
        
        container.classList.remove('hidden');
        emptyState.classList.add('hidden');
        
        container.innerHTML = Object.entries(this.certificates).map(([domain, cert]) => {
            const expiryDate = new Date(cert.expiresAt);
            const now = new Date();
            const daysUntilExpiry = Math.ceil((expiryDate - now) / (1000 * 60 * 60 * 24));
            
            let statusClass = 'valid';
            let statusText = 'Válido';
            
            if (daysUntilExpiry < 0) {
                statusClass = 'expired';
                statusText = 'Expirado';
            } else if (daysUntilExpiry < 30) {
                statusClass = 'expiring';
                statusText = `Expira en ${daysUntilExpiry} días`;
            }
            
            const sansHtml = cert.sans && cert.sans.length > 0 ? `
                <div class="cert-sans">
                    <div class="cert-sans-label">Nombres alternativos:</div>
                    <div class="cert-sans-list">
                        ${cert.sans.map(san => `<span class="cert-san-tag">${san}</span>`).join('')}
                    </div>
                </div>
            ` : '';
            
            return `
                <div class="certificate-card">
                    <div class="cert-header">
                        <div>
                            <div class="cert-domain">${domain}</div>
                            <span class="cert-status ${statusClass}">${statusText}</span>
                        </div>
                    </div>
                    
                    <div class="cert-info">
                        <div class="cert-info-item">
                            <span class="cert-info-label">Creado:</span>
                            <span>${new Date(cert.created).toLocaleDateString()}</span>
                        </div>
                        <div class="cert-info-item">
                            <span class="cert-info-label">Expira:</span>
                            <span>${expiryDate.toLocaleDateString()}</span>
                        </div>
                        <div class="cert-info-item">
                            <span class="cert-info-label">Duración:</span>
                            <span>${cert.duration} días</span>
                        </div>
                    </div>
                    
                    ${sansHtml}
                    
                    <div class="cert-actions">
                        <button class="btn btn-success btn-small" onclick="app.addToHosts('${domain}')">
                            <span class="icon">🌐</span>
                            Añadir a Hosts
                        </button>
                        <button class="btn btn-info btn-small" onclick="app.addDomainsModal('${domain}')">
                            <span class="icon">➕</span>
                            Agregar Dominios
                        </button>
                        <button class="btn btn-info btn-small" onclick="app.showCertificatePaths('${domain}')">
                            <span class="icon">📄</span>
                            Ver Rutas
                        </button>
                        <button class="btn btn-secondary btn-small" onclick="app.exportCertificate('${domain}')">
                            <span class="icon">📦</span>
                            Exportar
                        </button>
                        <button class="btn btn-warning btn-small" onclick="app.regenerateCertificate('${domain}')">
                            <span class="icon">🔄</span>
                            Regenerar
                        </button>
                        <button class="btn btn-danger btn-small" onclick="app.deleteCertificate('${domain}')">
                            <span class="icon">🗑️</span>
                            Eliminar
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    }

    showNewCertificateModal() {
        document.getElementById('new-cert-modal').classList.remove('hidden');
    }

    hideNewCertificateModal() {
        document.getElementById('new-cert-modal').classList.add('hidden');
        document.getElementById('new-cert-form').reset();
    }

    async createCertificate() {
        const form = document.getElementById('new-cert-form');
        const formData = new FormData(form);
        
        const domain = formData.get('domain').trim();
        const sansText = formData.get('sans').trim();
        const duration = parseInt(formData.get('duration'));
        const addToHosts = formData.get('addToHosts') === 'on';
        
        if (!domain) {
            this.showToast('error', 'Error', 'El dominio es requerido');
            return;
        }
        
        // Procesar SANs
        const sans = sansText ? sansText.split('\n').map(s => s.trim()).filter(s => s) : [];
        
        this.showLoading('Creando certificado...');
        
        try {
            const result = await window.electronAPI.certificates.create({
                domain,
                sans,
                duration
            });
            
            if (result.success) {
                this.showToast('success', 'Certificado Creado', result.message);
                this.hideNewCertificateModal();
                await this.loadCertificates();
                
                // Añadir a hosts si está marcado
                if (addToHosts) {
                    await this.addToHosts(domain);
                }
            } else {
                this.showToast('error', 'Error', result.message || 'Error al crear certificado');
            }
        } catch (error) {
            console.error('Error creating certificate:', error);
            this.showToast('error', 'Error', 'Error al crear certificado: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async deleteCertificate(domain) {
        this.showConfirmModal(
            'Eliminar Certificado',
            `¿Estás seguro de que quieres eliminar el certificado para ${domain}?`,
            'btn-danger',
            'Eliminar',
            async () => {
                this.showLoading('Eliminando certificado...');
                
                try {
                    const result = await window.electronAPI.certificates.delete(domain);
                    
                    if (result.success) {
                        this.showToast('success', 'Certificado Eliminado', result.message);
                        await this.loadCertificates();
                        await this.loadHosts(); // Actualizar hosts también
                    } else {
                        this.showToast('error', 'Error', result.message || 'Error al eliminar certificado');
                    }
                } catch (error) {
                    console.error('Error deleting certificate:', error);
                    this.showToast('error', 'Error', 'Error al eliminar certificado: ' + error.message);
                } finally {
                    this.hideLoading();
                }
            }
        );
    }

    async exportCertificate(domain) {
        this.showLoading('Exportando certificado...');
        
        try {
            const result = await window.electronAPI.certificates.export(domain);
            
            if (result.success) {
                this.showToast('success', 'Certificado Exportado', result.message);
            } else {
                this.showToast('error', 'Error', result.message || 'Error al exportar certificado');
            }
        } catch (error) {
            console.error('Error exporting certificate:', error);
            this.showToast('error', 'Error', 'Error al exportar certificado: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    async regenerateCertificate(domain) {
        const cert = this.certificates[domain];
        if (!cert) return;
        
        this.showConfirmModal(
            'Regenerar Certificado',
            `¿Estás seguro de que quieres regenerar el certificado para ${domain}?`,
            'btn-warning',
            'Regenerar',
            async () => {
                this.showLoading('Regenerando certificado...');
                
                try {
                    const result = await window.electronAPI.certificates.regenerate({
                        domain,
                        sans: cert.sans || [],
                        duration: cert.duration || 365
                    });
                    
                    if (result.success) {
                        this.showToast('success', 'Certificado Regenerado', result.message);
                        await this.loadCertificates();
                    } else {
                        this.showToast('error', 'Error', result.message || 'Error al regenerar certificado');
                    }
                } catch (error) {
                    console.error('Error regenerating certificate:', error);
                    this.showToast('error', 'Error', 'Error al regenerar certificado: ' + error.message);
                } finally {
                    this.hideLoading();
                }
            }
        );
    }

    addDomainsModal(domain) {
        const cert = this.certificates[domain];
        if (!cert) return;

        // Actualizar el formulario con los datos del certificado
        document.getElementById('add-domains-domain').value = domain;
        
        // Mostrar dominios actuales
        const currentDomainsList = document.getElementById('add-domains-current');
        const allCurrentDomains = [domain, ...(cert.sans || [])];
        currentDomainsList.innerHTML = allCurrentDomains.map(d => 
            `<span class="domain-tag">${d}</span>`
        ).join('');
        
        // Limpiar el textarea de nuevos dominios
        document.getElementById('add-domains-new').value = '';
        
        // Mostrar modal
        document.getElementById('add-domains-modal').classList.remove('hidden');
    }

    hideAddDomainsModal() {
        document.getElementById('add-domains-modal').classList.add('hidden');
        document.getElementById('add-domains-form').reset();
    }

    async addDomainstoCertificate() {
        const domain = document.getElementById('add-domains-domain').value;
        const newDomainsText = document.getElementById('add-domains-new').value.trim();
        
        if (!domain) {
            this.showToast('error', 'Error', 'Dominio no especificado');
            return;
        }

        if (!newDomainsText) {
            this.showToast('error', 'Error', 'Debes especificar al menos un nuevo dominio');
            return;
        }

        // Procesar nuevos dominios
        const newDomains = newDomainsText.split('\n').map(d => d.trim()).filter(d => d);
        
        if (newDomains.length === 0) {
            this.showToast('error', 'Error', 'Debes especificar al menos un nuevo dominio');
            return;
        }

        this.showLoading('Agregando dominios al certificado...');
        
        try {
            const result = await window.electronAPI.certificates.addDomains({
                domain,
                newDomains
            });
            
            if (result.success) {
                this.showToast('success', 'Dominios Agregados', result.message);
                this.hideAddDomainsModal();
                await this.loadCertificates();
            } else {
                this.showToast('error', 'Error', result.message || 'Error al agregar dominios');
            }
        } catch (error) {
            console.error('Error adding domains to certificate:', error);
            this.showToast('error', 'Error', 'Error al agregar dominios: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    // === HOSTS MANAGEMENT ===
    async loadHosts() {
        // Cargar hosts gestionados del helper
        try {
            const container = document.getElementById('hosts-list');
            const emptyState = document.getElementById('no-hosts');
            
            // Mostrar todos los certificados como hosts potenciales
            const certDomains = Object.keys(this.certificates);
            
            if (certDomains.length === 0) {
                container.classList.add('hidden');
                emptyState.classList.remove('hidden');
                return;
            }
            
            container.classList.remove('hidden');
            emptyState.classList.add('hidden');
            
            container.innerHTML = certDomains.map(domain => `
                <div class="host-item">
                    <div class="host-info">
                        <div class="host-domain">${domain}</div>
                        <div class="host-ip">127.0.0.1</div>
                    </div>
                    <div class="host-actions">
                        <button class="btn btn-success btn-small" onclick="app.addToHosts('${domain}')">
                            <span class="icon">➕</span>
                            Añadir
                        </button>
                        <button class="btn btn-danger btn-small" onclick="app.removeFromHosts('${domain}')">
                            <span class="icon">➖</span>
                            Eliminar
                        </button>
                    </div>
                </div>
            `).join('');
            
        } catch (error) {
            console.error('Error loading hosts:', error);
        }
    }

    async addToHosts(domain, ip = '127.0.0.1') {
        this.showLoading('Añadiendo al archivo hosts...');
        
        try {
            const result = await window.electronAPI.hosts.add({ domain, ip });
            
            if (result.success) {
                this.showToast('success', 'Host Añadido', result.message);
                await this.loadHosts();
            } else {
                this.showToast('error', 'Error', result.message || 'Error al añadir host');
            }
        } catch (error) {
            console.error('Error adding host:', error);
            
            // Manejar errores relacionados con permisos de manera más amigable
            if (error.message.includes('permisos de administrador') || error.message.includes('autenticación')) {
                this.showToast('info', 'Permisos Requeridos', 
                    'Se necesitan permisos de administrador para modificar /etc/hosts. ' +
                    'Aparecerá un diálogo de autenticación del sistema.');
            } else if (error.message.includes('Helper no disponible')) {
                this.showToast('warning', 'Helper No Disponible', 
                    'El helper para modificar hosts no está disponible. ' +
                    'Intenta ejecutar la aplicación con permisos de administrador o instala manualmente con: npm run install-helper');
            } else {
                this.showToast('error', 'Error', 'Error al añadir host: ' + error.message);
            }
        } finally {
            this.hideLoading();
        }
    }

    async removeFromHosts(domain) {
        this.showConfirmModal(
            'Eliminar de Hosts',
            `¿Estás seguro de que quieres eliminar ${domain} del archivo hosts?`,
            'btn-danger',
            'Eliminar',
            async () => {
                this.showLoading('Eliminando del archivo hosts...');
                
                try {
                    const result = await window.electronAPI.hosts.remove(domain);
                    
                    if (result.success) {
                        this.showToast('success', 'Host Eliminado', result.message);
                        await this.loadHosts();
                        await this.loadBackups(); // Actualizar backups
                    } else {
                        this.showToast('error', 'Error', result.message || 'Error al eliminar host');
                    }
                } catch (error) {
                    console.error('Error removing host:', error);
                    
                    // Manejar errores relacionados con permisos de manera más amigable
                    if (error.message.includes('permisos de administrador') || error.message.includes('autenticación')) {
                        this.showToast('info', 'Permisos Requeridos', 
                            'Se necesitan permisos de administrador para modificar /etc/hosts. ' +
                            'Aparecerá un diálogo de autenticación del sistema.');
                    } else if (error.message.includes('Helper no disponible')) {
                        this.showToast('warning', 'Helper No Disponible', 
                            'El helper para modificar hosts no está disponible. ' +
                            'Intenta ejecutar la aplicación con permisos de administrador o instala manualmente con: npm run install-helper');
                    } else {
                        this.showToast('error', 'Error', 'Error al eliminar host: ' + error.message);
                    }
                } finally {
                    this.hideLoading();
                }
            }
        );
    }

    // === BACKUPS MANAGEMENT ===
    async loadBackups() {
        try {
            const result = await window.electronAPI.hosts.listBackups();
            
            if (result.success) {
                this.backups = result.backups;
                this.renderBackups();
            }
        } catch (error) {
            console.error('Error loading backups:', error);
        }
    }

    renderBackups() {
        const container = document.getElementById('backups-list');
        const emptyState = document.getElementById('no-backups');
        
        if (this.backups.length === 0) {
            container.classList.add('hidden');
            emptyState.classList.remove('hidden');
            return;
        }
        
        container.classList.remove('hidden');
        emptyState.classList.add('hidden');
        
        container.innerHTML = this.backups.map(backup => `
            <div class="backup-item">
                <div class="backup-info">
                    <div class="backup-date">${new Date(backup.date).toLocaleString()}</div>
                    <div class="backup-details">
                        ${backup.filename} (${this.formatFileSize(backup.size)})
                    </div>
                </div>
                <div class="backup-actions">
                    <button class="btn btn-secondary btn-small" onclick="app.openBackup('${backup.path}')">
                        <span class="icon">👁️</span>
                        Ver
                    </button>
                    <button class="btn btn-success btn-small" onclick="app.restoreBackup('${backup.path}')">
                        <span class="icon">↩️</span>
                        Restaurar
                    </button>
                </div>
            </div>
        `).join('');
    }

    async openBackup(path) {
        try {
            await window.electronAPI.system.openConfigDir();
            this.showToast('info', 'Backup', 'Abriendo directorio de configuración');
        } catch (error) {
            console.error('Error opening backup:', error);
            this.showToast('error', 'Error', 'Error al abrir backup');
        }
    }

    async restoreBackup(backupPath) {
        this.showConfirmModal(
            'Restaurar Backup',
            `¿Estás seguro de que quieres restaurar el archivo /etc/hosts desde este backup? Se creará un backup del estado actual antes de restaurar.`,
            'btn-warning',
            'Restaurar',
            async () => {
                this.showLoading('Restaurando backup...');
                
                try {
                    const result = await window.electronAPI.hosts.restoreBackup(backupPath);
                    
                    if (result.success) {
                        this.showToast('success', 'Backup Restaurado', result.message);
                        await this.loadHosts();
                        await this.loadBackups(); // Actualizar backups
                    } else {
                        this.showToast('error', 'Error', result.message || 'Error al restaurar backup');
                    }
                } catch (error) {
                    console.error('Error restoring backup:', error);
                    
                    // Manejar errores relacionados con permisos
                    if (error.message.includes('permisos de administrador') || error.message.includes('autenticación')) {
                        this.showToast('info', 'Permisos Requeridos', 
                            'Se necesitan permisos de administrador para restaurar el backup. ' +
                            'Aparecerá un diálogo de autenticación del sistema.');
                    } else {
                        this.showToast('error', 'Error', 'Error al restaurar backup: ' + error.message);
                    }
                } finally {
                    this.hideLoading();
                }
            }
        );
    }

    // === HOSTS CLEANUP ===
    async cleanupDuplicates() {
        this.showConfirmModal(
            'Limpiar Duplicados',
            '¿Estás seguro de que quieres eliminar las entradas duplicadas del archivo /etc/hosts? Se creará un backup automáticamente.',
            'btn-warning',
            'Limpiar',
            async () => {
                this.showLoading('Limpiando duplicados...');
                
                try {
                    const result = await window.electronAPI.hosts.cleanupDuplicates();
                    
                    if (result.success) {
                        this.showToast('success', 'Duplicados Eliminados', result.message);
                        await this.loadHosts();
                        await this.loadBackups(); // Actualizar backups
                    } else {
                        this.showToast('error', 'Error', result.message || 'Error al limpiar duplicados');
                    }
                } catch (error) {
                    console.error('Error cleaning duplicates:', error);
                    
                    // Manejar errores relacionados con permisos de manera más amigable
                    if (error.message.includes('permisos de administrador') || error.message.includes('autenticación')) {
                        this.showToast('info', 'Permisos Requeridos', 
                            'Se necesitan permisos de administrador para modificar /etc/hosts. ' +
                            'Aparecerá un diálogo de autenticación del sistema.');
                    } else {
                        this.showToast('error', 'Error', 'Error al limpiar duplicados: ' + error.message);
                    }
                } finally {
                    this.hideLoading();
                }
            }
        );
    }

    // === MODAL MANAGEMENT ===
    showConfirmModal(title, message, buttonClass, buttonText, onConfirm) {
        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;
        
        const actionBtn = document.getElementById('confirm-action-btn');
        actionBtn.className = `btn ${buttonClass}`;
        actionBtn.textContent = buttonText;
        
        // Remover listeners previos
        actionBtn.replaceWith(actionBtn.cloneNode(true));
        const newActionBtn = document.getElementById('confirm-action-btn');
        
        newActionBtn.addEventListener('click', () => {
            this.hideConfirmModal();
            onConfirm();
        });
        
        document.getElementById('confirm-modal').classList.remove('hidden');
    }

    hideConfirmModal() {
        document.getElementById('confirm-modal').classList.add('hidden');
    }

    showConfirmDialog(title, message, confirmText = 'Confirmar', cancelText = 'Cancelar') {
        return new Promise((resolve) => {
            document.getElementById('confirm-title').textContent = title;
            document.getElementById('confirm-message').textContent = message;
            
            const actionBtn = document.getElementById('confirm-action-btn');
            actionBtn.className = 'btn btn-warning';
            actionBtn.textContent = confirmText;
            
            // Remover listeners previos
            actionBtn.replaceWith(actionBtn.cloneNode(true));
            const newActionBtn = document.getElementById('confirm-action-btn');
            
            // Handler para confirmar
            newActionBtn.addEventListener('click', () => {
                this.hideConfirmModal();
                resolve(true);
            });
            
            // Handler para cancelar (botón cancelar y click fuera del modal)
            const cancelHandler = () => {
                this.hideConfirmModal();
                resolve(false);
            };
            
            // Añadir listener temporal para el botón cancelar
            const cancelBtn = document.getElementById('confirm-cancel-btn');
            if (cancelBtn) {
                cancelBtn.replaceWith(cancelBtn.cloneNode(true));
                const newCancelBtn = document.getElementById('confirm-cancel-btn');
                newCancelBtn.addEventListener('click', cancelHandler);
            }
            
            // Listener para cerrar con Escape
            const escapeHandler = (e) => {
                if (e.key === 'Escape') {
                    document.removeEventListener('keydown', escapeHandler);
                    cancelHandler();
                }
            };
            document.addEventListener('keydown', escapeHandler);
            
            document.getElementById('confirm-modal').classList.remove('hidden');
        });
    }

    hideAllModals() {
        document.querySelectorAll('.modal').forEach(modal => {
            modal.classList.add('hidden');
        });
    }

    // === CERTIFICATE PATHS ===
    async showCertificatePaths(domain) {
        this.showLoading('Obteniendo rutas de certificado...');
        
        try {
            const result = await window.electronAPI.certificates.getPaths(domain);
            
            if (result.success) {
                // Actualizar el modal con la información
                document.getElementById('paths-domain-title').textContent = `Rutas de Certificado - ${domain}`;
                document.getElementById('cert-path').textContent = result.paths.certificate;
                document.getElementById('key-path').textContent = result.paths.privateKey;
                document.getElementById('fullchain-path').textContent = result.paths.fullchain;
                document.getElementById('ca-path').textContent = result.paths.caCertificate;
                document.getElementById('nginx-config').textContent = result.nginxConfig;
                
                // Mostrar modal
                document.getElementById('certificate-paths-modal').classList.remove('hidden');
                
                // Guardar datos para copiar todo
                this.currentCertificatePaths = {
                    domain: domain,
                    paths: result.paths,
                    nginxConfig: result.nginxConfig
                };
            } else {
                this.showToast('error', 'Error', result.message || 'Error al obtener rutas');
            }
        } catch (error) {
            console.error('Error getting certificate paths:', error);
            this.showToast('error', 'Error', 'Error al obtener rutas: ' + error.message);
        } finally {
            this.hideLoading();
        }
    }

    hideCertificatePathsModal() {
        document.getElementById('certificate-paths-modal').classList.add('hidden');
        this.currentCertificatePaths = null;
    }

    copyToClipboard(elementId) {
        const element = document.getElementById(elementId);
        const text = element.textContent;
        
        navigator.clipboard.writeText(text).then(() => {
            this.showToast('success', 'Copiado', 'Texto copiado al portapapeles');
        }).catch(err => {
            console.error('Error copying to clipboard:', err);
            this.showToast('error', 'Error', 'Error al copiar al portapapeles');
        });
    }

    async copyAllPaths() {
        if (!this.currentCertificatePaths) return;
        
        try {
            const result = await window.electronAPI.certificates.copyPaths(this.currentCertificatePaths.domain);
            
            if (result.success) {
                this.showToast('success', 'Copiado', result.message);
            } else {
                this.showToast('error', 'Error', result.message || 'Error al copiar');
            }
        } catch (error) {
            console.error('Error copying all paths:', error);
            this.showToast('error', 'Error', 'Error al copiar: ' + error.message);
        }
    }

    // === SYSTEM ===
    async openConfigDirectory() {
        try {
            await window.electronAPI.system.openConfigDir();
        } catch (error) {
            console.error('Error opening config directory:', error);
            this.showToast('error', 'Error', 'Error al abrir directorio de configuración');
        }
    }

    // === UI HELPERS ===
    showLoading(message = 'Procesando...') {
        document.getElementById('loading-message').textContent = message;
        document.getElementById('loading-overlay').classList.remove('hidden');
    }

    hideLoading() {
        document.getElementById('loading-overlay').classList.add('hidden');
    }

    showToast(type, title, message) {
        const container = document.getElementById('toast-container');
        const toastId = 'toast-' + Date.now();
        
        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };
        
        const toast = document.createElement('div');
        toast.id = toastId;
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <div class="toast-icon">${icons[type] || 'ℹ️'}</div>
            <div class="toast-content">
                <div class="toast-title">${title}</div>
                <div class="toast-message">${message}</div>
            </div>
            <button class="toast-close" onclick="app.hideToast('${toastId}')">×</button>
        `;
        
        container.appendChild(toast);
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.hideToast(toastId);
        }, 5000);
    }

    hideToast(toastId) {
        const toast = document.getElementById(toastId);
        if (toast) {
            toast.style.animation = 'slideOut 0.3s ease forwards';
            setTimeout(() => {
                toast.remove();
            }, 300);
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Funciones globales para los event handlers inline
window.showNewCertificateModal = () => app.showNewCertificateModal();
window.hideNewCertificateModal = () => app.hideNewCertificateModal();
window.createCertificate = () => app.createCertificate();
window.hideConfirmModal = () => app.hideConfirmModal();
window.hideCertificatePathsModal = () => app.hideCertificatePathsModal();
window.copyToClipboard = (elementId) => app.copyToClipboard(elementId);
window.copyAllPaths = () => app.copyAllPaths();

// Inicializar la aplicación
window.app = new DobleSealApp();
