# MySQL MCP Server

A Model Context Protocol (MCP) server that gives Claude direct access to your MySQL / MariaDB database.

## Tools exposed to Claude

| Tool | What it does |
|------|-------------|
| `mysql_select` | Run any SELECT query, returns rows as JSON |
| `mysql_insert` | Insert a row into any table |
| `mysql_update` | Update rows matching a WHERE condition |
| `mysql_delete` | Delete rows matching a WHERE condition |

---

## Setup

### 1. Install dependencies

```bash
cd mysql-mcp-server
npm install
```

### 2. Configure Claude Desktop

Open your Claude Desktop config file:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

Add this block inside `"mcpServers"`:

```json
{
  "mcpServers": {
    "mysql": {
      "command": "node",
      "args": ["/FULL/PATH/TO/mysql-mcp-server/index.js"],
      "env": {
        "DB_HOST": "localhost",
        "DB_PORT": "3306",
        "DB_USER": "your_db_user",
        "DB_PASSWORD": "your_db_password",
        "DB_NAME": "your_database_name"
      }
    }
  }
}
```

> Replace `/FULL/PATH/TO/` with the actual path where you saved the folder.

### 3. Restart Claude Desktop

After saving the config, fully quit and reopen Claude Desktop. You should see the MySQL tools available.

---

## Example prompts to use with Claude

```
Show me all customers from the customers table.

Insert a new customer: name = "Ahmed", email = "ahmed@example.com", city = "Chattogram"

Update the phone number to "01800000000" where customer id = 5

Delete all records from logs where created_at is older than 2024-01-01
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `DB_HOST` | `localhost` | MySQL server hostname |
| `DB_PORT` | `3306` | MySQL server port |
| `DB_USER` | `root` | Database username |
| `DB_PASSWORD` | _(empty)_ | Database password |
| `DB_NAME` | _(empty)_ | Database name to connect to |

---

## Security Notes

- The `mysql_select` tool **only allows SELECT** statements — no DDL or DML via that tool.
- Use a **dedicated DB user** with only the permissions Claude needs (SELECT, INSERT, UPDATE, DELETE on specific tables).
- Never commit your `claude_desktop_config.json` with real credentials to version control.
