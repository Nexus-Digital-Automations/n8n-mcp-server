import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';
import { ExportUtils } from '../utils/exportUtils.js';
import { ImportUtils, ImportOptions } from '../utils/importUtils.js';

// Zod schemas for validation
const WorkflowIdSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
});

const WorkflowIdsSchema = z.object({
  workflowIds: z
    .array(z.string().min(1, 'Workflow ID cannot be empty'))
    .min(1, 'At least one workflow ID is required'),
});

const CredentialIdSchema = z.object({
  credentialId: z.string().min(1, 'Credential ID is required'),
});

const CredentialIdsSchema = z.object({
  credentialIds: z
    .array(z.string().min(1, 'Credential ID cannot be empty'))
    .min(1, 'At least one credential ID is required'),
});

// ProjectIdSchema is defined for potential future use
// const ProjectIdSchema = z.object({
//   projectId: z.string().min(1, 'Project ID is required'),
// });

const ExportOptionsSchema = z.object({
  includeCredentials: z.boolean().optional().default(false),
  includeSecrets: z.boolean().optional().default(false),
  projectId: z.string().optional(),
  tagFilter: z.array(z.string()).optional(),
});

const ImportOptionsSchema = z.object({
  conflictResolution: z.enum(['skip', 'overwrite', 'rename']).optional().default('skip'),
  targetProjectId: z.string().optional(),
  createMissingProjects: z.boolean().optional().default(false),
  validateCredentials: z.boolean().optional().default(true),
  dryRun: z.boolean().optional().default(false),
  namePrefix: z.string().optional(),
  nameSuffix: z.string().optional(),
});

const ExportWorkflowSchema = WorkflowIdSchema.merge(ExportOptionsSchema);
const ExportWorkflowsSchema = WorkflowIdsSchema.merge(ExportOptionsSchema);
const ExportCredentialSchema = CredentialIdSchema.merge(ExportOptionsSchema);
const ExportCredentialsSchema = CredentialIdsSchema.merge(ExportOptionsSchema);
const ExportProjectSchema = z.object({
  projectId: z.string().min(1, 'Project ID is required'),
  includeCredentials: z.boolean().optional().default(false),
  includeSecrets: z.boolean().optional().default(false),
  tagFilter: z.array(z.string()).optional(),
});

const ImportDataSchema = z.object({
  exportData: z.string().min(1, 'Export data JSON is required'),
  options: ImportOptionsSchema.optional(),
});

const WorkflowsByTagsSchema = z.object({
  tags: z.array(z.string().min(1, 'Tag cannot be empty')).min(1, 'At least one tag is required'),
  options: ExportOptionsSchema.optional(),
});

const TransferWorkflowsSchema = z.object({
  workflowIds: z.array(z.string().min(1)).min(1, 'At least one workflow ID is required'),
  targetProjectId: z.string().min(1, 'Target project ID is required'),
  moveOrCopy: z.enum(['move', 'copy']).default('copy'),
});

// Tool registration function
export function createResourceTransferTools(getClient: () => N8nClient | null, server: any) {
  // Export single workflow
  server.addTool({
    name: 'export-workflow',
    description:
      'Export a single workflow with its configuration and dependencies for transfer to another n8n instance',
    parameters: ExportWorkflowSchema,
    annotations: {
      title: 'Export Workflow',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ExportWorkflowSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const exportUtils = new ExportUtils(client);
        const { workflowId, ...options } = args;

        const workflowExport = await exportUtils.exportWorkflow(workflowId, options);
        const summary = exportUtils.generateExportSummary([workflowExport]);

        return `${summary}\n\n**Export Data:**\n\`\`\`json\n${JSON.stringify(workflowExport, null, 2)}\n\`\`\`\n\n💾 Copy the JSON data above to import this workflow into another n8n instance.`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to export workflow: ${error.message}`);
        }
        throw new UserError('Failed to export workflow with unknown error');
      }
    },
  });

  // Export multiple workflows
  server.addTool({
    name: 'export-workflows',
    description:
      'Export multiple workflows with their configurations and dependencies for batch transfer',
    parameters: ExportWorkflowsSchema,
    annotations: {
      title: 'Export Multiple Workflows',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ExportWorkflowsSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const exportUtils = new ExportUtils(client);
        const { workflowIds, ...options } = args;

        const workflowExports = await exportUtils.exportWorkflows(workflowIds, options);
        const summary = exportUtils.generateExportSummary(workflowExports);

        return `${summary}\n\n**Export Data:**\n\`\`\`json\n${JSON.stringify(workflowExports, null, 2)}\n\`\`\`\n\n💾 Copy the JSON data above to import these workflows into another n8n instance.`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to export workflows: ${error.message}`);
        }
        throw new UserError('Failed to export workflows with unknown error');
      }
    },
  });

  // Export workflows by tags
  server.addTool({
    name: 'export-workflows-by-tags',
    description: 'Export all workflows that have any of the specified tags',
    parameters: WorkflowsByTagsSchema,
    annotations: {
      title: 'Export Workflows by Tags',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof WorkflowsByTagsSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const exportUtils = new ExportUtils(client);
        const { tags, options = {} } = args;

        const workflowExports = await exportUtils.exportWorkflowsByTags(tags, options);

        if (workflowExports.length === 0) {
          return `No workflows found with tags: ${tags.join(', ')}`;
        }

        const summary = exportUtils.generateExportSummary(workflowExports);

        return `${summary}\n\n**Export Data:**\n\`\`\`json\n${JSON.stringify(workflowExports, null, 2)}\n\`\`\`\n\n💾 Copy the JSON data above to import these workflows into another n8n instance.`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to export workflows by tags: ${error.message}`);
        }
        throw new UserError('Failed to export workflows by tags with unknown error');
      }
    },
  });

  // Export single credential
  server.addTool({
    name: 'export-credential',
    description:
      'Export a single credential for transfer to another n8n instance. Note: Secrets are only included if explicitly requested.',
    parameters: ExportCredentialSchema,
    annotations: {
      title: 'Export Credential',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ExportCredentialSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const exportUtils = new ExportUtils(client);
        const { credentialId, ...options } = args;

        const credentialExport = await exportUtils.exportCredential(credentialId, options);

        let result = `**Credential Export:**\n`;
        result += `- Name: ${credentialExport.name}\n`;
        result += `- Type: ${credentialExport.type}\n`;
        result += `- Secrets included: ${credentialExport.sanitized ? 'No' : 'Yes'}\n`;
        result += `- Exported at: ${credentialExport.exportedAt}\n\n`;

        if (credentialExport.sanitized) {
          result += `⚠️  **Security Notice:** Credential secrets were not included. You will need to reconfigure the credential data after import.\n\n`;
        }

        result += `**Export Data:**\n\`\`\`json\n${JSON.stringify(credentialExport, null, 2)}\n\`\`\`\n\n💾 Copy the JSON data above to import this credential into another n8n instance.`;

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to export credential: ${error.message}`);
        }
        throw new UserError('Failed to export credential with unknown error');
      }
    },
  });

  // Export multiple credentials
  server.addTool({
    name: 'export-credentials',
    description: 'Export multiple credentials for batch transfer to another n8n instance',
    parameters: ExportCredentialsSchema,
    annotations: {
      title: 'Export Multiple Credentials',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ExportCredentialsSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const exportUtils = new ExportUtils(client);
        const { credentialIds, ...options } = args;

        const credentialExports = await exportUtils.exportCredentials(credentialIds, options);

        let result = `**Credentials Export Summary:**\n`;
        result += `- Total credentials: ${credentialExports.length}\n`;
        result += `- Secrets included: ${options.includeSecrets ? 'Yes' : 'No'}\n`;
        result += `- Exported at: ${new Date().toISOString()}\n\n`;

        if (!options.includeSecrets) {
          result += `⚠️  **Security Notice:** Credential secrets were not included. You will need to reconfigure credential data after import.\n\n`;
        }

        result += `**Export Data:**\n\`\`\`json\n${JSON.stringify(credentialExports, null, 2)}\n\`\`\`\n\n💾 Copy the JSON data above to import these credentials into another n8n instance.`;

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to export credentials: ${error.message}`);
        }
        throw new UserError('Failed to export credentials with unknown error');
      }
    },
  });

  // Export project
  server.addTool({
    name: 'export-project',
    description: 'Export an entire project with all its workflows, credentials, and configurations',
    parameters: ExportProjectSchema,
    annotations: {
      title: 'Export Project',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ExportProjectSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const exportUtils = new ExportUtils(client);
        const { projectId, ...options } = args;

        const projectExport = await exportUtils.exportProject(projectId, options);
        const summary = exportUtils.generateExportSummary(projectExport);

        return `${summary}\n\n**Export Data:**\n\`\`\`json\n${JSON.stringify(projectExport, null, 2)}\n\`\`\`\n\n💾 Copy the JSON data above to import this project into another n8n instance.`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to export project: ${error.message}`);
        }
        throw new UserError('Failed to export project with unknown error');
      }
    },
  });

  // Export entire instance
  server.addTool({
    name: 'export-instance',
    description:
      'Export the entire n8n instance including all projects, workflows, credentials, and configurations',
    parameters: ExportOptionsSchema,
    annotations: {
      title: 'Export Entire Instance',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ExportOptionsSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const exportUtils = new ExportUtils(client);

        const instanceExport = await exportUtils.exportInstance(args);
        const summary = exportUtils.generateExportSummary(instanceExport);

        const dataSize = JSON.stringify(instanceExport).length;
        const dataSizeMB = (dataSize / (1024 * 1024)).toFixed(2);

        return `${summary}\n\n📦 **Export Size:** ${dataSizeMB} MB\n\n**Export Data:**\n\`\`\`json\n${JSON.stringify(instanceExport, null, 2)}\n\`\`\`\n\n💾 Copy the JSON data above to import this entire instance into another n8n setup.`;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to export instance: ${error.message}`);
        }
        throw new UserError('Failed to export instance with unknown error');
      }
    },
  });

  // Import workflows/credentials/projects
  server.addTool({
    name: 'import-resources',
    description:
      'Import workflows, credentials, or projects from exported JSON data into the current n8n instance',
    parameters: ImportDataSchema,
    annotations: {
      title: 'Import Resources',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof ImportDataSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const importUtils = new ImportUtils(client);
        const exportData = JSON.parse(args.exportData);
        const options = args.options || {
          conflictResolution: 'skip' as const,
          createMissingProjects: false,
          validateCredentials: true,
          dryRun: false,
        };

        let summary;

        // Determine the type of export data and import accordingly
        if (exportData.metadata) {
          // Full instance export
          summary = await importUtils.importInstance(exportData, options);
        } else if (exportData.workflows) {
          // Project export
          summary = await importUtils.importProject(exportData, options);
        } else if (Array.isArray(exportData)) {
          // Check if it's an array of workflows or credentials
          if (exportData.length > 0 && exportData[0].nodes) {
            // Array of workflows
            summary = await importUtils.importWorkflows(exportData, options);
          } else if (exportData.length > 0 && exportData[0].type) {
            // Array of credentials - import each one
            const results = [];
            for (const credential of exportData) {
              const result = await importUtils.importCredential(credential, options);
              results.push(result);
            }
            summary = {
              totalItems: results.length,
              successful: results.filter(r => r.success).length,
              failed: results.filter(r => !r.success).length,
              skipped: 0,
              warnings: [],
              results,
              importedAt: new Date().toISOString(),
            };
          } else {
            throw new UserError('Unable to determine the type of export data');
          }
        } else if (exportData.nodes) {
          // Single workflow
          const result = await importUtils.importWorkflow(exportData, options);
          summary = {
            totalItems: 1,
            successful: result.success ? 1 : 0,
            failed: result.success ? 0 : 1,
            skipped: 0,
            warnings: result.warnings || [],
            results: [result],
            importedAt: new Date().toISOString(),
          };
        } else if (exportData.type && exportData.name) {
          // Single credential
          const result = await importUtils.importCredential(exportData, options);
          summary = {
            totalItems: 1,
            successful: result.success ? 1 : 0,
            failed: result.success ? 0 : 1,
            skipped: 0,
            warnings: [],
            results: [result],
            importedAt: new Date().toISOString(),
          };
        } else {
          throw new UserError('Unable to determine the type of export data');
        }

        const summaryText = importUtils.generateImportSummary(summary);

        if (options?.dryRun) {
          return `🧪 **DRY RUN RESULTS**\n\n${summaryText}\n\n*No actual changes were made to the n8n instance.*`;
        } else {
          return `✅ **Import Completed**\n\n${summaryText}`;
        }
      } catch (error) {
        if (error instanceof SyntaxError) {
          throw new UserError(
            'Invalid JSON data provided. Please ensure the export data is valid JSON.'
          );
        }
        if (error instanceof Error) {
          throw new UserError(`Failed to import resources: ${error.message}`);
        }
        throw new UserError('Failed to import resources with unknown error');
      }
    },
  });

  // Transfer workflows between projects
  server.addTool({
    name: 'transfer-workflows-to-project',
    description: 'Transfer workflows from one project to another within the same n8n instance',
    parameters: TransferWorkflowsSchema,
    annotations: {
      title: 'Transfer Workflows Between Projects',
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async (args: z.infer<typeof TransferWorkflowsSchema>) => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const exportUtils = new ExportUtils(client);
        const importUtils = new ImportUtils(client);

        // Export workflows
        const workflowExports = await exportUtils.exportWorkflows(args.workflowIds, {
          includeCredentials: false, // Don't duplicate credentials
        });

        // Import to target project
        const importOptions: ImportOptions = {
          targetProjectId: args.targetProjectId,
          conflictResolution: args.moveOrCopy === 'copy' ? 'rename' : 'skip',
          validateCredentials: true,
        };

        const summary = await importUtils.importWorkflows(workflowExports, importOptions);

        let result = `📁 **Workflow Transfer Results**\n\n`;
        result += `Operation: ${args.moveOrCopy.toUpperCase()}\n`;
        result += `Target Project: ${args.targetProjectId}\n\n`;
        result += importUtils.generateImportSummary(summary);

        // If moving (not copying), delete the original workflows
        if (args.moveOrCopy === 'move' && summary.successful > 0) {
          result += `\n🗑️  **Removing original workflows...**\n`;

          let deleteCount = 0;
          for (const workflowId of args.workflowIds) {
            try {
              await client.deleteWorkflow(workflowId);
              deleteCount++;
            } catch (error) {
              result += `⚠️  Failed to delete original workflow ${workflowId}: ${error instanceof Error ? error.message : 'Unknown error'}\n`;
            }
          }

          result += `✅ Deleted ${deleteCount} original workflows\n`;
        }

        return result;
      } catch (error) {
        if (error instanceof Error) {
          throw new UserError(`Failed to transfer workflows: ${error.message}`);
        }
        throw new UserError('Failed to transfer workflows with unknown error');
      }
    },
  });
}
