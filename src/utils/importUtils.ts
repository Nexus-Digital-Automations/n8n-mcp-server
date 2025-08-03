import { N8nClient } from '../client/n8nClient.js';
import { WorkflowExport, CredentialExport, ProjectExport, FullExport } from './exportUtils.js';
import {
  CreateWorkflowRequest,
  CreateCredentialRequest,
  CreateProjectRequest,
  CreateVariableRequest,
} from '../types/n8n.js';

export interface ImportOptions {
  conflictResolution?: 'skip' | 'overwrite' | 'rename';
  targetProjectId?: string;
  createMissingProjects?: boolean;
  validateCredentials?: boolean;
  dryRun?: boolean;
  namePrefix?: string;
  nameSuffix?: string;
}

export interface ImportResult {
  success: boolean;
  message: string;
  originalId?: string;
  newId?: string;
  warnings?: string[];
}

export interface ImportSummary {
  totalItems: number;
  successful: number;
  failed: number;
  skipped: number;
  warnings: string[];
  results: ImportResult[];
  importedAt: string;
}

export class ImportUtils {
  constructor(private client: N8nClient) {}

  /**
   * Import a single workflow
   */
  async importWorkflow(
    workflowExport: WorkflowExport,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    try {
      if (options.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would import workflow: ${workflowExport.name}`,
          originalId: workflowExport.id,
        };
      }

      // Check for existing workflow with same name
      const existingWorkflows = await this.client.getWorkflows();
      const existing = existingWorkflows.data.find(w => w.name === workflowExport.name);

      if (existing && options.conflictResolution === 'skip') {
        return {
          success: false,
          message: `Skipped: Workflow '${workflowExport.name}' already exists`,
          originalId: workflowExport.id,
        };
      }

      let workflowName = workflowExport.name;

      // Handle naming conflicts
      if (existing && options.conflictResolution === 'rename') {
        workflowName = this.generateUniqueName(
          workflowName,
          existingWorkflows.data.map(w => w.name)
        );
      }

      // Apply name prefix/suffix if specified
      if (options.namePrefix) {
        workflowName = options.namePrefix + workflowName;
      }
      if (options.nameSuffix) {
        workflowName = workflowName + options.nameSuffix;
      }

      // Prepare workflow data for import
      const workflowData: CreateWorkflowRequest = {
        name: workflowName,
        nodes: workflowExport.nodes,
        connections: workflowExport.connections,
        active: false, // Import as inactive for safety
        settings: workflowExport.settings,
        tags: workflowExport.tags,
      };

      // Validate and update credential references
      const validationWarnings = await this.validateWorkflowCredentials(workflowData, options);

      let newWorkflow;
      if (existing && options.conflictResolution === 'overwrite') {
        newWorkflow = await this.client.updateWorkflow(existing.id, workflowData);
      } else {
        newWorkflow = await this.client.createWorkflow(workflowData);
      }

      return {
        success: true,
        message: `Successfully imported workflow: ${workflowName}`,
        originalId: workflowExport.id,
        newId: newWorkflow.id,
        warnings: validationWarnings,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to import workflow '${workflowExport.name}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        originalId: workflowExport.id,
      };
    }
  }

  /**
   * Import a credential
   */
  async importCredential(
    credentialExport: CredentialExport,
    options: ImportOptions = {}
  ): Promise<ImportResult> {
    try {
      if (options.dryRun) {
        return {
          success: true,
          message: `[DRY RUN] Would import credential: ${credentialExport.name}`,
          originalId: credentialExport.id,
        };
      }

      // Check for existing credential with same name
      const existingCredentials = await this.client.getCredentials();
      const existing = existingCredentials.data.find(c => c.name === credentialExport.name);

      if (existing && options.conflictResolution === 'skip') {
        return {
          success: false,
          message: `Skipped: Credential '${credentialExport.name}' already exists`,
          originalId: credentialExport.id,
        };
      }

      let credentialName = credentialExport.name;

      // Handle naming conflicts
      if (existing && options.conflictResolution === 'rename') {
        credentialName = this.generateUniqueName(
          credentialName,
          existingCredentials.data.map(c => c.name)
        );
      }

      // Apply name prefix/suffix if specified
      if (options.namePrefix) {
        credentialName = options.namePrefix + credentialName;
      }
      if (options.nameSuffix) {
        credentialName = credentialName + options.nameSuffix;
      }

      // Cannot import credential without data
      if (!credentialExport.data) {
        return {
          success: false,
          message: `Cannot import credential '${credentialExport.name}': No credential data (secrets not included in export)`,
          originalId: credentialExport.id,
        };
      }

      const credentialData: CreateCredentialRequest = {
        name: credentialName,
        type: credentialExport.type,
        data: credentialExport.data,
        projectId: options.targetProjectId,
      };

      let newCredential;
      if (existing && options.conflictResolution === 'overwrite') {
        // Note: n8n API might not support credential updates, this would need to be handled
        throw new Error('Credential overwrite not supported by n8n API');
      } else {
        newCredential = await this.client.createCredential(credentialData);
      }

      return {
        success: true,
        message: `Successfully imported credential: ${credentialName}`,
        originalId: credentialExport.id,
        newId: newCredential.id,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to import credential '${credentialExport.name}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        originalId: credentialExport.id,
      };
    }
  }

  /**
   * Import a project with all its resources
   */
  async importProject(
    projectExport: ProjectExport,
    options: ImportOptions = {}
  ): Promise<ImportSummary> {
    const results: ImportResult[] = [];
    const warnings: string[] = [];
    let projectId = options.targetProjectId;

    try {
      // Create project if it doesn't exist and createMissingProjects is true
      if (options.createMissingProjects && !projectId) {
        const existingProjects = await this.client.getProjects();
        const existingProject = existingProjects.data.find(p => p.name === projectExport.name);

        if (existingProject) {
          projectId = existingProject.id;
          warnings.push(`Using existing project: ${projectExport.name}`);
        } else {
          const projectData: CreateProjectRequest = {
            name: projectExport.name,
            type: projectExport.type,
          };

          const newProject = await this.client.createProject(projectData);
          projectId = newProject.id;
        }
      }

      // Import variables first
      if (projectExport.variables) {
        for (const variable of projectExport.variables) {
          try {
            const variableData: CreateVariableRequest = {
              key: variable.key,
              value: variable.value,
              type: variable.type,
            };
            await this.client.createVariable(variableData);
            results.push({
              success: true,
              message: `Imported variable: ${variable.key}`,
              originalId: variable.id,
            });
          } catch (error) {
            results.push({
              success: false,
              message: `Failed to import variable '${variable.key}': ${error instanceof Error ? error.message : 'Unknown error'}`,
              originalId: variable.id,
            });
          }
        }
      }

      // Import credentials
      if (projectExport.credentials) {
        const credentialOptions: ImportOptions = {
          ...options,
          targetProjectId: projectId,
        };

        for (const credential of projectExport.credentials) {
          const result = await this.importCredential(credential, credentialOptions);
          results.push(result);
        }
      }

      // Import workflows
      if (projectExport.workflows) {
        const workflowOptions: ImportOptions = {
          ...options,
          targetProjectId: projectId,
        };

        for (const workflow of projectExport.workflows) {
          const result = await this.importWorkflow(workflow, workflowOptions);
          results.push(result);
        }
      }
    } catch (error) {
      results.push({
        success: false,
        message: `Failed to import project '${projectExport.name}': ${error instanceof Error ? error.message : 'Unknown error'}`,
        originalId: projectExport.id,
      });
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      totalItems: results.length,
      successful,
      failed,
      skipped: 0, // Calculated from results if needed
      warnings,
      results,
      importedAt: new Date().toISOString(),
    };
  }

  /**
   * Import a full instance export
   */
  async importInstance(
    instanceExport: FullExport,
    options: ImportOptions = {}
  ): Promise<ImportSummary> {
    const allResults: ImportResult[] = [];
    const allWarnings: string[] = [];

    // Import global variables first
    for (const variable of instanceExport.variables) {
      try {
        const variableData: CreateVariableRequest = {
          key: variable.key,
          value: variable.value,
          type: variable.type,
        };
        await this.client.createVariable(variableData);
        allResults.push({
          success: true,
          message: `Imported variable: ${variable.key}`,
          originalId: variable.id,
        });
      } catch (error) {
        allResults.push({
          success: false,
          message: `Failed to import variable '${variable.key}': ${error instanceof Error ? error.message : 'Unknown error'}`,
          originalId: variable.id,
        });
      }
    }

    // Import projects
    for (const project of instanceExport.projects) {
      const projectSummary = await this.importProject(project, options);
      allResults.push(...projectSummary.results);
      allWarnings.push(...projectSummary.warnings);
    }

    // Import global credentials
    for (const credential of instanceExport.globalCredentials) {
      const result = await this.importCredential(credential, options);
      allResults.push(result);
    }

    // Import global workflows
    for (const workflow of instanceExport.globalWorkflows) {
      const result = await this.importWorkflow(workflow, options);
      allResults.push(result);
    }

    const successful = allResults.filter(r => r.success).length;
    const failed = allResults.filter(r => !r.success).length;

    return {
      totalItems: allResults.length,
      successful,
      failed,
      skipped: 0,
      warnings: allWarnings,
      results: allResults,
      importedAt: new Date().toISOString(),
    };
  }

  /**
   * Import multiple workflows
   */
  async importWorkflows(
    workflowExports: WorkflowExport[],
    options: ImportOptions = {}
  ): Promise<ImportSummary> {
    const results: ImportResult[] = [];

    for (const workflow of workflowExports) {
      const result = await this.importWorkflow(workflow, options);
      results.push(result);
    }

    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;

    return {
      totalItems: results.length,
      successful,
      failed,
      skipped: 0,
      warnings: [],
      results,
      importedAt: new Date().toISOString(),
    };
  }

  /**
   * Validate workflow credentials and generate warnings
   */
  private async validateWorkflowCredentials(
    workflow: CreateWorkflowRequest,
    options: ImportOptions
  ): Promise<string[]> {
    const warnings: string[] = [];

    if (!options.validateCredentials) {
      return warnings;
    }

    const existingCredentials = await this.client.getCredentials();
    const credentialMap = new Map(existingCredentials.data.map(c => [c.id, c]));

    for (const node of workflow.nodes) {
      if (node.credentials && typeof node.credentials === 'object') {
        for (const credentialType in node.credentials) {
          const credentialRef = (node.credentials as Record<string, any>)[credentialType];
          if (credentialRef && typeof credentialRef === 'object' && credentialRef.id) {
            if (!credentialMap.has(credentialRef.id)) {
              warnings.push(
                `Node '${node.name}' references missing credential ID: ${credentialRef.id}`
              );
            }
          }
        }
      }
    }

    return warnings;
  }

  /**
   * Generate a unique name by appending a number
   */
  private generateUniqueName(baseName: string, existingNames: string[]): string {
    let counter = 1;
    let newName = `${baseName} (${counter})`;

    while (existingNames.includes(newName)) {
      counter++;
      newName = `${baseName} (${counter})`;
    }

    return newName;
  }

  /**
   * Generate import summary text
   */
  generateImportSummary(summary: ImportSummary): string {
    const { totalItems, successful, failed, warnings, importedAt } = summary;

    let result = `Import Summary (${importedAt}):\n`;
    result += `- Total items: ${totalItems}\n`;
    result += `- Successful: ${successful}\n`;
    result += `- Failed: ${failed}\n`;

    if (warnings.length > 0) {
      result += `\nWarnings:\n`;
      warnings.forEach(warning => {
        result += `- ${warning}\n`;
      });
    }

    const failedResults = summary.results.filter(r => !r.success);
    if (failedResults.length > 0) {
      result += `\nFailed items:\n`;
      failedResults.forEach(failedResult => {
        result += `- ${failedResult.message}\n`;
      });
    }

    return result;
  }
}
