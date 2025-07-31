# n8n MCP Server API Reference

Complete reference for all tools, resources, and endpoints available in the n8n MCP Server.

## Table of Contents

- [Core Workflow Tools](#core-workflow-tools)
- [Execution Management](#execution-management)
- [Enterprise Features](#enterprise-features)
- [User Management](#user-management)
- [Additional Tools](#additional-tools)
- [MCP Resources](#mcp-resources)
- [Authentication & Authorization](#authentication--authorization)

## Core Workflow Tools

### `init-n8n`
Initialize connection to n8n instance.

**Parameters:**
- `baseUrl` (string, required): n8n instance URL
- `apiKey` (string, required): n8n API key

**Returns:** Connection status and instance information

**Example:**
```json
{
  "baseUrl": "https://your-n8n-instance.com",
  "apiKey": "your-api-key"
}
```

---

### `list-workflows`
List all workflows with optional filtering.

**Parameters:**
- `limit` (number, optional): Maximum number of workflows to return (default: 20)
- `cursor` (string, optional): Pagination cursor for next page
- `active` (boolean, optional): Filter by active status
- `tags` (string[], optional): Filter by workflow tags

**Returns:** Array of workflow summaries

**Example:**
```json
{
  "limit": 50,
  "active": true,
  "tags": ["production", "automated"]
}
```

---

### `get-workflow`
Get detailed information about a specific workflow.

**Parameters:**
- `workflowId` (string, required): Workflow ID

**Returns:** Complete workflow definition and metadata

**Example:**
```json
{
  "workflowId": "workflow-123"
}
```

---

### `create-workflow`
Create a new workflow from definition.

**Parameters:**
- `name` (string, required): Workflow name
- `nodes` (array, required): Workflow nodes definition
- `connections` (object, required): Node connections
- `active` (boolean, optional): Whether to activate immediately (default: false)
- `tags` (string[], optional): Workflow tags

**Returns:** Created workflow with ID

**Example:**
```json
{
  "name": "My New Workflow",
  "nodes": [
    {
      "name": "Start",
      "type": "n8n-nodes-base.manualTrigger",
      "position": [240, 300],
      "parameters": {}
    }
  ],
  "connections": {},
  "active": false,
  "tags": ["test"]
}
```

---

### `update-workflow`
Update an existing workflow.

**Parameters:**
- `workflowId` (string, required): Workflow ID to update
- `name` (string, optional): New workflow name
- `nodes` (array, optional): Updated nodes definition
- `connections` (object, optional): Updated connections
- `tags` (string[], optional): Updated tags

**Returns:** Updated workflow information

---

### `delete-workflow`
Delete a workflow (requires confirmation).

**Parameters:**
- `workflowId` (string, required): Workflow ID to delete
- `confirm` (boolean, required): Confirmation flag (must be true)

**Returns:** Deletion confirmation

---

### `activate-workflow`
Enable workflow execution.

**Parameters:**
- `workflowId` (string, required): Workflow ID to activate

**Returns:** Activation status

---

### `deactivate-workflow`
Disable workflow execution.

**Parameters:**
- `workflowId` (string, required): Workflow ID to deactivate

**Returns:** Deactivation status

## Execution Management

### `list-executions`
View execution history with filtering options.

**Parameters:**
- `limit` (number, optional): Maximum executions to return (default: 20)
- `cursor` (string, optional): Pagination cursor
- `workflowId` (string, optional): Filter by specific workflow
- `status` (string, optional): Filter by status ("success", "error", "running")
- `startedAfter` (string, optional): ISO date filter
- `startedBefore` (string, optional): ISO date filter

**Returns:** Array of execution summaries

---

### `get-execution`
Get detailed execution information.

**Parameters:**
- `executionId` (string, required): Execution ID

**Returns:** Complete execution details including data and logs

---

### `delete-execution`
Remove execution records.

**Parameters:**
- `executionId` (string, required): Execution ID to delete
- `confirm` (boolean, required): Confirmation flag

**Returns:** Deletion confirmation

---

### `retry-execution`
Retry a failed execution.

**Parameters:**
- `executionId` (string, required): Failed execution ID to retry

**Returns:** New execution information

---

### `stop-execution`
Stop a currently running execution.

**Parameters:**
- `executionId` (string, required): Running execution ID

**Returns:** Stop confirmation

## Enterprise Features

> **Note:** These features require an n8n Enterprise license.

### Project Management

#### `list-projects`
List all projects.

**Parameters:**
- `limit` (number, optional): Maximum projects to return

**Returns:** Array of project summaries

#### `create-project`
Create a new project.

**Parameters:**
- `name` (string, required): Project name
- `type` (string, optional): Project type

**Returns:** Created project information

#### `get-project`
Get project details.

**Parameters:**
- `projectId` (string, required): Project ID

**Returns:** Complete project information

#### `update-project`
Modify project settings.

**Parameters:**
- `projectId` (string, required): Project ID
- `name` (string, optional): New project name
- `type` (string, optional): New project type

**Returns:** Updated project information

#### `delete-project`
Remove a project.

**Parameters:**
- `projectId` (string, required): Project ID
- `confirm` (boolean, required): Confirmation flag

**Returns:** Deletion confirmation

### Variable Management

#### `list-variables`
List environment variables.

**Parameters:**
- `limit` (number, optional): Maximum variables to return

**Returns:** Array of variables (values redacted for security)

#### `create-variable`
Create environment variable.

**Parameters:**
- `key` (string, required): Variable key
- `value` (string, required): Variable value
- `type` (string, optional): Variable type

**Returns:** Created variable information

#### `get-variable`
Retrieve variable value.

**Parameters:**
- `key` (string, required): Variable key

**Returns:** Variable information (value may be redacted)

#### `update-variable`
Modify variable.

**Parameters:**
- `key` (string, required): Variable key
- `value` (string, required): New value

**Returns:** Updated variable information

#### `delete-variable`
Remove variable.

**Parameters:**
- `key` (string, required): Variable key
- `confirm` (boolean, required): Confirmation flag

**Returns:** Deletion confirmation

## User Management

> **Note:** Requires admin privileges.

### `list-users`
List all users.

**Parameters:**
- `limit` (number, optional): Maximum users to return

**Returns:** Array of user information

### `create-user`
Create new user account.

**Parameters:**
- `email` (string, required): User email
- `firstName` (string, required): User first name
- `lastName` (string, required): User last name
- `role` (string, optional): User role (default: "member")

**Returns:** Created user information

### `get-user`
Get user details.

**Parameters:**
- `userId` (string, required): User ID

**Returns:** Complete user information

### `update-user`
Modify user information.

**Parameters:**
- `userId` (string, required): User ID
- `firstName` (string, optional): New first name
- `lastName` (string, optional): New last name
- `role` (string, optional): New role

**Returns:** Updated user information

### `delete-user`
Remove user account.

**Parameters:**
- `userId` (string, required): User ID
- `confirm` (boolean, required): Confirmation flag

**Returns:** Deletion confirmation

## Additional Tools

### Tag Management

#### `list-tags`
List all workflow tags.

**Returns:** Array of tag information

#### `create-tag`
Create new workflow tag.

**Parameters:**
- `name` (string, required): Tag name
- `color` (string, optional): Tag color

**Returns:** Created tag information

#### `update-tag`
Modify tag information.

**Parameters:**
- `tagId` (string, required): Tag ID
- `name` (string, optional): New name
- `color` (string, optional): New color

**Returns:** Updated tag information

#### `delete-tag`
Remove tag.

**Parameters:**
- `tagId` (string, required): Tag ID
- `confirm` (boolean, required): Confirmation flag

**Returns:** Deletion confirmation

### Security & Auditing

#### `get-audit-logs`
Retrieve security audit logs.

**Parameters:**
- `limit` (number, optional): Maximum log entries
- `startDate` (string, optional): Start date filter
- `endDate` (string, optional): End date filter

**Returns:** Array of audit log entries

#### `generate-audit-report`
Create comprehensive security audit report.

**Parameters:**
- `format` (string, optional): Report format ("json", "csv", "pdf")
- `includeExecutions` (boolean, optional): Include execution history
- `includeUsers` (boolean, optional): Include user activity

**Returns:** Generated audit report

### Credential Management

#### `list-credentials`
List credentials (metadata only, no secrets).

**Parameters:**
- `limit` (number, optional): Maximum credentials to return

**Returns:** Array of credential metadata

## MCP Resources

Access n8n data through standardized MCP resources.

### Workflow Resources

- **`n8n://workflows/list`** - All workflows with basic information
- **`n8n://workflows/active`** - Only active workflows
- **`n8n://workflows/stats`** - Workflow statistics and metrics
- **`n8n://workflows/{id}`** - Individual workflow by ID

### Execution Resources

- **`n8n://executions/recent`** - Recent executions across all workflows
- **`n8n://executions/failures`** - Failed executions for debugging
- **`n8n://executions/stats`** - Execution statistics and performance metrics
- **`n8n://executions/{id}`** - Individual execution details
- **`n8n://executions/{id}/logs`** - Execution logs and debug information
- **`n8n://executions/workflow/{workflowId}`** - All executions for specific workflow

### Information Resources

- **`n8n://info`** - n8n instance information and capabilities
- **`n8n://index`** - Resource directory and available endpoints
- **`n8n://nodes/available`** - Available n8n nodes and their capabilities
- **`n8n://nodes/{nodeType}`** - Documentation for specific node type

### Resource Template Parameters

Some resources support template parameters:

**Workflow Resource by ID:**
```
n8n://workflows/{id}
```
- `id` (required): Workflow ID

**Execution Resource by ID:**
```
n8n://executions/{id}
```
- `id` (required): Execution ID

**Node Documentation:**
```
n8n://nodes/{nodeType}
```
- `nodeType` (required): Node type (e.g., "n8n-nodes-base.httpRequest")

## Authentication & Authorization

### Role-Based Access Control

The server supports role-based access control with the following roles:

- **anonymous**: Basic read-only access to community features
- **member**: Standard user with workflow and execution access
- **editor**: Enhanced permissions including credential management
- **admin**: Full access including user management and enterprise features

### Permission Matrix

| Feature | Anonymous | Member | Editor | Admin |
|---------|-----------|--------|--------|-------|
| List workflows | ✅ | ✅ | ✅ | ✅ |
| Create workflows | ❌ | ✅ | ✅ | ✅ |
| Manage credentials | ❌ | ❌ | ✅ | ✅ |
| User management | ❌ | ❌ | ❌ | ✅ |
| Enterprise features | ❌ | ❌ | ❌ | ✅ |
| Audit logs | ❌ | ❌ | ❌ | ✅ |

### Authentication Methods

#### Environment Variables (Default)
```bash
export N8N_BASE_URL=https://your-n8n-instance.com
export N8N_API_KEY=your-api-key
```

#### Per-Request Headers
- `X-N8N-API-Key`: Your n8n API key
- `X-N8N-Base-URL`: Your n8n instance URL
- `Authorization`: Bearer token format

#### Configuration Options
```bash
# Enable authentication requirement
export N8N_MCP_AUTH_REQUIRED=true

# Authentication settings
export N8N_MCP_VALIDATE_CONNECTION=true
export N8N_MCP_AUTH_CACHE_DURATION=300000  # 5 minutes
export N8N_MCP_DEFAULT_ROLES=member,editor
```

## Error Handling

All tools return structured error responses:

```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "Error message details"
    }
  ]
}
```

### Common Error Types

- **UserError**: User-facing errors (invalid parameters, permissions)
- **ConnectionError**: n8n instance connection issues
- **AuthenticationError**: Invalid credentials or permissions
- **NotFoundError**: Requested resource doesn't exist
- **ValidationError**: Invalid input data or parameters

### Error Codes

- `CLIENT_NOT_INITIALIZED`: n8n client not set up
- `INVALID_CREDENTIALS`: Invalid API key or URL
- `PERMISSION_DENIED`: Insufficient permissions
- `RESOURCE_NOT_FOUND`: Workflow, execution, or user not found
- `ENTERPRISE_REQUIRED`: Enterprise license needed
- `VALIDATION_FAILED`: Input validation errors

## Rate Limiting

The server implements rate limiting to protect n8n instances:

- **Default**: 100 requests per minute per client
- **Configurable** via `N8N_MCP_RATE_LIMIT` environment variable
- **Burst handling**: Short bursts allowed with exponential backoff

## Caching

Resources are cached to improve performance:

- **Workflow metadata**: 5 minutes
- **Execution data**: 2 minutes (changes frequently)
- **User information**: 10 minutes
- **Node documentation**: 1 hour (static data)

Cache duration can be configured via environment variables:
```bash
export N8N_MCP_RESOURCE_CACHE_DURATION=300000  # 5 minutes in milliseconds
```

---

For more information, see:
- [Configuration Guide](configuration.md)
- [Troubleshooting Guide](troubleshooting.md)
- [Migration Guide](migration-guide.md)