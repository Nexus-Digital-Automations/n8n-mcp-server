import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { createAuditTools } from '../../../src/tools/audit';
import { N8nClient } from '../../../src/client/n8nClient';

describe('Audit Tools', () => {
  let mockClient: jest.Mocked<N8nClient>;
  let mockServer: any;
  let getClient: () => N8nClient | null;

  beforeEach(() => {
    mockClient = (global as any).testUtils.createMockClient() as jest.Mocked<N8nClient>;
    getClient = jest.fn(() => mockClient);
    mockServer = {
      addTool: jest.fn(),
    };

    // Register audit tools
    createAuditTools(getClient, mockServer);
  });

  it('should register all audit tools', () => {
    expect(mockServer.addTool).toHaveBeenCalledTimes(1);

    const toolNames = mockServer.addTool.mock.calls.map((call: any) => call[0].name);
    expect(toolNames).toContain('generate-audit-report');
  });

  describe('generate-audit-report tool', () => {
    let generateAuditReportTool: any;

    beforeEach(() => {
      generateAuditReportTool = mockServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'generate-audit-report'
      )[0];
    });

    it('should generate audit report successfully with all sections', async () => {
      const mockAuditReport = {
        'Database Settings': {
          type: 'sqlite',
          encryption: true,
        },
        'Credentials Risk Report': {
          'high-risk-credentials': 2,
          'unencrypted-credentials': 0,
        },
        'Nodes Risk Report': {
          'deprecated-nodes': 1,
          'external-api-nodes': 5,
        },
        'Instance Risk Report': {
          'admin-users': 2,
          'open-permissions': false,
        },
      };

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      expect(mockClient.generateAuditReport).toHaveBeenCalledWith();
      expect(result).toContain('# n8n Security Audit Report');
      expect(result).toContain('## Database Settings');
      expect(result).toContain('## Credentials Risk Assessment');
      expect(result).toContain('## Nodes Risk Assessment');
      expect(result).toContain('## Instance Risk Assessment');
      expect(result).toContain('sqlite');
      expect(result).toContain('high-risk-credentials');
      expect(result).toContain('Security Recommendations');
    });

    it('should handle audit report with empty risk sections', async () => {
      const mockAuditReport = {
        'Database Settings': {
          type: 'postgresql',
        },
        'Credentials Risk Report': {},
        'Nodes Risk Report': {},
        'Instance Risk Report': {},
      };

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      expect(result).toContain('No credential risk issues found');
      expect(result).toContain('No node risk issues found');
      expect(result).toContain('No instance risk issues found');
    });

    it('should handle audit report with unusual data structures', async () => {
      const mockAuditReport = {
        'Database Settings': {
          type: 'mysql',
        },
        'Credentials Risk Report': {
          status: 'No issues found',
        },
        'Nodes Risk Report': {
          nodes: ['node1', 'node2'],
        },
        'Instance Risk Report': {
          value: null,
        },
      };

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      expect(result).toContain('No issues found');
      expect(result).toContain('node1');
      expect(result).toContain('null');
    });

    it('should handle audit report with additional unknown sections', async () => {
      const mockAuditReport = {
        'Database Settings': {
          type: 'sqlite',
        },
        'Custom Security Section': {
          'custom-metric': 'value',
        },
        'Another Section': ['item1', 'item2'],
      };

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      expect(result).toContain('## Additional Audit Information');
      expect(result).toContain('### Custom Security Section');
      expect(result).toContain('### Another Section');
      expect(result).toContain('custom-metric');
      expect(result).toContain('item1');
    });

    it('should handle license-related errors', async () => {
      mockClient.generateAuditReport.mockRejectedValue(
        new Error('This feature requires an Enterprise license')
      );

      await expect(generateAuditReportTool.execute({})).rejects.toThrow(
        'This operation may require an n8n Enterprise license'
      );
    });

    it('should handle generic API errors', async () => {
      mockClient.generateAuditReport.mockRejectedValue(new Error('API connection failed'));

      await expect(generateAuditReportTool.execute({})).rejects.toThrow(
        'Failed to generate audit report: API connection failed'
      );
    });

    it('should handle unknown errors', async () => {
      mockClient.generateAuditReport.mockRejectedValue('Unknown error');

      await expect(generateAuditReportTool.execute({})).rejects.toThrow(
        'Failed to generate audit report with unknown error'
      );
    });

    it('should throw UserError when client is not initialized', async () => {
      const uninitializedGetClient = jest.fn(() => null);
      const uninitializedServer = { addTool: jest.fn() };

      createAuditTools(uninitializedGetClient, uninitializedServer);
      const tool = uninitializedServer.addTool.mock.calls.find(
        (call: any) => call[0].name === 'generate-audit-report'
      )?.[0];

      expect(tool).toBeDefined();
      expect(tool).toHaveProperty('execute');
      await expect((tool as any).execute({})).rejects.toThrow(
        'n8n client not initialized. Please run init-n8n first.'
      );
    });

    it('should have correct tool annotations', () => {
      expect(generateAuditReportTool.annotations).toEqual({
        title: 'Generate Audit Report',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      });
    });

    it('should accept empty parameters object', () => {
      expect(generateAuditReportTool.parameters).toBeDefined();
      // Zod schema should accept empty object
      expect(() => generateAuditReportTool.parameters.parse({})).not.toThrow();
    });

    it('should format current date and time in report', async () => {
      const mockAuditReport = {
        'Database Settings': { type: 'test' },
      };

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      // Check that a date is included in the report
      expect(result).toMatch(/\*\*Generated:\*\* \d{1,2}\/\d{1,2}\/\d{4}/);
    });

    it('should handle credentials risk report as non-object (null)', async () => {
      const mockAuditReport = {
        'Database Settings': { type: 'test' },
        'Credentials Risk Report': null,
      } as any;

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      // null is falsy, so the credentials section should not appear
      expect(result).not.toContain('## Credentials Risk Assessment');
    });

    it('should handle credentials risk report as primitive string', async () => {
      const mockAuditReport = {
        'Database Settings': { type: 'test' },
        'Credentials Risk Report': 'No risk assessment available',
      } as any;

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      expect(result).toContain('## Credentials Risk Assessment');
      expect(result).toContain('```json\n"No risk assessment available"\n```');
    });

    it('should handle nodes risk report as non-object (array)', async () => {
      const mockAuditReport = {
        'Database Settings': { type: 'test' },
        'Nodes Risk Report': ['node1', 'node2', 'node3'],
      } as any;

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      expect(result).toContain('## Nodes Risk Assessment');
      // Arrays are objects in JavaScript, so Object.entries() converts indices to keys
      expect(result).toContain('**0:** "node1"');
      expect(result).toContain('**1:** "node2"');
      expect(result).toContain('**2:** "node3"');
    });

    it('should handle nodes risk report as primitive number', async () => {
      const mockAuditReport = {
        'Database Settings': { type: 'test' },
        'Nodes Risk Report': 42,
      } as any;

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      expect(result).toContain('## Nodes Risk Assessment');
      expect(result).toContain('```json\n42\n```');
    });

    it('should handle instance risk report as non-object (boolean)', async () => {
      const mockAuditReport = {
        'Database Settings': { type: 'test' },
        'Instance Risk Report': false,
      } as any;

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      // false is falsy, so the instance section should not appear
      expect(result).not.toContain('## Instance Risk Assessment');
    });

    it('should handle instance risk report as string', async () => {
      const mockAuditReport = {
        'Database Settings': { type: 'test' },
        'Instance Risk Report': 'Instance is secure',
      } as any;

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      expect(result).toContain('## Instance Risk Assessment');
      expect(result).toContain('```json\n"Instance is secure"\n```');
    });

    it('should handle all risk reports as non-objects simultaneously', async () => {
      const mockAuditReport = {
        'Database Settings': { type: 'test' },
        'Credentials Risk Report': 'All credentials secure',
        'Nodes Risk Report': ['secure-node-1', 'secure-node-2'],
        'Instance Risk Report': true,
      } as any;

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      expect(result).toContain('## Credentials Risk Assessment');  
      expect(result).toContain('```json\n"All credentials secure"\n```');
      expect(result).toContain('## Nodes Risk Assessment');
      // Arrays are objects, so they use Object.entries() processing
      expect(result).toContain('**0:** "secure-node-1"');
      expect(result).toContain('**1:** "secure-node-2"');
      expect(result).toContain('## Instance Risk Assessment');
      expect(result).toContain('```json\ntrue\n```');
    });

    it('should handle mixed risk report types (some objects, some non-objects)', async () => {
      const mockAuditReport = {
        'Database Settings': { type: 'test' },
        'Credentials Risk Report': {
          'encrypted-count': 5,
          'total-count': 10,
        },
        'Nodes Risk Report': 'No nodes to assess',
        'Instance Risk Report': null,
      } as any;

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      // Object-type report should show key-value pairs
      expect(result).toContain('**encrypted-count:** 5');
      expect(result).toContain('**total-count:** 10');
      
      // String-type report should show JSON block
      expect(result).toContain('```json\n"No nodes to assess"\n```');
      
      // Null is falsy, so instance section should not appear
      expect(result).not.toContain('## Instance Risk Assessment');
    });

    it('should handle undefined/missing risk report sections gracefully', async () => {
      const mockAuditReport = {
        'Database Settings': { type: 'test' },
        'Credentials Risk Report': undefined,
      } as any;

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      // Should not include the credentials section if it's undefined
      expect(result).not.toContain('## Credentials Risk Assessment');
    });

    // Additional tests to ensure we cover the JSON formatting branches for non-object truthy values
    it('should handle credentials risk report as truthy non-object (zero)', async () => {
      const mockAuditReport = {
        'Database Settings': { type: 'test' },
        'Credentials Risk Report': 0, // truthy check fails, but exists
      } as any;

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      // 0 is falsy, so the credentials section should not appear
      expect(result).not.toContain('## Credentials Risk Assessment');
    });

    it('should handle nodes risk report as truthy non-object (empty string)', async () => {
      const mockAuditReport = {
        'Database Settings': { type: 'test' },
        'Nodes Risk Report': '', // falsy
      } as any;

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      // Empty string is falsy, so the nodes section should not appear
      expect(result).not.toContain('## Nodes Risk Assessment');
    });

    it('should cover all JSON formatting branches with non-object truthy values', async () => {
      const mockAuditReport = {
        'Database Settings': { type: 'test' },
        'Credentials Risk Report': 'credentials-info', // truthy string - triggers lines 56-58
        'Nodes Risk Report': 42, // truthy number - triggers lines 78-80  
        'Instance Risk Report': 'instance-secure', // truthy string - triggers lines 100-102
      } as any;

      mockClient.generateAuditReport.mockResolvedValue(mockAuditReport);

      const result = await generateAuditReportTool.execute({});

      expect(result).toContain('## Credentials Risk Assessment');
      expect(result).toContain('```json\n"credentials-info"\n```');
      expect(result).toContain('## Nodes Risk Assessment');
      expect(result).toContain('```json\n42\n```');
      expect(result).toContain('## Instance Risk Assessment');
      expect(result).toContain('```json\n"instance-secure"\n```');
    });
  });
});
