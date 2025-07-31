/**
 * Authentication Provider Interface for n8n MCP Server
 *
 * Defines the contract for authentication providers that can validate
 * client requests and control access to n8n tools and resources.
 */

/* eslint-disable no-unused-vars */

/**
 * Request context containing client information and request metadata
 */
export interface RequestContext {
  /** Client identifier or session ID */
  clientId?: string;

  /** Request headers containing potential authentication tokens */
  headers?: Record<string, string>;

  /** Request metadata */
  metadata?: Record<string, unknown>;

  /** Authenticated user information (populated after successful auth) */
  user?: AuthenticatedUser;
}

/**
 * Result of authentication attempt
 */
export interface AuthResult {
  /** Whether authentication was successful */
  success: boolean;

  /** Authenticated user information (if successful) */
  user?: AuthenticatedUser;

  /** Error message (if failed) */
  error?: string;

  /** Additional context or session data */
  context?: Record<string, unknown>;
}

/**
 * Authenticated user information
 */
export interface AuthenticatedUser {
  /** Unique user identifier */
  id: string;

  /** User display name */
  name?: string;

  /** User email address */
  email?: string;

  /** User roles for access control */
  roles: string[];

  /** n8n instance permissions */
  permissions: {
    /** Can access Community features */
    community: boolean;

    /** Can access Enterprise features (projects, users, etc.) */
    enterprise: boolean;

    /** Can manage workflows */
    workflows: boolean;

    /** Can view executions */
    executions: boolean;

    /** Can manage credentials */
    credentials: boolean;

    /** Can manage users (admin only) */
    users: boolean;

    /** Can access audit logs */
    audit: boolean;
  };

  /** n8n API key for backend requests */
  n8nApiKey?: string;

  /** n8n instance URL */
  n8nBaseUrl?: string;
}

/**
 * Authentication provider interface
 */

export interface AuthProvider {
  /**
   * Authenticate a client request
   * @param context Request context containing client information
   * @returns Promise resolving to authentication result
   */
  authenticate(_context: RequestContext): Promise<AuthResult>;

  /**
   * Check if authenticated user can access a specific tool
   * @param toolName Name of the tool being accessed
   * @param context Request context with authenticated user
   * @returns Promise resolving to true if access is allowed
   */
  canAccessTool(_toolName: string, _context: RequestContext): Promise<boolean>;

  /**
   * Check if authenticated user can access a specific resource
   * @param resourceUri URI of the resource being accessed
   * @param context Request context with authenticated user
   * @returns Promise resolving to true if access is allowed
   */
  canAccessResource(_resourceUri: string, _context: RequestContext): Promise<boolean>;

  /**
   * Refresh or validate existing authentication
   * @param context Request context with existing auth data
   * @returns Promise resolving to updated authentication result
   */
  refresh(_context: RequestContext): Promise<AuthResult>;
}

/**
 * Base authentication provider with common functionality
 */
export abstract class BaseAuthProvider implements AuthProvider {
  abstract authenticate(_context: RequestContext): Promise<AuthResult>;
  abstract refresh(_context: RequestContext): Promise<AuthResult>;

  /**
   * Default tool access control based on user permissions
   */
  async canAccessTool(toolName: string, context: RequestContext): Promise<boolean> {
    if (!context.user) {
      return false;
    }

    const { permissions } = context.user;

    // Tool access mapping
    const toolPermissions: Record<string, keyof typeof permissions> = {
      // Core workflow tools
      'init-n8n': 'community',
      status: 'community',
      'list-workflows': 'workflows',
      'get-workflow': 'workflows',
      'create-workflow': 'workflows',
      'update-workflow': 'workflows',
      'delete-workflow': 'workflows',
      'activate-workflow': 'workflows',
      'deactivate-workflow': 'workflows',

      // Execution tools
      'list-executions': 'executions',
      'get-execution': 'executions',
      'delete-execution': 'executions',
      'retry-execution': 'executions',
      'stop-execution': 'executions',

      // Enterprise features
      'list-projects': 'enterprise',
      'create-project': 'enterprise',
      'get-project': 'enterprise',
      'update-project': 'enterprise',
      'delete-project': 'enterprise',
      'list-project-workflows': 'enterprise',
      'list-variables': 'enterprise',
      'create-variable': 'enterprise',
      'get-variable': 'enterprise',
      'update-variable': 'enterprise',
      'delete-variable': 'enterprise',

      // User management
      'list-users': 'users',
      'create-user': 'users',
      'get-user': 'users',
      'update-user': 'users',
      'delete-user': 'users',

      // Credentials
      'list-credentials': 'credentials',
      'get-credential': 'credentials',
      'create-credential': 'credentials',
      'update-credential': 'credentials',
      'delete-credential': 'credentials',

      // Audit
      'get-audit-logs': 'audit',
      'generate-audit-report': 'audit',

      // Tags (community feature)
      'list-tags': 'community',
      'create-tag': 'workflows',
      'update-tag': 'workflows',
      'delete-tag': 'workflows',
    };

    const requiredPermission = toolPermissions[toolName];
    if (!requiredPermission) {
      // Unknown tool, default to community access
      return permissions.community;
    }

    return permissions[requiredPermission];
  }

  /**
   * Default resource access control
   */
  async canAccessResource(resourceUri: string, context: RequestContext): Promise<boolean> {
    if (!context.user) {
      return false;
    }

    const { permissions } = context.user;

    // Resource access based on URI patterns
    if (resourceUri.startsWith('n8n://workflows/')) {
      return permissions.workflows;
    }

    if (resourceUri.startsWith('n8n://executions/')) {
      return permissions.executions;
    }

    if (resourceUri.startsWith('n8n://credentials/')) {
      return permissions.credentials;
    }

    if (resourceUri.startsWith('n8n://users/')) {
      return permissions.users;
    }

    if (resourceUri.startsWith('n8n://projects/')) {
      return permissions.enterprise;
    }

    // Default to community access for other resources
    return permissions.community;
  }

  /**
   * Create default permissions based on user roles
   */
  protected createPermissions(roles: string[]): AuthenticatedUser['permissions'] {
    const isAdmin = roles.includes('admin') || roles.includes('owner');
    const isEditor = roles.includes('editor') || isAdmin;
    const isMember = roles.includes('member') || isEditor;

    return {
      community: true, // All authenticated users get community access
      enterprise: isAdmin, // Only admins get enterprise features by default
      workflows: isMember, // Members and above can manage workflows
      executions: isMember, // Members and above can view executions
      credentials: isEditor, // Editors and above can manage credentials
      users: isAdmin, // Only admins can manage users
      audit: isAdmin, // Only admins can access audit logs
    };
  }
}
