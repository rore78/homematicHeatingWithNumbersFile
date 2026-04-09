import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  FritzboxFileSource,
  encodeCredential,
  decodeCredential,
} from "../../src/sources/fritzboxFileSource.js";

// Mock basic-ftp
vi.mock("basic-ftp", () => {
  const mockClient = {
    ftp: { verbose: false },
    access: vi.fn(),
    cd: vi.fn(),
    list: vi.fn().mockResolvedValue([]),
    downloadTo: vi.fn(),
    close: vi.fn(),
  };
  return {
    Client: vi.fn(() => ({ ...mockClient })),
    _mockClient: mockClient,
  };
});

describe("FritzboxFileSource", () => {
  let source;

  beforeEach(() => {
    source = new FritzboxFileSource({
      host: "192.168.178.1",
      port: 21,
      username: "fritz",
      password: encodeCredential("geheim"),
      path: "FRITZ.NAS/Heizung",
      secure: true,
    });
    vi.clearAllMocks();
  });

  it("getType gibt 'fritzbox' zurueck", () => {
    expect(source.getType()).toBe("fritzbox");
  });

  it("getConfig gibt Konfiguration ohne dekodiertes Passwort zurueck", () => {
    const config = source.getConfig();
    expect(config.host).toBe("192.168.178.1");
    expect(config.port).toBe(21);
    expect(config.username).toBe("fritz");
    expect(config.path).toBe("FRITZ.NAS/Heizung");
    expect(config.secure).toBe(true);
    // Passwort darf NICHT in getConfig sein
    expect(config.password).toBeUndefined();
  });

  it("updateConfig aktualisiert Felder", () => {
    source.updateConfig({ host: "10.0.0.1", port: 990 });
    expect(source.host).toBe("10.0.0.1");
    expect(source.port).toBe(990);
  });

  describe("Base64-Kodierung", () => {
    it("encodeCredential kodiert Klartext", () => {
      const encoded = encodeCredential("test123");
      expect(encoded).toBe(Buffer.from("test123").toString("base64"));
    });

    it("decodeCredential dekodiert Base64", () => {
      const encoded = encodeCredential("geheim");
      expect(decodeCredential(encoded)).toBe("geheim");
    });

    it("Roundtrip mit Sonderzeichen", () => {
      const special = "P@$$w0rd!äöü#";
      expect(decodeCredential(encodeCredential(special))).toBe(special);
    });

    it("decodeCredential mit leerem String", () => {
      expect(decodeCredential("")).toBe("");
    });

    it("decodeCredential mit null", () => {
      expect(decodeCredential(null)).toBe("");
    });
  });

  describe("isAvailable", () => {
    it("gibt false zurueck wenn host leer", async () => {
      source.host = "";
      expect(await source.isAvailable()).toBe(false);
    });
  });

  describe("testConnection", () => {
    it("gibt Erfolg bei gueltiger Verbindung", async () => {
      // _connect wird gemockt durch basic-ftp mock
      const result = await source.testConnection();
      expect(result.success).toBe(true);
      expect(result.message).toContain("Verbindung erfolgreich");
    });
  });
});
