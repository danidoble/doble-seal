#!/bin/bash

# Script de inicio para DobleSeal
# Verifica que el helper esté instalado antes de ejecutar

HELPER_PATH="/usr/local/bin/doble-seal-hosts-helper"

echo "🔒 Iniciando DobleSeal..."

# Verificar que el helper esté instalado
if [ ! -f "$HELPER_PATH" ]; then
    echo ""
    echo "⚠️  Helper privilegiado no encontrado"
    echo ""
    echo "Para instalar el helper, ejecuta:"
    echo "sudo ./install-helper.sh"
    echo ""
    echo "El helper es necesario para modificar el archivo /etc/hosts"
    echo ""
    read -p "¿Quieres continuar sin el helper? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Instalación cancelada"
        exit 1
    fi
    echo ""
    echo "⚠️  Continuando sin helper - las funciones de hosts no estarán disponibles"
    echo ""
fi

# Ejecutar la aplicación
npm start
