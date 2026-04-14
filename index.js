#!/usr/bin/env node

const { Server } = require("@modelcontextprotocol/sdk/server/index.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} = require("@modelcontextprotocol/sdk/types.js");
const mysql = require("mysql2/promise");

// ── Config from env vars ──────────────────────────────────────────────────────
const DB_CONFIG = {
  host:     process.env.DB_HOST     || "localhost",
  port:     parseInt(process.env.DB_PORT || "3306"),
  user:     process.env.DB_USER     || "root",
  password: process.env.DB_PASSWORD || "",
  database: process.env.DB_NAME     || "",
  waitForConnections: true,
  connectionLimit: 5,
};

let pool;

async function getPool() {
  if (!pool) {
    pool = mysql.createPool(DB_CONFIG);
    // quick connectivity check
    const conn = await pool.getConnection();
    conn.release();
  }
  return pool;
}

// ── MCP Server ────────────────────────────────────────────────────────────────
const server = new Server(
  { name: "mysql-mcp-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// ── Tool definitions ──────────────────────────────────────────────────────────
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "mysql_select",
      description: "Run a SELECT query and return rows as JSON.",
      inputSchema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "A valid SELECT SQL statement.",
          },
          params: {
            type: "array",
            items: {},
            description: "Optional array of positional parameters (? placeholders).",
          },
        },
        required: ["query"],
      },
    },
    {
      name: "mysql_insert",
      description: "Insert a row into a table.",
      inputSchema: {
        type: "object",
        properties: {
          table: { type: "string", description: "Target table name." },
          data: {
            type: "object",
            description: "Key-value pairs of column → value to insert.",
          },
        },
        required: ["table", "data"],
      },
    },
    {
      name: "mysql_update",
      description: "Update rows in a table matching a WHERE condition.",
      inputSchema: {
        type: "object",
        properties: {
          table: { type: "string", description: "Target table name." },
          data: {
            type: "object",
            description: "Key-value pairs of column → new value.",
          },
          where: {
            type: "string",
            description: "WHERE clause WITHOUT the word WHERE (e.g. \"id = 5\").",
          },
          params: {
            type: "array",
            items: {},
            description: "Positional params for the WHERE clause placeholders.",
          },
        },
        required: ["table", "data", "where"],
      },
    },
    {
      name: "mysql_delete",
      description: "Delete rows from a table matching a WHERE condition.",
      inputSchema: {
        type: "object",
        properties: {
          table: { type: "string", description: "Target table name." },
          where: {
            type: "string",
            description: "WHERE clause WITHOUT the word WHERE (e.g. \"id = 5\").",
          },
          params: {
            type: "array",
            items: {},
            description: "Positional params for the WHERE clause placeholders.",
          },
        },
        required: ["table", "where"],
      },
    },
  ],
}));

// ── Tool handlers ─────────────────────────────────────────────────────────────
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    const db = await getPool();

    // ── SELECT ──────────────────────────────────────────────────────────────
    if (name === "mysql_select") {
      const { query, params = [] } = args;

      if (!/^\s*SELECT\b/i.test(query)) {
        return errorResult("Only SELECT statements are allowed in mysql_select.");
      }

      const [rows] = await db.execute(query, params);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(rows, null, 2),
          },
        ],
      };
    }

    // ── INSERT ──────────────────────────────────────────────────────────────
    if (name === "mysql_insert") {
      const { table, data } = args;
      const columns = Object.keys(data);
      const values  = Object.values(data);
      const placeholders = columns.map(() => "?").join(", ");

      const sql = `INSERT INTO \`${table}\` (${columns.map(c => `\`${c}\``).join(", ")}) VALUES (${placeholders})`;
      const [result] = await db.execute(sql, values);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              insertId: result.insertId,
              affectedRows: result.affectedRows,
            }),
          },
        ],
      };
    }

    // ── UPDATE ──────────────────────────────────────────────────────────────
    if (name === "mysql_update") {
      const { table, data, where, params = [] } = args;
      const setClauses = Object.keys(data).map(c => `\`${c}\` = ?`).join(", ");
      const setValues  = Object.values(data);

      const sql = `UPDATE \`${table}\` SET ${setClauses} WHERE ${where}`;
      const [result] = await db.execute(sql, [...setValues, ...params]);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              affectedRows: result.affectedRows,
              changedRows: result.changedRows,
            }),
          },
        ],
      };
    }

    // ── DELETE ──────────────────────────────────────────────────────────────
    if (name === "mysql_delete") {
      const { table, where, params = [] } = args;
      const sql = `DELETE FROM \`${table}\` WHERE ${where}`;
      const [result] = await db.execute(sql, params);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              affectedRows: result.affectedRows,
            }),
          },
        ],
      };
    }

    return errorResult(`Unknown tool: ${name}`);

  } catch (err) {
    return errorResult(`Database error: ${err.message}`);
  }
});

function errorResult(msg) {
  return {
    content: [{ type: "text", text: JSON.stringify({ error: msg }) }],
    isError: true,
  };
}

// ── Start ─────────────────────────────────────────────────────────────────────
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MySQL MCP Server running (stdio)");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
