import axios from "axios";
import https from "https";

/**
 * Homematic IP Connect API Auth
 *
 * Implementiert den 3-Schritt-Auth-Flow zur Anforderung eines
 * Auth-Tokens ueber HTTPS. Wird nur fuer Remote-Entwicklung benoetigt.
 * Installierte Plugins lesen den Token aus /TOKEN.
 *
 * Ablauf:
 *   1. Aktivierungsschluessel ueber HCUweb Developer-Mode generieren
 *   2. requestToken(activationKey, pluginId, friendlyName)
 *   3. confirmToken(activationKey, authToken)
 */
export class ConnectApiAuth {
  constructor(hcuHost) {
    this.baseUrl = `https://${hcuHost}:6969`;
    this.httpsAgent = new https.Agent({ rejectUnauthorized: false });
  }

  /**
   * Schritt 1: Auth-Token anfordern
   * @param {string} activationKey - 6-stelliger Schluessel aus HCUweb
   * @param {string} pluginId - Reverse-Domain Plugin-ID
   * @param {Object} friendlyName - Lokalisierte Anzeigenamen, z.B. { de: '...', en: '...' }
   * @returns {Promise<string>} authToken
   */
  async requestToken(activationKey, pluginId, friendlyName) {
    const response = await axios.post(
      `${this.baseUrl}/hmip/auth/requestConnectApiAuthToken`,
      { activationKey, pluginId, friendlyName },
      {
        headers: { VERSION: "12", "Content-Type": "application/json" },
        httpsAgent: this.httpsAgent,
      },
    );
    if (!response.data?.authToken) {
      throw new Error("Kein authToken in der Antwort erhalten");
    }
    return response.data.authToken;
  }

  /**
   * Schritt 2: Auth-Token bestaetigen
   * @param {string} activationKey - gleicher Schluessel wie in Schritt 1
   * @param {string} authToken - Token aus Schritt 1
   * @returns {Promise<string>} clientId
   */
  async confirmToken(activationKey, authToken) {
    const response = await axios.post(
      `${this.baseUrl}/hmip/auth/confirmConnectApiAuthToken`,
      { activationKey, authToken },
      {
        headers: { VERSION: "12", "Content-Type": "application/json" },
        httpsAgent: this.httpsAgent,
      },
    );
    if (!response.data?.clientId) {
      throw new Error("Keine clientId in der Antwort erhalten");
    }
    return response.data.clientId;
  }
}

export default ConnectApiAuth;
