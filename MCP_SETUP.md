# Connect Akada to Claude

Akada exposes a remote MCP endpoint that lets Claude find courses in the active semester and add tasks to them.

## Before connecting

Deploy the current `main` branch to Vercel and set these Production environment variables:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SITE_URL` | The deployed Akada origin, with no trailing slash. |
| `AKADA_MCP_TOKEN_SECRET` | A random value of at least 32 characters. Keep it stable; changing it invalidates existing connector credentials. |

Redeploy after adding or changing an environment variable.

## Add the connector in Claude

1. In Claude, open **Customize -> Connectors -> Add custom connector**.
2. Enter the MCP server URL:

   ```text
   https://your-akada-domain/api/mcp
   ```

3. Select **Always required** authentication.
4. Select **No client ID -- register one automatically**.
5. Leave Additional request headers empty.
6. Add the connector, click **Connect**, sign in to Akada, and select **Allow connection**.
7. Enable Akada for a chat through the chat's Connectors menu.

The connector provides `find_course` and `create_tasks`. It cannot edit or delete courses, tasks, semesters, or study sessions. In Claude's connector permissions, set `create_tasks` to **Needs approval** if you want to review each task-creation request.
