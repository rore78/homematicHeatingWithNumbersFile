import HomematicIPAddon, { Config } from "../src/index.js";

/**
 * Beispiel 1: Cloud-Verbindung
 */
async function exampleCloud() {
  console.log("=== Beispiel: Cloud-Verbindung ===\n");

  try {
    // Konfiguration für Cloud-Verbindung
    const config = new Config({
      mode: "cloud",
      cloud: {
        accessPointSGTIN: "YOUR_ACCESS_POINT_SGTIN", // Ersetze mit deinem Access Point SGTIN
        authToken: "YOUR_AUTH_TOKEN", // Optional: Wenn bereits vorhanden
      },
    });

    // Addon initialisieren
    const addon = new HomematicIPAddon(config);
    await addon.initialize();

    console.log(`Verbindungsmodus: ${addon.getMode()}\n`);

    // Alle Geräte abrufen
    const devices = await addon.getDevices();
    console.log(`Gefundene Geräte: ${devices.length}`);
    devices.forEach((device) => {
      console.log(`  - ${device.name} (${device.id}) - Typ: ${device.type}`);
    });

    // Beispiel: Gerät einschalten (ersetze DEVICE_ID mit einer echten Geräte-ID)
    if (devices.length > 0) {
      const deviceId = devices[0].id;
      console.log(`\nSchalte Gerät ${devices[0].name} ein...`);
      await addon.setSwitchState(deviceId, true);
      console.log("Gerät eingeschaltet!");
    }
  } catch (error) {
    console.error("Fehler:", error.message);
  }
}

/**
 * Beispiel 2: Lokale CCU-Verbindung
 */
async function exampleLocal() {
  console.log("\n=== Beispiel: Lokale CCU-Verbindung ===\n");

  try {
    // Konfiguration für lokale Verbindung
    const config = new Config({
      mode: "local",
      local: {
        host: "192.168.1.100", // Ersetze mit der IP-Adresse deiner CCU
        port: 2001,
        username: "", // Optional
        password: "", // Optional
      },
    });

    // Addon initialisieren
    const addon = new HomematicIPAddon(config);
    await addon.initialize();

    console.log(`Verbindungsmodus: ${addon.getMode()}\n`);

    // Alle Geräte abrufen
    const devices = await addon.getDevices();
    console.log(`Gefundene Geräte: ${devices.length}`);
    devices.forEach((device) => {
      console.log(`  - ${device.name} (${device.id}) - Typ: ${device.type}`);
    });

    // Beispiel: Dimmer auf 50% setzen
    const dimmer = devices.find(
      (d) => d.type && d.type.toLowerCase().includes("dimmer"),
    );
    if (dimmer) {
      console.log(`\nSetze Dimmer ${dimmer.name} auf 50%...`);
      await addon.setDimLevel(dimmer.id, 0.5);
      console.log("Helligkeit gesetzt!");
    }
  } catch (error) {
    console.error("Fehler:", error.message);
  }
}

/**
 * Beispiel 3: Auto-Detection (Cloud oder Local)
 */
async function exampleAuto() {
  console.log("\n=== Beispiel: Auto-Detection ===\n");

  try {
    // Konfiguration mit beiden Optionen - Auto-Detection wählt automatisch
    const config = new Config({
      mode: "auto", // oder weglassen, Standard ist 'auto'
      cloud: {
        accessPointSGTIN: process.env.HOMEMATIC_IP_ACCESS_POINT_SGTIN || null,
      },
      local: {
        host: process.env.HOMEMATIC_CCU_HOST || "192.168.1.100",
        port: 2001,
      },
    });

    const addon = new HomematicIPAddon(config);
    await addon.initialize();

    console.log(`Verbindungsmodus: ${addon.getMode()}\n`);

    // Gerätestatus abrufen
    const devices = await addon.getDevices();
    if (devices.length > 0) {
      const device = devices[0];
      const state = await addon.getDeviceState(device.id);
      console.log(`Status von ${device.name}:`, JSON.stringify(state, null, 2));
    }
  } catch (error) {
    console.error("Fehler:", error.message);
  }
}

/**
 * Beispiel 4: Umgebungsvariablen verwenden
 */
async function exampleEnvVars() {
  console.log("\n=== Beispiel: Umgebungsvariablen ===\n");

  try {
    // Konfiguration wird automatisch aus Umgebungsvariablen geladen
    // Setze z.B.:
    // export HOMEMATIC_MODE=cloud
    // export HOMEMATIC_IP_ACCESS_POINT_SGTIN=YOUR_SGTIN
    // export HOMEMATIC_IP_AUTH_TOKEN=YOUR_TOKEN

    const config = new Config(); // Lädt automatisch aus Umgebungsvariablen
    const addon = new HomematicIPAddon(config);
    await addon.initialize();

    console.log(`Verbindungsmodus: ${addon.getMode()}\n`);

    const devices = await addon.getDevices();
    console.log(`Gefundene Geräte: ${devices.length}`);
  } catch (error) {
    console.error("Fehler:", error.message);
    console.log(
      "\nHinweis: Stelle sicher, dass die Umgebungsvariablen gesetzt sind.",
    );
  }
}

// Hauptfunktion
async function main() {
  console.log("Homematic IP Addon - Beispiele\n");
  console.log(
    "Hinweis: Passe die Konfiguration in den Beispielen an deine Umgebung an.\n",
  );

  // Kommentiere die gewünschten Beispiele ein:

  // await exampleCloud();
  // await exampleLocal();
  // await exampleAuto();
  await exampleEnvVars();
}

// Führe Beispiele aus, wenn direkt aufgerufen
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { exampleCloud, exampleLocal, exampleAuto, exampleEnvVars };
