#!/usr/bin/env bash
# Reuse the production backup, feature-preservation and automatic rollback flow.
set -Eeuo pipefail
exec bash deploy/deploy-player-registration.sh \
  "${1:?Reviewed release SHA required}" "${2:?Previous production SHA required}" visibility-nakka
