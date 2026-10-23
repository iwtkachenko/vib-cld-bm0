#!/usr/bin/env bash
# Manage the local infrastructure (MongoDB replica set, Redis, Mailpit).
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env ] || cp .env.example .env

if ! docker info >/dev/null 2>&1; then
  echo "Docker daemon is not reachable. Start it first (OrbStack: 'orb start')." >&2
  exit 1
fi

cmd="${1:-help}"
case "$cmd" in
  up)     docker compose up -d --wait ;;
  down)   docker compose down ;;
  reset)  docker compose down -v ;;
  logs)   docker compose logs -f --tail=100 "${@:2}" ;;
  ps)     docker compose ps ;;
  mongo)  docker compose exec mongo mongosh pm ;;
  redis)  docker compose exec redis redis-cli ;;
  *)      echo "usage: scripts/infra.sh {up|down|reset|logs|ps|mongo|redis}"; [ "$cmd" = help ] || exit 1 ;;
esac
