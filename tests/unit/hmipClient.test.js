import { describe, it, expect } from "vitest";
import { isHmipClient } from "../../src/client/hmipClient.js";
import CloudClient from "../../src/client/cloudClient.js";
import ConnectApiClient from "../../src/client/connectApiClient.js";

describe("HmipClient Interface", () => {
  describe("isHmipClient", () => {
    it("gibt false fuer null/undefined", () => {
      expect(isHmipClient(null)).toBe(false);
      expect(isHmipClient(undefined)).toBe(false);
    });

    it("gibt false fuer primitive Typen", () => {
      expect(isHmipClient("string")).toBe(false);
      expect(isHmipClient(123)).toBe(false);
      expect(isHmipClient(true)).toBe(false);
    });

    it("gibt false wenn Pflichtmethoden fehlen", () => {
      const partial = {
        connect: () => {},
        getDevices: () => {},
      };
      expect(isHmipClient(partial)).toBe(false);
    });

    it("gibt true fuer Objekt mit allen Pflichtmethoden", () => {
      const full = {
        connect: () => {},
        disconnect: () => {},
        getDevices: () => {},
        getDevice: () => {},
        getSystemState: () => {},
        setTemperature: () => {},
        setBoost: () => {},
        setActiveProfile: () => {},
        setControlMode: () => {},
        setSwitchState: () => {},
        on: () => {},
      };
      expect(isHmipClient(full)).toBe(true);
    });
  });

  describe("CloudClient implementiert HmipClient", () => {
    it("erfuellt das HmipClient-Interface", () => {
      const client = new CloudClient({
        accessPointSGTIN: "TEST",
        authToken: "TOKEN",
      });
      expect(isHmipClient(client)).toBe(true);
    });
  });

  describe("ConnectApiClient implementiert HmipClient", () => {
    it("erfuellt das HmipClient-Interface", () => {
      const client = new ConnectApiClient({
        host: "hcu.local",
        authToken: "TOKEN",
      });
      expect(isHmipClient(client)).toBe(true);
    });
  });
});
