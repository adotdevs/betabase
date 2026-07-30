#!/usr/bin/env bash
# Alias for setup-help-nginx.sh (fixes duplicate /help location errors)
exec bash "$(dirname "$0")/setup-help-nginx.sh"
