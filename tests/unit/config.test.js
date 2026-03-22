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

  it("Local-Config via Constructor setzt hasLocalConfig", () => {
    const config = new Config({
      local: { host: "192.168.1.100" },
    });
    expect(config.hasLocalConfig()).toBe(true);
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
    // Default cloud config has null values
    config.cloud.accessPointSGTIN = null;
    config.cloud.authToken = null;
    expect(config.getMode()).toBeNull();
  });

  it("getMode local mit Local-Config gibt local", () => {
    const config = new Config({
      mode: "local",
      local: { host: "192.168.1.100" },
    });
    expect(config.getMode()).toBe("local");
  });

  it("getMode auto mit beiden gibt cloud (bevorzugt)", () => {
    const config = new Config({
      mode: "auto",
      cloud: { accessPointSGTIN: "SGTIN" },
      local: { host: "192.168.1.100" },
    });
    expect(config.getMode()).toBe("cloud");
  });

  it("getMode auto nur local gibt local", () => {
    const config = new Config({
      mode: "auto",
      local: { host: "192.168.1.100" },
    });
    // Ensure cloud config is empty
    config.cloud.accessPointSGTIN = null;
    config.cloud.authToken = null;
    expect(config.getMode()).toBe("local");
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
});
