#!/bin/bash

# Helper privilegiado para modificar /etc/hosts
# Se ejecuta con pkexec para obtener permisos de administrador
# Version: 1.2.0

HOSTS_FILE="/etc/hosts"
HELPER_VERSION="1.2.0"

# Detectar el directorio home del usuario real
if [[ -n "$SUDO_USER" ]]; then
    USER_HOME=$(getent passwd "$SUDO_USER" | cut -d: -f6)
elif [[ -n "$PKEXEC_UID" ]]; then
    USER_HOME=$(getent passwd "$PKEXEC_UID" | cut -d: -f6)
else
    USER_HOME="$HOME"
fi

BACKUP_DIR="$USER_HOME/.config/doble-seal/hosts-backups"
APP_MARKER_START="# DOBLE-SEAL START - DO NOT EDIT"
APP_MARKER_END="# DOBLE-SEAL END"

# Función para mostrar error y salir
error_exit() {
    echo "{\"success\": false, \"error\": \"$1\"}" >&2
    exit 1
}

# Función para mostrar resultado exitoso
success_response() {
    echo "{\"success\": true, \"message\": \"$1\"}"
}

# Función para crear backup
create_backup() {
    local timestamp=$(date +"%Y%m%d_%H%M%S")
    local backup_file="$BACKUP_DIR/hosts.backup.$timestamp.txt"
    
    # Asegurar nombre único si el archivo ya existe
    local counter=1
    while [[ -f "$backup_file" ]]; do
        backup_file="$BACKUP_DIR/hosts.backup.$timestamp.$counter.txt"
        ((counter++))
    done
    
    # Debug: mostrar información del directorio
    echo "Debug: BACKUP_DIR=$BACKUP_DIR" >&2
    echo "Debug: USER_HOME=$USER_HOME" >&2
    echo "Debug: SUDO_USER=$SUDO_USER" >&2
    echo "Debug: PKEXEC_UID=$PKEXEC_UID" >&2
    
    # Crear directorio de backup si no existe
    if mkdir -p "$BACKUP_DIR"; then
        echo "Debug: Directorio creado exitosamente: $BACKUP_DIR" >&2
    else
        error_exit "No se pudo crear directorio de backup: $BACKUP_DIR"
    fi
    
    # Copiar archivo hosts
    if cp "$HOSTS_FILE" "$backup_file"; then
        echo "Debug: Archivo copiado exitosamente a: $backup_file" >&2
        
        # Intentar establecer el propietario correcto
        if [[ -n "$SUDO_USER" ]]; then
            echo "Debug: Estableciendo propietario usando SUDO_USER: $SUDO_USER" >&2
            chown "$SUDO_USER:$SUDO_USER" "$backup_file" 2>/dev/null || echo "Debug: chown falló para backup_file" >&2
            chown "$SUDO_USER:$SUDO_USER" "$BACKUP_DIR" 2>/dev/null || echo "Debug: chown falló para BACKUP_DIR" >&2
        elif [[ -n "$PKEXEC_UID" ]]; then
            local username=$(getent passwd "$PKEXEC_UID" | cut -d: -f1)
            echo "Debug: Estableciendo propietario usando PKEXEC_UID: $PKEXEC_UID -> $username" >&2
            if [[ -n "$username" ]]; then
                chown "$username:$username" "$backup_file" 2>/dev/null || echo "Debug: chown falló para backup_file (username)" >&2
                chown "$username:$username" "$BACKUP_DIR" 2>/dev/null || echo "Debug: chown falló para BACKUP_DIR (username)" >&2
            fi
        else
            echo "Debug: No se encontró SUDO_USER ni PKEXEC_UID" >&2
        fi
        
        # Verificar que el archivo fue creado
        if [[ -f "$backup_file" ]]; then
            local file_size=$(stat -c%s "$backup_file" 2>/dev/null || echo "0")
            echo "Debug: Backup verificado - Tamaño: $file_size bytes" >&2
            echo "Backup creado: $backup_file" >&2
        else
            error_exit "El archivo de backup no existe después de la copia"
        fi
    else
        error_exit "No se pudo crear backup del archivo hosts"
    fi
}

# Función para validar dominio
validate_domain() {
    local domain="$1"
    
    # Verificar que no esté vacío
    if [[ -z "$domain" ]]; then
        error_exit "Dominio no puede estar vacío"
    fi
    
    # Verificar formato básico de dominio
    if [[ ! "$domain" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$ ]]; then
        error_exit "Formato de dominio inválido: $domain"
    fi
    
    # Verificar caracteres peligrosos
    if [[ "$domain" =~ [\;\&\|\`\$\(\)\{\}\[\]\<\>] ]]; then
        error_exit "Dominio contiene caracteres no permitidos: $domain"
    fi
}

# Función para validar IP
validate_ip() {
    local ip="$1"
    
    if [[ ! "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
        error_exit "Formato de IP inválido: $ip"
    fi
    
    # Verificar que cada octeto esté en rango válido
    IFS='.' read -ra ADDR <<< "$ip"
    for i in "${ADDR[@]}"; do
        if [[ $i -lt 0 || $i -gt 255 ]]; then
            error_exit "IP fuera de rango: $ip"
        fi
    done
}

# Función para obtener sección gestionada
get_managed_section() {
    if [[ -f "$HOSTS_FILE" ]]; then
        sed -n "/$APP_MARKER_START/,/$APP_MARKER_END/p" "$HOSTS_FILE"
    fi
}

# Función para eliminar sección gestionada
remove_managed_section() {
    if [[ -f "$HOSTS_FILE" ]]; then
        sed -i "/$APP_MARKER_START/,/$APP_MARKER_END/d" "$HOSTS_FILE"
    fi
}

# Función para añadir entrada
add_host() {
    local domain="$1"
    local ip="$2"
    
    validate_domain "$domain"
    validate_ip "$ip"
    
    # Crear backup
    create_backup
    
    # Obtener sección actual excluyendo marcadores y líneas vacías
    local current_entries=""
    if [[ -f "$HOSTS_FILE" ]]; then
        current_entries=$(sed -n "/$APP_MARKER_START/,/$APP_MARKER_END/p" "$HOSTS_FILE" | \
                         grep -v "^# DOBLE-SEAL" | \
                         grep -v "^$" | \
                         grep -v " $domain$" | \
                         grep -v " $domain ")
    fi
    
    # Eliminar sección actual completa
    remove_managed_section
    
    # Crear nueva sección con entradas sin duplicados
    {
        echo "$APP_MARKER_START"
        
        # Añadir entradas existentes (ya filtradas para excluir el dominio actual)
        if [[ -n "$current_entries" ]]; then
            echo "$current_entries"
        fi
        
        # Añadir la nueva entrada
        echo "$ip $domain"
        
        echo "$APP_MARKER_END"
    } >> "$HOSTS_FILE"
    
    success_response "Dominio $domain configurado en hosts con IP $ip"
}

# Función para eliminar entrada
remove_host() {
    local domain="$1"
    
    validate_domain "$domain"
    
    # Verificar si el dominio existe en la sección gestionada
    local current_section=$(get_managed_section)
    if [[ -z "$current_section" ]] || ! echo "$current_section" | grep -q " $domain$\| $domain "; then
        error_exit "Dominio $domain no encontrado en la sección gestionada"
    fi
    
    # Crear backup
    create_backup
    
    # Eliminar sección actual
    remove_managed_section
    
    # Obtener entradas sin el dominio a eliminar
    local filtered_entries=$(echo "$current_section" | \
                            grep -v "^# DOBLE-SEAL" | \
                            grep -v "^$" | \
                            grep -v " $domain$" | \
                            grep -v " $domain ")
    
    # Si quedan entradas, recrear la sección
    if [[ -n "$filtered_entries" ]]; then
        {
            echo "$APP_MARKER_START"
            echo "$filtered_entries"
            echo "$APP_MARKER_END"
        } >> "$HOSTS_FILE"
    fi
    
    success_response "Dominio $domain eliminado de hosts"
}

# Función para listar entradas gestionadas
list_hosts() {
    local current_section=$(get_managed_section)
    if [[ -n "$current_section" ]]; then
        local hosts_list=$(echo "$current_section" | grep -v "^# DOBLE-SEAL" | grep -v "^$" | sort -u)
        if [[ -n "$hosts_list" ]]; then
            echo "{\"success\": true, \"hosts\": [$(echo "$hosts_list" | while read line; do echo "\"$line\""; done | paste -sd ',')] }"
        else
            echo "{\"success\": true, \"hosts\": []}"
        fi
    else
        echo "{\"success\": true, \"hosts\": []}"
    fi
}

# Función para limpiar duplicados existentes
cleanup_duplicates() {
    local current_section=$(get_managed_section)
    if [[ -n "$current_section" ]]; then
        # Crear backup
        create_backup
        
        # Obtener entradas únicas (sin marcadores ni líneas vacías)
        local unique_entries=$(echo "$current_section" | \
                              grep -v "^# DOBLE-SEAL" | \
                              grep -v "^$" | \
                              sort -u)
        
        # Eliminar sección actual
        remove_managed_section
        
        # Recrear sección con entradas únicas
        if [[ -n "$unique_entries" ]]; then
            {
                echo "$APP_MARKER_START"
                echo "$unique_entries"
                echo "$APP_MARKER_END"
            } >> "$HOSTS_FILE"
        fi
        
        success_response "Duplicados eliminados de la sección gestionada"
    else
        success_response "No hay sección gestionada para limpiar"
    fi
}

# Función para restaurar backup
restore_backup() {
    local backup_file="$1"
    
    # Validar que el archivo de backup existe
    if [[ ! -f "$backup_file" ]]; then
        error_exit "Archivo de backup no encontrado: $backup_file"
    fi
    
    # Validar que está en el directorio de backups
    if [[ "$backup_file" != "$BACKUP_DIR"/* ]]; then
        error_exit "El archivo debe estar en el directorio de backups"
    fi
    
    # Crear backup del estado actual antes de restaurar
    create_backup
    
    # Restaurar el backup
    if cp "$backup_file" "$HOSTS_FILE"; then
        success_response "Archivo /etc/hosts restaurado desde backup"
    else
        error_exit "No se pudo restaurar el backup"
    fi
}

# Verificar que se ejecuta como root
if [[ $EUID -ne 0 ]]; then
    error_exit "Este script debe ejecutarse con privilegios de administrador"
fi

# Leer JSON desde stdin
input=$(cat)

# Parsear JSON usando métodos básicos de bash (ya que no podemos garantizar que jq esté instalado)
action=$(echo "$input" | sed -n 's/.*"action"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
domain=$(echo "$input" | sed -n 's/.*"domain"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
ip=$(echo "$input" | sed -n 's/.*"ip"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')
backup_file=$(echo "$input" | sed -n 's/.*"backupFile"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p')

# Valores por defecto
if [[ -z "$ip" ]]; then
    ip="127.0.0.1"
fi

# Ejecutar acción
case "$action" in
    "add")
        if [[ -z "$domain" ]]; then
            error_exit "Dominio requerido para la acción add"
        fi
        add_host "$domain" "$ip"
        ;;
    "remove")
        if [[ -z "$domain" ]]; then
            error_exit "Dominio requerido para la acción remove"
        fi
        remove_host "$domain"
        ;;
    "list")
        list_hosts
        ;;
    "cleanup")
        cleanup_duplicates
        ;;
    "restore")
        if [[ -z "$backup_file" ]]; then
            error_exit "Archivo de backup requerido para la acción restore"
        fi
        restore_backup "$backup_file"
        ;;
    "version")
        echo "{\"success\": true, \"version\": \"$HELPER_VERSION\"}"
        ;;
    *)
        error_exit "Acción no válida: $action. Acciones disponibles: add, remove, list, cleanup, restore, version"
        ;;
esac
