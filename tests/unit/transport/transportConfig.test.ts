import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import {
  TransportConfig,
  TransportConfigSchema,
  DEFAULT_CONFIGS,
  detectTransportConfig,
  validateTransportConfig,
  getServerUrl,
  ENV_CONFIG,
  parseConfigFromEnv,
} from '../../../src/transport/transportConfig';

describe('Transport Configuration', () => {
  let originalEnv: Record<string, string | undefined>;

  beforeEach(() => {
    // Save original environment
    originalEnv = { ...process.env };

    // Clear environment variables
    Object.values(ENV_CONFIG).forEach(envVar => {
      delete process.env[envVar];
    });
    delete process.env.NODE_ENV;
    delete process.env.PORT;
    delete process.env.RAILWAY_ENVIRONMENT;
    delete process.env.VERCEL;
    delete process.env.RENDER;
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('TransportConfigSchema', () => {
    it('should validate minimal stdio configuration', () => {
      const config = { type: 'stdio' as const };
      const result = TransportConfigSchema.parse(config);

      expect(result.type).toBe('stdio');
      expect(result.sse).toBeUndefined();
    });

    it('should validate complete SSE configuration', () => {
      const config = {
        type: 'sse' as const,
        sse: {
          port: 8080,
          endpoint: '/sse',
          host: 'localhost',
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
      };

      const result = TransportConfigSchema.parse(config);
      expect(result).toEqual(config);
    });

    it('should apply default values for SSE configuration', () => {
      const config = { type: 'sse' as const, sse: {} };
      const result = TransportConfigSchema.parse(config);

      expect(result.sse?.port).toBe(8080);
      expect(result.sse?.endpoint).toBe('/sse');
      expect(result.sse?.host).toBe('localhost');
      expect(result.sse?.cors.enabled).toBe(true);
      expect(result.sse?.cors.origins).toEqual(['*']);
      expect(result.sse?.cors.credentials).toBe(false);
      expect(result.sse?.healthCheck.enabled).toBe(true);
      expect(result.sse?.healthCheck.endpoint).toBe('/health');
    });

    it('should default to stdio transport type', () => {
      const config = {};
      const result = TransportConfigSchema.parse(config);

      expect(result.type).toBe('stdio');
    });

    it('should reject invalid transport type', () => {
      const config = { type: 'invalid' };

      expect(() => TransportConfigSchema.parse(config)).toThrow();
    });

    it('should reject invalid port numbers', () => {
      const config = {
        type: 'sse' as const,
        sse: { port: 100 }, // Below minimum
      };

      expect(() => TransportConfigSchema.parse(config)).toThrow();

      const config2 = {
        type: 'sse' as const,
        sse: { port: 70000 }, // Above maximum
      };

      expect(() => TransportConfigSchema.parse(config2)).toThrow();
    });

    it('should validate custom CORS configuration', () => {
      const config = {
        type: 'sse' as const,
        sse: {
          cors: {
            enabled: false,
            origins: ['https://example.com', 'https://test.com'],
            credentials: true,
          },
        },
      };

      const result = TransportConfigSchema.parse(config);
      expect(result.sse?.cors.enabled).toBe(false);
      expect(result.sse?.cors.origins).toEqual(['https://example.com', 'https://test.com']);
      expect(result.sse?.cors.credentials).toBe(true);
    });

    it('should validate custom health check configuration', () => {
      const config = {
        type: 'sse' as const,
        sse: {
          healthCheck: {
            enabled: false,
            endpoint: '/custom-health',
          },
        },
      };

      const result = TransportConfigSchema.parse(config);
      expect(result.sse?.healthCheck.enabled).toBe(false);
      expect(result.sse?.healthCheck.endpoint).toBe('/custom-health');
    });

    it('should handle partial SSE configuration with defaults', () => {
      const config = {
        type: 'sse' as const,
        sse: {
          port: 3000,
          host: '0.0.0.0',
        },
      };

      const result = TransportConfigSchema.parse(config);
      expect(result.sse?.port).toBe(3000);
      expect(result.sse?.host).toBe('0.0.0.0');
      expect(result.sse?.endpoint).toBe('/sse'); // Default
      expect(result.sse?.cors.enabled).toBe(true); // Default
    });
  });

  describe('DEFAULT_CONFIGS', () => {
    it('should provide correct development configuration', () => {
      const config = DEFAULT_CONFIGS.development;

      expect(config.type).toBe('stdio');
      expect('sse' in config ? config.sse : undefined).toBeUndefined();
    });

    it('should provide correct production configuration', () => {
      const config = DEFAULT_CONFIGS.production;

      expect(config.type).toBe('sse');
      expect(config.sse?.port).toBe(8080);
      expect(config.sse?.endpoint).toBe('/sse');
      expect(config.sse?.host).toBe('0.0.0.0');
      expect(config.sse?.cors.enabled).toBe(true);
      expect(config.sse?.cors.origins).toEqual(['*']);
      expect(config.sse?.cors.credentials).toBe(false);
      expect(config.sse?.healthCheck.enabled).toBe(true);
      expect(config.sse?.healthCheck.endpoint).toBe('/health');
    });

    it('should provide correct web configuration', () => {
      const config = DEFAULT_CONFIGS.web;

      expect(config.type).toBe('sse');
      expect(config.sse?.port).toBe(3000); // Default from process.env.PORT fallback
      expect(config.sse?.endpoint).toBe('/sse');
      expect(config.sse?.host).toBe('0.0.0.0');
      expect(config.sse?.cors.enabled).toBe(true);
      expect(config.sse?.cors.origins).toEqual(['*']);
      expect(config.sse?.cors.credentials).toBe(true);
      expect(config.sse?.healthCheck.enabled).toBe(true);
      expect(config.sse?.healthCheck.endpoint).toBe('/health');
    });

    it('should use environment PORT variable in web configuration', async () => {
      process.env.PORT = '5000';

      // Need to re-import the module to pick up the new environment variable
      jest.resetModules();
      const { DEFAULT_CONFIGS: newConfigs } = await import(
        '../../../src/transport/transportConfig'
      );

      expect(newConfigs.web.sse.port).toBe(5000);
    });

    it('should use environment CORS_ORIGINS in web configuration', async () => {
      process.env.CORS_ORIGINS = 'https://example.com,https://test.com';

      jest.resetModules();
      const { DEFAULT_CONFIGS: newConfigs } = await import(
        '../../../src/transport/transportConfig'
      );

      expect(newConfigs.web.sse.cors.origins).toEqual(['https://example.com', 'https://test.com']);
    });
  });

  describe('detectTransportConfig', () => {
    it('should return stdio config for explicit N8N_MCP_TRANSPORT=stdio', () => {
      process.env[ENV_CONFIG.TRANSPORT_TYPE] = 'stdio';

      const config = detectTransportConfig();
      expect(config.type).toBe('stdio');
    });

    it('should return SSE config for explicit N8N_MCP_TRANSPORT=sse', () => {
      process.env[ENV_CONFIG.TRANSPORT_TYPE] = 'sse';

      const config = detectTransportConfig();
      expect(config.type).toBe('sse');
    });

    it('should return web config for NODE_ENV=production', () => {
      process.env.NODE_ENV = 'production';

      const config = detectTransportConfig();
      expect(config.type).toBe('sse');
      expect(config).toEqual(DEFAULT_CONFIGS.web);
    });

    it('should return web config when PORT is set', () => {
      process.env.PORT = '3000';

      const config = detectTransportConfig();
      expect(config.type).toBe('sse');
      expect(config).toEqual(DEFAULT_CONFIGS.web);
    });

    it('should return web config for Railway environment', () => {
      process.env.RAILWAY_ENVIRONMENT = 'production';

      const config = detectTransportConfig();
      expect(config.type).toBe('sse');
      expect(config).toEqual(DEFAULT_CONFIGS.web);
    });

    it('should return web config for Vercel environment', () => {
      process.env.VERCEL = '1';

      const config = detectTransportConfig();
      expect(config.type).toBe('sse');
      expect(config).toEqual(DEFAULT_CONFIGS.web);
    });

    it('should return web config for Render environment', () => {
      process.env.RENDER = 'true';

      const config = detectTransportConfig();
      expect(config.type).toBe('sse');
      expect(config).toEqual(DEFAULT_CONFIGS.web);
    });

    it('should default to development config for local environment', () => {
      // No environment variables set
      const config = detectTransportConfig();
      expect(config.type).toBe('stdio');
      expect(config).toEqual(DEFAULT_CONFIGS.development);
    });

    it('should prioritize explicit transport type over environment detection', () => {
      process.env.NODE_ENV = 'production';
      process.env[ENV_CONFIG.TRANSPORT_TYPE] = 'stdio';

      const config = detectTransportConfig();
      expect(config.type).toBe('stdio');
    });
  });

  describe('validateTransportConfig', () => {
    it('should validate and return correct stdio configuration', () => {
      const input = { type: 'stdio' };
      const result = validateTransportConfig(input);

      expect(result.type).toBe('stdio');
      expect(result.sse).toBeUndefined();
    });

    it('should validate and return correct SSE configuration', () => {
      const input = {
        type: 'sse',
        sse: {
          port: 8080,
          endpoint: '/sse',
          host: 'localhost',
        },
      };

      const result = validateTransportConfig(input);
      expect(result.type).toBe('sse');
      expect(result.sse?.port).toBe(8080);
      expect(result.sse?.endpoint).toBe('/sse');
      expect(result.sse?.host).toBe('localhost');
    });

    it('should throw error for invalid configuration', () => {
      const input = { type: 'invalid' };

      expect(() => validateTransportConfig(input)).toThrow();
    });

    it('should throw error for invalid port range', () => {
      const input = {
        type: 'sse',
        sse: { port: 100 },
      };

      expect(() => validateTransportConfig(input)).toThrow();
    });

    it('should apply defaults to partial configuration', () => {
      const input = { type: 'sse', sse: { port: 3000 } };
      const result = validateTransportConfig(input);

      expect(result.sse?.port).toBe(3000);
      expect(result.sse?.endpoint).toBe('/sse'); // Default
      expect(result.sse?.host).toBe('localhost'); // Default
    });
  });

  describe('getServerUrl', () => {
    it('should return null for stdio configuration', () => {
      const config: TransportConfig = { type: 'stdio' };
      const url = getServerUrl(config);

      expect(url).toBeNull();
    });

    it('should return correct HTTP URL for SSE configuration', () => {
      const config: TransportConfig = {
        type: 'sse',
        sse: {
          host: 'localhost',
          port: 8080,
          endpoint: '/sse',
          cors: { enabled: true, origins: ['*'], credentials: false },
          healthCheck: { enabled: true, endpoint: '/health' },
        },
      };

      const url = getServerUrl(config);
      expect(url).toBe('http://localhost:8080/sse');
    });

    it('should return correct HTTPS URL for port 443', () => {
      const config: TransportConfig = {
        type: 'sse',
        sse: {
          host: 'example.com',
          port: 443,
          endpoint: '/sse',
          cors: { enabled: true, origins: ['*'], credentials: false },
          healthCheck: { enabled: true, endpoint: '/health' },
        },
      };

      const url = getServerUrl(config);
      expect(url).toBe('https://example.com:443/sse');
    });

    it('should handle custom endpoints', () => {
      const config: TransportConfig = {
        type: 'sse',
        sse: {
          host: '0.0.0.0',
          port: 3000,
          endpoint: '/api/mcp',
          cors: { enabled: true, origins: ['*'], credentials: false },
          healthCheck: { enabled: true, endpoint: '/health' },
        },
      };

      const url = getServerUrl(config);
      expect(url).toBe('http://0.0.0.0:3000/api/mcp');
    });

    it('should return null when SSE config is missing', () => {
      const config: TransportConfig = { type: 'sse' };
      const url = getServerUrl(config);

      expect(url).toBeNull();
    });
  });

  describe('parseConfigFromEnv', () => {
    it('should return empty config when no environment variables are set', () => {
      const config = parseConfigFromEnv();
      expect(config).toEqual({});
    });

    it('should parse transport type from environment', () => {
      process.env[ENV_CONFIG.TRANSPORT_TYPE] = 'sse';

      const config = parseConfigFromEnv();
      expect(config.type).toBe('sse');
    });

    it('should parse SSE port from environment', () => {
      process.env[ENV_CONFIG.SSE_PORT] = '9000';

      const config = parseConfigFromEnv();
      expect(config.sse?.port).toBe(9000);
    });

    it('should parse SSE host from environment', () => {
      process.env[ENV_CONFIG.SSE_HOST] = '0.0.0.0';

      const config = parseConfigFromEnv();
      expect(config.sse?.host).toBe('0.0.0.0');
    });

    it('should parse SSE endpoint from environment', () => {
      process.env[ENV_CONFIG.SSE_ENDPOINT] = '/api/mcp';

      const config = parseConfigFromEnv();
      expect(config.sse?.endpoint).toBe('/api/mcp');
    });

    it('should parse CORS origins from environment', () => {
      process.env[ENV_CONFIG.CORS_ORIGINS] = 'https://example.com,https://test.com';

      const config = parseConfigFromEnv();
      expect(config.sse?.cors.enabled).toBe(true);
      expect(config.sse?.cors.origins).toEqual(['https://example.com', 'https://test.com']);
    });

    it('should parse CORS credentials from environment', () => {
      process.env[ENV_CONFIG.CORS_CREDENTIALS] = 'true';

      const config = parseConfigFromEnv();
      expect(config.sse?.cors.credentials).toBe(true);
    });

    it('should parse health check enabled from environment', () => {
      process.env[ENV_CONFIG.HEALTH_CHECK_ENABLED] = 'false';

      const config = parseConfigFromEnv();
      expect(config.sse?.healthCheck.enabled).toBe(false);
    });

    it('should parse health check endpoint from environment', () => {
      process.env[ENV_CONFIG.HEALTH_CHECK_ENDPOINT] = '/status';

      const config = parseConfigFromEnv();
      expect(config.sse?.healthCheck.endpoint).toBe('/status');
    });

    it('should create SSE config when SSE port is set', () => {
      process.env[ENV_CONFIG.SSE_PORT] = '3000';

      const config = parseConfigFromEnv();
      expect(config.sse).toBeDefined();
      expect(config.sse?.port).toBe(3000);
      expect(config.sse?.host).toBe('localhost'); // Default
      expect(config.sse?.endpoint).toBe('/sse'); // Default
    });

    it('should handle complete environment configuration', () => {
      process.env[ENV_CONFIG.TRANSPORT_TYPE] = 'sse';
      process.env[ENV_CONFIG.SSE_PORT] = '4000';
      process.env[ENV_CONFIG.SSE_HOST] = '0.0.0.0';
      process.env[ENV_CONFIG.SSE_ENDPOINT] = '/mcp';
      process.env[ENV_CONFIG.CORS_ORIGINS] = 'https://app.com';
      process.env[ENV_CONFIG.CORS_CREDENTIALS] = 'true';
      process.env[ENV_CONFIG.HEALTH_CHECK_ENABLED] = 'true';
      process.env[ENV_CONFIG.HEALTH_CHECK_ENDPOINT] = '/health-check';

      const config = parseConfigFromEnv();

      expect(config.type).toBe('sse');
      expect(config.sse?.port).toBe(4000);
      expect(config.sse?.host).toBe('0.0.0.0');
      expect(config.sse?.endpoint).toBe('/mcp');
      expect(config.sse?.cors.enabled).toBe(true);
      expect(config.sse?.cors.origins).toEqual(['https://app.com']);
      expect(config.sse?.cors.credentials).toBe(true);
      expect(config.sse?.healthCheck.enabled).toBe(true);
      expect(config.sse?.healthCheck.endpoint).toBe('/health-check');
    });

    it('should handle invalid port number gracefully', () => {
      process.env[ENV_CONFIG.SSE_PORT] = 'invalid';

      const config = parseConfigFromEnv();
      expect(config.sse?.port).toBeNaN();
    });

    it('should handle CORS credentials with non-true values', () => {
      process.env[ENV_CONFIG.CORS_CREDENTIALS] = 'false';

      const config = parseConfigFromEnv();
      expect(config.sse?.cors.credentials).toBe(false);

      process.env[ENV_CONFIG.CORS_CREDENTIALS] = 'invalid';
      const config2 = parseConfigFromEnv();
      expect(config2.sse?.cors.credentials).toBe(false);
    });
  });

  describe('ENV_CONFIG constants', () => {
    it('should have correct environment variable names', () => {
      expect(ENV_CONFIG.TRANSPORT_TYPE).toBe('N8N_MCP_TRANSPORT');
      expect(ENV_CONFIG.SSE_PORT).toBe('N8N_MCP_SSE_PORT');
      expect(ENV_CONFIG.SSE_HOST).toBe('N8N_MCP_SSE_HOST');
      expect(ENV_CONFIG.SSE_ENDPOINT).toBe('N8N_MCP_SSE_ENDPOINT');
      expect(ENV_CONFIG.CORS_ORIGINS).toBe('N8N_MCP_CORS_ORIGINS');
      expect(ENV_CONFIG.CORS_CREDENTIALS).toBe('N8N_MCP_CORS_CREDENTIALS');
      expect(ENV_CONFIG.HEALTH_CHECK_ENABLED).toBe('N8N_MCP_HEALTH_CHECK_ENABLED');
      expect(ENV_CONFIG.HEALTH_CHECK_ENDPOINT).toBe('N8N_MCP_HEALTH_CHECK_ENDPOINT');
    });

    it('should have all required environment variables defined', () => {
      const expectedKeys = [
        'TRANSPORT_TYPE',
        'SSE_PORT',
        'SSE_HOST',
        'SSE_ENDPOINT',
        'CORS_ORIGINS',
        'CORS_CREDENTIALS',
        'HEALTH_CHECK_ENABLED',
        'HEALTH_CHECK_ENDPOINT',
      ];

      expectedKeys.forEach(key => {
        expect(ENV_CONFIG).toHaveProperty(key);
        expect(typeof ENV_CONFIG[key as keyof typeof ENV_CONFIG]).toBe('string');
      });
    });
  });

  describe('Integration Tests', () => {
    it('should create valid configuration from environment and validate it', () => {
      process.env[ENV_CONFIG.TRANSPORT_TYPE] = 'sse';
      process.env[ENV_CONFIG.SSE_PORT] = '8080';
      process.env[ENV_CONFIG.SSE_HOST] = 'localhost';

      const envConfig = parseConfigFromEnv();
      const validatedConfig = validateTransportConfig(envConfig);

      expect(validatedConfig.type).toBe('sse');
      expect(validatedConfig.sse?.port).toBe(8080);
      expect(validatedConfig.sse?.host).toBe('localhost');
    });

    it('should detect configuration and get server URL', () => {
      process.env[ENV_CONFIG.TRANSPORT_TYPE] = 'sse';

      const config = detectTransportConfig();
      const url = getServerUrl(config);

      expect(url).toBeTruthy();
      expect(typeof url).toBe('string');
      expect(url).toMatch(/^https?:\/\//);
    });

    it('should handle full workflow from detection to URL generation', () => {
      process.env.NODE_ENV = 'production';

      const detectedConfig = detectTransportConfig();
      const validatedConfig = validateTransportConfig(detectedConfig);
      const serverUrl = getServerUrl(validatedConfig);

      expect(validatedConfig.type).toBe('sse');
      expect(serverUrl).toBe('http://0.0.0.0:3000/sse');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle null/undefined input to validateTransportConfig', () => {
      expect(() => validateTransportConfig(null)).toThrow();
      expect(() => validateTransportConfig(undefined)).toThrow();
    });

    it('should handle empty object to validateTransportConfig', () => {
      const result = validateTransportConfig({});
      expect(result.type).toBe('stdio'); // Default
    });

    it('should handle malformed SSE configuration', () => {
      const config = {
        type: 'sse',
        sse: {
          port: 'invalid',
          endpoint: 123,
          host: null,
        },
      };

      expect(() => validateTransportConfig(config)).toThrow();
    });

    it('should handle missing SSE configuration for SSE type', () => {
      const config = { type: 'sse' };
      const result = validateTransportConfig(config);

      expect(result.type).toBe('sse');
      expect(result.sse).toBeUndefined();
    });

    it('should handle CORS origins parsing with empty string', () => {
      process.env[ENV_CONFIG.CORS_ORIGINS] = '';

      const config = parseConfigFromEnv();
      expect(config.sse?.cors.origins).toEqual(['']);
    });

    it('should handle CORS origins parsing with single origin', () => {
      process.env[ENV_CONFIG.CORS_ORIGINS] = 'https://example.com';

      const config = parseConfigFromEnv();
      expect(config.sse?.cors.origins).toEqual(['https://example.com']);
    });

    it('should handle edge case port numbers', () => {
      // Test minimum valid port
      const config1 = { type: 'sse' as const, sse: { port: 1024 } };
      expect(() => validateTransportConfig(config1)).not.toThrow();

      // Test maximum valid port
      const config2 = { type: 'sse' as const, sse: { port: 65535 } };
      expect(() => validateTransportConfig(config2)).not.toThrow();

      // Test below minimum
      const config3 = { type: 'sse' as const, sse: { port: 1023 } };
      expect(() => validateTransportConfig(config3)).toThrow();

      // Test above maximum
      const config4 = { type: 'sse' as const, sse: { port: 65536 } };
      expect(() => validateTransportConfig(config4)).toThrow();
    });
  });
});
