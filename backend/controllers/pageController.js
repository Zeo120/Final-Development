const { getUserPages, getPageWidgets, createPage, addWidget, deleteWidget } = require("../models/pageModel");
const { requireAppAuth } = require("./authController");

function parseBoolean(value) {
  if (value === true || value === false) {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (normalized === "true" || normalized === "1") return true;
    if (normalized === "false" || normalized === "0" || normalized === "") return false;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return Boolean(value);
}

async function listPages(req, res, next) {
  try {
    const auth = requireAppAuth(req, res, ["admin", "user"]);
    if (!auth) return;

    const pages = await getUserPages(auth.userId);
    res.json({ success: true, pages });
  } catch (err) {
    next(err);
  }
}

async function getPageDetails(req, res, next) {
  try {
    const auth = requireAppAuth(req, res, ["admin", "user"]);
    if (!auth) return;

    const pageId = Number(req.params.pageId);
    if (!Number.isInteger(pageId) || pageId <= 0) {
      return res.status(400).json({ success: false, message: "A valid page ID is required." });
    }

    const pages = await getUserPages(auth.userId);
    const ownsPage = pages.some((page) => Number(page.PageID) === pageId);

    if (!ownsPage) {
      return res.status(404).json({ success: false, message: "Page not found." });
    }

    const widgets = await getPageWidgets(pageId);
    return res.json({ success: true, widgets });
  } catch (err) {
    return next(err);
  }
}

async function createNewPage(req, res, next) {
  try {
    const auth = requireAppAuth(req, res, ["admin", "user"]);
    if (!auth) return;

    const title = String(req.body.title || "").trim();
    const slug = String(req.body.slug || "").trim();
    const isDefault = parseBoolean(req.body.isDefault);

    if (!title || !slug) {
      return res.status(400).json({ success: false, message: "Title and slug are required." });
    }

    const page = await createPage(auth.userId, title, slug, isDefault);
    return res.status(201).json({ success: true, page });
  } catch (err) {
    return next(err);
  }
}

async function addNewWidget(req, res, next) {
  try {
    const auth = requireAppAuth(req, res, ["admin"]);
    if (!auth) return;

    const pageId = Number(req.params.pageId);
    const type = String(req.body.type || "").trim();
    const title = String(req.body.title || "").trim();
    const settings = req.body.settings || null;
    const position = Number(req.body.position || 0);

    if (!Number.isInteger(pageId) || pageId <= 0 || !type) {
      return res.status(400).json({ success: false, message: "Valid page ID and widget type are required." });
    }

    const pages = await getUserPages(auth.userId);
    const ownsPage = pages.some((page) => Number(page.PageID) === pageId);
    if (!ownsPage) {
      return res.status(404).json({ success: false, message: "Page not found." });
    }

    const widget = await addWidget(pageId, type, title, settings, position);
    return res.status(201).json({ success: true, widget });
  } catch (err) {
    return next(err);
  }
}

async function removeWidget(req, res, next) {
  try {
    const auth = requireAppAuth(req, res, ["admin"]);
    if (!auth) return;

    const widgetId = Number(req.params.widgetId);

    if (!Number.isInteger(widgetId) || widgetId <= 0) {
      return res.status(400).json({ success: false, message: "A valid widget ID is required." });
    }

    const pages = await getUserPages(auth.userId);
    let targetWidget = null;

    for (const page of pages) {
      const widgets = await getPageWidgets(page.PageID);
      targetWidget = widgets.find((widget) => Number(widget.WidgetID) === widgetId) || null;
      if (targetWidget) {
        break;
      }
    }

    if (!targetWidget) {
      return res.status(404).json({ success: false, message: "Widget not found." });
    }

    const widget = await deleteWidget(widgetId);
    return res.json({ success: true, widget });
  } catch (err) {
    return next(err);
  }
}

module.exports = {
  listPages,
  getPageDetails,
  createNewPage,
  addNewWidget,
  removeWidget
};
