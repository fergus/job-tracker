#!/bin/sh
set -e

# Fix volume ownership
chown -R nodejs:nodejs /app/data /app/uploads

# Conditionally start SMB
if [ "$ENABLE_SMB" = "true" ]; then
  # Create smb-share directory
  mkdir -p /app/smb-share
  chown -R nodejs:nodejs /app/smb-share

  # Read credentials from file (Docker secrets) or fall back to env vars
  if [ -f "$SMB_CREDENTIALS_FILE" ]; then
    SMB_USER=$(head -1 "$SMB_CREDENTIALS_FILE" | cut -d: -f1)
    SMB_PASS=$(head -1 "$SMB_CREDENTIALS_FILE" | cut -d: -f2)
    SMB_USER_EMAIL=$(head -1 "$SMB_CREDENTIALS_FILE" | cut -d: -f3)
  fi

  if [ -z "$SMB_USER" ] || [ -z "$SMB_PASS" ] || [ -z "$SMB_USER_EMAIL" ]; then
    echo "SMB: ERROR - SMB_USER, SMB_PASS, and SMB_USER_EMAIL are required (via env or SMB_CREDENTIALS_FILE)"
    exit 1
  fi

  # Create single Samba user (add system user in nodejs group, then samba password)
  adduser -D -H -s /sbin/nologin -G nodejs "$SMB_USER" 2>/dev/null || true
  echo -e "$SMB_PASS\n$SMB_PASS" | smbpasswd -a -s "$SMB_USER"
  smbpasswd -e "$SMB_USER"
  echo "SMB: User '$SMB_USER' configured"

  # Clear credentials from environment
  unset SMB_PASS

  # Generate internal auth token for sync engine → API communication
  INTERNAL_AUTH_TOKEN=$(head -c 32 /dev/urandom | od -A n -t x1 | tr -d ' \n')
  export INTERNAL_AUTH_TOKEN

  # Start Samba daemon (high port 3445, no root needed for binding)
  smbd --daemon --no-process-group --configfile=/etc/samba/smb.conf
  echo "SMB: Samba started on port 3445"

  # Start sync process in background (waits for Express readiness internally)
  export SMB_USER_EMAIL
  su-exec nodejs node /app/server/smb-sync.mjs &
  echo "SMB: Sync process started"
fi

# Start Express as main process (PID 1 via exec)
exec su-exec nodejs node server/index.js
