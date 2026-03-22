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
            <td>${row.temperature}°C</td>
            <td>${row.profile || "-"}</td>
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

// Initialisierung
loadAreas();
loadSchedules();
setInterval(() => {
  loadSchedules();
}, 30000); // Aktualisiere alle 30 Sekunden
