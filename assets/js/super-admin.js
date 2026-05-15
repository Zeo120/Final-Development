const SUPER_ADMIN_TOKEN_KEY = "paradigmSuperAdminToken";

function getSuperAdminToken() {
  return window.sessionStorage.getItem(SUPER_ADMIN_TOKEN_KEY) || "";
}

function setSuperAdminToken(token) {
  window.sessionStorage.setItem(SUPER_ADMIN_TOKEN_KEY, token);
}

function clearSuperAdminToken() {
  window.sessionStorage.removeItem(SUPER_ADMIN_TOKEN_KEY);
}

function isSuperAdminDashboard() {
  return window.location.pathname.includes("super-admin-dashboard");
}

async function apiRequest(url, options = {}) {
  const token = getSuperAdminToken();
  const headers = {
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });
  const result = await response.json();

  if (!response.ok) {
    const error = new Error(result.message || "Request failed.");
    error.status = response.status;
    throw error;
  }

  return result;
}

function bindSuperAdminLogin() {
  const form = document.querySelector("[data-super-admin-login-form]");

  if (!form) {
    return;
  }

  const statusNode = form.querySelector("[data-super-admin-login-status]");
  const submitButton = form.querySelector("button[type='submit']");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = {
      superAdminId: String(formData.get("superAdminId") || "").trim(),
      superAdminPassword: String(formData.get("superAdminPassword") || "")
    };

    if (!payload.superAdminId || !payload.superAdminPassword) {
      statusNode.textContent = "Super admin ID and password are required.";
      return;
    }

    submitButton.disabled = true;
    statusNode.textContent = "Verifying privileged access...";

    try {
      const result = await apiRequest("/api/auth/super-admin-login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      setSuperAdminToken(result.token);
      window.location.assign("/super-admin-dashboard");
    } catch (error) {
      statusNode.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
}

function renderAdminList(admins) {
  const tbody = document.querySelector("[data-admin-list]");

  if (!tbody) {
    return;
  }

  if (!admins.length) {
    tbody.innerHTML = "<tr><td colspan=\"2\">No admins found.</td></tr>";
    return;
  }

  tbody.innerHTML = admins
    .map((admin) => {
      const createdAt = admin.createdAt ? new Date(admin.createdAt).toLocaleString() : "-";
      return `<tr><td>${admin.adminId}</td><td>${createdAt}</td></tr>`;
    })
    .join("");
}

async function loadAdmins() {
  const statusNode = document.querySelector("[data-admin-list-status]");

  if (statusNode) {
    statusNode.textContent = "Loading admin list...";
  }

  try {
    const result = await apiRequest("/api/admins");
    renderAdminList(result.admins || []);

    if (statusNode) {
      statusNode.textContent = "Admin list loaded.";
    }
  } catch (error) {
    if (error.status === 401) {
      clearSuperAdminToken();
      window.location.replace("/super-admin-login");
      return;
    }

    if (statusNode) {
      statusNode.textContent = error.message;
    }
  }
}

function bindCreateAdmin() {
  const form = document.querySelector("[data-super-admin-create-form]");

  if (!form) {
    return;
  }

  const statusNode = form.querySelector("[data-super-admin-create-status]");
  const submitButton = form.querySelector("button[type='submit']");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = {
      adminId: String(formData.get("adminId") || "").trim(),
      password: String(formData.get("password") || "")
    };

    if (!payload.adminId || !payload.password) {
      statusNode.textContent = "Admin ID and password are required.";
      return;
    }

    submitButton.disabled = true;
    statusNode.textContent = "Creating admin...";

    try {
      await apiRequest("/api/admins", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });
      form.reset();
      statusNode.textContent = `Admin ${payload.adminId} created successfully.`;
      await loadAdmins();
    } catch (error) {
      if (error.status === 401) {
        clearSuperAdminToken();
        window.location.replace("/super-admin-login");
        return;
      }

      statusNode.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
}

function bindUpdateAdmin() {
  const form = document.querySelector("[data-super-admin-update-form]");

  if (!form) {
    return;
  }

  const statusNode = form.querySelector("[data-super-admin-update-status]");
  const submitButton = form.querySelector("button[type='submit']");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const adminId = String(formData.get("adminId") || "").trim();
    const password = String(formData.get("password") || "");

    if (!adminId || !password) {
      statusNode.textContent = "Admin ID and new password are required.";
      return;
    }

    submitButton.disabled = true;
    statusNode.textContent = "Updating admin...";

    try {
      await apiRequest(`/api/admins/${encodeURIComponent(adminId)}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ password })
      });
      form.reset();
      statusNode.textContent = `Admin ${adminId} updated successfully.`;
      await loadAdmins();
    } catch (error) {
      if (error.status === 401) {
        clearSuperAdminToken();
        window.location.replace("/super-admin-login");
        return;
      }

      statusNode.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
}

function bindSuperAdminDashboard() {
  if (!isSuperAdminDashboard()) {
    return;
  }

  if (!getSuperAdminToken()) {
    window.location.replace("/super-admin-login");
    return;
  }

  bindCreateAdmin();
  bindUpdateAdmin();
  loadAdmins();

  const refreshButton = document.querySelector("[data-refresh-admins]");

  if (refreshButton) {
    refreshButton.addEventListener("click", () => {
      loadAdmins();
    });
  }

  const logoutButton = document.querySelector("[data-super-admin-logout]");

  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      clearSuperAdminToken();
      window.location.replace("/super-admin-login");
    });
  }
}

document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("is-ready");
  bindSuperAdminLogin();
  bindSuperAdminDashboard();
});
