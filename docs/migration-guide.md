# Migration Guide

Complete guide for migrating from the legacy MCP SDK to the new FastMCP-based n8n MCP Server.

## Table of Contents

- [Overview](#overview)
- [Breaking Changes](#breaking-changes)
- [Step-by-Step Migration](#step-by-step-migration)
- [Configuration Updates](#configuration-updates)
- [New Features](#new-features)
- [Troubleshooting Migration Issues](#troubleshooting-migration-issues)

## Overview

The n8n MCP Server has been completely rewritten using the modern [FastMCP TypeScript framework](https://fastmcp.org), providing significant improvements in performance, features, and maintainability.

### What's Changed

**✅ Enhanced Features:**
- **FastMCP Framework**: Modern TypeScript framework with better performance
- **Multiple Transports**: Both stdio and SSE (Server-Sent Events) support
- **Authentication & Authorization**: Optional role-based access control
- **MCP Resources**: Dynamic access to n8n data through standardized resources
- **Improved Error Handling**: Better error messages and debugging
- **Progress Reporting**: Real-time progress updates for long operations
- **Enhanced Security**: Built-in security best practices

**🔄 Preserved Features:**
- **All existing tools**: Every tool from the previous version is available
- **Same API**: Tool parameters and responses remain the same
- **Backward compatibility**: Existing configurations continue to work

## Breaking Changes

### Environment Variable Changes

**Old (Legacy SDK):**
```bash
export N8N_HOST=https://your-n8n-instance.com
export N8N_API_KEY=your-api-key
```

**New (FastMCP):**
```bash
export N8N_BASE_URL=https://your-n8n-instance.com  # Changed from N8N_HOST
export N8N_API_KEY=your-api-key                    # Same
```

### Package Name Changes

**Old Installation:**
```bash
# Legacy versions (if you had custom builds)
npm install @modelcontextprotocol/sdk
```

**New Installation:**
```bash
# Current version uses FastMCP internally
npm install -g @illuminaresolutions/n8n-mcp-server
```

### Configuration File Updates

**No changes needed** - The server automatically handles the transition from `N8N_HOST` to `N8N_BASE_URL` for backward compatibility.

## Step-by-Step Migration

### Step 1: Update Environment Variables

If you're using the old `N8N_HOST` variable, update it to `N8N_BASE_URL`:

**Before:**
```bash
export N8N_HOST=https://your-n8n-instance.com
export N8N_API_KEY=your-api-key
```

**After:**
```bash
export N8N_BASE_URL=https://your-n8n-instance.com
export N8N_API_KEY=your-api-key
```

> **Note**: The old `N8N_HOST` will still work for backward compatibility, but `N8N_BASE_URL` is recommended.

### Step 2: Update Client Configuration

#### Claude Desktop

**Legacy Configuration (still works):**
```json
{
  "mcpServers": {
    "n8n": {
      "command": "n8n-mcp-server",
      "env": {
        "N8N_HOST": "https://your-n8n-instance.com",
        "N8N_API_KEY": "your-api-key"
      }
    }
  }
}
```

**Recommended Configuration:**
```json
{
  "mcpServers": {
    "n8n": {
      "command": "n8n-mcp-server",
      "env": {
        "N8N_BASE_URL": "https://your-n8n-instance.com",
        "N8N_API_KEY": "your-api-key"
      }
    }
  }
}
```

#### Cline (VS Code)

**Update your Cline MCP configuration:**
```json
{
  "mcpServers": {
    "n8n": {
      "command": "n8n-mcp-server",
      "env": {
        "N8N_BASE_URL": "https://your-n8n-instance.com",
        "N8N_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Step 3: Install Latest Version

```bash
# Uninstall old version (if installed globally)
npm uninstall -g n8n-mcp-server

# Install latest version
npm install -g @illuminaresolutions/n8n-mcp-server

# Verify installation
n8n-mcp-server --version
```

### Step 4: Test Configuration

```bash
# Test with FastMCP CLI
npx fastmcp dev n8n-mcp-server

# Or test with MCP Inspector
npx fastmcp inspect n8n-mcp-server
```

### Step 5: Restart Client Applications

1. **Claude Desktop**: Restart the application
2. **Cline**: Reload VS Code extension
3. **Custom clients**: Restart your MCP client

## Configuration Updates

### New Environment Variables

The FastMCP version introduces many new configuration options:

#### Transport Configuration
```bash
# New: Choose transport type
export N8N_MCP_TRANSPORT=stdio              # stdio | sse

# New: SSE transport options
export N8N_MCP_SSE_HOST=localhost
export N8N_MCP_SSE_PORT=8080
export N8N_MCP_SSE_ENDPOINT=/sse
```

#### Authentication Configuration
```bash
# New: Optional authentication
export N8N_MCP_AUTH_REQUIRED=false
export N8N_MCP_VALIDATE_CONNECTION=true
export N8N_MCP_AUTH_CACHE_DURATION=300000
export N8N_MCP_DEFAULT_ROLES=member
```

#### Resource Configuration
```bash
# New: MCP Resources configuration
export N8N_MCP_RESOURCE_BASE_URI=n8n://
export N8N_MCP_ENABLE_WORKFLOW_RESOURCES=true
export N8N_MCP_ENABLE_EXECUTION_RESOURCES=true
export N8N_MCP_ENABLE_CREDENTIAL_RESOURCES=false
export N8N_MCP_ENABLE_NODE_RESOURCES=true
export N8N_MCP_RESOURCE_CACHE_DURATION=300000
```

#### Logging Configuration
```bash
# New: Enhanced logging options
export N8N_MCP_LOG_LEVEL=info               # debug | info | warn | error
export N8N_MCP_LOG_FORMAT=json              # json | text
export DEBUG=fastmcp:*                      # FastMCP debug logs
```

### Backward Compatibility

The server maintains backward compatibility with legacy configurations:

```bash
# These legacy variables still work:
export N8N_HOST=https://your-n8n-instance.com    # Mapped to N8N_BASE_URL
export N8N_API_KEY=your-api-key                  # Same as before
```

## New Features

### 1. SSE Transport for Remote Access

**Enable SSE transport:**
```bash
export N8N_MCP_TRANSPORT=sse
export N8N_MCP_SSE_PORT=8080

# Start server
n8n-mcp-server
# Available at http://localhost:8080/sse
```

**Connect from Claude Desktop:**
```json
{
  "mcpServers": {
    "n8n-remote": {
      "command": "npx",
      "args": ["@modelcontextprotocol/inspector", "http://localhost:8080/sse"],
      "env": {
        "N8N_BASE_URL": "https://your-n8n-instance.com",
        "N8N_API_KEY": "your-api-key"
      }
    }
  }
}
```

### 2. MCP Resources

Access n8n data through standardized MCP resources:

```bash
# List available resources
npx fastmcp inspect n8n-mcp-server

# Available resources:
# n8n://workflows/list
# n8n://workflows/active
# n8n://workflows/stats
# n8n://executions/recent
# n8n://executions/failures
# n8n://info
```

### 3. Authentication & Authorization

**Enable authentication:**
```bash
export N8N_MCP_AUTH_REQUIRED=true
export N8N_MCP_DEFAULT_ROLES=member,editor
```

**Per-request authentication (HTTP headers):**
```bash
curl -H "X-N8N-API-Key: your-key" \
     -H "X-N8N-Base-URL: https://your-instance.com" \
     http://localhost:8080/sse
```

### 4. Enhanced Error Handling

**New error format:**
```json
{
  "isError": true,
  "content": [
    {
      "type": "text",
      "text": "Detailed error message with context"
    }
  ]
}
```

### 5. Progress Reporting

Long-running operations now report progress:

```javascript
// Example: Creating a complex workflow
// Progress: 25% - Validating workflow structure
// Progress: 50% - Creating nodes
// Progress: 75% - Setting up connections
// Progress: 100% - Workflow created successfully
```

## Troubleshooting Migration Issues

### Common Migration Issues

#### 1. "Command not found: n8n-mcp-server"

**Solution:**
```bash
# Ensure you have the latest version installed
npm install -g @illuminaresolutions/n8n-mcp-server

# Check installation
which n8n-mcp-server
n8n-mcp-server --version
```

#### 2. "Invalid n8n configuration"

**Old variable still in use:**
```bash
# This might not work in some contexts
export N8N_HOST=https://your-instance.com
```

**Solution:**
```bash
# Use the new variable name
export N8N_BASE_URL=https://your-instance.com
```

#### 3. "Client connection failed"

**Check transport configuration:**
```bash
# Ensure correct transport for your setup
export N8N_MCP_TRANSPORT=stdio  # For Claude Desktop
# OR
export N8N_MCP_TRANSPORT=sse    # For remote access
```

#### 4. "Tools not working as expected"

**Reset client configuration:**
1. Clear client cache/restart client application
2. Verify environment variables are loaded
3. Test with MCP Inspector:
   ```bash
   npx fastmcp inspect n8n-mcp-server
   ```

#### 5. "SSE transport not starting"

**Check port availability:**
```bash
# Check if port is in use
lsof -i :8080

# Use different port if needed
export N8N_MCP_SSE_PORT=8081
```

### Migration Verification

#### Test Checklist

- [ ] Environment variables updated (`N8N_BASE_URL` instead of `N8N_HOST`)
- [ ] Latest version installed (`npm install -g @illuminaresolutions/n8n-mcp-server`)
- [ ] Client configuration updated
- [ ] All existing tools work as before
- [ ] New resources are accessible (optional)
- [ ] SSE transport works (if using remote access)

#### Verification Commands

```bash
# 1. Check version
n8n-mcp-server --version

# 2. Test configuration
n8n-mcp-server --validate-config

# 3. Test n8n connection
n8n-mcp-server --test-connection

# 4. Inspect with FastMCP CLI
npx fastmcp inspect n8n-mcp-server

# 5. Test specific tools
# (Use MCP Inspector to test individual tools)
```

### Rollback Plan

If you encounter issues, you can temporarily rollback:

#### Rollback Steps

1. **Keep old configuration:**
   ```bash
   # Backup current config
   cp ~/.config/Claude/claude_desktop_config.json ~/.config/Claude/claude_desktop_config.json.backup
   
   # Restore old config if needed
   export N8N_HOST=https://your-instance.com  # Will still work
   export N8N_API_KEY=your-api-key
   ```

2. **Use specific version:**
   ```bash
   # If you need to pin to a specific version
   npm install -g @illuminaresolutions/n8n-mcp-server@1.0.0
   ```

3. **Report issues:**
   - [GitHub Issues](https://github.com/illuminaresolutions/n8n-mcp-server/issues)
   - Include error logs and configuration details

## Migration Best Practices

### 1. Gradual Migration

- **Test in development first**: Set up a test environment before migrating production
- **Keep old configuration**: Maintain backward compatibility during transition
- **Monitor logs**: Watch for deprecation warnings and errors

### 2. Configuration Management

```bash
# Create migration script
#!/bin/bash
# migrate-n8n-mcp.sh

echo "Migrating n8n MCP Server configuration..."

# Update environment variables
if [ ! -z "$N8N_HOST" ]; then
    export N8N_BASE_URL="$N8N_HOST"
    echo "Mapped N8N_HOST to N8N_BASE_URL"
fi

# Install latest version
npm install -g @illuminaresolutions/n8n-mcp-server

# Test configuration
n8n-mcp-server --validate-config

echo "Migration complete!"
```

### 3. Documentation Updates

Update your internal documentation to reflect:
- New environment variable names
- Available FastMCP features
- SSE transport options
- New resource capabilities

---

For additional help:
- [Configuration Guide](configuration.md)
- [API Reference](api-reference.md)  
- [Troubleshooting Guide](troubleshooting.md)
- [GitHub Issues](https://github.com/illuminaresolutions/n8n-mcp-server/issues)