# Troubleshooting Guide

Comprehensive troubleshooting guide for common issues with the n8n MCP Server and FastMCP framework integration.

## Table of Contents

- [Quick Diagnostics](#quick-diagnostics)
- [Installation Issues](#installation-issues)
- [Connection Problems](#connection-problems)
- [Authentication Errors](#authentication-errors)
- [Transport Issues](#transport-issues)
- [Tool Execution Problems](#tool-execution-problems)
- [Performance Issues](#performance-issues)
- [Client-Specific Issues](#client-specific-issues)
- [Advanced Debugging](#advanced-debugging)

## Quick Diagnostics

### Health Check Commands

```bash
# Check if server is installed
n8n-mcp-server --version

# Validate configuration
n8n-mcp-server --validate-config

# Test n8n connection
n8n-mcp-server --test-connection

# Show current configuration
n8n-mcp-server --show-config
```

### Environment Check

```bash
# Verify environment variables
echo "N8N_BASE_URL: $N8N_BASE_URL"
echo "N8N_API_KEY: ${N8N_API_KEY:0:10}..."
echo "Transport: $N8N_MCP_TRANSPORT"

# Test n8n API directly
curl -H "X-N8N-API-Key: $N8N_API_KEY" \
     "${N8N_BASE_URL}/api/v1/workflows?limit=1"
```

### FastMCP Testing

```bash
# Test with FastMCP CLI
npx fastmcp dev n8n-mcp-server

# Inspect server capabilities
npx fastmcp inspect n8n-mcp-server

# Test SSE transport (if using)
curl -N -H "Accept: text/event-stream" http://localhost:8080/sse
```

## Installation Issues

### Command Not Found: `n8n-mcp-server`

**Symptoms:**
- `command not found: n8n-mcp-server`
- Package seems installed but binary is missing

**Solutions:**

1. **Reinstall globally:**
   ```bash
   npm uninstall -g @illuminaresolutions/n8n-mcp-server
   npm install -g @illuminaresolutions/n8n-mcp-server
   ```

2. **Check npm global path:**
   ```bash
   npm config get prefix
   echo $PATH
   # Ensure npm global bin is in PATH
   ```

3. **Use npx as fallback:**
   ```bash
   npx @illuminaresolutions/n8n-mcp-server
   ```

4. **Permissions issue (Linux/macOS):**
   ```bash
   sudo npm install -g @illuminaresolutions/n8n-mcp-server
   # Or configure npm to use a different directory
   ```

### Package Installation Failures

**Symptoms:**
- `npm install` fails with dependency errors
- Permission denied errors
- Network timeout issues

**Solutions:**

1. **Clear npm cache:**
   ```bash
   npm cache clean --force
   npm install -g @illuminaresolutions/n8n-mcp-server
   ```

2. **Node.js version compatibility:**
   ```bash
   node --version  # Should be 16.x or higher
   npm --version   # Should be 8.x or higher
   ```

3. **Use different registry:**
   ```bash
   npm install -g @illuminaresolutions/n8n-mcp-server --registry https://registry.npmjs.org/
   ```

4. **Install from source:**
   ```bash
   git clone https://github.com/illuminaresolutions/n8n-mcp-server.git
   cd n8n-mcp-server
   npm install
   npm run build
   npm link
   ```

## Connection Problems

### "Client not initialized" Error

**Symptoms:**
- Tools return "Client not initialized" error
- Cannot connect to n8n instance

**Diagnostic Steps:**

1. **Check environment variables:**
   ```bash
   echo "Base URL: $N8N_BASE_URL"
   echo "API Key set: ${N8N_API_KEY:+yes}"
   ```

2. **Test n8n API directly:**
   ```bash
   curl -H "X-N8N-API-Key: $N8N_API_KEY" \
        "$N8N_BASE_URL/api/v1/workflows?limit=1"
   ```

**Solutions:**

1. **Set correct environment variables:**
   ```bash
   export N8N_BASE_URL=https://your-n8n-instance.com
   export N8N_API_KEY=your-api-key-here
   ```

2. **Check URL format:**
   ```bash
   # Correct formats:
   export N8N_BASE_URL=https://n8n.example.com
   export N8N_BASE_URL=http://localhost:5678
   
   # Incorrect (with trailing slash):
   export N8N_BASE_URL=https://n8n.example.com/
   ```

3. **Validate API key:**
   - Ensure key is active in n8n settings
   - Check key has required permissions
   - Regenerate key if necessary

### SSL/TLS Certificate Issues

**Symptoms:**
- "certificate verify failed" errors
- SSL handshake failures
- "unable to verify the first certificate"

**Solutions:**

1. **For self-signed certificates:**
   ```bash
   export NODE_TLS_REJECT_UNAUTHORIZED=0
   ```

2. **For development environments:**
   ```bash
   export N8N_MCP_VALIDATE_SSL=false
   ```

3. **Add certificate to trust store:**
   ```bash
   # Download certificate
   openssl s_client -connect your-n8n-instance.com:443 \
     -showcerts </dev/null 2>/dev/null | \
     openssl x509 -outform PEM > n8n-cert.pem
   
   # Add to Node.js trusted certificates
   export NODE_EXTRA_CA_CERTS=/path/to/n8n-cert.pem
   ```

### Network Connectivity Issues

**Symptoms:**
- Connection timeouts
- "network unreachable" errors
- Intermittent connection failures

**Diagnostic Steps:**

1. **Test basic connectivity:**
   ```bash
   ping your-n8n-instance.com
   telnet your-n8n-instance.com 443
   ```

2. **Check DNS resolution:**
   ```bash
   nslookup your-n8n-instance.com
   dig your-n8n-instance.com
   ```

3. **Test with curl:**
   ```bash
   curl -I https://your-n8n-instance.com
   ```

**Solutions:**

1. **Configure proxy settings:**
   ```bash
   export HTTP_PROXY=http://proxy.company.com:8080
   export HTTPS_PROXY=http://proxy.company.com:8080
   export NO_PROXY=localhost,127.0.0.1
   ```

2. **Increase timeout values:**
   ```bash
   export N8N_MCP_CONNECTION_TIMEOUT=60000  # 60 seconds
   ```

3. **Use different network interface:**
   ```bash
   # Bind to specific interface if needed
   export N8N_MCP_BIND_ADDRESS=192.168.1.100
   ```

## Authentication Errors

### "Invalid credentials" Error

**Symptoms:**
- Authentication failed messages
- 401 Unauthorized responses
- "Invalid API key" errors

**Solutions:**

1. **Verify API key:**
   ```bash
   # Test API key directly
   curl -H "X-N8N-API-Key: $N8N_API_KEY" \
        "$N8N_BASE_URL/api/v1/me"
   ```

2. **Check key format:**
   ```bash
   # API key should be a long string, typically starting with 'n8n_api_'
   echo "Key length: ${#N8N_API_KEY}"
   echo "Key prefix: ${N8N_API_KEY:0:10}"
   ```

3. **Regenerate API key:**
   - Log into n8n instance
   - Go to Settings → API
   - Delete old key and create new one
   - Update configuration

### Permission Denied Errors

**Symptoms:**
- "Permission denied" for specific operations
- "Admin rights required" messages
- Enterprise feature access denied

**Solutions:**

1. **Check user role in n8n:**
   ```bash
   # Test current user permissions
   curl -H "X-N8N-API-Key: $N8N_API_KEY" \
        "$N8N_BASE_URL/api/v1/me"
   ```

2. **Configure role mapping:**
   ```bash
   export N8N_MCP_DEFAULT_ROLES=admin,editor,member
   ```

3. **Use appropriate user account:**
   - Enterprise features require admin role
   - User management requires admin permissions
   - Credential access requires editor role minimum

### Authentication Cache Issues

**Symptoms:**
- Intermittent authentication failures
- "Token expired" messages
- Cached credential conflicts

**Solutions:**

1. **Clear authentication cache:**
   ```bash
   export N8N_MCP_AUTH_CACHE_DURATION=0  # Disable caching
   ```

2. **Reduce cache duration:**
   ```bash
   export N8N_MCP_AUTH_CACHE_DURATION=60000  # 1 minute
   ```

3. **Force re-authentication:**
   ```bash
   export N8N_MCP_VALIDATE_CONNECTION=true
   ```

## Transport Issues

### Stdio Transport Problems

**Symptoms:**
- Tools don't respond in Claude Desktop
- Process hangs or crashes
- No output from MCP server

**Solutions:**

1. **Check process status:**
   ```bash
   ps aux | grep n8n-mcp-server
   ```

2. **Test stdio manually:**
   ```bash
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | n8n-mcp-server
   ```

3. **Enable debug logging:**
   ```bash
   export DEBUG=mcp:*
   export N8N_MCP_LOG_LEVEL=debug
   ```

4. **Restart client application:**
   - Close Claude Desktop completely
   - Restart application
   - Check for updated configuration

### SSE Transport Issues

**Symptoms:**
- SSE server won't start
- "Port already in use" errors
- Connection refused errors
- CORS issues with web clients

**Solutions:**

1. **Check port availability:**
   ```bash
   lsof -i :8080
   netstat -tulpn | grep 8080
   ```

2. **Use different port:**
   ```bash
   export N8N_MCP_SSE_PORT=8081
   ```

3. **Configure CORS:**
   ```bash
   export N8N_MCP_SSE_CORS_ENABLED=true
   export N8N_MCP_SSE_CORS_ORIGINS="*"
   export N8N_MCP_SSE_CORS_CREDENTIALS=false
   ```

4. **Test SSE endpoint:**
   ```bash
   curl -N -H "Accept: text/event-stream" \
        -H "Cache-Control: no-cache" \
        http://localhost:8080/sse
   ```

5. **Check firewall settings:**
   ```bash
   # Linux
   sudo ufw status
   sudo ufw allow 8080
   
   # macOS
   sudo pfctl -sr | grep 8080
   ```

### SSE Connection Drops

**Symptoms:**
- Frequent disconnections
- "Connection lost" messages
- SSE stream stops unexpectedly

**Solutions:**

1. **Configure keepalive:**
   ```bash
   export N8N_MCP_SSE_KEEPALIVE_INTERVAL=30000  # 30 seconds
   ```

2. **Adjust timeout settings:**
   ```bash
   export N8N_MCP_SSE_CONNECTION_TIMEOUT=60000
   export N8N_MCP_SSE_IDLE_TIMEOUT=300000
   ```

3. **Check network stability:**
   ```bash
   ping -c 100 localhost  # Test local network
   ```

4. **Monitor server resources:**
   ```bash
   top -p $(pgrep n8n-mcp-server)
   ```

## Tool Execution Problems

### "Tool not found" Errors

**Symptoms:**
- Specific tools return "not found" errors
- Tools worked before but stopped working
- Only some tools are available

**Solutions:**

1. **List available tools:**
   ```bash
   npx fastmcp inspect n8n-mcp-server | grep -A5 "tools"
   ```

2. **Check tool registration:**
   ```bash
   export DEBUG=fastmcp:tools
   ```

3. **Verify n8n capabilities:**
   ```bash
   # Test specific n8n API endpoints
   curl -H "X-N8N-API-Key: $N8N_API_KEY" \
        "$N8N_BASE_URL/api/v1/workflows"
   ```

4. **Check enterprise features:**
   ```bash
   # Some tools require enterprise license
   curl -H "X-N8N-API-Key: $N8N_API_KEY" \
        "$N8N_BASE_URL/api/v1/license"
   ```

### Tool Parameter Validation Errors

**Symptoms:**
- "Invalid parameter" errors
- Schema validation failures
- Missing required parameters

**Solutions:**

1. **Check parameter format:**
   ```bash
   npx fastmcp inspect n8n-mcp-server
   # Review tool parameter schemas
   ```

2. **Validate JSON structure:**
   ```bash
   echo '{"workflowId": "123"}' | jq .
   ```

3. **Check parameter types:**
   - Ensure strings are quoted
   - Arrays use bracket notation
   - Boolean values are true/false

4. **Review API documentation:**
   - Check docs/api-reference.md
   - Verify required vs optional parameters

### Enterprise Feature Errors

**Symptoms:**
- "Enterprise license required" messages
- User management tools fail
- Project management unavailable

**Solutions:**

1. **Check n8n license:**
   ```bash
   curl -H "X-N8N-API-Key: $N8N_API_KEY" \
        "$N8N_BASE_URL/api/v1/license"
   ```

2. **Use community features only:**
   - Focus on workflow and execution tools
   - Avoid user management and projects
   - Skip variable management tools

3. **Upgrade n8n license:**
   - Contact n8n sales for enterprise license
   - Configure license in n8n settings

## Performance Issues

### Slow Response Times

**Symptoms:**
- Tools take long time to respond
- Timeouts during operations
- UI becomes unresponsive

**Solutions:**

1. **Optimize caching:**
   ```bash
   export N8N_MCP_RESOURCE_CACHE_DURATION=300000  # 5 minutes
   export N8N_MCP_MAX_CACHE_SIZE=100
   ```

2. **Reduce data loads:**
   ```bash
   # Use smaller limits for list operations
   # Implement pagination for large datasets
   ```

3. **Monitor system resources:**
   ```bash
   htop
   free -h
   df -h
   ```

4. **Enable connection pooling:**
   ```bash
   export N8N_MCP_CONNECTION_POOL_SIZE=10
   export N8N_MCP_CONNECTION_TIMEOUT=30000
   ```

### Memory Usage Issues

**Symptoms:**
- High memory consumption
- Out of memory errors
- System becomes slow

**Solutions:**

1. **Limit cache sizes:**
   ```bash
   export N8N_MCP_RESOURCE_MAX_ITEMS=50
   export N8N_MCP_EXECUTION_MAX_ITEMS=100
   ```

2. **Configure garbage collection:**
   ```bash
   export NODE_OPTIONS="--max-old-space-size=1024"
   ```

3. **Monitor memory usage:**
   ```bash
   ps aux | grep n8n-mcp-server
   top -p $(pgrep n8n-mcp-server)
   ```

4. **Restart server periodically:**
   ```bash
   # Add to cron for periodic restarts
   0 2 * * * pkill n8n-mcp-server && n8n-mcp-server
   ```

### Rate Limiting Issues

**Symptoms:**
- "Rate limit exceeded" errors
- Requests being rejected
- Slow tool execution

**Solutions:**

1. **Configure rate limits:**
   ```bash
   export N8N_MCP_RATE_LIMIT=1000      # Per minute
   export N8N_MCP_BURST_LIMIT=50       # Burst requests
   ```

2. **Implement request throttling:**
   ```bash
   export N8N_MCP_REQUEST_DELAY=100    # Milliseconds between requests
   ```

3. **Monitor rate limit status:**
   ```bash
   curl -I -H "X-N8N-API-Key: $N8N_API_KEY" \
        "$N8N_BASE_URL/api/v1/workflows"
   # Check X-RateLimit-* headers
   ```

## Client-Specific Issues

### Claude Desktop Issues

**Symptoms:**
- MCP server not loading in Claude Desktop
- Tools not appearing in Claude
- Configuration not taking effect

**Solutions:**

1. **Verify configuration location:**
   ```bash
   # macOS
   ls -la ~/Library/Application\ Support/Claude/claude_desktop_config.json
   
   # Windows
   dir %APPDATA%\Claude\claude_desktop_config.json
   
   # Linux
   ls -la ~/.config/Claude/claude_desktop_config.json
   ```

2. **Validate JSON syntax:**
   ```bash
   cat ~/Library/Application\ Support/Claude/claude_desktop_config.json | jq .
   ```

3. **Check Claude Desktop logs:**
   ```bash
   # macOS
   tail -f ~/Library/Logs/Claude/mcp*.log
   
   # Windows
   tail -f %APPDATA%\Claude\logs\mcp*.log
   ```

4. **Restart Claude Desktop:**
   - Completely quit application
   - Clear any cached data
   - Restart and test

5. **Test configuration manually:**
   ```bash
   export N8N_BASE_URL=https://your-n8n-instance.com
   export N8N_API_KEY=your-api-key
   n8n-mcp-server
   ```

### Cline (VS Code) Issues

**Symptoms:**
- MCP server not connecting in VS Code
- Extension errors or crashes
- Tools not available in Cline

**Solutions:**

1. **Check Cline extension logs:**
   - Open VS Code Developer Tools
   - Check Console for MCP errors
   - Look for connection failures

2. **Verify MCP server configuration:**
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

3. **Test server separately:**
   ```bash
   export N8N_BASE_URL=https://your-n8n-instance.com
   export N8N_API_KEY=your-api-key
   echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}' | n8n-mcp-server
   ```

4. **Reload VS Code extension:**
   - Reload Cline extension
   - Restart VS Code completely
   - Check extension permissions

### Custom MCP Client Issues

**Symptoms:**
- Custom client cannot connect
- Protocol errors or mismatches
- Unexpected responses

**Solutions:**

1. **Verify MCP protocol version:**
   ```javascript
   // Ensure client supports MCP 2024-11-05 or later
   const client = new Client({
     name: "custom-client",
     version: "1.0.0"
   });
   ```

2. **Check transport configuration:**
   ```javascript
   // For SSE transport
   const transport = new SSEClientTransport(
     new URL("http://localhost:8080/sse")
   );
   ```

3. **Enable debug logging:**
   ```javascript
   process.env.DEBUG = 'mcp:*';
   ```

4. **Test with reference client:**
   ```bash
   npx @modelcontextprotocol/inspector http://localhost:8080/sse
   ```

## Advanced Debugging

### Enable Debug Logging

**Comprehensive logging setup:**

```bash
# Enable all debugging
export DEBUG=fastmcp:*,mcp:*,n8n-mcp:*
export N8N_MCP_LOG_LEVEL=debug
export N8N_MCP_LOG_FORMAT=json

# FastMCP specific debugging
export DEBUG=fastmcp:server,fastmcp:transport,fastmcp:tools

# File-based logging
export N8N_MCP_LOG_FILE=/tmp/n8n-mcp-debug.log
```

### Network Traffic Analysis

**Capture and analyze network traffic:**

```bash
# Monitor HTTP requests
sudo tcpdump -i any -A 'port 80 or port 443'

# Use mitmproxy for HTTPS inspection
pip install mitmproxy
mitmproxy -p 8080

# Configure proxy for debugging
export HTTPS_PROXY=http://localhost:8080
```

### Process Monitoring

**Monitor server processes:**

```bash
# Watch process resources
watch -n 1 'ps aux | grep n8n-mcp-server'

# Monitor file descriptors
lsof -p $(pgrep n8n-mcp-server)

# Check memory leaks
valgrind --tool=memcheck n8n-mcp-server

# Profile CPU usage
perf record -g n8n-mcp-server
perf report
```

### Database/State Analysis

**Examine server state:**

```bash
# Check cache contents
export N8N_MCP_CACHE_DEBUG=true

# Monitor authentication state
export N8N_MCP_AUTH_DEBUG=true

# Trace resource access
export N8N_MCP_RESOURCE_DEBUG=true
```

### Configuration Validation

**Deep configuration analysis:**

```bash
# Dump all environment variables
env | grep N8N_MCP | sort

# Validate against schema
n8n-mcp-server --validate-config --verbose

# Test all components
n8n-mcp-server --self-test
```

## Getting Help

### Collect Diagnostic Information

**Before reporting issues, collect:**

1. **System Information:**
   ```bash
   uname -a
   node --version
   npm --version
   n8n-mcp-server --version
   ```

2. **Configuration:**
   ```bash
   env | grep N8N_MCP | sort
   cat ~/.config/Claude/claude_desktop_config.json
   ```

3. **Logs:**
   ```bash
   tail -100 ~/Library/Logs/Claude/mcp*.log
   ```

4. **Network Test:**
   ```bash
   curl -v -H "X-N8N-API-Key: $N8N_API_KEY" \
        "$N8N_BASE_URL/api/v1/workflows?limit=1"
   ```

### Support Channels

- **GitHub Issues**: [Report bugs and request features](https://github.com/illuminaresolutions/n8n-mcp-server/issues)
- **n8n Community**: [n8n Community Forum](https://community.n8n.io)
- **FastMCP Documentation**: [FastMCP Framework Docs](https://fastmcp.org)
- **MCP Protocol**: [Official MCP Specification](https://modelcontextprotocol.io)

### Issue Template

**When reporting issues, include:**

```
## Environment
- OS: [macOS/Windows/Linux version]
- Node.js: [version]
- n8n-mcp-server: [version]
- Client: [Claude Desktop/Cline/Custom]

## Configuration
- Transport: [stdio/sse]
- Authentication: [enabled/disabled]
- n8n Version: [version]

## Problem Description
[Detailed description of the issue]

## Steps to Reproduce
1. [First step]
2. [Second step]
3. [etc.]

## Expected Behavior
[What should happen]

## Actual Behavior
[What actually happens]

## Logs
[Include relevant log output]

## Additional Context
[Any other relevant information]
```

---

For more information, see:
- [Configuration Guide](configuration.md)
- [API Reference](api-reference.md)
- [Migration Guide](migration-guide.md)