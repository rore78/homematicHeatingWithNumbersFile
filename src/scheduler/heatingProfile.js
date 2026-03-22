/**
 * Heizprofil-Manager
 * Verwaltet vordefinierte und benutzerdefinierte Heizprofile
 */
export class HeatingProfile {
  constructor() {
    this.profiles = {
      Komfort: {
        name: "Komfort",
        temperature: 21.0,
        description: "Komfortable Raumtemperatur",
      },
      Nacht: {
        name: "Nacht",
        temperature: 17.0,
        description: "Nachtabsenkung",
      },
      Abwesenheit: {
        name: "Abwesenheit",
        temperature: 16.0,
        description: "Temperatur bei Abwesenheit",
      },
      Reduziert: {
        name: "Reduziert",
        temperature: 19.0,
        description: "Reduzierte Temperatur",
      },
    };
  }

  /**
   * Ruft ein Profil ab
   * @param {string} profileName - Profilname
   * @returns {object|null} - Profil oder null wenn nicht gefunden
   */
  getProfile(profileName) {
    return this.profiles[profileName] || null;
  }

  /**
   * Ruft alle Profile ab
   * @returns {Array<object>} - Liste aller Profile
   */
  getAllProfiles() {
    return Object.values(this.profiles);
  }

  /**
   * Erstellt oder aktualisiert ein benutzerdefiniertes Profil
   * @param {string} name - Profilname
   * @param {number} temperature - Temperatur in °C
   * @param {string} description - Beschreibung (optional)
   * @returns {object} - Erstelltes/aktualisiertes Profil
   */
  createProfile(name, temperature, description = "") {
    if (
      typeof temperature !== "number" ||
      temperature < 0 ||
      temperature > 30
    ) {
      throw new Error("Temperatur muss eine Zahl zwischen 0 und 30 sein");
    }

    this.profiles[name] = {
      name,
      temperature,
      description,
      custom: true,
    };

    return this.profiles[name];
  }

  /**
   * Löscht ein benutzerdefiniertes Profil
   * @param {string} name - Profilname
   * @returns {boolean} - true wenn gelöscht, false wenn nicht gefunden oder vordefiniert
   */
  deleteProfile(name) {
    // Vordefinierte Profile können nicht gelöscht werden
    if (this.profiles[name] && !this.profiles[name].custom) {
      return false;
    }

    if (this.profiles[name]) {
      delete this.profiles[name];
      return true;
    }
    return false;
  }

  /**
   * Gibt die Temperatur für ein Profil zurück
   * @param {string} profileName - Profilname
   * @param {number} fallbackTemperature - Fallback-Temperatur wenn Profil nicht gefunden
   * @returns {number} - Temperatur in °C
   */
  getTemperature(profileName, fallbackTemperature = null) {
    const profile = this.getProfile(profileName);
    if (profile) {
      return profile.temperature;
    }
    if (fallbackTemperature !== null) {
      return fallbackTemperature;
    }
    throw new Error(`Profil '${profileName}' nicht gefunden`);
  }

  /**
   * Prüft ob ein Profil existiert
   * @param {string} profileName - Profilname
   * @returns {boolean}
   */
  hasProfile(profileName) {
    return !!this.profiles[profileName];
  }
}

export default HeatingProfile;
