/**
 * Credential Testing Tools for n8n MCP Server
 *
 * Provides comprehensive tools for testing credential validity, OAuth2 token management,
 * and authentication flow validation.
 */

/* eslint-disable no-undef */
declare const fetch: typeof globalThis.fetch;
declare const AbortController: typeof globalThis.AbortController;
declare const AbortSignal: typeof globalThis.AbortSignal;

import { z } from 'zod';
import { UserError } from 'fastmcp';
import { setTimeout, clearTimeout } from 'timers';
import { N8nClient } from '../client/n8nClient.js';
import { OAuth2Handler, OAuth2Config, OAuth2CallbackResult } from '../auth/oauth2Handler.js';
import { N8nAuthProvider } from '../auth/n8nAuth.js';

// Zod schemas for validation
const TestCredentialSchema = z.object({
  credentialType: z.string().min(1, 'Credential type is required'),
  credentialData: z.record(z.string(), z.any()),
  testEndpoint: z.string().url().optional(),
  timeout: z.number().min(1000).max(30000).optional().default(10000),
});

const TestN8nApiKeySchema = z.object({
  baseUrl: z.string().url('Must be a valid URL'),
  apiKey: z.string().min(1, 'API key is required'),
  testOperations: z.array(z.string()).optional().default(['workflows', 'executions']),
});

const OAuth2InitSchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  clientId: z.string().min(1, 'Client ID is required'),
  clientSecret: z.string().min(1, 'Client secret is required'),
  authUrl: z.string().url('Auth URL must be valid'),
  tokenUrl: z.string().url('Token URL must be valid'),
  userInfoUrl: z.string().url().optional(),
  redirectUri: z.string().url('Redirect URI must be valid'),
  scopes: z.array(z.string()).min(1, 'At least one scope is required'),
  extraParams: z.record(z.string(), z.string()).optional(),
  enablePKCE: z.boolean().optional().default(true),
});

const OAuth2AuthorizeSchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  sessionId: z.string().optional(),
  extraParams: z.record(z.string(), z.string()).optional(),
  metadata: z.record(z.string(), z.any()).optional(),
});

const OAuth2CallbackSchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  code: z.string().optional(),
  state: z.string().optional(),
  error: z.string().optional(),
  error_description: z.string().optional(),
  error_uri: z.string().optional(),
});

const OAuth2RefreshSchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  userId: z.string().min(1, 'User ID is required'),
});

const OAuth2TokenValidationSchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  userId: z.string().min(1, 'User ID is required'),
  bufferSeconds: z.number().min(0).max(3600).optional().default(300),
});

const OAuth2RevokeSchema = z.object({
  provider: z.string().min(1, 'Provider is required'),
  userId: z.string().min(1, 'User ID is required'),
});

const BatchCredentialTestSchema = z.object({
  credentials: z
    .array(
      z.object({
        id: z.string(),
        type: z.string(),
        data: z.record(z.string(), z.any()),
        testEndpoint: z.string().url().optional(),
      })
    )
    .min(1)
    .max(10), // Limit batch size
  timeout: z.number().min(1000).max(30000).optional().default(10000),
  parallel: z.boolean().optional().default(false),
});

// Note: Security audit schema reserved for future implementation
// const CredentialSecurityAuditSchema = z.object({
//   credentialId: z.string().min(1, 'Credential ID is required'),
//   checks: z.array(z.enum([
//     'encryption',
//     'expiry',
//     'permissions',
//     'usage',
//     'sharing',
//     'rotation'
//   ])).optional().default(['encryption', 'expiry', 'permissions']),
// });

// Global OAuth2 handler instance
let oauth2Handler: OAuth2Handler | null = null;

// Function to get the OAuth2 handler instance
const getOAuth2Handler = () => {
  if (!oauth2Handler) {
    oauth2Handler = new OAuth2Handler();
  }
  return oauth2Handler;
};

// Function to get the n8n auth provider
const getN8nAuthProvider = () => {
  return new N8nAuthProvider({
    required: false,
    validateConnection: true,
  });
};

// Tool registration function
export function createCredentialTestingTools(getClient: () => N8nClient | null, server: any) {
  // Test n8n API key tool
  server.addTool({
    name: 'test-n8n-api-key',
    description: 'Test n8n API key validity and permissions by performing various operations.',
    parameters: TestN8nApiKeySchema,
    annotations: {
      title: 'Test n8n API Key',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof TestN8nApiKeySchema>) => {
      try {
        const authProvider = getN8nAuthProvider();

        // Create test context
        const context = {
          headers: {
            'x-n8n-base-url': args.baseUrl,
            'x-n8n-api-key': args.apiKey,
          },
        };

        // Test authentication
        const authResult = await authProvider.authenticate(context);

        if (!authResult.success) {
          return (
            `❌ **n8n API Key Test Failed**\n\n` +
            `- **Base URL:** ${args.baseUrl}\n` +
            `- **Error:** ${authResult.error}\n\n` +
            `The API key is invalid or the n8n instance is not accessible.`
          );
        }

        // Create temporary client for testing
        const testClient = new N8nClient(args.baseUrl, args.apiKey);
        const results: string[] = [];
        const permissions: Record<string, boolean> = {};

        // Test specific operations
        for (const operation of args.testOperations) {
          try {
            switch (operation) {
              case 'workflows':
                await testClient.getWorkflows({ limit: 1 });
                permissions.workflows = true;
                results.push('✅ Can access workflows');
                break;

              case 'executions':
                await testClient.getExecutions({ limit: 1 });
                permissions.executions = true;
                results.push('✅ Can access executions');
                break;

              case 'credentials':
                await testClient.getCredentials({ limit: 1 });
                permissions.credentials = true;
                results.push('✅ Can access credentials');
                break;

              case 'users':
                await testClient.getUsers({ limit: 1 });
                permissions.users = true;
                results.push('✅ Can access users (Enterprise)');
                break;

              case 'projects':
                await testClient.getProjects({ limit: 1 });
                permissions.projects = true;
                results.push('✅ Can access projects (Enterprise)');
                break;

              default:
                results.push(`⚠️ Unknown operation: ${operation}`);
            }
          } catch (error) {
            permissions[operation] = false;
            results.push(
              `❌ Cannot access ${operation}: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }

        const user = authResult.user!;
        const hasEnterpriseFeatures = permissions.users || permissions.projects;

        return (
          `✅ **n8n API Key Test Successful**\n\n` +
          `**Connection Details:**\n` +
          `- **Base URL:** ${args.baseUrl}\n` +
          `- **User ID:** ${user.id}\n` +
          `- **User Type:** ${hasEnterpriseFeatures ? 'Enterprise' : 'Community'}\n` +
          `- **Roles:** ${user.roles.join(', ')}\n\n` +
          `**Permission Test Results:**\n` +
          results.join('\n') +
          '\n\n' +
          `**Available Features:**\n` +
          `- Community Features: ${user.permissions.community ? '✅' : '❌'}\n` +
          `- Enterprise Features: ${user.permissions.enterprise ? '✅' : '❌'}\n` +
          `- Workflow Management: ${user.permissions.workflows ? '✅' : '❌'}\n` +
          `- Execution Access: ${user.permissions.executions ? '✅' : '❌'}\n` +
          `- Credential Management: ${user.permissions.credentials ? '✅' : '❌'}\n` +
          `- User Management: ${user.permissions.users ? '✅' : '❌'}\n` +
          `- Audit Access: ${user.permissions.audit ? '✅' : '❌'}`
        );
      } catch (error) {
        throw new UserError(
          `n8n API key test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Initialize OAuth2 provider tool
  server.addTool({
    name: 'init-oauth2-provider',
    description: 'Initialize OAuth2 provider configuration for authentication testing.',
    parameters: OAuth2InitSchema,
    annotations: {
      title: 'Initialize OAuth2 Provider',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof OAuth2InitSchema>) => {
      try {
        const handler = getOAuth2Handler();

        const config: OAuth2Config = {
          provider: args.provider,
          clientId: args.clientId,
          clientSecret: args.clientSecret,
          authUrl: args.authUrl,
          tokenUrl: args.tokenUrl,
          userInfoUrl: args.userInfoUrl,
          redirectUri: args.redirectUri,
          scopes: args.scopes,
          extraParams: args.extraParams,
          pkce: args.enablePKCE ? { enabled: true, challengeMethod: 'S256' } : undefined,
          refreshSettings: {
            autoRefresh: true,
            refreshBuffer: 300,
          },
        };

        handler.registerProvider(config);

        return (
          `✅ **OAuth2 Provider Initialized**\n\n` +
          `- **Provider:** ${args.provider}\n` +
          `- **Client ID:** ${args.clientId.substring(0, 8)}...\n` +
          `- **Auth URL:** ${args.authUrl}\n` +
          `- **Token URL:** ${args.tokenUrl}\n` +
          `- **User Info URL:** ${args.userInfoUrl || 'Not configured'}\n` +
          `- **Redirect URI:** ${args.redirectUri}\n` +
          `- **Scopes:** ${args.scopes.join(', ')}\n` +
          `- **PKCE Enabled:** ${args.enablePKCE ? 'Yes' : 'No'}\n\n` +
          `The OAuth2 provider is now ready for authentication flows.`
        );
      } catch (error) {
        throw new UserError(
          `Failed to initialize OAuth2 provider: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Generate OAuth2 authorization URL tool
  server.addTool({
    name: 'oauth2-authorize',
    description: 'Generate OAuth2 authorization URL to start authentication flow.',
    parameters: OAuth2AuthorizeSchema,
    annotations: {
      title: 'Generate OAuth2 Authorization URL',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof OAuth2AuthorizeSchema>) => {
      try {
        const handler = getOAuth2Handler();

        const { url, session } = handler.generateAuthUrl(args.provider, {
          sessionId: args.sessionId,
          extraParams: args.extraParams,
          metadata: args.metadata,
        });

        return (
          `🔗 **OAuth2 Authorization URL Generated**\n\n` +
          `- **Provider:** ${args.provider}\n` +
          `- **Session ID:** ${session.sessionId}\n` +
          `- **State:** ${session.state}\n` +
          `- **Expires:** ${new Date(session.expiresAt).toLocaleString()}\n` +
          `- **PKCE:** ${session.codeChallenge ? 'Enabled' : 'Disabled'}\n\n` +
          `**Authorization URL:**\n` +
          `\`\`\`\n${url}\n\`\`\`\n\n` +
          `🌐 Visit this URL to start the OAuth2 authentication flow. ` +
          `The session will expire in 15 minutes.`
        );
      } catch (error) {
        throw new UserError(
          `Failed to generate OAuth2 authorization URL: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Handle OAuth2 callback tool
  server.addTool({
    name: 'oauth2-callback',
    description: 'Handle OAuth2 callback and exchange authorization code for tokens.',
    parameters: OAuth2CallbackSchema,
    annotations: {
      title: 'Handle OAuth2 Callback',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof OAuth2CallbackSchema>) => {
      try {
        const handler = getOAuth2Handler();

        const result: OAuth2CallbackResult = await handler.handleCallback(args.provider, {
          code: args.code,
          state: args.state,
          error: args.error,
          error_description: args.error_description,
          error_uri: args.error_uri,
        });

        if (!result.success) {
          return (
            `❌ **OAuth2 Callback Failed**\n\n` +
            `- **Provider:** ${args.provider}\n` +
            `- **Error:** ${result.error}\n` +
            (result.errorDetails
              ? `- **Error Code:** ${result.errorDetails.code}\n` +
                `- **Description:** ${result.errorDetails.description}\n` +
                (result.errorDetails.uri ? `- **More Info:** ${result.errorDetails.uri}\n` : '')
              : '') +
            `\nThe OAuth2 authentication flow was not completed successfully.`
          );
        }

        const tokens = result.tokens!;
        const userInfo = result.userInfo!;

        return (
          `✅ **OAuth2 Callback Successful**\n\n` +
          `- **Provider:** ${args.provider}\n` +
          `- **User ID:** ${userInfo.id}\n` +
          `- **User Name:** ${userInfo.name || 'Unknown'}\n` +
          `- **User Email:** ${userInfo.email || 'Not provided'}\n\n` +
          `**Token Information:**\n` +
          `- **Token Type:** ${tokens.tokenType}\n` +
          `- **Scopes:** ${tokens.scopes.join(', ')}\n` +
          `- **Has Refresh Token:** ${tokens.refreshToken ? 'Yes' : 'No'}\n` +
          `- **Expires:** ${tokens.expiresAt ? new Date(tokens.expiresAt).toLocaleString() : 'Never'}\n\n` +
          `**Access Token (first 20 chars):** \`${tokens.accessToken.substring(0, 20)}...\`\n\n` +
          `🎉 OAuth2 authentication completed successfully! Tokens have been stored for future use.`
        );
      } catch (error) {
        throw new UserError(
          `Failed to handle OAuth2 callback: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Refresh OAuth2 tokens tool
  server.addTool({
    name: 'oauth2-refresh-tokens',
    description: 'Refresh OAuth2 access tokens using refresh token.',
    parameters: OAuth2RefreshSchema,
    annotations: {
      title: 'Refresh OAuth2 Tokens',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof OAuth2RefreshSchema>) => {
      try {
        const handler = getOAuth2Handler();

        const newTokens = await handler.refreshTokens(args.provider, args.userId);

        if (!newTokens) {
          return (
            `❌ **Token Refresh Failed**\n\n` +
            `- **Provider:** ${args.provider}\n` +
            `- **User ID:** ${args.userId}\n\n` +
            `Unable to refresh tokens. This could be due to:\n` +
            `- No refresh token available\n` +
            `- Refresh token has expired\n` +
            `- OAuth2 provider rejected the refresh request\n` +
            `- Network connectivity issues`
          );
        }

        return (
          `✅ **Tokens Refreshed Successfully**\n\n` +
          `- **Provider:** ${args.provider}\n` +
          `- **User ID:** ${args.userId}\n` +
          `- **Token Type:** ${newTokens.tokenType}\n` +
          `- **Scopes:** ${newTokens.scopes.join(', ')}\n` +
          `- **Expires:** ${newTokens.expiresAt ? new Date(newTokens.expiresAt).toLocaleString() : 'Never'}\n` +
          `- **Refreshed At:** ${new Date().toLocaleString()}\n\n` +
          `**New Access Token (first 20 chars):** \`${newTokens.accessToken.substring(0, 20)}...\`\n\n` +
          `🔄 Tokens have been refreshed and updated in storage.`
        );
      } catch (error) {
        throw new UserError(
          `Failed to refresh OAuth2 tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Validate OAuth2 tokens tool
  server.addTool({
    name: 'oauth2-validate-tokens',
    description: 'Check if OAuth2 tokens are valid and not expired.',
    parameters: OAuth2TokenValidationSchema,
    annotations: {
      title: 'Validate OAuth2 Tokens',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof OAuth2TokenValidationSchema>) => {
      try {
        const handler = getOAuth2Handler();

        const tokens = handler.getTokens(args.provider, args.userId);

        if (!tokens) {
          return (
            `❌ **No Tokens Found**\n\n` +
            `- **Provider:** ${args.provider}\n` +
            `- **User ID:** ${args.userId}\n\n` +
            `No OAuth2 tokens found for this user and provider combination.`
          );
        }

        const isValid = handler.areTokensValid(tokens, args.bufferSeconds);
        const now = Date.now();
        const timeToExpiry = tokens.expiresAt ? tokens.expiresAt - now : null;

        return (
          `${isValid ? '✅' : '❌'} **Token Validation Result**\n\n` +
          `- **Provider:** ${args.provider}\n` +
          `- **User ID:** ${args.userId}\n` +
          `- **Token Type:** ${tokens.tokenType}\n` +
          `- **Scopes:** ${tokens.scopes.join(', ')}\n` +
          `- **Has Refresh Token:** ${tokens.refreshToken ? 'Yes' : 'No'}\n` +
          `- **Valid:** ${isValid ? 'Yes' : 'No'}\n` +
          (tokens.expiresAt
            ? `- **Expires:** ${new Date(tokens.expiresAt).toLocaleString()}\n` +
              `- **Time to Expiry:** ${timeToExpiry ? Math.floor(timeToExpiry / 1000) + ' seconds' : 'Expired'}\n`
            : `- **Expires:** Never\n`) +
          `- **Buffer Time:** ${args.bufferSeconds} seconds\n\n` +
          (isValid
            ? `✅ Tokens are valid and can be used for authentication.`
            : `❌ Tokens are invalid or expired. ${tokens.refreshToken ? 'Consider refreshing tokens.' : 'Re-authentication required.'}`)
        );
      } catch (error) {
        throw new UserError(
          `Failed to validate OAuth2 tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Revoke OAuth2 tokens tool
  server.addTool({
    name: 'oauth2-revoke-tokens',
    description: 'Revoke OAuth2 tokens and remove them from storage.',
    parameters: OAuth2RevokeSchema,
    annotations: {
      title: 'Revoke OAuth2 Tokens',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof OAuth2RevokeSchema>) => {
      try {
        const handler = getOAuth2Handler();

        const success = await handler.revokeTokens(args.provider, args.userId);

        return (
          `${success ? '✅' : '⚠️'} **Token Revocation ${success ? 'Successful' : 'Completed'}**\n\n` +
          `- **Provider:** ${args.provider}\n` +
          `- **User ID:** ${args.userId}\n\n` +
          (success
            ? `Tokens have been revoked with the provider and removed from local storage.`
            : `Tokens have been removed from local storage. Provider revocation may have failed.`) +
          `\n\n🔒 User will need to re-authenticate to access OAuth2-protected resources.`
        );
      } catch (error) {
        throw new UserError(
          `Failed to revoke OAuth2 tokens: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // List OAuth2 sessions tool
  server.addTool({
    name: 'list-oauth2-sessions',
    description: 'List all active OAuth2 authentication sessions.',
    parameters: z.object({}),
    annotations: {
      title: 'List OAuth2 Sessions',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async () => {
      try {
        const handler = getOAuth2Handler();
        const sessions = handler.getActiveSessions();

        if (sessions.length === 0) {
          return '📭 No active OAuth2 sessions found.';
        }

        let result = `📋 **Active OAuth2 Sessions (${sessions.length})**\n\n`;

        sessions.forEach((session, index) => {
          const timeLeft = session.expiresAt - Date.now();
          result += `${index + 1}. **${session.provider}**\n`;
          result += `   - Session ID: ${session.sessionId}\n`;
          result += `   - State: ${session.state}\n`;
          result += `   - Created: ${new Date(session.createdAt).toLocaleString()}\n`;
          result += `   - Expires: ${new Date(session.expiresAt).toLocaleString()}\n`;
          result += `   - Time Left: ${Math.floor(timeLeft / 1000)} seconds\n`;
          result += `   - PKCE: ${session.codeChallenge ? 'Enabled' : 'Disabled'}\n`;
          if (session.metadata && Object.keys(session.metadata).length > 0) {
            result += `   - Metadata: ${JSON.stringify(session.metadata)}\n`;
          }
          result += '\n';
        });

        return result;
      } catch (error) {
        throw new UserError(
          `Failed to list OAuth2 sessions: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Generic credential test tool
  server.addTool({
    name: 'test-credential',
    description: 'Test generic credential validity by making a test request to specified endpoint.',
    parameters: TestCredentialSchema,
    annotations: {
      title: 'Test Generic Credential',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof TestCredentialSchema>) => {
      try {
        if (!args.testEndpoint) {
          return (
            `⚠️ **Credential Test Skipped**\n\n` +
            `- **Type:** ${args.credentialType}\n` +
            `- **Reason:** No test endpoint provided\n\n` +
            `To test this credential, please provide a \`testEndpoint\` URL.`
          );
        }

        // Prepare request based on credential type
        const headers: Record<string, string> = {
          'User-Agent': 'n8n-mcp-server/2.0.0',
          Accept: 'application/json',
        };

        // Add authentication based on credential type
        if (args.credentialType === 'api-key') {
          if (args.credentialData.apiKey) {
            headers['Authorization'] = `Bearer ${args.credentialData.apiKey}`;
          } else if (args.credentialData.key) {
            headers['X-API-Key'] = args.credentialData.key;
          }
        } else if (args.credentialType === 'basic-auth') {
          const credentials = Buffer.from(
            `${args.credentialData.username}:${args.credentialData.password}`
          ).toString('base64');
          headers['Authorization'] = `Basic ${credentials}`;
        } else if (args.credentialType === 'oauth2') {
          if (args.credentialData.accessToken) {
            headers['Authorization'] = `Bearer ${args.credentialData.accessToken}`;
          }
        }

        // Make test request
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), args.timeout);

        try {
          const response = await fetch(args.testEndpoint, {
            method: 'GET',
            headers,
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          const isSuccess = response.status >= 200 && response.status < 300;
          const responseText = await response.text().catch(() => 'Unable to read response');

          return (
            `${isSuccess ? '✅' : '❌'} **Credential Test ${isSuccess ? 'Successful' : 'Failed'}**\n\n` +
            `- **Type:** ${args.credentialType}\n` +
            `- **Test Endpoint:** ${args.testEndpoint}\n` +
            `- **Status Code:** ${response.status} ${response.statusText}\n` +
            `- **Response Time:** ${Date.now() - Date.now()} ms\n` +
            `- **Content Type:** ${response.headers.get('content-type') || 'Unknown'}\n\n` +
            (isSuccess
              ? `✅ The credential is valid and working correctly.`
              : `❌ The credential test failed. This could indicate:\n` +
                `- Invalid credentials\n` +
                `- Expired tokens\n` +
                `- Insufficient permissions\n` +
                `- Service unavailable\n\n` +
                `**Response:** ${responseText.substring(0, 500)}${responseText.length > 500 ? '...' : ''}`)
          );
        } catch (error) {
          clearTimeout(timeoutId);
          throw error;
        }
      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          return (
            `⏱️ **Credential Test Timeout**\n\n` +
            `- **Type:** ${args.credentialType}\n` +
            `- **Test Endpoint:** ${args.testEndpoint}\n` +
            `- **Timeout:** ${args.timeout}ms\n\n` +
            `The test request timed out. This could indicate:\n` +
            `- Network connectivity issues\n` +
            `- Slow service response\n` +
            `- Invalid endpoint URL`
          );
        }

        throw new UserError(
          `Credential test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });

  // Batch credential test tool
  server.addTool({
    name: 'batch-test-credentials',
    description: 'Test multiple credentials in batch (sequential or parallel).',
    parameters: BatchCredentialTestSchema,
    annotations: {
      title: 'Batch Test Credentials',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof BatchCredentialTestSchema>) => {
      try {
        const results: Array<{
          id: string;
          type: string;
          success: boolean;
          status?: number;
          error?: string;
          responseTime?: number;
        }> = [];

        const testCredential = async (cred: (typeof args.credentials)[0]) => {
          const startTime = Date.now();
          try {
            if (!cred.testEndpoint) {
              return {
                id: cred.id,
                type: cred.type,
                success: false,
                error: 'No test endpoint provided',
              };
            }

            // Prepare headers (simplified version of individual test)
            const headers: Record<string, string> = {
              'User-Agent': 'n8n-mcp-server/2.0.0',
              Accept: 'application/json',
            };

            if (cred.type === 'api-key' && cred.data.apiKey) {
              headers['Authorization'] = `Bearer ${cred.data.apiKey}`;
            } else if (cred.type === 'basic-auth') {
              const credentials = Buffer.from(
                `${cred.data.username}:${cred.data.password}`
              ).toString('base64');
              headers['Authorization'] = `Basic ${credentials}`;
            }

            const response = await fetch(cred.testEndpoint, {
              method: 'GET',
              headers,
              signal: AbortSignal.timeout(args.timeout),
            });

            return {
              id: cred.id,
              type: cred.type,
              success: response.status >= 200 && response.status < 300,
              status: response.status,
              responseTime: Date.now() - startTime,
            };
          } catch (error) {
            return {
              id: cred.id,
              type: cred.type,
              success: false,
              error: error instanceof Error ? error.message : 'Unknown error',
              responseTime: Date.now() - startTime,
            };
          }
        };

        // Execute tests
        if (args.parallel) {
          const promises = args.credentials.map(testCredential);
          results.push(...(await Promise.all(promises)));
        } else {
          for (const cred of args.credentials) {
            const result = await testCredential(cred);
            results.push(result);
          }
        }

        // Generate summary
        const successful = results.filter(r => r.success).length;
        const failed = results.length - successful;
        const avgResponseTime =
          results.filter(r => r.responseTime).reduce((sum, r) => sum + (r.responseTime || 0), 0) /
          results.length;

        let output = `📊 **Batch Credential Test Results**\n\n`;
        output += `- **Total Tested:** ${results.length}\n`;
        output += `- **Successful:** ${successful}\n`;
        output += `- **Failed:** ${failed}\n`;
        output += `- **Success Rate:** ${Math.round((successful / results.length) * 100)}%\n`;
        output += `- **Execution Mode:** ${args.parallel ? 'Parallel' : 'Sequential'}\n`;
        output += `- **Average Response Time:** ${Math.round(avgResponseTime)}ms\n\n`;

        output += `**Detailed Results:**\n`;
        results.forEach((result, index) => {
          output += `${index + 1}. **${result.id}** (${result.type})\n`;
          output += `   - Status: ${result.success ? '✅ Success' : '❌ Failed'}\n`;
          if (result.status) {
            output += `   - HTTP Status: ${result.status}\n`;
          }
          if (result.responseTime) {
            output += `   - Response Time: ${result.responseTime}ms\n`;
          }
          if (result.error) {
            output += `   - Error: ${result.error}\n`;
          }
          output += '\n';
        });

        return output;
      } catch (error) {
        throw new UserError(
          `Batch credential test failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
  });
}

// Helper function to format response time (for future use)
// function formatResponseTime(ms: number): string {
//   if (ms < 1000) {
//     return `${ms}ms`;
//   }
//   return `${(ms / 1000).toFixed(2)}s`;
// }
