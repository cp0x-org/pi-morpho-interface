#!/bin/sh
set -eu

if [ -n "${MORPHO_REST_PRIVATE_API_KEY:-}" ]; then
  MORPHO_API_HOST="private.api.morpho.org"
else
  MORPHO_API_HOST="api.morpho.org"
fi
export MORPHO_API_HOST MORPHO_REST_PRIVATE_API_KEY
envsubst '${MORPHO_API_HOST} ${MORPHO_REST_PRIVATE_API_KEY}' \
  < /etc/nginx/morpho.conf.template \
  > /etc/nginx/conf.d/default.conf
