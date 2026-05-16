const { sql, getPool } = require("../config/db");

async function getUserPages(userId) {
  const pool = await getPool();
  const query = `
    SELECT * FROM [UserPages] 
    WHERE UserID = @userId 
    ORDER BY IsDefault DESC, CreatedAt ASC
  `;
  const result = await pool.request()
    .input("userId", sql.NVarChar, userId)
    .query(query);
  return result.recordset;
}

async function getPageWidgets(pageId) {
  const pool = await getPool();
  const query = `
    SELECT * FROM [Widgets] 
    WHERE PageID = @pageId 
    ORDER BY [Position] ASC
  `;
  const result = await pool.request()
    .input("pageId", sql.Int, pageId)
    .query(query);
  return result.recordset;
}

async function getOwnedWidget(widgetId, userId) {
  const pool = await getPool();

  const result = await pool.request()
    .input("widgetId", sql.Int, widgetId)
    .input("userId", sql.NVarChar, userId)
    .query(`
      SELECT w.*
      FROM Widgets w
      INNER JOIN UserPages p
        ON p.PageID = w.PageID
      WHERE
        w.WidgetID = @widgetId
        AND p.UserID = @userId
    `);

  return result.recordset[0] || null;
}

async function createPage(userId, title, slug, isDefault = false) {
  const pool = await getPool();
  const query = `
    INSERT INTO [UserPages] (UserID, Title, Slug, IsDefault)
    OUTPUT INSERTED.*
    VALUES (@userId, @title, @slug, @isDefault)
  `;
  const result = await pool.request()
    .input("userId", sql.NVarChar, userId)
    .input("title", sql.NVarChar, title)
    .input("slug", sql.NVarChar, slug)
    .input("isDefault", sql.Bit, isDefault ? 1 : 0)
    .query(query);
  return result.recordset[0];
}

async function addWidget(pageId, type, title, settings = null, position = 0) {
  const pool = await getPool();
  const query = `
    INSERT INTO [Widgets] (PageID, [Type], Title, Settings, [Position])
    OUTPUT INSERTED.*
    VALUES (@pageId, @type, @title, @settings, @position)
  `;
  const result = await pool.request()
    .input("pageId", sql.Int, pageId)
    .input("type", sql.NVarChar, type)
    .input("title", sql.NVarChar, title)
    .input("settings", sql.NVarChar, settings ? JSON.stringify(settings) : null)
    .input("position", sql.Int, position)
    .query(query);
  return result.recordset[0];
}

async function deleteWidget(widgetId) {
  const pool = await getPool();
  const query = `
    DELETE FROM [Widgets]
    OUTPUT DELETED.*
    WHERE WidgetID = @widgetId
  `;
  const result = await pool.request()
    .input("widgetId", sql.Int, widgetId)
    .query(query);
  return result.recordset[0] || null;
}

module.exports = {
  getUserPages,
  getPageWidgets,
  getOwnedWidget,
  createPage,
  addWidget,
  deleteWidget
};
