import { describe, it, expect, vi, beforeEach } from "vitest";
import IcloudFileSource from "../../src/sources/icloudFileSource.js";

// Mock child_process
vi.mock("child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("util", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    promisify: () =>
      vi.fn(async (cmd, args) => {
        // Default: python available, pyicloud available
        if (args.includes("--version")) {
          return { stdout: "Python 3.11.0", stderr: "" };
        }
        if (args.includes("-c")) {
          return { stdout: "", stderr: "" };
        }
        // Bridge actions -- parse action from args
        const actionIdx = args.indexOf("--action");
        const action = actionIdx >= 0 ? args[actionIdx + 1] : null;

        if (action === "status") {
          return {
            stdout: JSON.stringify({ status: "ok", authenticated: true }),
          };
        }
        if (action === "login") {
          return {
            stdout: JSON.stringify({ status: "2fa_required", message: "Code gesendet." }),
          };
        }
        if (action === "verify-2fa") {
          return {
            stdout: JSON.stringify({ status: "ok", session_valid: true }),
          };
        }
        if (action === "list") {
          return {
            stdout: JSON.stringify({
              status: "ok",
              files: [
                { name: "test.xlsx", path: "/Heizung/test.xlsx", size: 1000, modified: "2026-01-01" },
              ],
            }),
          };
        }
        return { stdout: JSON.stringify({ status: "ok" }), stderr: "" };
      }),
  };
});

describe("IcloudFileSource", () => {
  let source;

  beforeEach(() => {
    source = new IcloudFileSource({
      appleId: "test@icloud.com",
      password: "dGVzdA==",
      path: "/Heizung",
    });
    vi.clearAllMocks();
  });

  it("getType gibt 'icloud' zurueck", () => {
    expect(source.getType()).toBe("icloud");
  });

  it("getConfig gibt Config ohne Passwort zurueck", () => {
    const config = source.getConfig();
    expect(config.appleId).toBe("test@icloud.com");
    expect(config.path).toBe("/Heizung");
    expect(config.password).toBeUndefined();
  });

  it("updateConfig aktualisiert Felder", () => {
    source.updateConfig({ appleId: "new@icloud.com", path: "/Neu" });
    expect(source.appleId).toBe("new@icloud.com");
    expect(source.path).toBe("/Neu");
  });

  it("getAuthState gibt not_configured bei leerer appleId", () => {
    source.appleId = "";
    expect(source.getAuthState()).toBe("not_configured");
  });

  it("getAuthState gibt python_missing bei fehlendem Python", () => {
    source.pythonAvailable = false;
    expect(source.getAuthState()).toBe("python_missing");
  });

  it("getAuthState gibt aktuellen authState zurueck", () => {
    source.authState = "authenticated";
    expect(source.getAuthState()).toBe("authenticated");
  });

  it("isAvailable gibt false bei leerer appleId", async () => {
    source.appleId = "";
    expect(await source.isAvailable()).toBe(false);
  });
});
