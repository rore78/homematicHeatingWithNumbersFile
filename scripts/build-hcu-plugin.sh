#!/bin/bash
# Baut das HCU-Plugin als Docker-Image fuer linux/arm64 (HCU-Plattform).

set -euo pipefail

PLUGIN_ID="com.redlberger.hmip.heizungssteuerung"
VERSION="1.0.0"
IMAGE_NAME="heizungssteuerung-plugin"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

echo "=========================================="
echo "Baue HCU-Plugin"
echo "=========================================="
echo "Plugin-ID: ${PLUGIN_ID}"
echo "Version:   ${VERSION}"
echo "Image:     ${IMAGE_NAME}:${VERSION}"
echo "Plattform: linux/arm64"
echo ""

# Pruefe ob docker buildx verfuegbar
if ! docker buildx version >/dev/null 2>&1; then
  echo "FEHLER: docker buildx nicht verfuegbar. Bitte Docker Desktop aktualisieren."
  exit 1
fi

# Build
docker buildx build \
  --platform linux/arm64 \
  --tag "${IMAGE_NAME}:${VERSION}" \
  --tag "${IMAGE_NAME}:latest" \
  --load \
  .

echo ""
echo "=========================================="
echo "Plugin erfolgreich gebaut!"
echo "=========================================="

# Ausgabe-Verzeichnis fuer das exportierte Image
OUTPUT_DIR="${PROJECT_ROOT}/build"
mkdir -p "${OUTPUT_DIR}"
OUTPUT_FILE="${OUTPUT_DIR}/${IMAGE_NAME}-${VERSION}.tar.gz"

echo "Exportiere Image als ${OUTPUT_FILE}..."
docker save "${IMAGE_NAME}:${VERSION}" | gzip > "${OUTPUT_FILE}"

echo ""
echo "Exportiertes Image: ${OUTPUT_FILE}"
echo "Groesse:            $(du -h "${OUTPUT_FILE}" | cut -f1)"
echo ""
echo "Deployment auf HCU:"
echo "  1. Image auf die HCU uebertragen (scp, HCUweb Upload, etc.)"
echo "  2. Image laden: docker load -i ${IMAGE_NAME}-${VERSION}.tar.gz"
echo "  3. Plugin ueber HCUweb registrieren / konfigurieren"
echo "=========================================="
