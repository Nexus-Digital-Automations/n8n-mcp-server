import { z } from 'zod';
import { UserError } from 'fastmcp';
import { N8nClient } from '../client/n8nClient.js';

// Tool registration function
export function createAuditTools(getClient: () => N8nClient | null, server: any) {
  // Generate audit report tool
  server.addTool({
    name: 'generate-audit-report',
    description:
      'Generate a comprehensive security and configuration audit report for the n8n instance. NOTE: May require Enterprise license',
    parameters: z.object({}),
    annotations: {
      title: 'Generate Audit Report',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
    execute: async () => {
      const client = getClient();
      if (!client) {
        throw new UserError('n8n client not initialized. Please run init-n8n first.');
      }

      try {
        const auditReport = await client.generateAuditReport();

        let result = `# n8n Security Audit Report\n\n`;
        result += `**Generated:** ${new Date().toLocaleString()}\n\n`;

        // Database Settings section
        if (auditReport['Database Settings']) {
          result += `## Database Settings\n\n`;
          const dbSettings = auditReport['Database Settings'];
          result += '```json\n';
          result += JSON.stringify(dbSettings, null, 2);
          result += '\n```\n\n';
        }

        // Credentials Risk Report section
        if (auditReport['Credentials Risk Report']) {
          result += `## Credentials Risk Assessment\n\n`;
          const credRisk = auditReport['Credentials Risk Report'];

          if (typeof credRisk === 'object' && credRisk !== null) {
            const entries = Object.entries(credRisk);
            if (entries.length > 0) {
              entries.forEach(([key, value]) => {
                result += `**${key}:** ${JSON.stringify(value)}\n`;
              });
            } else {
              result += `No credential risk issues found.\n`;
            }
          } else {
            result += '```json\n';
            result += JSON.stringify(credRisk, null, 2);
            result += '\n```\n';
          }
          result += '\n';
        }

        // Nodes Risk Report section
        if (auditReport['Nodes Risk Report']) {
          result += `## Nodes Risk Assessment\n\n`;
          const nodesRisk = auditReport['Nodes Risk Report'];

          if (typeof nodesRisk === 'object' && nodesRisk !== null) {
            const entries = Object.entries(nodesRisk);
            if (entries.length > 0) {
              entries.forEach(([key, value]) => {
                result += `**${key}:** ${JSON.stringify(value)}\n`;
              });
            } else {
              result += `No node risk issues found.\n`;
            }
          } else {
            result += '```json\n';
            result += JSON.stringify(nodesRisk, null, 2);
            result += '\n```\n';
          }
          result += '\n';
        }

        // Instance Risk Report section
        if (auditReport['Instance Risk Report']) {
          result += `## Instance Risk Assessment\n\n`;
          const instanceRisk = auditReport['Instance Risk Report'];

          if (typeof instanceRisk === 'object' && instanceRisk !== null) {
            const entries = Object.entries(instanceRisk);
            if (entries.length > 0) {
              entries.forEach(([key, value]) => {
                result += `**${key}:** ${JSON.stringify(value)}\n`;
              });
            } else {
              result += `No instance risk issues found.\n`;
            }
          } else {
            result += '```json\n';
            result += JSON.stringify(instanceRisk, null, 2);
            result += '\n```\n';
          }
          result += '\n';
        }

        // Add any additional sections that might be present
        const knownSections = [
          'Database Settings',
          'Credentials Risk Report',
          'Nodes Risk Report',
          'Instance Risk Report',
        ];
        const additionalSections = Object.keys(auditReport).filter(
          key => !knownSections.includes(key)
        );

        if (additionalSections.length > 0) {
          result += `## Additional Audit Information\n\n`;
          additionalSections.forEach(section => {
            result += `### ${section}\n\n`;
            result += '```json\n';
            result += JSON.stringify((auditReport as Record<string, unknown>)[section], null, 2);
            result += '\n```\n\n';
          });
        }

        result += `---\n\n`;
        result += `**Security Recommendations:**\n`;
        result += `- Review any identified risk issues above\n`;
        result += `- Ensure credentials are properly scoped and secured\n`;
        result += `- Regularly update n8n to the latest version\n`;
        result += `- Monitor and audit workflow access permissions\n`;
        result += `- Use environment variables for sensitive configuration\n`;

        return result;
      } catch (error) {
        if (error instanceof Error) {
          // Check for license-related errors
          if (error.message.includes('license') || error.message.includes('Enterprise')) {
            throw new UserError(
              `This operation may require an n8n Enterprise license. Error: ${error.message}`
            );
          }
          throw new UserError(`Failed to generate audit report: ${error.message}`);
        }
        throw new UserError('Failed to generate audit report with unknown error');
      }
    },
  });
}
