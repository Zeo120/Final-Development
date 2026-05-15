const SESSION_KEY = "paradigmSession";
const FINANCIAL_MONTHS = [
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" }
];
const complianceFormState = {
  currentClientId: "",
  fiscalYears: [],
  monthsByYear: {}
};

function populateMonthOptions(selectId) {
  const select = document.getElementById(selectId);
  if (!select) return;
  select.innerHTML = `<option value="">Select a month</option>${FINANCIAL_MONTHS.map((month) => `
    <option value="${month.value}" data-label="${month.label}">${month.label}</option>
  `).join("")}`;
}

function getCurrentPageRole() {
  const path = window.location.pathname;
  if (path.includes("admin-dashboard")) return "admin";
  if (path.includes("user-dashboard")) return "user";
  return "";
}

function loadSession() {
  try {
    return JSON.parse(window.sessionStorage.getItem(SESSION_KEY) || "null");
  } catch (_error) {
    return null;
  }
}

function clearSessionAndRedirect() {
  window.sessionStorage.removeItem(SESSION_KEY);
  window.location.replace("/");
}

async function apiRequest(url, options = {}) {
  const session = loadSession();
  const headers = {
    ...(options.headers || {}),
    ...(session && session.token ? { Authorization: `Bearer ${session.token}` } : {})
  };

  const response = await fetch(url, {
    ...options,
    headers
  });

  const result = await response.json().catch(() => ({}));

  if (response.status === 401) {
    clearSessionAndRedirect();
    throw new Error("Your session has expired.");
  }

  if (!response.ok) {
    throw new Error(result.message || "Request failed.");
  }

  return result;
}

async function fetchDashboardData(session) {
  try {
    const pagesResult = await apiRequest("/api/pages");

    if (!pagesResult.success || !Array.isArray(pagesResult.pages) || pagesResult.pages.length === 0) {
      console.warn("No pages found for user.");
    } else {
      renderPageTabs(pagesResult.pages, session);

      const storedPageId = window.sessionStorage.getItem("activePageId");
      const activePage = pagesResult.pages.find((page) => String(page.PageID) === storedPageId)
        || pagesResult.pages.find((page) => page.IsDefault)
        || pagesResult.pages[0];

      if (activePage) {
        await loadPage(activePage, session);
      }
    }

    const summary = await apiRequest("/api/data/summary");
    if (summary.success) updateMetrics(summary.data);
  } catch (error) {
    console.error("Dashboard synchronization error:", error);
  }
}

function renderPageTabs(pages, session) {
  const container = document.getElementById("page-tabs-container");
  if (!container) return;

  const storedPageId = window.sessionStorage.getItem("activePageId");
  const userId = session?.userId || "";
  const role = session?.role || "";

  container.innerHTML = "";
  if (!Array.isArray(pages) || pages.length === 0) {
    return;
  }

  const fragment = document.createDocumentFragment();

  pages.forEach((page) => {
    const button = document.createElement("button");
    const pageId = String(page.PageID);
    const isActive = storedPageId === pageId || (!storedPageId && page.IsDefault);
    button.type = "button";
    button.className = `btn ${isActive ? "btn-primary" : "btn-secondary"}`;
    button.textContent = page.Title || `Page ${page.PageID}`;
    button.style.padding = "0.5rem 1rem";
    button.style.fontSize = "0.8rem";
    button.style.borderRadius = "8px";
    button.addEventListener("click", () => switchPage(page.PageID, userId, role));
    fragment.appendChild(button);
  });

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "btn btn-secondary";
  addButton.style.padding = "0.5rem 1rem";
  addButton.style.fontSize = "0.8rem";
  addButton.style.borderRadius = "8px";
  addButton.textContent = "+";
  addButton.addEventListener("click", () => {
    const modal = document.getElementById("modal-create-page");
    if (modal) {
      modal.style.display = "flex";
    }
  });
  fragment.appendChild(addButton);

  container.appendChild(fragment);
}

async function switchPage(pageId, userId, role) {
  window.sessionStorage.setItem("activePageId", String(pageId));
  await fetchDashboardData({ userId, role });
}

async function loadPage(page, session) {
  if (!page) return;

  const titleNode = document.getElementById("dashboard-title-dynamic");
  if (titleNode) {
    titleNode.textContent = page.Title;
  }

  const widgetsResult = await apiRequest(`/api/pages/${page.PageID}/widgets`);

  if (widgetsResult.success) {
    renderWidgets(widgetsResult.widgets || [], session, page.PageID);
  }
}

async function renderWidgets(widgets, session, pageId) {
  const container = document.getElementById("dashboard-widgets-container");
  if (!container) return;
  container.innerHTML = "";

  if (!Array.isArray(widgets) || widgets.length === 0) {
    if (session?.role === "admin") {
      const placeholder = document.createElement("article");
      placeholder.className = "glass-card widget-item";
      placeholder.style.margin = "0";
      placeholder.innerHTML = "<p style='opacity:0.5;'>No widgets configured yet.</p>";
      container.appendChild(placeholder);
    }
  }

  const fragment = document.createDocumentFragment();

  widgets.forEach((widget) => {
    const section = document.createElement("article");
    section.className = "glass-card widget-item";
    section.style.position = "relative";

    const header = document.createElement("div");
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";
    header.style.marginBottom = "1.5rem";

    const title = document.createElement("h3");
    title.textContent = widget.Title || widget.Type;
    header.appendChild(title);

    const headerMeta = document.createElement("div");
    headerMeta.style.display = "flex";
    headerMeta.style.gap = "0.5rem";
    headerMeta.style.alignItems = "center";

    const typeBadge = document.createElement("span");
    typeBadge.style.fontSize = "0.6rem";
    typeBadge.style.color = "var(--text-muted)";
    typeBadge.style.textTransform = "uppercase";
    typeBadge.textContent = widget.Type;
    headerMeta.appendChild(typeBadge);

    if (session?.role === "admin") {
      const removeButton = document.createElement("button");
      removeButton.type = "button";
      removeButton.innerHTML = "&times;";
      removeButton.style.background = "none";
      removeButton.style.border = "none";
      removeButton.style.color = "var(--text-muted)";
      removeButton.style.cursor = "pointer";
      removeButton.style.fontSize = "0.8rem";
      removeButton.addEventListener("click", () => removeWidget(widget.WidgetID, pageId, session.userId, session.role));
      headerMeta.appendChild(removeButton);
    }

    header.appendChild(headerMeta);
    section.appendChild(header);

    const body = document.createElement("div");
    body.id = `widget-body-${widget.WidgetID}`;
    body.className = "widget-content";
    body.textContent = "Loading...";
    section.appendChild(body);

    fragment.appendChild(section);
  });

  if (session?.role === "admin") {
    const addWidgetCard = document.createElement("article");
    addWidgetCard.className = "glass-card widget-item";
    addWidgetCard.style.display = "flex";
    addWidgetCard.style.alignItems = "center";
    addWidgetCard.style.justifyContent = "center";
    addWidgetCard.style.borderStyle = "dashed";
    addWidgetCard.style.opacity = "0.5";
    addWidgetCard.style.cursor = "pointer";
    addWidgetCard.addEventListener("click", () => {
      const pageInput = document.getElementById("input-widget-page-id");
      if (pageInput) {
        pageInput.value = pageId;
      }
      const modal = document.getElementById("modal-add-widget");
      if (modal) {
        modal.style.display = "flex";
      }
    });
    const placeholder = document.createElement("span");
    placeholder.textContent = "+ Add Widget";
    addWidgetCard.appendChild(placeholder);
    fragment.appendChild(addWidgetCard);
  }

  container.appendChild(fragment);

  for (const widget of widgets) {
    await loadWidgetData(widget, session);
  }
}

async function addPage(event) {
  event.preventDefault();
  const form = event.target;
  const session = loadSession();
  const title = String(form.title.value || "").trim();
  const payload = {
    title,
    slug: title.toLowerCase().replace(/\s+/g, "-"),
    isDefault: false
  };

  try {
    await apiRequest("/api/pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    form.reset();
    form.closest(".auth-shell").style.display = "none";
    await fetchDashboardData(session);
  } catch (err) {
    console.error(err);
  }
}

async function createWidget(event) {
  event.preventDefault();
  const form = event.target;
  const session = loadSession();
  const pageId = form.pageId.value;
  const payload = {
    type: form.type.value,
    title: form.title.value,
    position: 0
  };

  try {
    await apiRequest(`/api/pages/${pageId}/widgets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    form.reset();
    form.closest(".auth-shell").style.display = "none";
    await fetchDashboardData(session);
  } catch (err) {
    console.error(err);
  }
}

async function removeWidget(widgetId, pageId, userId, role) {
  if (!window.confirm("Remove this widget?")) return;

  try {
    await apiRequest(`/api/widgets/${widgetId}`, {
      method: "DELETE"
    });
    await fetchDashboardData({ userId, role });
  } catch (err) {
    console.error(err);
  }
}

async function loadWidgetData(widget, session) {
  const body = document.getElementById(`widget-body-${widget.WidgetID}`);
  if (!body) return;

  try {
    if (widget.Type === "project-summary") {
      const data = await apiRequest("/api/data/projects");
      if (data.success) renderProjectsIntoWidget(body, data.data || []);
    } else if (widget.Type === "task-list") {
      const data = await apiRequest("/api/data/tasks");
      if (data.success) renderTasksIntoWidget(body, data.data || [], session.role);
    } else {
      body.innerHTML = "<span class=\"auth-status\">Unsupported widget type.</span>";
    }
  } catch (_err) {
    body.innerHTML = "<span class=\"auth-status\">Failed to load data.</span>";
  }
}

function renderProjectsIntoWidget(container, data) {
  if (data.length === 0) {
    container.innerHTML = "<p style=\"opacity:0.5;\">No active projects.</p>";
    return;
  }

  container.innerHTML = `
    <table class="admin-list-table">
      <thead><tr><th>Title</th><th>Budget</th><th>Status</th></tr></thead>
      <tbody>
        ${data.map((project) => `
          <tr>
            <td><strong>${project.Title}</strong></td>
            <td>Rs ${Number(project.Budget || 0).toLocaleString()}</td>
            <td><span class="glass" style="padding: 2px 6px; font-size: 0.7rem; border: 1px solid var(--accent);">${project.Status}</span></td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderTasksIntoWidget(container, data, role) {
  if (data.length === 0) {
    container.innerHTML = "<p style=\"opacity:0.5;\">No pending tasks.</p>";
    return;
  }

  container.innerHTML = `
    <ul style="list-style: none; display: grid; gap: 0.75rem;">
      ${data.map((task) => `
        <li style="display: flex; gap: 0.75rem; align-items: center; padding: 0.75rem; background: rgba(255,255,255,0.02); border-radius: 8px;">
          <div style="width: 8px; height: 8px; border-radius: 50%; background: var(--accent); opacity: ${task.Priority === "High" ? 1 : 0.3};"></div>
          <span style="flex: 1; font-size: 0.9rem;">${task.Description}</span>
          ${role === "user" ? `<input type="checkbox" ${task.IsCompleted ? "checked" : ""} onchange="toggleTask(${task.TaskID}, this.checked)">` : ""}
        </li>
      `).join("")}
    </ul>
  `;
}

function updateMetrics(data) {
  document.querySelectorAll(".metric strong").forEach((node) => {
    const span = node.previousElementSibling;
    if (!span) return;

    const label = span.textContent.toUpperCase();
    if (label.includes("PROJECTS") || label.includes("TAX")) {
      node.textContent = `${data.totalProjects || 0} Registered`;
    } else if (label.includes("TASKS") || label.includes("COMPLIANCE")) {
      const value = label.includes("COMPLIANCE") ? data.activeCompliance : data.pendingTasks;
      node.textContent = `${value || 0} Pending`;
    }
  });

  const completionBar = document.querySelector(".glass-card div div[style*='width']");
  if (completionBar) {
    const totalProjects = Number(data.totalProjects || 0);
    const pendingTasks = Number(data.pendingTasks || 0);
    const percent = totalProjects > 0
      ? Math.max(0, Math.min(100, Math.round(((totalProjects - pendingTasks) / totalProjects) * 100)))
      : 100;
    completionBar.style.width = `${percent}%`;
    const percentText = completionBar.parentElement.nextElementSibling;
    if (percentText) percentText.textContent = `OVERALL COMPLETION: ${percent}%`;
  }
}

async function toggleTask(taskId, isCompleted) {
  try {
    await apiRequest(`/api/data/tasks/${taskId}/toggle`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isCompleted })
    });
  } catch (err) {
    console.error(err);
  }
}

function updateComplianceFiscalYearSelects(years) {
  const html = `<option value=\"\">Select a fiscal year</option>${(years || []).map((year) => `
    <option value="${year.FiscalYearID}">${year.Title}</option>
  `).join("")}`;

  ["select-compliance-month-fiscal-year", "select-compliance-invoice-fiscal-year"].forEach((id) => {
    const select = document.getElementById(id);
    if (!select) return;
    const previousValue = select.value;
    select.innerHTML = html;
    if (previousValue) {
      const exists = Array.from(select.options).some((option) => option.value === previousValue);
      if (exists) {
        select.value = previousValue;
      }
    }
  });
}

function updateComplianceInvoiceMonthSelect(yearId) {
  const select = document.getElementById("select-compliance-invoice-month");
  if (!select) return;
  const months = complianceFormState.monthsByYear[yearId] || [];
  if (!months.length) {
    select.innerHTML = "<option value=\"\">No months available</option>";
    return;
  }
  select.innerHTML = `<option value=\"\">Select a month</option>${months.map((month) => `
    <option value="${month.MonthID}">${month.MonthName} (${month.Status})</option>
  `).join("")}`;
}

function clearComplianceInvoiceMonthSelect() {
  const select = document.getElementById("select-compliance-invoice-month");
  if (!select) return;
  select.innerHTML = "<option value=\"\">Select a fiscal year first</option>";
}

async function refreshComplianceMonthsForYear(fiscalYearId) {
  if (!fiscalYearId) {
    clearComplianceInvoiceMonthSelect();
    return;
  }

  try {
    const response = await apiRequest(`/api/compliance/fiscal-years/${encodeURIComponent(fiscalYearId)}`);
    if (response.success) {
      complianceFormState.monthsByYear[fiscalYearId] = Array.isArray(response.months) ? response.months : [];
      updateComplianceInvoiceMonthSelect(fiscalYearId);
    }
  } catch (err) {
    console.error("Failed to load fiscal months", err);
  }
}

async function loadComplianceDataForClient(userId, { forceRefresh = false } = {}) {
  if (!userId) return;
  if (!forceRefresh && complianceFormState.currentClientId === userId && complianceFormState.fiscalYears.length) {
    return;
  }

  try {
    const response = await apiRequest(`/api/compliance/fiscal-years?userId=${encodeURIComponent(userId)}`);
    if (!response.success) return;

    complianceFormState.currentClientId = userId;
    complianceFormState.fiscalYears = Array.isArray(response.data) ? response.data : [];
    updateComplianceFiscalYearSelects(complianceFormState.fiscalYears);

    const firstYear = complianceFormState.fiscalYears[0];
    if (firstYear) {
      await refreshComplianceMonthsForYear(firstYear.FiscalYearID);
    } else {
      clearComplianceInvoiceMonthSelect();
    }
  } catch (err) {
    console.error("Failed to refresh compliance fiscal years", err);
  }
}

  function bindComplianceManagement(session) {
    const yearForm = document.getElementById("form-compliance-year");
    const monthForm = document.getElementById("form-compliance-month");
    const invoiceForm = document.getElementById("form-compliance-invoice");
    populateMonthOptions("select-compliance-month-name");

  if (yearForm) {
    const statusNode = yearForm.querySelector("[data-compliance-year-status]");
    yearForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(yearForm);
      const payload = {
        userId: String(formData.get("userId") || "").trim(),
        title: String(formData.get("title") || "").trim(),
        startDate: formData.get("startDate"),
        endDate: formData.get("endDate")
      };

      if (!payload.userId) {
        if (statusNode) statusNode.textContent = "Select a client before creating a fiscal year.";
        return;
      }

      if (statusNode) statusNode.textContent = "Creating fiscal year…";
      try {
        await apiRequest("/api/compliance/fiscal-years", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (statusNode) statusNode.textContent = "Fiscal year created.";
        yearForm.reset();
        await loadComplianceDataForClient(payload.userId, { forceRefresh: true });
      } catch (err) {
        if (statusNode) statusNode.textContent = err.message;
      }
    });
  }

  if (monthForm) {
    const statusNode = monthForm.querySelector("[data-compliance-month-status]");
    monthForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(monthForm);
      const clientId = String(formData.get("userId") || "").trim();
      const fiscalYearId = Number(formData.get("fiscalYearId"));
      const monthSelect = document.getElementById("select-compliance-month-name");
      const selectedOption = monthSelect && monthSelect.options[monthSelect.selectedIndex];
      const payload = {
        userId: clientId,
        fiscalYearId,
        monthName: selectedOption?.dataset?.label || selectedOption?.text || selectedOption?.value,
        monthIndex: Number(monthSelect?.value || 0),
        status: String(formData.get("status") || "").trim() || "Not Filed",
        totalItc: Number(formData.get("totalItc") || 0)
      };

      if (!payload.userId || !payload.fiscalYearId) {
        if (statusNode) statusNode.textContent = "Select a client and fiscal year.";
        return;
      }

      if (statusNode) statusNode.textContent = "Saving month…";
      try {
        await apiRequest("/api/compliance/months", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (statusNode) statusNode.textContent = "Month saved.";
        await refreshComplianceMonthsForYear(payload.fiscalYearId);
      } catch (err) {
        if (statusNode) statusNode.textContent = err.message;
      }
    });

    const clientSelect = document.getElementById("select-users-compliance-month");
    if (clientSelect) {
      clientSelect.addEventListener("change", () => {
        if (clientSelect.value) {
          loadComplianceDataForClient(clientSelect.value, { forceRefresh: true });
        }
      });
    }
  }

  if (invoiceForm) {
    const statusNode = invoiceForm.querySelector("[data-compliance-invoice-status]");
    invoiceForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(invoiceForm);
      const clientId = String(formData.get("userId") || "").trim();
      const fiscalYearId = Number(formData.get("fiscalYearId"));
      const fiscalMonthId = Number(formData.get("fiscalMonthId"));
      const payload = {
        userId: clientId,
        fiscalYearId,
        fiscalMonthId,
        invoiceNumber: String(formData.get("invoiceNumber") || "").trim(),
        invoiceValue: Number(formData.get("invoiceValue") || 0),
        taxableValue: Number(formData.get("taxableValue") || 0),
        cgst: Number(formData.get("cgst") || 0),
        sgst: Number(formData.get("sgst") || 0),
        igst: Number(formData.get("igst") || 0)
      };

      if (!payload.userId || !payload.fiscalMonthId) {
        if (statusNode) statusNode.textContent = "Select a client and month before adding invoices.";
        return;
      }

      if (statusNode) statusNode.textContent = "Adding invoice…";
      try {
        await apiRequest("/api/compliance/invoices", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        if (statusNode) statusNode.textContent = "Invoice recorded.";
        invoiceForm.reset();
        await refreshComplianceMonthsForYear(payload.fiscalYearId);
      } catch (err) {
        if (statusNode) statusNode.textContent = err.message;
      }
    });

    const clientSelect = document.getElementById("select-users-compliance-invoice");
    if (clientSelect) {
      clientSelect.addEventListener("change", () => {
        if (clientSelect.value) {
          loadComplianceDataForClient(clientSelect.value, { forceRefresh: true });
        }
      });
    }

    const invoiceYearSelect = document.getElementById("select-compliance-invoice-fiscal-year");
    if (invoiceYearSelect) {
      invoiceYearSelect.addEventListener("change", () => {
        const yearId = Number(invoiceYearSelect.value);
        if (yearId) {
          refreshComplianceMonthsForYear(yearId);
        } else {
          clearComplianceInvoiceMonthSelect();
        }
      });
    }
  }
}

async function populateUserDropdowns() {
  try {
    const result = await apiRequest("/api/users");
    if (result.success) {
      const options = result.users.map((user) => `<option value="${user.userId}">${user.userId}</option>`).join("");
      ["select-users-project", "select-users-task", "select-users-manage", "select-users-compliance-year", "select-users-compliance-month", "select-users-compliance-invoice"].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<option value="">Select a Client</option>${options}`;
      });
      const complianceSelect = document.getElementById("select-users-compliance-month");
      if (complianceSelect && complianceSelect.value) {
        loadComplianceDataForClient(complianceSelect.value);
      }
    }
  } catch (err) {
    console.error(err);
  }
}

function bindAdminForms(session) {
  const projectForm = document.getElementById("form-create-project");
  const taskForm = document.getElementById("form-create-task");
  const manageUserForm = document.getElementById("form-manage-user");

  if (projectForm) {
    projectForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(projectForm);
      const payload = Object.fromEntries(formData.entries());
      try {
        await apiRequest("/api/data/projects", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        projectForm.reset();
        projectForm.closest(".auth-shell").style.display = "none";
        await fetchDashboardData(session);
      } catch (err) {
        console.error(err);
      }
    });
  }

  if (taskForm) {
    taskForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(taskForm);
      const payload = Object.fromEntries(formData.entries());
      try {
        await apiRequest("/api/data/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        taskForm.reset();
        taskForm.closest(".auth-shell").style.display = "none";
        await fetchDashboardData(session);
      } catch (err) {
        console.error(err);
      }
    });
  }

  if (manageUserForm) {
    manageUserForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(manageUserForm);
      const currentUserId = String(formData.get("currentUserId") || "").trim();
      const nextUserId = String(formData.get("userId") || "").trim();
      const password = String(formData.get("password") || "");
      const statusNode = manageUserForm.querySelector("[data-manage-user-status]");
      const payload = {
        userId: nextUserId,
        password
      };

      statusNode.textContent = "Updating user credentials...";

      try {
        const result = await apiRequest(`/api/users/${encodeURIComponent(currentUserId)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });

        statusNode.textContent = `Updated ${currentUserId} successfully.`;
        if (result.user && nextUserId && currentUserId === session.userId) {
          session.userId = nextUserId;
          window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
        }
        manageUserForm.reset();
        await populateUserDropdowns();
        await fetchDashboardData(session);
      } catch (err) {
        statusNode.textContent = err.message;
      }
    });
  }
}

function updateSessionUI(session) {
  const userId = session.userId || session.role;
  document.querySelectorAll("[data-user-id]").forEach((node) => { node.textContent = userId; });
  document.querySelectorAll("[data-user-id-secondary]").forEach((node) => { node.textContent = userId; });
  document.querySelectorAll("[data-user-role]").forEach((node) => { node.textContent = session.role; });

  if (session.role === "admin") {
    populateUserDropdowns();
    bindAdminForms(session);
    bindComplianceManagement(session);
  }

  fetchDashboardData(session);
}

document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("is-ready");
  const session = loadSession();
  const currentRole = getCurrentPageRole();

  if (!session || !session.token || session.role !== currentRole) {
    window.location.replace(currentRole === "admin" ? "/admin-login" : "/user-login");
    return;
  }

  updateSessionUI(session);

  const logoutButton = document.querySelector("[data-logout]");
  if (logoutButton) {
    logoutButton.addEventListener("click", () => {
      clearSessionAndRedirect();
    });
  }
});
