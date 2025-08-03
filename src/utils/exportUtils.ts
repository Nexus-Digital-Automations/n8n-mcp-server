import { N8nClient } from '../client/n8nClient.js';
import { N8nVariable } from '../types/n8n.js';

export interface ExportOptions {
  includeCredentials?: boolean;
  includeSecrets?: boolean;
  projectId?: string;
  tagFilter?: string[];
}

export interface WorkflowExport {
  id: string;
  name: string;
  active: boolean;
  nodes: any[];
  connections: Record<string, unknown>;
  settings?: Record<string, unknown>;
  staticData?: Record<string, unknown>;
  tags?: string[];
  pinData?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  exportedAt: string;
  credentials?: string[]; // Array of credential IDs referenced
}

export interface CredentialExport {
  id: string;
  name: string;
  type: string;
  data?: Record<string, unknown>; // Only included if includeSecrets is true
  homeProject?: {
    id: string;
    name: string;
    type: string;
  };
  scopes?: string[];
  exportedAt: string;
  sanitized: boolean; // Indicates if sensitive data was removed
}

export interface ProjectExport {
  id: string;
  name: string;
  type: string;
  exportedAt: string;
  workflows?: WorkflowExport[];
  credentials?: CredentialExport[];
  variables?: N8nVariable[];
}

export interface FullExport {
  metadata: {
    exportedAt: string;
    sourceInstance: string;
    n8nVersion?: string;
    includeSecrets: boolean;
    projectCount: number;
    workflowCount: number;
    credentialCount: number;
  };
  projects: ProjectExport[];
  globalWorkflows: WorkflowExport[]; // Workflows not in any project
  globalCredentials: CredentialExport[]; // Credentials not in any project
  variables: N8nVariable[];
}

export class ExportUtils {
  constructor(private client: N8nClient) {}

  /**
   * Export a single workflow with its dependencies
   */
  async exportWorkflow(workflowId: string, _options: ExportOptions = {}): Promise<WorkflowExport> {
    const workflow = await this.client.getWorkflow(workflowId);

    const workflowExport: WorkflowExport = {
      id: workflow.id,
      name: workflow.name,
      active: workflow.active,
      nodes: workflow.nodes || [],
      connections: workflow.connections,
      settings: workflow.settings,
      staticData: workflow.staticData,
      tags: workflow.tags,
      pinData: workflow.pinData,
      meta: workflow.meta,
      exportedAt: new Date().toISOString(),
      credentials: this.extractCredentialIds(workflow.nodes || []),
    };

    return workflowExport;
  }

  /**
   * Export multiple workflows
   */
  async exportWorkflows(
    workflowIds: string[],
    options: ExportOptions = {}
  ): Promise<WorkflowExport[]> {
    const exports: WorkflowExport[] = [];

    for (const workflowId of workflowIds) {
      try {
        const workflowExport = await this.exportWorkflow(workflowId, options);
        exports.push(workflowExport);
      } catch (error) {
        console.warn(`Failed to export workflow ${workflowId}:`, error);
      }
    }

    return exports;
  }

  /**
   * Export a credential (with security considerations)
   */
  async exportCredential(
    credentialId: string,
    options: ExportOptions = {}
  ): Promise<CredentialExport> {
    const credential = await this.client.getCredential(credentialId);

    const credentialExport: CredentialExport = {
      id: credential.id,
      name: credential.name,
      type: credential.type,
      homeProject: credential.homeProject,
      scopes: credential.scopes,
      exportedAt: new Date().toISOString(),
      sanitized: !options.includeSecrets,
    };

    // Only include sensitive data if explicitly requested
    if (options.includeSecrets && credential.data) {
      credentialExport.data = credential.data;
    }

    return credentialExport;
  }

  /**
   * Export multiple credentials
   */
  async exportCredentials(
    credentialIds: string[],
    options: ExportOptions = {}
  ): Promise<CredentialExport[]> {
    const exports: CredentialExport[] = [];

    for (const credentialId of credentialIds) {
      try {
        const credentialExport = await this.exportCredential(credentialId, options);
        exports.push(credentialExport);
      } catch (error) {
        console.warn(`Failed to export credential ${credentialId}:`, error);
      }
    }

    return exports;
  }

  /**
   * Export a complete project with all its resources
   */
  async exportProject(projectId: string, options: ExportOptions = {}): Promise<ProjectExport> {
    const project = await this.client.getProject(projectId);

    // Get all workflows in the project
    const workflowsResponse = await this.client.getWorkflows({ projectId });
    const workflows = await this.exportWorkflows(
      workflowsResponse.data.map(w => w.id),
      options
    );

    let credentials: CredentialExport[] = [];
    if (options.includeCredentials) {
      // Get all credentials in the project
      const credentialsResponse = await this.client.getCredentials({ projectId });
      credentials = await this.exportCredentials(
        credentialsResponse.data.map(c => c.id),
        options
      );
    }

    // Get project variables
    const variablesResponse = await this.client.getVariables();
    const projectVariables = variablesResponse.data.filter(
      v => v.key.startsWith(`project_${projectId}_`) // Assuming project-scoped variables have this prefix
    );

    const projectExport: ProjectExport = {
      id: project.id,
      name: project.name,
      type: project.type,
      exportedAt: new Date().toISOString(),
      workflows,
      credentials: options.includeCredentials ? credentials : undefined,
      variables: projectVariables,
    };

    return projectExport;
  }

  /**
   * Export the entire n8n instance
   */
  async exportInstance(options: ExportOptions = {}): Promise<FullExport> {
    const exportTime = new Date().toISOString();

    // Get all projects
    const projectsResponse = await this.client.getProjects();
    const projects: ProjectExport[] = [];

    for (const project of projectsResponse.data) {
      try {
        const projectExport = await this.exportProject(project.id, options);
        projects.push(projectExport);
      } catch (error) {
        console.warn(`Failed to export project ${project.id}:`, error);
      }
    }

    // Get workflows not in any project (global workflows)
    const allWorkflowsResponse = await this.client.getWorkflows();
    const projectWorkflowIds = new Set(projects.flatMap(p => p.workflows?.map(w => w.id) || []));
    const globalWorkflowIds = allWorkflowsResponse.data
      .filter(w => !projectWorkflowIds.has(w.id))
      .map(w => w.id);

    const globalWorkflows = await this.exportWorkflows(globalWorkflowIds, options);

    // Get credentials not in any project (global credentials)
    let globalCredentials: CredentialExport[] = [];
    if (options.includeCredentials) {
      const allCredentialsResponse = await this.client.getCredentials();
      const projectCredentialIds = new Set(
        projects.flatMap(p => p.credentials?.map(c => c.id) || [])
      );
      const globalCredentialIds = allCredentialsResponse.data
        .filter(c => !projectCredentialIds.has(c.id))
        .map(c => c.id);

      globalCredentials = await this.exportCredentials(globalCredentialIds, options);
    }

    // Get all variables
    const variablesResponse = await this.client.getVariables();
    const projectVariableKeys = new Set(projects.flatMap(p => p.variables?.map(v => v.key) || []));
    const globalVariables = variablesResponse.data.filter(v => !projectVariableKeys.has(v.key));

    const fullExport: FullExport = {
      metadata: {
        exportedAt: exportTime,
        sourceInstance: 'n8n-instance', // Could be made configurable
        includeSecrets: options.includeSecrets || false,
        projectCount: projects.length,
        workflowCount:
          projects.reduce((acc, p) => acc + (p.workflows?.length || 0), 0) + globalWorkflows.length,
        credentialCount: options.includeCredentials
          ? projects.reduce((acc, p) => acc + (p.credentials?.length || 0), 0) +
            globalCredentials.length
          : 0,
      },
      projects,
      globalWorkflows,
      globalCredentials,
      variables: globalVariables,
    };

    return fullExport;
  }

  /**
   * Export workflows by tag filter
   */
  async exportWorkflowsByTags(
    tags: string[],
    options: ExportOptions = {}
  ): Promise<WorkflowExport[]> {
    const workflowsResponse = await this.client.getWorkflows();
    const filteredWorkflows = workflowsResponse.data.filter(
      workflow => workflow.tags && workflow.tags.some(tag => tags.includes(tag))
    );

    return this.exportWorkflows(
      filteredWorkflows.map(w => w.id),
      options
    );
  }

  /**
   * Generate export summary
   */
  generateExportSummary(exportData: FullExport | ProjectExport | WorkflowExport[]): string {
    if ('metadata' in exportData) {
      // Full instance export
      const metadata = exportData.metadata;
      return `Export Summary:
- Exported at: ${metadata.exportedAt}
- Projects: ${metadata.projectCount}
- Workflows: ${metadata.workflowCount}
- Credentials: ${metadata.credentialCount}
- Secrets included: ${metadata.includeSecrets ? 'Yes' : 'No'}`;
    } else if ('workflows' in exportData) {
      // Project export
      return `Project Export Summary:
- Project: ${exportData.name} (${exportData.type})
- Workflows: ${exportData.workflows?.length || 0}
- Credentials: ${exportData.credentials?.length || 0}
- Variables: ${exportData.variables?.length || 0}
- Exported at: ${exportData.exportedAt}`;
    } else if (Array.isArray(exportData)) {
      // Workflow array export
      const workflowCount = exportData.length;
      const credentialIds = new Set(exportData.flatMap(w => w.credentials || []));
      return `Workflow Export Summary:
- Workflows: ${workflowCount}
- Referenced credentials: ${credentialIds.size}
- Exported at: ${exportData.length > 0 ? exportData[0]?.exportedAt || new Date().toISOString() : new Date().toISOString()}`;
    } else {
      return 'Unknown export data format';
    }
  }

  /**
   * Extract credential IDs from workflow nodes
   */
  private extractCredentialIds(nodes: any[]): string[] {
    const credentialIds = new Set<string>();

    for (const node of nodes) {
      if (node.credentials) {
        for (const credentialType in node.credentials) {
          const credential = node.credentials[credentialType];
          if (credential && credential.id) {
            credentialIds.add(credential.id);
          }
        }
      }
    }

    return Array.from(credentialIds);
  }
}
