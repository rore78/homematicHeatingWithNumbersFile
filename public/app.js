const API_BASE = "";

// DOM Elements
const uploadArea = document.getElementById("uploadArea");
const fileInput = document.getElementById("fileInput");
const uploadStatus = document.getElementById("uploadStatus");
const previewSection = document.getElementById("previewSection");
const previewTableBody = document.getElementById("previewTableBody");
const scheduleNameInput = document.getElementById("scheduleName");
const createScheduleBtn = document.getElementById("createScheduleBtn");
const areasList = document.getElementById("areasList");
const schedulesList = document.getElementById("schedulesList");
const areaNameInput = document.getElementById("areaName");
const areaDevicesInput = document.getElementById("areaDevices");
const createAreaBtn = document.getElementById("createAreaBtn");

let parsedData = null;

// Upload Handling
uploadArea.addEventListener("click", () => fileInput.click());
uploadArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  uploadArea.classList.add("dragover");
});
uploadArea.addEventListener("dragleave", () => {
  uploadArea.classList.remove("dragover");
});
uploadArea.addEventListener("drop", (e) => {
  e.preventDefault();
  uploadArea.classList.remove("dragover");
  const files = e.dataTransfer.files;
  if (files.length > 0) {
    handleFile(files[0]);
  }
});

fileInput.addEventListener("change", (e) => {
  if (e.target.files.length > 0) {
    handleFile(e.target.files[0]);
  }
});

async function handleFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  uploadStatus.className = "upload-status";
  uploadStatus.textContent = "Datei wird hochgeladen...";
  uploadStatus.style.display = "block";

  try {
    const response = await fetch(`${API_BASE}/api/upload`, {
      method: "POST",
      body: formData,
    });

    const result = await response.json();

    if (result.success) {
      uploadStatus.className = "upload-status success";
      uploadStatus.textContent = `✓ ${result.count} Zeilen erfolgreich geparst`;
      parsedData = result.data;
      showPreview(result.data);
    } else {
      throw new Error(result.error || "Unbekannter Fehler");
    }
  } catch (error) {
    uploadStatus.className = "upload-status error";
    uploadStatus.textContent = `✗ Fehler: ${error.message}`;
    parsedData = null;
    previewSection.style.display = "none";
  }
}

function showPreview(data) {
  previewSection.style.display = "block";
  previewTableBody.innerHTML = "";

  data.forEach((row, _index) => {
    const tr = document.createElement("tr");

    const startDate = new Date(row.startDateTime);
    const endDate = new Date(row.endDateTime);

    tr.innerHTML = `
            <td>${escapeHtml(row.area)}</td>
            <td>${formatDateTime(startDate)}</td>
            <td>${formatDateTime(endDate)}</td>
            <td>${formatControlMode(row)}</td>
            <td>${row.notes || "-"}</td>
        `;

    previewTableBody.appendChild(tr);
  });
}

function formatDateTime(date) {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${day}.${month}.${year} ${hours}:${minutes}`;
}

function formatControlMode(row) {
  if (row.controlMode === "deviceProfile" && row.deviceProfile) {
    return `Profil ${row.deviceProfile}`;
  }
  if (row.profile && row.temperature != null) {
    return `${escapeHtml(row.profile)} (${row.temperature}°C)`;
  }
  if (row.temperature != null) {
    return `Temp. ${row.temperature}°C`;
  }
  return "-";
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Zeitplan erstellen
createScheduleBtn.addEventListener("click", async () => {
  if (!parsedData || parsedData.length === 0) {
    alert("Keine Daten zum Erstellen eines Zeitplans");
    return;
  }

  const name = scheduleNameInput.value.trim();
  if (!name) {
    alert("Bitte gib einen Namen für den Zeitplan ein");
    return;
  }

  createScheduleBtn.disabled = true;
  createScheduleBtn.textContent = "Wird erstellt...";

  try {
    const response = await fetch(`${API_BASE}/api/schedule`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        data: parsedData,
      }),
    });

    const result = await response.json();

    if (result.success) {
      alert("Zeitplan erfolgreich erstellt!");
      scheduleNameInput.value = "";
      parsedData = null;
      previewSection.style.display = "none";
      loadSchedules();
    } else {
      throw new Error(result.error || "Unbekannter Fehler");
    }
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  } finally {
    createScheduleBtn.disabled = false;
    createScheduleBtn.textContent = "Zeitplan erstellen";
  }
});

// Bereich erstellen
createAreaBtn.addEventListener("click", async () => {
  const name = areaNameInput.value.trim();
  const devices = areaDevicesInput.value
    .trim()
    .split(",")
    .map((d) => d.trim())
    .filter((d) => d);

  if (!name || devices.length === 0) {
    alert("Bitte gib einen Namen und mindestens eine Geräte-ID ein");
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/areas`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name,
        deviceIds: devices,
      }),
    });

    const result = await response.json();

    if (result.success) {
      areaNameInput.value = "";
      areaDevicesInput.value = "";
      loadAreas();
    } else {
      throw new Error(result.error || "Unbekannter Fehler");
    }
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
});

// Bereiche laden
async function loadAreas() {
  try {
    const response = await fetch(`${API_BASE}/api/areas`);
    const result = await response.json();

    if (result.success) {
      areasList.innerHTML = "";

      if (result.areas.length === 0) {
        areasList.innerHTML =
          '<div class="empty-state">Keine Bereiche definiert</div>';
        return;
      }

      result.areas.forEach((area) => {
        const div = document.createElement("div");
        div.className = "area-item";
        div.innerHTML = `
                    <div>
                        <strong>${escapeHtml(area.name)}</strong>
                        <div class="devices">Geräte: ${area.deviceIds.join(", ")}</div>
                    </div>
                    <button class="btn btn-danger btn-small" onclick="deleteArea('${area.name}')">Löschen</button>
                `;
        areasList.appendChild(div);
      });
    }
  } catch (error) {
    console.error("Fehler beim Laden der Bereiche:", error);
  }
}

// Bereich löschen
window.deleteArea = async function (name) {
  if (!confirm(`Bereich "${name}" wirklich löschen?`)) {
    return;
  }

  try {
    const response = await fetch(
      `${API_BASE}/api/areas/${encodeURIComponent(name)}`,
      {
        method: "DELETE",
      },
    );

    const result = await response.json();

    if (result.success) {
      loadAreas();
    } else {
      throw new Error(result.error || "Unbekannter Fehler");
    }
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
};

// Zeitpläne laden
async function loadSchedules() {
  try {
    const response = await fetch(`${API_BASE}/api/schedules`);
    const result = await response.json();

    if (result.success) {
      schedulesList.innerHTML = "";

      if (result.schedules.length === 0) {
        schedulesList.innerHTML =
          '<div class="empty-state">Keine Zeitpläne vorhanden</div>';
        return;
      }

      result.schedules.forEach((schedule) => {
        const div = document.createElement("div");
        div.className = `schedule-item ${schedule.active ? "active" : ""}`;

        const createdAt = new Date(schedule.createdAt);
        const _areas = schedule.areas.map((a) => a.areaName).join(", ");

        div.innerHTML = `
                    <h3>${escapeHtml(schedule.name)}</h3>
                    <div class="meta">
                        Erstellt: ${formatDateTime(createdAt)} | 
                        Bereiche: ${schedule.areas.length} | 
                        Status: ${schedule.active ? "Aktiv" : "Inaktiv"}
                    </div>
                    <div class="areas">
                        ${schedule.areas.map((a) => `<span class="area-badge">${escapeHtml(a.areaName)}</span>`).join("")}
                    </div>
                    <div class="actions">
                        ${
                          schedule.active
                            ? `<button class="btn btn-secondary btn-small" onclick="deactivateSchedule('${schedule.id}')">Deaktivieren</button>`
                            : `<button class="btn btn-success btn-small" onclick="activateSchedule('${schedule.id}')">Aktivieren</button>`
                        }
                        <button class="btn btn-danger btn-small" onclick="deleteSchedule('${schedule.id}')">Löschen</button>
                    </div>
                `;
        schedulesList.appendChild(div);
      });
    }
  } catch (error) {
    console.error("Fehler beim Laden der Zeitpläne:", error);
  }
}

// Zeitplan aktivieren
window.activateSchedule = async function (id) {
  try {
    const response = await fetch(`${API_BASE}/api/schedules/${id}/activate`, {
      method: "POST",
    });

    const result = await response.json();

    if (result.success) {
      loadSchedules();
    } else {
      throw new Error(result.error || "Unbekannter Fehler");
    }
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
};

// Zeitplan deaktivieren
window.deactivateSchedule = async function (id) {
  try {
    const response = await fetch(`${API_BASE}/api/schedules/${id}/deactivate`, {
      method: "POST",
    });

    const result = await response.json();

    if (result.success) {
      loadSchedules();
    } else {
      throw new Error(result.error || "Unbekannter Fehler");
    }
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
};

// Zeitplan löschen
window.deleteSchedule = async function (id) {
  if (!confirm("Zeitplan wirklich löschen?")) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE}/api/schedules/${id}`, {
      method: "DELETE",
    });

    const result = await response.json();

    if (result.success) {
      loadSchedules();
    } else {
      throw new Error(result.error || "Unbekannter Fehler");
    }
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
};

// --- Dateiquellen ---

const usbEnabled = document.getElementById("usbEnabled");
const usbMountPoint = document.getElementById("usbMountPoint");
const usbSubFolder = document.getElementById("usbSubFolder");
const usbSaveBtn = document.getElementById("usbSaveBtn");
const usbScanBtn = document.getElementById("usbScanBtn");
const usbStatus = document.getElementById("usbStatus");
const usbFilesList = document.getElementById("usbFilesList");

async function loadSources() {
  try {
    const response = await fetch(`${API_BASE}/api/sources`);
    const result = await response.json();
    if (result.success) {
      if (result.data.usb) {
        const usb = result.data.usb;
        usbEnabled.checked = usb.enabled;
        usbMountPoint.value = usb.mountPoint || "";
        usbSubFolder.value = usb.subFolder || "";
        if (usb.enabled) {
          usbStatus.textContent = usb.available
            ? "Verbunden"
            : "Nicht verbunden";
          usbStatus.className = `source-status ${usb.available ? "connected" : "disconnected"}`;
          if (usb.lastChecked) {
            usbStatus.textContent += ` | Zuletzt geprueft: ${formatDateTime(new Date(usb.lastChecked))}`;
          }
        } else {
          usbStatus.textContent = "Deaktiviert";
          usbStatus.className = "source-status info";
        }
      }
      if (result.data.fritzbox) {
        updateFritzboxUI(result.data.fritzbox);
      }
    }
  } catch {
    // Quellen nicht verfuegbar
  }
}

usbSaveBtn.addEventListener("click", async () => {
  try {
    const response = await fetch(`${API_BASE}/api/sources/usb`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: usbEnabled.checked,
        mountPoint: usbMountPoint.value.trim(),
        subFolder: usbSubFolder.value.trim(),
      }),
    });
    const result = await response.json();
    if (result.success) {
      usbStatus.textContent = "Konfiguration gespeichert.";
      usbStatus.className = "source-status connected";
      loadSources();
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    usbStatus.textContent = `Fehler: ${error.message}`;
    usbStatus.className = "source-status disconnected";
  }
});

usbScanBtn.addEventListener("click", async () => {
  usbScanBtn.disabled = true;
  usbScanBtn.textContent = "Scanne...";
  try {
    const response = await fetch(`${API_BASE}/api/sources/usb/scan`, {
      method: "POST",
    });
    const result = await response.json();
    if (result.success) {
      renderUsbFiles(result.data.files);
      usbStatus.textContent = `${result.data.files.length} Datei(en) gefunden | Geprueft: ${formatDateTime(new Date(result.data.checkedAt))}`;
      usbStatus.className = "source-status connected";
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    usbStatus.textContent = `Fehler: ${error.message}`;
    usbStatus.className = "source-status disconnected";
    usbFilesList.innerHTML = "";
  } finally {
    usbScanBtn.disabled = false;
    usbScanBtn.textContent = "Jetzt pruefen";
  }
});

function renderUsbFiles(files) {
  renderSourceFiles(usbFilesList, "usb", files);
}

window.importSourceFile = async function (type, fileName) {
  try {
    const response = await fetch(`${API_BASE}/api/sources/${type}/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName }),
    });
    const result = await response.json();
    if (result.success) {
      alert(result.message);
      loadSchedules();
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    alert(`Fehler: ${error.message}`);
  }
};

// --- FRITZ!Box Dateiquelle ---

const fbEnabled = document.getElementById("fbEnabled");
const fbHost = document.getElementById("fbHost");
const fbPort = document.getElementById("fbPort");
const fbUsername = document.getElementById("fbUsername");
const fbPassword = document.getElementById("fbPassword");
const fbPath = document.getElementById("fbPath");
const fbSaveBtn = document.getElementById("fbSaveBtn");
const fbTestBtn = document.getElementById("fbTestBtn");
const fbScanBtn = document.getElementById("fbScanBtn");
const fbStatus = document.getElementById("fbStatus");
const fbFilesList = document.getElementById("fbFilesList");

function updateFritzboxUI(fb) {
  if (!fb) return;
  fbEnabled.checked = fb.enabled;
  fbHost.value = fb.host || "";
  fbPort.value = fb.port || 21;
  fbUsername.value = fb.username || "";
  fbPassword.value = fb.password === "********" ? "********" : "";
  fbPath.value = fb.path || "";
  if (!fb.host) {
    fbStatus.textContent = "Nicht konfiguriert";
    fbStatus.className = "source-status info";
  } else if (fb.enabled) {
    fbStatus.textContent = fb.available ? "Verbunden" : "Nicht erreichbar";
    fbStatus.className = `source-status ${fb.available ? "connected" : "disconnected"}`;
    if (fb.lastChecked) {
      fbStatus.textContent += ` | Zuletzt geprueft: ${formatDateTime(new Date(fb.lastChecked))}`;
    }
  } else {
    fbStatus.textContent = "Deaktiviert";
    fbStatus.className = "source-status info";
  }
}

fbSaveBtn.addEventListener("click", async () => {
  try {
    const response = await fetch(`${API_BASE}/api/sources/fritzbox`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: fbEnabled.checked,
        host: fbHost.value.trim(),
        port: parseInt(fbPort.value) || 21,
        username: fbUsername.value.trim(),
        password: fbPassword.value,
        path: fbPath.value.trim(),
        secure: true,
      }),
    });
    const result = await response.json();
    if (result.success) {
      fbStatus.textContent = "Konfiguration gespeichert.";
      fbStatus.className = "source-status connected";
      loadSources();
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    fbStatus.textContent = `Fehler: ${error.message}`;
    fbStatus.className = "source-status disconnected";
  }
});

fbTestBtn.addEventListener("click", async () => {
  fbTestBtn.disabled = true;
  fbTestBtn.textContent = "Teste...";
  try {
    const response = await fetch(`${API_BASE}/api/sources/fritzbox/test`, {
      method: "POST",
    });
    const result = await response.json();
    if (result.success) {
      fbStatus.textContent = result.message;
      fbStatus.className = "source-status connected";
    } else {
      fbStatus.textContent = result.error;
      fbStatus.className = "source-status disconnected";
    }
  } catch (error) {
    fbStatus.textContent = `Fehler: ${error.message}`;
    fbStatus.className = "source-status disconnected";
  } finally {
    fbTestBtn.disabled = false;
    fbTestBtn.textContent = "Verbindung testen";
  }
});

fbScanBtn.addEventListener("click", async () => {
  fbScanBtn.disabled = true;
  fbScanBtn.textContent = "Scanne...";
  try {
    const response = await fetch(`${API_BASE}/api/sources/fritzbox/scan`, {
      method: "POST",
    });
    const result = await response.json();
    if (result.success) {
      renderSourceFiles(fbFilesList, "fritzbox", result.data.files);
      fbStatus.textContent = `${result.data.files.length} Datei(en) gefunden | Geprueft: ${formatDateTime(new Date(result.data.checkedAt))}`;
      fbStatus.className = "source-status connected";
    } else {
      throw new Error(result.error);
    }
  } catch (error) {
    fbStatus.textContent = `Fehler: ${error.message}`;
    fbStatus.className = "source-status disconnected";
    fbFilesList.innerHTML = "";
  } finally {
    fbScanBtn.disabled = false;
    fbScanBtn.textContent = "Jetzt pruefen";
  }
});

function renderSourceFiles(container, type, files) {
  if (!files || files.length === 0) {
    container.innerHTML =
      '<div class="empty-state">Keine Dateien gefunden</div>';
    return;
  }
  let html = `<table><thead><tr>
    <th>Datei</th><th>Groesse</th><th>Geaendert</th><th>Aktion</th>
  </tr></thead><tbody>`;
  for (const file of files) {
    const sizeKb = Math.round(file.size / 1024);
    const mod = file.modified ? formatDateTime(new Date(file.modified)) : "-";
    html += `<tr>
      <td>${escapeHtml(file.name)}</td>
      <td>${sizeKb} KB</td>
      <td>${mod}</td>
      <td><button class="btn btn-primary btn-small" onclick="importSourceFile('${type}','${escapeHtml(file.name)}')">Importieren</button></td>
    </tr>`;
  }
  html += "</tbody></table>";
  container.innerHTML = html;
}

// --- iCloud ---

const _icloudEnabled = document.getElementById("icloudEnabled");
const icloudContent = document.getElementById("icloudContent");
const icloudStatus = document.getElementById("icloudStatus");
const icloudFilesList = document.getElementById("icloudFilesList");

async function loadIcloudState() {
  try {
    const response = await fetch(`${API_BASE}/api/sources/icloud/auth-state`);
    const result = await response.json();
    if (!result.success) return;
    const d = result.data;
    renderIcloudUI(d.authState, d.appleId);
  } catch {
    renderIcloudUI("not_configured", "");
  }
}

function renderIcloudUI(authState, appleId) {
  let html = "";
  switch (authState) {
    case "python_missing":
      html = `<div class="source-hint">
        Python 3 + pyicloud nicht gefunden. iCloud-Zugriff erfordert Python 3 und das pyicloud-Paket.<br>
        Installation: <code>pip3 install pyicloud</code><br>
        <button class="btn btn-secondary btn-small" onclick="loadIcloudState()" style="margin-top:8px">Erneut pruefen</button>
      </div>`;
      break;
    case "2fa_required":
      html = `<div class="source-form">
        <p>Bestaetigungscode wurde an Ihre Apple-Geraete gesendet.</p>
        <label>2FA-Code: <input type="text" id="icloud2faCode" maxlength="6" placeholder="123456" /></label>
        <button class="btn btn-primary btn-small" onclick="verifyIcloud2fa()">Bestaetigen</button>
      </div>`;
      break;
    case "authenticated":
      html = `<div>
        <p>Apple-ID: ${escapeHtml(appleId || "")}<br>Session: Gueltig</p>
        <div class="source-actions" style="margin-top:8px">
          <button class="btn btn-secondary btn-small" onclick="scanIcloud()">Jetzt pruefen</button>
          <button class="btn btn-danger btn-small" onclick="logoutIcloud()">Abmelden</button>
        </div>
      </div>`;
      break;
    case "reauth_required":
      html = `<div class="source-hint">
        Session abgelaufen. Erneute Anmeldung erforderlich.
        <button class="btn btn-primary btn-small" style="margin-top:8px" onclick="renderIcloudUI('login_required','')">Erneut anmelden</button>
      </div>`;
      break;
    default: // not_configured, login_required, unknown
      html = `<div class="source-form">
        <label>Apple-ID: <input type="email" id="icloudAppleId" placeholder="user@icloud.com" value="${escapeHtml(appleId || "")}" /></label>
        <label>Passwort: <input type="password" id="icloudPassword" /></label>
        <label>iCloud-Pfad: <input type="text" id="icloudPath" placeholder="/Heizung" /></label>
      </div>
      <p class="source-hint">Verwenden Sie Ihr Apple-ID-Passwort oder ein app-spezifisches Passwort. Zugangsdaten werden kodiert gespeichert.</p>
      <div class="source-actions">
        <button class="btn btn-primary btn-small" onclick="loginIcloud()">Anmelden</button>
      </div>`;
      break;
  }
  icloudContent.innerHTML = html;
}

window.loginIcloud = async function () {
  const appleId = document.getElementById("icloudAppleId")?.value?.trim();
  const password = document.getElementById("icloudPassword")?.value;
  if (!appleId || !password) return alert("Apple-ID und Passwort erforderlich.");
  icloudStatus.textContent = "Anmeldung...";
  icloudStatus.className = "source-status info";
  try {
    const r = await fetch(`${API_BASE}/api/sources/icloud/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appleId, password }),
    });
    const result = await r.json();
    if (result.data?.status === "2fa_required") {
      renderIcloudUI("2fa_required", appleId);
      icloudStatus.textContent = "Bestaetigungscode gesendet.";
      icloudStatus.className = "source-status info";
    } else if (result.data?.status === "ok") {
      loadIcloudState();
      icloudStatus.textContent = "Erfolgreich angemeldet.";
      icloudStatus.className = "source-status connected";
    } else {
      icloudStatus.textContent = result.data?.message || result.error || "Fehler";
      icloudStatus.className = "source-status disconnected";
    }
  } catch (e) {
    icloudStatus.textContent = e.message;
    icloudStatus.className = "source-status disconnected";
  }
};

window.verifyIcloud2fa = async function () {
  const code = document.getElementById("icloud2faCode")?.value?.trim();
  if (!code) return;
  try {
    const r = await fetch(`${API_BASE}/api/sources/icloud/verify-2fa`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const result = await r.json();
    if (result.success) {
      loadIcloudState();
      icloudStatus.textContent = "Erfolgreich angemeldet.";
      icloudStatus.className = "source-status connected";
    } else {
      icloudStatus.textContent = result.data?.message || "Ungueltiger Code.";
      icloudStatus.className = "source-status disconnected";
    }
  } catch (e) {
    icloudStatus.textContent = e.message;
    icloudStatus.className = "source-status disconnected";
  }
};

window.scanIcloud = async function () {
  try {
    const r = await fetch(`${API_BASE}/api/sources/icloud/scan`, { method: "POST" });
    const result = await r.json();
    if (result.success) {
      renderSourceFiles(icloudFilesList, "icloud", result.data.files);
      icloudStatus.textContent = `${result.data.files.length} Datei(en) gefunden.`;
      icloudStatus.className = "source-status connected";
    } else {
      icloudStatus.textContent = result.error;
      icloudStatus.className = "source-status disconnected";
    }
  } catch (e) {
    icloudStatus.textContent = e.message;
    icloudStatus.className = "source-status disconnected";
  }
};

window.logoutIcloud = async function () {
  if (!confirm("iCloud-Session wirklich loeschen?")) return;
  await fetch(`${API_BASE}/api/sources/icloud/logout`, { method: "POST" });
  loadIcloudState();
  icloudStatus.textContent = "Abgemeldet.";
  icloudStatus.className = "source-status info";
};

// --- Push-Endpunkt ---

const pushEnabled = document.getElementById("pushEnabled");
const pushContent = document.getElementById("pushContent");

async function loadPushConfig() {
  try {
    const r = await fetch(`${API_BASE}/api/push/config`);
    const result = await r.json();
    if (!result.success) return;
    const d = result.data;
    pushEnabled.checked = d.enabled;
    const host = window.location.host || "[CCU-IP]:8080";
    let html = "";
    if (d.enabled && d.apiKey) {
      html = `<div>
        <div class="source-form">
          <label>API-Key: <input type="text" id="pushApiKey" value="${escapeHtml(d.apiKey)}" readonly style="font-family:monospace;font-size:0.85em" /></label>
          <button class="btn btn-small" onclick="navigator.clipboard.writeText(document.getElementById('pushApiKey').value)">Kopieren</button>
          <button class="btn btn-danger btn-small" onclick="regeneratePushKey()">Neuen Key</button>
        </div>
        <p class="source-hint">
          Endpunkt: <code>POST http://${escapeHtml(host)}/api/push/upload</code><br>
          Header: <code>Authorization: Bearer &lt;API-Key&gt;</code>
        </p>
        ${d.lastUpload ? `<p class="source-hint">Letzter Upload: ${formatDateTime(new Date(d.lastUpload))} (${escapeHtml(d.lastUploadFile || "")})</p>` : ""}
      </div>`;
    } else {
      html = `<p class="source-hint">Push-Endpunkt ist deaktiviert. Aktivieren um einen API-Key zu generieren.</p>`;
    }
    pushContent.innerHTML = html;
  } catch {
    // nicht verfuegbar
  }
}

pushEnabled.addEventListener("change", async () => {
  try {
    await fetch(`${API_BASE}/api/push/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: pushEnabled.checked }),
    });
    loadPushConfig();
  } catch {
    // ignore
  }
});

window.regeneratePushKey = async function () {
  if (!confirm("Bisheriger Key wird ungueltig. Fortfahren?")) return;
  await fetch(`${API_BASE}/api/push/regenerate-key`, { method: "POST" });
  loadPushConfig();
};

// --- Polling ---

const pollingEnabled = document.getElementById("pollingEnabled");
const pollingInterval = document.getElementById("pollingInterval");
const pollingNextPoll = document.getElementById("pollingNextPoll");
const pollAllBtn = document.getElementById("pollAllBtn");
const pollingLog = document.getElementById("pollingLog");
const toggleLogBtn = document.getElementById("toggleLogBtn");
const pollingLogEntries = document.getElementById("pollingLogEntries");

async function loadPollingStatus() {
  try {
    const response = await fetch(`${API_BASE}/api/polling/status`);
    const result = await response.json();
    if (result.success) {
      const d = result.data;
      pollingEnabled.checked = d.enabled;
      pollingInterval.value = String(d.intervalMinutes);
      if (d.nextPoll) {
        pollingNextPoll.textContent = `Naechste Pruefung: ${formatDateTime(new Date(d.nextPoll))}`;
      } else {
        pollingNextPoll.textContent = d.enabled
          ? "Warte auf Start..."
          : "";
      }
    }
  } catch {
    // Polling nicht verfuegbar
  }
}

pollingEnabled.addEventListener("change", async () => {
  try {
    await fetch(`${API_BASE}/api/polling/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: pollingEnabled.checked }),
    });
    loadPollingStatus();
  } catch {
    // ignore
  }
});

pollingInterval.addEventListener("change", async () => {
  try {
    await fetch(`${API_BASE}/api/polling/config`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        intervalMinutes: parseInt(pollingInterval.value),
      }),
    });
    loadPollingStatus();
  } catch {
    // ignore
  }
});

pollAllBtn.addEventListener("click", async () => {
  pollAllBtn.disabled = true;
  pollAllBtn.textContent = "Pruefe...";
  try {
    const response = await fetch(`${API_BASE}/api/polling/trigger`, {
      method: "POST",
    });
    const result = await response.json();
    if (result.success) {
      loadPollingStatus();
      loadSources();
      loadPollingLog();
    }
  } catch {
    // ignore
  } finally {
    pollAllBtn.disabled = false;
    pollAllBtn.textContent = "Alle Quellen pruefen";
  }
});

let logVisible = false;
toggleLogBtn.addEventListener("click", () => {
  logVisible = !logVisible;
  pollingLogEntries.style.display = logVisible ? "block" : "none";
  toggleLogBtn.textContent = logVisible ? "Ausblenden" : "Anzeigen";
  if (logVisible) loadPollingLog();
});

async function loadPollingLog() {
  try {
    const response = await fetch(`${API_BASE}/api/polling/log`);
    const result = await response.json();
    if (result.success && result.data.length > 0) {
      pollingLog.style.display = "block";
      pollingLogEntries.innerHTML = result.data
        .map((entry) => {
          const time = formatDateTime(new Date(entry.timestamp));
          return `<div class="polling-log-entry ${entry.type}">
            <span class="log-time">${time}</span>
            <span class="log-source">${escapeHtml(entry.source || "")}</span>
            <span>${escapeHtml(entry.message)}</span>
          </div>`;
        })
        .join("");
    } else {
      pollingLog.style.display = "block";
      pollingLogEntries.innerHTML =
        '<div class="empty-state">Noch keine Eintraege</div>';
    }
  } catch {
    // ignore
  }
}

// Initialisierung
loadSources();
loadIcloudState();
loadPushConfig();
loadPollingStatus();
loadAreas();
loadSchedules();
setInterval(() => {
  loadSchedules();
}, 30000); // Aktualisiere alle 30 Sekunden
