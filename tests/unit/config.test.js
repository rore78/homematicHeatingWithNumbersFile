import { describe, it, expect } from "vitest";
import Config from "../../src/config/config.js";

describe("Config", () => {
  it("erstellt Default-Config mit mode auto", () => {
    const config = new Config();
    expect(config.mode).toBe("auto");
  });

  it("Cloud-Config via Constructor setzt hasCloudConfig", () => {
    const config = new Config({
      cloud: { accessPointSGTIN: "TEST-SGTIN-123" },
    });
    expect(config.hasCloudConfig()).toBe(true);
  });

  it("HCU-Config via Constructor setzt hasHcuConfig", () => {
    const config = new Config({
      hcu: { host: "hcu1-1234.local", authToken: "ABCDEF1234" },
    });
    expect(config.hasHcuConfig()).toBe(true);
  });

  it("getMode cloud mit Cloud-Config gibt cloud", () => {
    const config = new Config({
      mode: "cloud",
      cloud: { accessPointSGTIN: "TEST-SGTIN" },
    });
    expect(config.getMode()).toBe("cloud");
  });

  it("getMode cloud ohne Cloud-Config gibt null", () => {
    const config = new Config({ mode: "cloud" });
    config.cloud.accessPointSGTIN = null;
    config.cloud.authToken = null;
    expect(config.getMode()).toBeNull();
  });

  it("getMode hcu mit HCU-Config gibt hcu", () => {
    const config = new Config({
      mode: "hcu",
      hcu: { host: "hcu1-1234.local", authToken: "TOKEN123" },
    });
    expect(config.getMode()).toBe("hcu");
  });

  it("getMode auto mit HCU-Config gibt hcu (bevorzugt)", () => {
    const config = new Config({
      mode: "auto",
      cloud: { accessPointSGTIN: "SGTIN" },
      hcu: { host: "hcu1-1234.local", authToken: "TOKEN" },
    });
    expect(config.getMode()).toBe("hcu");
  });

  it("getMode auto nur cloud gibt cloud", () => {
    const config = new Config({
      mode: "auto",
      cloud: { accessPointSGTIN: "SGTIN" },
    });
    expect(config.getMode()).toBe("cloud");
  });

  it("validate ohne Config gibt errors", () => {
    const config = new Config({ mode: "cloud" });
    config.cloud.accessPointSGTIN = null;
    config.cloud.authToken = null;
    const result = config.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("validate mit gueltiger Cloud-Config gibt valid", () => {
    const config = new Config({
      mode: "cloud",
      cloud: { accessPointSGTIN: "TEST" },
    });
    const result = config.validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("validate HCU ohne Token gibt errors", () => {
    const config = new Config({
      mode: "hcu",
      hcu: { host: "hcu1-1234.local" },
    });
    const result = config.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
