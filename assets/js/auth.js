const SESSION_KEY = "paradigmSession";
const SPECIAL_LANDING_MAP = [
  {
    role: "user",
    userId: "vestazen",
    adminId: "lvss",
    target: "/user-vestazen"
  }
];

function normalizeIdentifier(value) {
  return String(value || "").trim().toLowerCase();
}

function resolveLandingRoute(role, userId, userRecord) {
  if (!role || role !== "user" || !userRecord) {
    return "";
  }

  const normalizedUserId = normalizeIdentifier(userId);
  const normalizedAdminId = normalizeIdentifier(
    userRecord.AdminID || userRecord.adminId || userRecord.AdminId
  );

  const match = SPECIAL_LANDING_MAP.find(
    (entry) => entry.role === role && entry.userId === normalizedUserId && entry.adminId === normalizedAdminId
  );

  return match ? match.target : "";
}

async function handleLogin(form, endpoint, idFieldName) {
  const submitButton = form.querySelector("button[type='submit']");
  const statusNode = form.querySelector("[data-auth-status]");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const formData = new FormData(form);
    const payload = {
      [idFieldName]: String(formData.get(idFieldName) || "").trim(),
      password: String(formData.get("password") || "")
    };

    submitButton.disabled = true;
    statusNode.textContent = "Checking credentials...";

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || "Login failed.");
      }

      window.sessionStorage.setItem(
        SESSION_KEY,
        JSON.stringify({
          role: result.role,
          token: result.token,
          userId: payload[idFieldName],
          user: result.user
        })
      );

      statusNode.textContent = `Login successful for ${result.role}. Redirecting...`;
      const landingRoute = resolveLandingRoute(result.role, payload[idFieldName], result.user);
      const destination = landingRoute || (result.role === "admin" ? "/admin-dashboard" : "/user-dashboard");
      window.location.assign(destination);
    } catch (error) {
      statusNode.textContent = error.message;
    } finally {
      submitButton.disabled = false;
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("is-ready");
  const adminForm = document.querySelector("[data-auth-form='admin']");
  const userForm = document.querySelector("[data-auth-form='user']");

  if (adminForm) {
    handleLogin(adminForm, "/api/auth/admin-login", "adminId");
  }

  if (userForm) {
    handleLogin(userForm, "/api/auth/user-login", "userId");
  }
});
