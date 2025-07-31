/**
 * Transport Configuration for n8n MCP Server
 *
 * Provides transport type detection and configuration for different deployment scenarios.
 * Supports both stdio (local development) and SSE (remote/web access) transports.
 */

import { z } from 'zod';

// Transport configuration schema
export const TransportConfigSchema = z.object({
  type: z.enum(['stdio', 'sse']).default('stdio'),
  sse: z
    .object({
      port: z.number().min(1024).max(65535).default(8080),
      endpoint: z.string().default('/sse'),
      host: z.string().default('localhost'),
      cors: z
        .object({
          enabled: z.boolean().default(true),
          origins: z.array(z.string()).default(['*']),
          credentials: z.boolean().default(false),
        })
        .default({}),
      healthCheck: z
        .object({
          enabled: z.boolean().default(true),
          endpoint: z.string().default('/health'),
        })
        .default({}),
    })
    .optional(),
});

export type TransportConfig = z.infer<typeof TransportConfigSchema>;

/**
 * Default transport configurations for different environments
 */
export const DEFAULT_CONFIGS = {
  development: {
    type: 'stdio' as const,
  },
  production: {
    type: 'sse' as const,
    sse: {
      port: 8080,
      endpoint: '/sse',
      host: '0.0.0.0',
      cors: {
        enabled: true,
        origins: ['*'],
        credentials: false,
      },
      healthCheck: {
        enabled: true,
        endpoint: '/health',
      },
    },
  },
  web: {
    type: 'sse' as const,
    sse: {
      port: process.env.PORT ? parseInt(process.env.PORT) : 3000,
      endpoint: '/sse',
      host: '0.0.0.0',
      cors: {
        enabled: true,
        origins: process.env.CORS_ORIGINS?.split(',') || ['*'],
        credentials: true,
      },
      healthCheck: {
        enabled: true,
        endpoint: '/health',
      },
    },
  },
} as const;

/**
 * Detect appropriate transport configuration based on environment
 */
export function detectTransportConfig(): TransportConfig {
  // Check environment variables for explicit transport type
  const transportType = process.env.N8N_MCP_TRANSPORT as 'stdio' | 'sse' | undefined;

  if (transportType === 'sse') {
    return DEFAULT_CONFIGS.web;
  }

  if (transportType === 'stdio') {
    return DEFAULT_CONFIGS.development;
  }

  // Auto-detect based on environment
  if (process.env.NODE_ENV === 'production' || process.env.PORT) {
    return DEFAULT_CONFIGS.web;
  }

  // Check if running in a web environment (Railway, Vercel, etc.)
  if (process.env.RAILWAY_ENVIRONMENT || process.env.VERCEL || process.env.RENDER) {
    return DEFAULT_CONFIGS.web;
  }

  // Default to stdio for local development
  return DEFAULT_CONFIGS.development;
}

/**
 * Validate and normalize transport configuration
 */
export function validateTransportConfig(config: unknown): TransportConfig {
  return TransportConfigSchema.parse(config);
}

/**
 * Get SSE server URL from configuration
 */
export function getServerUrl(config: TransportConfig): string | null {
  if (config.type !== 'sse' || !config.sse) {
    return null;
  }

  const { host, port, endpoint } = config.sse;
  const protocol = port === 443 ? 'https' : 'http';
  return `${protocol}://${host}:${port}${endpoint}`;
}

/**
 * Environment variable configuration helpers
 */
export const ENV_CONFIG = {
  // Transport type selection
  TRANSPORT_TYPE: 'N8N_MCP_TRANSPORT', // 'stdio' | 'sse'

  // SSE configuration
  SSE_PORT: 'N8N_MCP_SSE_PORT',
  SSE_HOST: 'N8N_MCP_SSE_HOST',
  SSE_ENDPOINT: 'N8N_MCP_SSE_ENDPOINT',

  // CORS configuration
  CORS_ORIGINS: 'N8N_MCP_CORS_ORIGINS', // comma-separated list
  CORS_CREDENTIALS: 'N8N_MCP_CORS_CREDENTIALS', // 'true' | 'false'

  // Health check configuration
  HEALTH_CHECK_ENABLED: 'N8N_MCP_HEALTH_CHECK_ENABLED',
  HEALTH_CHECK_ENDPOINT: 'N8N_MCP_HEALTH_CHECK_ENDPOINT',
} as const;

/**
 * Parse transport configuration from environment variables
 */
export function parseConfigFromEnv(): Partial<TransportConfig> {
  const config: Partial<TransportConfig> = {};

  // Transport type
  if (process.env[ENV_CONFIG.TRANSPORT_TYPE]) {
    config.type = process.env[ENV_CONFIG.TRANSPORT_TYPE] as 'stdio' | 'sse';
  }

  // SSE configuration - create if any SSE-related environment variables are set
  const hasAnySSEConfig =
    ENV_CONFIG.SSE_PORT in process.env ||
    ENV_CONFIG.SSE_HOST in process.env ||
    ENV_CONFIG.SSE_ENDPOINT in process.env ||
    ENV_CONFIG.CORS_ORIGINS in process.env ||
    ENV_CONFIG.CORS_CREDENTIALS in process.env ||
    ENV_CONFIG.HEALTH_CHECK_ENABLED in process.env ||
    ENV_CONFIG.HEALTH_CHECK_ENDPOINT in process.env;

  if (config.type === 'sse' || hasAnySSEConfig) {
    const ssePortEnv = process.env[ENV_CONFIG.SSE_PORT];
    config.sse = {
      port: ssePortEnv ? parseInt(ssePortEnv) : 8080,
      host: process.env[ENV_CONFIG.SSE_HOST] || 'localhost',
      endpoint: process.env[ENV_CONFIG.SSE_ENDPOINT] || '/sse',
      cors: {
        enabled: process.env[ENV_CONFIG.CORS_ORIGINS] !== undefined,
        origins: process.env[ENV_CONFIG.CORS_ORIGINS]?.split(',') ?? ['*'],
        credentials: process.env[ENV_CONFIG.CORS_CREDENTIALS] === 'true',
      },
      healthCheck: {
        enabled: process.env[ENV_CONFIG.HEALTH_CHECK_ENABLED] !== 'false',
        endpoint: process.env[ENV_CONFIG.HEALTH_CHECK_ENDPOINT] || '/health',
      },
    };
  }

  return config;
}
