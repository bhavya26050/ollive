#!/bin/sh
set -e

mkdir -p /app/data
npm run db:push
exec "$@"