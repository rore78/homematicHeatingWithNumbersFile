# syntax=docker/dockerfile:1.6
#
# Homematic IP Connect API Plugin -- Heizungssteuerung
#
# Baut ein linux/arm64 Image fuer die HCU (Home Control Unit).
# Build:
#   docker buildx build --platform linux/arm64 --tag heizungssteuerung-plugin:1.0.0 --load .

# Stage 1: Produktions-Abhaengigkeiten installieren
FROM ghcr.io/homematicip/alpine-node-simple:0.0.1 AS builder
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts

# Stage 2: Finales Image
FROM ghcr.io/homematicip/alpine-node-simple:0.0.1
WORKDIR /app

# Nur benoetigte Dateien kopieren
COPY --from=builder /app/node_modules ./node_modules
COPY src/ ./src/
COPY package.json ./

# Persistenter Speicher (schedules/, areas.json, .env, uploads/)
VOLUME /data

# Plugin-Metadaten fuer die HCU
LABEL de.eq3.hmip.plugin.metadata='{ \
  "pluginId": "com.redlberger.hmip.heizungssteuerung", \
  "issuer": "Roman Redlberger", \
  "version": "1.0.0", \
  "hcuMinVersion": "1.4.7", \
  "scope": "LOCAL", \
  "friendlyName": { \
    "de": "Heizungssteuerung", \
    "en": "Heating Control" \
  }, \
  "description": { \
    "de": "Heizungszeitplaene aus Excel/Numbers-Dateien auslesen und Homematic IP Thermostate steuern.", \
    "en": "Read heating schedules from Excel/Numbers files and control Homematic IP thermostats." \
  }, \
  "settings": {}, \
  "image": "", \
  "changelog": { \
    "1.0.0": { \
      "de": "Erstversion mit Connect API Unterstuetzung", \
      "en": "Initial release with Connect API support" \
    } \
  }, \
  "logsEnabled": true \
}'

# Standard-Umgebungsvariablen (in der HCU via /TOKEN, /CLIENTID, /SGTIN ueberschrieben)
ENV HOMEMATIC_MODE=hcu
ENV DATA_DIR=/data
ENV NODE_ENV=production
ENV LOG_LEVEL=info

CMD ["node", "src/index.js"]
