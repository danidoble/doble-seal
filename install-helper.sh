#!/bin/bash

# Script para instalar el helper privilegiado
# Ejecutar con: sudo ./install-helper.sh

echo "Instalando helper privilegiado para DobleSeal..."

# Verificar que se ejecuta con sudo
if [ "$EUID" -ne 0 ]; then
    echo "Error: Este script debe ejecutarse con sudo"
    echo "Uso: sudo ./install-helper.sh"
    exit 1
fi

# Copiar helper
cp src/helpers/hosts-helper.sh /usr/local/bin/doble-seal-hosts-helper
chmod +x /usr/local/bin/doble-seal-hosts-helper

echo "Helper instalado correctamente en /usr/local/bin/doble-seal-hosts-helper"
echo ""
echo "Ahora puedes ejecutar la aplicación con: npm start"
