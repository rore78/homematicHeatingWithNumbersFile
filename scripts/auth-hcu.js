#!/usr/bin/env node
/**
 * CLI-Script zum Anfordern eines Connect-API Auth-Tokens fuer eine HCU.
 *
 * Nutzung:
 *   node scripts/auth-hcu.js <hcu-host> <activation-key> [plugin-id]
 *
 * Beispiel:
 *   node scripts/auth-hcu.js hcu1-1234.local ABCDEF \
 *     com.redlberger.hmip.heizungssteuerung
 *
 * Der Aktivierungsschluessel (6 Zeichen) muss vorher ueber die HCUweb
 * Developer-Mode-Seite generiert werden.
 *
 * Das Script gibt den Auth-Token aus -- in .env als HOMEMATIC_AUTH_TOKEN
 * speichern.
 */
import ConnectApiAuth from "../src/client/connectApiAuth.js";

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error(
    "Nutzung: node scripts/auth-hcu.js <hcu-host> <activation-key> [plugin-id]",
  );
  process.exit(1);
}

const [hcuHost, activationKey, pluginIdArg] = args;
const pluginId = pluginIdArg || "com.redlberger.hmip.heizungssteuerung";
const friendlyName = {
  de: "Heizungssteuerung",
  en: "Heating Control",
};

async function main() {
  const auth = new ConnectApiAuth(hcuHost);

  console.log(`HCU: ${hcuHost}`);
  console.log(`Plugin-ID: ${pluginId}`);
  console.log("Fordere Auth-Token an...");

  const authToken = await auth.requestToken(
    activationKey,
    pluginId,
    friendlyName,
  );
  console.log(`Token erhalten: ${authToken}`);

  console.log("Bestaetige Token...");
  const clientId = await auth.confirmToken(activationKey, authToken);
  console.log(`Client-ID: ${clientId}`);

  console.log("");
  console.log("=========================================");
  console.log("Erfolgreich authentifiziert!");
  console.log("=========================================");
  console.log("");
  console.log("In .env eintragen:");
  console.log(`  HOMEMATIC_MODE=hcu`);
  console.log(`  HOMEMATIC_HCU_HOST=${hcuHost}`);
  console.log(`  HOMEMATIC_PLUGIN_ID=${pluginId}`);
  console.log(`  HOMEMATIC_AUTH_TOKEN=${authToken}`);
}

main().catch((err) => {
  console.error(`Fehler: ${err.message}`);
  if (err.response?.data) {
    console.error("Details:", err.response.data);
  }
  process.exit(1);
});
