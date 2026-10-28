#!/bin/sh
set -eu
test -n "${ALERTMANAGER_WEBHOOK_URL:-}"
envsubst '$ALERTMANAGER_WEBHOOK_URL' < /template/alertmanager.yml > /generated/alertmanager.yml