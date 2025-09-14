#!/bin/bash

# Script de post-instalación para DobleSeal
# Se ejecuta después de instalar el paquete .deb

echo "Configurando DobleSeal..."

# Copiar helper privilegiado
HELPER_SOURCE="/usr/lib/doble-seal/resources/hosts-helper.sh"
HELPER_DEST="/usr/local/bin/doble-seal-hosts-helper"

if [ -f "$HELPER_SOURCE" ]; then
    cp "$HELPER_SOURCE" "$HELPER_DEST"
    chmod +x "$HELPER_DEST"
    echo "Helper privilegiado instalado en $HELPER_DEST"
else
    echo "Warning: Helper no encontrado en $HELPER_SOURCE"
fi

# Crear entrada de menú de aplicaciones
DESKTOP_FILE="/usr/share/applications/doble-seal.desktop"
cat > "$DESKTOP_FILE" << EOF
[Desktop Entry]
Version=1.0
Type=Application
Name=DobleSeal
Comment=Gestor de certificados autofirmados para desarrollo local
Exec=/usr/lib/doble-seal/doble-seal
Icon=doble-seal
Terminal=false
Categories=Utility;Development;Security;
Keywords=certificate;ssl;development;localhost;
StartupNotify=true
EOF

echo "Entrada de menú creada en $DESKTOP_FILE"

# Actualizar base de datos de aplicaciones
update-desktop-database /usr/share/applications/ 2>/dev/null || true

echo "DobleSeal instalado correctamente."
echo "Puedes ejecutarlo desde el menú de aplicaciones o con: doble-seal"
