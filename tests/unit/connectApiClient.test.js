import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock WebSocket BEFORE importing ConnectApiClient so the module picks up the mock.
vi.mock("ws", () => {
  class MockWebSocket {
    constructor(url, options) {
      this.url = url;
      this.options = options;
      this.readyState = 1; // OPEN
      this.sent = [];
      this._listeners = {};
      MockWebSocket.instances.push(this);
      // Open asynchron emittieren damit Listener angebunden werden koennen
      Promise.resolve().then(() => this._emit("open"));
    }

    on(event, handler) {
      (this._listeners[event] ||= []).push(handler);
    }
    once(event, handler) {
      const wrap = (...args) => {
        this.off(event, wrap);
        handler(...args);
      };
      this.on(event, wrap);
    }
    off(event, handler) {
      if (!this._listeners[event]) return;
      this._listeners[event] = this._listeners[event].filter(
        (h) => h !== handler,
      );
    }

    send(data) {
      this.sent.push(data);
    }

    close() {
      this.readyState = 3;
      this._emit("close");
    }

    _emit(event, ...args) {
      const handlers = this._listeners[event] || [];
      for (const h of handlers) h(...args);
    }

    // Helfer zum Simulieren eingehender Nachrichten
    simulateMessage(message) {
      const data =
        typeof message === "string" ? message : JSON.stringify(message);
      this._emit("message", Buffer.from(data));
    }
  }
  MockWebSocket.OPEN = 1;
  MockWebSocket.instances = [];
  return { default: MockWebSocket };
});

const { default: ConnectApiClient } =
  await import("../../src/client/connectApiClient.js");
const { default: WebSocket } = await import("ws");

describe("ConnectApiClient", () => {
  let client;

  beforeEach(() => {
    WebSocket.instances.length = 0;
  });

  afterEach(async () => {
    if (client) {
      await client.disconnect();
      client = null;
    }
  });

  describe("Verbindungsaufbau", () => {
    it("sendet Auth-Header beim Verbinden", async () => {
      client = new ConnectApiClient({
        host: "hcu1-1234.local",
        authToken: "TOKEN-ABC",
        pluginId: "test.plugin",
      });
      await client.connect();

      const ws = WebSocket.instances[0];
      expect(ws.url).toBe("wss://hcu1-1234.local:9001");
      expect(ws.options.headers.authtoken).toBe("TOKEN-ABC");
      expect(ws.options.headers["plugin-id"]).toBe("test.plugin");
      expect(ws.options.headers["hmip-system-events"]).toBe("true");
      expect(ws.options.rejectUnauthorized).toBe(false);
    });

    it("wirft Fehler ohne Auth-Token", async () => {
      client = new ConnectApiClient({ host: "hcu.local" });
      await expect(client.connect()).rejects.toThrow(/Auth-Token/);
    });

    it("setzt hmip-system-events header nur wenn aktiviert", async () => {
      client = new ConnectApiClient({
        host: "hcu.local",
        authToken: "T",
        subscribeSystemEvents: false,
      });
      await client.connect();
      const ws = WebSocket.instances[0];
      expect(ws.options.headers["hmip-system-events"]).toBeUndefined();
    });
  });

  describe("Nachrichten-Envelope", () => {
    it("sendet PluginMessage mit pluginId, id, type, body", async () => {
      client = new ConnectApiClient({
        host: "hcu.local",
        authToken: "T",
        pluginId: "test.plugin",
      });
      await client.connect();

      const ws = WebSocket.instances[0];
      // Starte Request (nicht awaiten, da keine Antwort kommt)
      client
        ._sendRequest("HMIP_SYSTEM_REQUEST", { path: "/x", body: {} })
        .catch(() => {});

      expect(ws.sent).toHaveLength(1);
      const msg = JSON.parse(ws.sent[0]);
      expect(msg.pluginId).toBe("test.plugin");
      expect(msg.type).toBe("HMIP_SYSTEM_REQUEST");
      expect(msg.body).toEqual({ path: "/x", body: {} });
      expect(typeof msg.id).toBe("string");
      expect(msg.id.length).toBeGreaterThan(8);
    });
  });

  describe("Request-Response Korrelation", () => {
    it("loest pending Request bei passender ID auf", async () => {
      client = new ConnectApiClient({ host: "h", authToken: "T" });
      await client.connect();
      const ws = WebSocket.instances[0];

      const promise = client._sendRequest("HMIP_SYSTEM_REQUEST", {});
      const sent = JSON.parse(ws.sent[0]);

      ws.simulateMessage({
        pluginId: "test",
        id: sent.id,
        type: "HMIP_SYSTEM_RESPONSE",
        body: { code: 200 },
      });

      const response = await promise;
      expect(response.body.code).toBe(200);
    });

    it("wirft Timeout-Fehler wenn keine Antwort kommt", async () => {
      client = new ConnectApiClient({ host: "h", authToken: "T" });
      await client.connect();
      await expect(
        client._sendRequest("HMIP_SYSTEM_REQUEST", {}, 50),
      ).rejects.toThrow(/Zeitueberschreitung/);
    });
  });

  describe("HMIP_SYSTEM_REQUEST Fehlerbehandlung", () => {
    it("wirft Fehler mit errorCode bei Code != 200", async () => {
      client = new ConnectApiClient({ host: "h", authToken: "T" });
      await client.connect();
      const ws = WebSocket.instances[0];

      const promise = client.setTemperature("group-1", 21);
      const sent = JSON.parse(ws.sent[0]);

      ws.simulateMessage({
        id: sent.id,
        type: "HMIP_SYSTEM_RESPONSE",
        body: { code: 400, body: { errorCode: "UNKNOWN_GROUP" } },
      });

      await expect(promise).rejects.toThrow(/UNKNOWN_GROUP/);
    });
  });

  describe("Heizungssteuerung", () => {
    it("setTemperature sendet korrekten Path und Body", async () => {
      client = new ConnectApiClient({ host: "h", authToken: "T" });
      await client.connect();
      const ws = WebSocket.instances[0];

      const p = client.setTemperature("grp-1", 21.5);
      const sent = JSON.parse(ws.sent[0]);
      expect(sent.body.path).toBe("/hmip/group/heating/setSetPointTemperature");
      expect(sent.body.body).toEqual({
        groupId: "grp-1",
        setPointTemperature: 21.5,
      });

      // Antwort simulieren damit die Promise aufloest
      ws.simulateMessage({
        id: sent.id,
        type: "HMIP_SYSTEM_RESPONSE",
        body: { code: 200 },
      });
      await p;
    });

    it("setTemperature klemmt Wert auf 5-30 °C", async () => {
      client = new ConnectApiClient({ host: "h", authToken: "T" });
      await client.connect();
      const ws = WebSocket.instances[0];

      client.setTemperature("g", 50).catch(() => {});
      let sent = JSON.parse(ws.sent[0]);
      expect(sent.body.body.setPointTemperature).toBe(30);

      client.setTemperature("g", -5).catch(() => {});
      sent = JSON.parse(ws.sent[1]);
      expect(sent.body.body.setPointTemperature).toBe(5);
    });

    it("setActiveProfile konvertiert Nummer zu PROFILE_N", async () => {
      client = new ConnectApiClient({ host: "h", authToken: "T" });
      await client.connect();
      const ws = WebSocket.instances[0];

      client.setActiveProfile("g", 2).catch(() => {});
      const sent = JSON.parse(ws.sent[0]);
      expect(sent.body.body.profileIndex).toBe("PROFILE_2");
    });

    it("setBoost sendet boolean direkt", async () => {
      client = new ConnectApiClient({ host: "h", authToken: "T" });
      await client.connect();
      const ws = WebSocket.instances[0];

      client.setBoost("g", true).catch(() => {});
      const sent = JSON.parse(ws.sent[0]);
      expect(sent.body.path).toBe("/hmip/group/heating/setBoost");
      expect(sent.body.body).toEqual({ groupId: "g", boost: true });
    });
  });

  describe("Plugin-Lebenszyklus", () => {
    it("antwortet auf PLUGIN_STATE_REQUEST mit READY", async () => {
      client = new ConnectApiClient({
        host: "h",
        authToken: "T",
        friendlyName: { de: "Test", en: "Test" },
      });
      await client.connect();
      const ws = WebSocket.instances[0];

      ws.simulateMessage({
        id: "req-1",
        type: "PLUGIN_STATE_REQUEST",
        body: {},
      });

      expect(ws.sent).toHaveLength(1);
      const sent = JSON.parse(ws.sent[0]);
      expect(sent.type).toBe("PLUGIN_STATE_RESPONSE");
      expect(sent.id).toBe("req-1");
      expect(sent.body.pluginReadinessStatus).toBe("READY");
      expect(sent.body.friendlyName).toEqual({ de: "Test", en: "Test" });
    });

    it("antwortet auf CONFIG_TEMPLATE_REQUEST mit Template", async () => {
      const template = {
        properties: { foo: { dataType: "STRING", friendlyName: "Foo" } },
        groups: {},
      };
      client = new ConnectApiClient({
        host: "h",
        authToken: "T",
        configTemplate: template,
      });
      await client.connect();
      const ws = WebSocket.instances[0];

      ws.simulateMessage({
        id: "req-2",
        type: "CONFIG_TEMPLATE_REQUEST",
        body: {},
      });

      const sent = JSON.parse(ws.sent[0]);
      expect(sent.type).toBe("CONFIG_TEMPLATE_RESPONSE");
      expect(sent.body).toEqual(template);
    });

    it("ruft configUpdateHandler bei CONFIG_UPDATE_REQUEST auf", async () => {
      const handler = vi.fn();
      client = new ConnectApiClient({
        host: "h",
        authToken: "T",
        configUpdateHandler: handler,
      });
      await client.connect();
      const ws = WebSocket.instances[0];

      ws.simulateMessage({
        id: "req-3",
        type: "CONFIG_UPDATE_REQUEST",
        body: { properties: { pollingInterval: "30" } },
      });

      expect(handler).toHaveBeenCalledWith({ pollingInterval: "30" });
      const sent = JSON.parse(ws.sent[0]);
      expect(sent.body.status).toBe("APPLIED");
    });

    it("meldet FAILED bei Fehler im Config-Handler", async () => {
      const handler = vi.fn(() => {
        throw new Error("ungueltig");
      });
      client = new ConnectApiClient({
        host: "h",
        authToken: "T",
        configUpdateHandler: handler,
      });
      await client.connect();
      const ws = WebSocket.instances[0];

      ws.simulateMessage({
        id: "req-4",
        type: "CONFIG_UPDATE_REQUEST",
        body: { properties: { x: "y" } },
      });

      const sent = JSON.parse(ws.sent[0]);
      expect(sent.body.status).toBe("FAILED");
      expect(sent.body.message).toBe("ungueltig");
    });
  });

  describe("System-Events", () => {
    it("emittiert deviceChanged Event", async () => {
      client = new ConnectApiClient({ host: "h", authToken: "T" });
      await client.connect();
      const ws = WebSocket.instances[0];

      const handler = vi.fn();
      client.on("deviceChanged", handler);

      ws.simulateMessage({
        type: "HMIP_SYSTEM_EVENT",
        body: {
          eventTransaction: {
            events: {
              0: {
                pushEventType: "DEVICE_CHANGED",
                device: { id: "dev1", label: "Licht" },
              },
            },
          },
        },
      });

      expect(handler).toHaveBeenCalledWith({ id: "dev1", label: "Licht" });
    });

    it("emittiert groupChanged Event", async () => {
      client = new ConnectApiClient({ host: "h", authToken: "T" });
      await client.connect();
      const ws = WebSocket.instances[0];

      const handler = vi.fn();
      client.on("groupChanged", handler);

      ws.simulateMessage({
        type: "HMIP_SYSTEM_EVENT",
        body: {
          eventTransaction: {
            events: {
              0: {
                pushEventType: "GROUP_CHANGED",
                group: { id: "grp1" },
              },
            },
          },
        },
      });

      expect(handler).toHaveBeenCalledWith({ id: "grp1" });
    });

    it("invalidiert systemState bei HOME_CHANGED", async () => {
      client = new ConnectApiClient({ host: "h", authToken: "T" });
      await client.connect();
      const ws = WebSocket.instances[0];

      client.systemState = { devices: { x: {} } };

      ws.simulateMessage({
        type: "HMIP_SYSTEM_EVENT",
        body: {
          eventTransaction: {
            events: { 0: { pushEventType: "HOME_CHANGED", home: {} } },
          },
        },
      });

      expect(client.systemState).toBeNull();
    });
  });

  describe("Geraete-Normalisierung", () => {
    it("normalisiert Connect-API-Geraete in HmipDevice-Format", async () => {
      client = new ConnectApiClient({ host: "h", authToken: "T" });
      await client.connect();
      const ws = WebSocket.instances[0];

      client.systemState = {
        devices: {
          "dev-1": {
            label: "Wohnzimmer Thermostat",
            type: "THERMOSTAT",
            modelType: "HmIP-eTRV",
            firmwareVersion: "2.0.0",
            functionalChannels: {
              1: {
                actualTemperature: 21.5,
                setPointTemperature: 22.0,
                humidity: 45,
                lowBat: false,
                unreach: false,
              },
            },
          },
        },
      };

      const devices = await client.getDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0]).toMatchObject({
        id: "dev-1",
        name: "Wohnzimmer Thermostat",
        type: "THERMOSTAT",
        model: "HmIP-eTRV",
        firmware: "2.0.0",
        temperature: 21.5,
        setPointTemperature: 22.0,
        humidity: 45,
        lowBat: false,
        unreach: false,
      });

      // Anti-Konsum: keine WebSocket-Nachricht geschickt, da systemState gecacht
      expect(ws.sent).toHaveLength(0);
    });
  });

  describe("Disconnect", () => {
    it("beendet pending Requests mit Fehler", async () => {
      client = new ConnectApiClient({ host: "h", authToken: "T" });
      await client.connect();

      const pending = client._sendRequest("X", {}, 5000);
      await client.disconnect();
      await expect(pending).rejects.toThrow(/geschlossen/);
    });
  });
});
