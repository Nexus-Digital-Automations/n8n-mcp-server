// Type definitions for n8n API responses
export interface N8nUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  personalizationAnswers?: Record<string, unknown>;
  settings?: Record<string, unknown>;
  role?: string;
  password?: string;
  resetPasswordToken?: string;
  globalRoleId?: string;
  isPending?: boolean;
  disabled?: boolean;
  lastSeenAt?: string;
  globalRole?: {
    scope: string;
    name: string;
    id: string;
    createdAt: string;
    updatedAt: string;
  };
  createdAt?: string;
  updatedAt?: string;
  hasRecoveryCodesLeft?: boolean;
  mfaEnabled?: boolean;
}

export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters?: Record<string, any>;
  credentials?: Record<string, any>;
  disabled?: boolean;
  notes?: string;
  webhookId?: string;
  [key: string]: unknown; // Add index signature to make it compatible with Record<string, unknown>
}

export interface N8nWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodes?: N8nNode[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: Record<string, unknown>;
  tags?: string[];
  versionId?: string;
  triggerCount?: number;
  createdAt?: string;
  updatedAt?: string;
  pinData?: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

export interface N8nExecution {
  id: string;
  finished: boolean;
  mode: string;
  retryOf?: string;
  retrySuccessId?: string;
  startedAt: string;
  stoppedAt?: string;
  workflowId: string;
  waitTill?: Date;
  status: 'error' | 'success' | 'running' | 'waiting';
  data?: Record<string, unknown>;
  workflowData?: N8nWorkflow;
}

export interface N8nCredential {
  id: string;
  name: string;
  type: string;
  data?: Record<string, unknown>;
  nodesAccess?: Array<{
    nodeType: string;
    user?: string;
    date?: Date;
  }>;
  sharedWith?: Array<{
    id: string;
    user: N8nUser;
    role: string;
  }>;
  homeProject?: {
    id: string;
    name: string;
    type: string;
  };
  scopes?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface N8nProject {
  id: string;
  name: string;
  type: 'Personal' | 'Team';
  createdAt: string;
  updatedAt: string;
  relations?: Array<{
    id: string;
    userId: string;
    projectId: string;
    role: string;
    createdAt: string;
    updatedAt: string;
    user: N8nUser;
  }>;
}

export interface N8nVariable {
  id: string;
  key: string;
  value: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  createdAt: string;
  updatedAt: string;
}

export interface N8nTag {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  usageCount?: number;
}

export interface N8nAuditReport {
  'Database Settings'?: Record<string, unknown>;
  'Credentials Risk Report'?: Record<string, unknown>;
  'Nodes Risk Report'?: Record<string, unknown>;
  'Instance Risk Report'?: Record<string, unknown>;
}

export interface ApiResponse<T> {
  data: T;
  nextCursor?: string;
}

export interface PaginationOptions {
  limit?: number;
  cursor?: string;
  projectId?: string;
}

export interface CreateUserRequest {
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
  role?: string;
}

export interface UpdateUserRequest {
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}

export interface CreateWorkflowRequest {
  name: string;
  nodes: Array<Record<string, unknown>>;
  connections: Record<string, unknown>;
  active?: boolean;
  settings?: Record<string, unknown>;
  tags?: string[];
}

export interface UpdateWorkflowRequest {
  name?: string;
  nodes?: Array<Record<string, unknown>>;
  connections?: Record<string, unknown>;
  active?: boolean;
  settings?: Record<string, unknown>;
  tags?: string[];
}

export interface CreateCredentialRequest {
  name: string;
  type: string;
  data: Record<string, unknown>;
  projectId?: string;
}

export interface CreateProjectRequest {
  name: string;
  type?: string;
}

export interface UpdateProjectRequest {
  name?: string;
}

export interface CreateVariableRequest {
  key: string;
  value: string;
  type?: 'string' | 'number' | 'boolean' | 'json';
}

export interface CreateTagRequest {
  name: string;
}

export interface UpdateTagRequest {
  name?: string;
}

// Community Node and Package Management Types

export interface N8nCommunityPackage {
  packageName: string;
  installedVersion: string;
  authorName?: string;
  authorEmail?: string;
  installedNodes?: N8nNodeTypeDescription[];
  createdAt: string;
  updatedAt: string;
  failedLoading?: boolean;
}

export interface N8nNodeTypeDescription {
  name: string;
  displayName: string;
  description: string;
  version: number;
  defaults: Record<string, unknown>;
  inputs: string[];
  outputs: string[];
  properties: N8nNodeProperty[];
  credentials?: N8nNodeCredential[];
  documentationUrl?: string;
  icon?: string;
  iconData?: {
    type: string;
    fileBuffer: string;
  };
  group: string[];
  subtitle?: string;
  codex?: {
    label?: string;
    categories?: string[];
    subcategories?: Record<string, string[]>;
    resources?: {
      primaryDocumentation?: Array<{
        url: string;
      }>;
      credentialDocumentation?: Array<{
        url: string;
      }>;
    };
    alias?: string[];
  };
  parameterPane?: string;
  supportsCORS?: boolean;
  maxNodes?: number;
  polling?: boolean;
  triggerPanel?: {
    header: string;
    executionsHelp: {
      inactive: string;
      active: string;
    };
    activationHint: string;
  };
  webhooks?: Array<{
    name: string;
    httpMethod: string;
    responseMode: string;
    path: string;
    ndvHideUrl?: boolean;
    ndvHideMethod?: boolean;
  }>;
  requestDefaults?: {
    returnFullResponse?: boolean;
    baseURL?: string;
  };
}

export interface N8nNodeProperty {
  displayName: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'options' | 'multiOptions' | 'json' | 'dateTime' | 'resourceLocator' | 'fixedCollection' | 'collection' | 'color' | 'hidden' | 'notice';
  default?: unknown;
  description?: string;
  placeholder?: string;
  required?: boolean;
  options?: Array<{
    name: string;
    value: unknown;
    description?: string;
  }>;
  routing?: Record<string, unknown>;
  extractValue?: Record<string, unknown>;
  displayOptions?: Record<string, unknown>;
  typeOptions?: Record<string, unknown>;
}

export interface N8nNodeCredential {
  name: string;
  required?: boolean;
  displayOptions?: Record<string, unknown>;
  testedBy?: string;
}

export interface CommunityPackageInstallRequest {
  name: string;
  version?: string;
}

export interface CommunityPackageUpdateRequest {
  name: string;
  version?: string;
}

export interface NodeSearchResult {
  workflowId: string;
  workflowName: string;
  node: N8nNode;
  isWorkflowActive: boolean;
}

export interface NodeUsageStats {
  nodeType: string;
  totalCount: number;
  activeWorkflowCount: number;
  workflowIds: string[];
  lastUsed?: string;
}

export interface NodeUpdateRequest {
  workflowId: string;
  nodeId: string;
  updates: Partial<N8nNode>;
}

export interface NodeInstallationProgress {
  packageName: string;
  status: 'downloading' | 'installing' | 'validating' | 'completed' | 'failed';
  progress: number;
  message?: string;
  error?: string;
}

export interface NodeRegistrySearchResult {
  name: string;
  version: string;
  description: string;
  keywords: string[];
  author: {
    name?: string;
    email?: string;
    url?: string;
  };
  maintainers: Array<{
    name: string;
    email?: string;
  }>;
  license: string;
  homepage?: string;
  repository?: {
    type: string;
    url: string;
  };
  downloads: {
    weekly: number;
    monthly: number;
    total: number;
  };
  nodeTypes: string[];
  compatibility: {
    minN8nVersion: string;
    maxN8nVersion?: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface DynamicNodeParameter {
  name: string;
  displayName: string;
  value: string;
  type: string;
  action?: string;
}

export interface DynamicNodeOptions {
  property: string;
  currentNodeParameters: Record<string, unknown>;
  credentials?: Record<string, unknown>;
  path?: string;
  methodName?: string;
  loadOptionsMethod?: string;
}

export interface ResourceLocatorResult {
  name: string;
  value: string;
  url?: string;
}

export interface AINodeClassification {
  nodeType: string;
  isAINode: boolean;
  aiCapabilities: string[];
  suggestedIntegrations: string[];
  confidenceScore: number;
}

export interface AINodeSuggestion {
  nodeType: string;
  suggestion: string;
  reasoning: string;
  confidence: number;
  alternativeNodes: string[];
}
