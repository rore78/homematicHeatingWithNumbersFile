/**
 * HmipClient Interface
 *
 * Einheitliches Interface fuer die Kommunikation mit Homematic IP Systemen.
 * Wird von CloudClient (REST) und ConnectApiClient (WebSocket) implementiert.
 *
 * Diese Datei definiert nur die JSDoc-Typen -- JavaScript hat keine echten
 * Interfaces. Konkrete Implementierungen werden in cloudClient.js und
 * connectApiClient.js bereitgestellt.
 */

/**
 * Einheitliches Geraete-Datenmodell
 * @typedef {Object} HmipDevice
 * @property {string} id - Eindeutige Geraete-ID
 * @property {string} name - Anzeigename
 * @property {string} type - Geraetetyp (z.B. THERMOSTAT, SWITCH, LIGHT)
 * @property {string} [model] - Modellbezeichnung
 * @property {string} [manufacturer] - Hersteller
 * @property {string} [firmware] - Firmware-Version
 * @property {boolean} [lowBat] - Batterie schwach
 * @property {boolean} [unreach] - Geraet nicht erreichbar
 * @property {Object|Array} [channels] - Kanalzuordnung (client-spezifisch)
 * @property {number} [temperature] - Aktuelle Temperatur (°C, falls verfuegbar)
 * @property {number} [setPointTemperature] - Zieltemperatur (°C, falls verfuegbar)
 * @property {number} [humidity] - Luftfeuchtigkeit (%, falls verfuegbar)
 */

/**
 * Fehler-Datenmodell
 * @typedef {Object} HmipError
 * @property {string} code - Fehlercode (z.B. 'FEATURE_NOT_SUPPORTED')
 * @property {string} [message] - Menschenlesbare Fehlermeldung
 */

/**
 * Event-Typen die von Clients emittiert werden koennen.
 * Nicht alle Clients unterstuetzen alle Events (Cloud hat kein Push).
 *
 * @typedef {'connected'|'disconnected'|'deviceChanged'|'groupChanged'|'deviceAdded'|'deviceRemoved'} HmipEventType
 */

/**
 * @typedef {Object} HmipClient
 *
 * @property {function(): Promise<void>} connect
 *   Baut die Verbindung auf (oder authentifiziert bei zustandslosen Clients).
 *
 * @property {function(): Promise<void>} disconnect
 *   Beendet die Verbindung sauber (Noop bei zustandslosen Clients).
 *
 * @property {function(): Promise<HmipDevice[]>} getDevices
 *   Liefert alle bekannten Geraete als normalisiertes HmipDevice-Array.
 *
 * @property {function(string): Promise<HmipDevice>} getDevice
 *   Liefert ein einzelnes Geraet anhand der ID.
 *
 * @property {function(): Promise<Object>} getSystemState
 *   Liefert den vollstaendigen Systemstatus (Geraete, Gruppen, Home-Konfig).
 *   Format ist client-spezifisch.
 *
 * @property {function(string, number): Promise<void>} setTemperature
 *   Setzt die Zieltemperatur einer Heizgruppe/eines Thermostats.
 *   @param id - Gruppen-ID (HCU) oder Geraete-ID (Cloud)
 *   @param temperature - Temperatur in °C (5-30)
 *
 * @property {function(string, boolean): Promise<void>} setBoost
 *   Aktiviert/deaktiviert den Boost-Modus einer Heizgruppe.
 *
 * @property {function(string, string): Promise<void>} setActiveProfile
 *   Aktiviert ein Heizprofil (z.B. 'PROFILE_1' bis 'PROFILE_6').
 *
 * @property {function(string, string): Promise<void>} setControlMode
 *   Setzt den Steuerungsmodus ('AUTOMATIC' oder 'MANUAL').
 *
 * @property {function(string, boolean, number=): Promise<void>} setSwitchState
 *   Schaltet einen Schaltaktor ein/aus.
 *   @param deviceId - Geraete-ID
 *   @param on - true = ein, false = aus
 *   @param channelIndex - Kanal (Default: 1)
 *
 * @property {function(): Promise<void>} [activateAbsence]
 *   Aktiviert dauerhafte Abwesenheit (Economy-Modus). Optional.
 *
 * @property {function(): Promise<void>} [deactivateAbsence]
 *   Deaktiviert Abwesenheit. Optional.
 *
 * @property {function(HmipEventType, function): void} on
 *   Registriert einen Event-Handler. Bei Clients ohne Push-Support (Cloud)
 *   wird der Handler nie aufgerufen.
 */

/**
 * Hilfsfunktion zur Laufzeitpruefung ob ein Objekt das HmipClient-Interface
 * implementiert. Nuetzlich fuer Fehlerdiagnose.
 *
 * @param {any} obj - Zu pruefendes Objekt
 * @returns {boolean} true wenn alle Pflichtmethoden vorhanden sind
 */
export function isHmipClient(obj) {
  if (!obj || typeof obj !== "object") return false;
  const required = [
    "connect",
    "disconnect",
    "getDevices",
    "getDevice",
    "getSystemState",
    "setTemperature",
    "setBoost",
    "setActiveProfile",
    "setControlMode",
    "setSwitchState",
    "on",
  ];
  return required.every((method) => typeof obj[method] === "function");
}
