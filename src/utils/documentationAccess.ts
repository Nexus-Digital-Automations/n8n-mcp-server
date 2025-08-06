export interface NodeDocumentation {
  nodeType: string;
  displayName: string;
  description: string;
  version: number;
  category: string;
  parameters?: ParameterDocumentation[];
  examples?: NodeExample[];
  functions?: FunctionDocumentation[];
  credentials?: CredentialInfo[];
  webhooks?: WebhookInfo[];
  polling?: PollingInfo;
  properties?: NodeProperty[];
}

export interface ParameterDocumentation {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: any;
  options?: ParameterOption[];
  placeholder?: string;
  hint?: string;
  expression?: boolean;
}

export interface ParameterOption {
  name: string;
  value: any;
  description?: string;
}

export interface NodeExample {
  title: string;
  description: string;
  configuration: Record<string, any>;
  inputData?: any;
  expectedOutput?: any;
  useCase: string;
}

export interface FunctionDocumentation {
  name: string;
  category: 'date' | 'string' | 'number' | 'array' | 'object' | 'workflow' | 'utility';
  description: string;
  syntax: string;
  parameters?: FunctionParameter[];
  returnType: string;
  examples: FunctionExample[];
  relatedFunctions?: string[];
}

export interface FunctionParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  default?: any;
}

export interface FunctionExample {
  description: string;
  code: string;
  result: string;
  context?: string;
}

export interface CredentialInfo {
  name: string;
  displayName: string;
  required: boolean;
  description: string;
}

export interface WebhookInfo {
  httpMethod: string;
  path: string;
  description: string;
  responseMode: string;
}

export interface PollingInfo {
  enabled: boolean;
  interval: number;
  description: string;
}

export interface NodeProperty {
  name: string;
  value: any;
  description: string;
}

export interface DocumentationOptions {
  includeExamples?: boolean;
  includeFunctions?: boolean;
  includeAdvanced?: boolean;
}

/**
 * Get comprehensive documentation for a specific node type
 */
export async function getNodeDocumentation(
  nodeType: string,
  options: DocumentationOptions = {}
): Promise<NodeDocumentation> {
  const { includeExamples = true, includeFunctions = true, includeAdvanced = false } = options;

  // This is a comprehensive documentation database for common n8n nodes
  const nodeDocumentations = getNodeDocumentationDatabase();

  const baseDoc = nodeDocumentations[nodeType];
  if (!baseDoc) {
    // Return a generic template for unknown nodes
    return {
      nodeType,
      displayName: getDisplayNameFromType(nodeType),
      description: `Documentation for ${nodeType} node type`,
      version: 1,
      category: 'unknown',
      parameters: [],
      examples: includeExamples ? [] : undefined,
      functions: includeFunctions ? [] : undefined,
    };
  }

  // Filter documentation based on options
  const documentation: NodeDocumentation = {
    ...baseDoc,
    examples: includeExamples ? baseDoc.examples : undefined,
    functions: includeFunctions ? baseDoc.functions : undefined,
  };

  // Add advanced properties if requested
  if (includeAdvanced) {
    documentation.properties = baseDoc.properties || [];
    documentation.webhooks = baseDoc.webhooks;
    documentation.polling = baseDoc.polling;
  }

  return documentation;
}

/**
 * Get documentation for built-in n8n expression functions
 */
export async function getFunctionDocumentation(
  functionName: string,
  category?: 'date' | 'string' | 'number' | 'array' | 'object' | 'workflow' | 'utility'
): Promise<FunctionDocumentation> {
  const functionDocs = getFunctionDocumentationDatabase();

  // Try exact match first
  let functionDoc = functionDocs.find(f => f.name === functionName);

  // Try partial match if exact not found
  if (!functionDoc) {
    functionDoc = functionDocs.find(
      f =>
        f.name.toLowerCase().includes(functionName.toLowerCase()) ||
        functionName.toLowerCase().includes(f.name.toLowerCase())
    );
  }

  // Try category-based search if still not found and category provided
  if (!functionDoc && category) {
    functionDoc = functionDocs.find(
      f => f.category === category && f.name.toLowerCase().includes(functionName.toLowerCase())
    );
  }

  if (!functionDoc) {
    // Return a generic template for unknown functions
    return {
      name: functionName,
      category: category || 'utility',
      description: `Documentation for ${functionName} function`,
      syntax: `${functionName}()`,
      returnType: 'unknown',
      examples: [],
    };
  }

  return functionDoc;
}

/**
 * Get display name from node type
 */
function getDisplayNameFromType(nodeType: string): string {
  // Convert node type to display name
  const parts = nodeType.split('.');
  const name = parts[parts.length - 1];

  // Convert camelCase to Title Case
  return name
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .trim();
}

/**
 * Database of node documentation
 */
function getNodeDocumentationDatabase(): Record<string, NodeDocumentation> {
  return {
    'n8n-nodes-base.httpRequest': {
      nodeType: 'n8n-nodes-base.httpRequest',
      displayName: 'HTTP Request',
      description: 'Makes HTTP requests to any URL. Supports all HTTP methods and authentication.',
      version: 4,
      category: 'core',
      parameters: [
        {
          name: 'method',
          type: 'options',
          required: true,
          description: 'The HTTP method to use',
          default: 'GET',
          options: [
            { name: 'DELETE', value: 'DELETE' },
            { name: 'GET', value: 'GET' },
            { name: 'HEAD', value: 'HEAD' },
            { name: 'OPTIONS', value: 'OPTIONS' },
            { name: 'PATCH', value: 'PATCH' },
            { name: 'POST', value: 'POST' },
            { name: 'PUT', value: 'PUT' },
          ],
        },
        {
          name: 'url',
          type: 'string',
          required: true,
          description: 'The URL to make the request to',
          placeholder: 'https://httpbin.org/get',
          expression: true,
        },
        {
          name: 'authentication',
          type: 'options',
          required: false,
          description: 'Authentication method to use',
          default: 'none',
          options: [
            { name: 'None', value: 'none' },
            { name: 'Basic Auth', value: 'basicAuth' },
            { name: 'Header Auth', value: 'headerAuth' },
            { name: 'OAuth1', value: 'oAuth1' },
            { name: 'OAuth2', value: 'oAuth2' },
          ],
        },
      ],
      examples: [
        {
          title: 'Simple GET Request',
          description: 'Make a simple GET request to fetch data',
          configuration: {
            method: 'GET',
            url: 'https://jsonplaceholder.typicode.com/posts/1',
          },
          expectedOutput: {
            userId: 1,
            id: 1,
            title: 'sunt aut facere repellat provident occaecati excepturi optio reprehenderit',
            body: 'quia et suscipit\nsuscipit...',
          },
          useCase: 'Fetching data from REST APIs',
        },
        {
          title: 'POST Request with JSON Body',
          description: 'Send JSON data to an API endpoint',
          configuration: {
            method: 'POST',
            url: 'https://jsonplaceholder.typicode.com/posts',
            sendBody: true,
            contentType: 'json',
            jsonBody: '{"title": "New Post", "body": "This is a new post", "userId": 1}',
          },
          expectedOutput: {
            id: 101,
            title: 'New Post',
            body: 'This is a new post',
            userId: 1,
          },
          useCase: 'Creating new resources via API',
        },
      ],
    },

    'n8n-nodes-base.set': {
      nodeType: 'n8n-nodes-base.set',
      displayName: 'Set',
      description: 'Sets values on items and optionally remove other values',
      version: 3,
      category: 'core',
      parameters: [
        {
          name: 'keepOnlySet',
          type: 'boolean',
          required: false,
          description: 'Keep only the values set on this node and remove all others',
          default: false,
        },
        {
          name: 'values',
          type: 'fixedCollection',
          required: true,
          description: 'The values to set',
          default: {},
        },
      ],
      examples: [
        {
          title: 'Set Simple Values',
          description: 'Set string and number values on items',
          configuration: {
            keepOnlySet: false,
            values: {
              string: [
                { name: 'name', value: 'John Doe' },
                { name: 'status', value: 'active' },
              ],
              number: [
                { name: 'age', value: 30 },
                { name: 'score', value: 85.5 },
              ],
            },
          },
          inputData: { id: 1 },
          expectedOutput: { id: 1, name: 'John Doe', status: 'active', age: 30, score: 85.5 },
          useCase: 'Adding computed values to data items',
        },
      ],
    },

    'n8n-nodes-base.function': {
      nodeType: 'n8n-nodes-base.function',
      displayName: 'Function',
      description: 'Run custom JavaScript code to transform data',
      version: 1,
      category: 'core',
      parameters: [
        {
          name: 'functionCode',
          type: 'string',
          required: true,
          description: 'The JavaScript code to execute',
          default: 'return items;',
          expression: false,
        },
      ],
      examples: [
        {
          title: 'Transform Data',
          description: 'Transform incoming data using JavaScript',
          configuration: {
            functionCode: `
// Transform each item
for (const item of items) {
  item.json.fullName = \`\${item.json.firstName} \${item.json.lastName}\`;
  item.json.timestamp = new Date().toISOString();
}

return items;`,
          },
          inputData: [{ firstName: 'John', lastName: 'Doe' }],
          expectedOutput: [
            {
              firstName: 'John',
              lastName: 'Doe',
              fullName: 'John Doe',
              timestamp: '2023-12-01T10:30:00.000Z',
            },
          ],
          useCase: 'Custom data transformation logic',
        },
      ],
      functions: [
        {
          name: 'console.log',
          category: 'utility',
          description: 'Log messages for debugging',
          syntax: 'console.log(message)',
          returnType: 'void',
          examples: [
            {
              description: 'Log debug information',
              code: 'console.log("Processing item:", item.json);',
              result: 'Outputs to n8n logs',
              context: 'Function node',
            },
          ],
        },
      ],
    },

    'n8n-nodes-base.if': {
      nodeType: 'n8n-nodes-base.if',
      displayName: 'IF',
      description: 'Routes items to different outputs based on conditions',
      version: 2,
      category: 'core',
      parameters: [
        {
          name: 'conditions',
          type: 'fixedCollection',
          required: true,
          description: 'The conditions to check',
          default: {},
        },
      ],
      examples: [
        {
          title: 'Route Based on Value',
          description: 'Route items based on a field value',
          configuration: {
            conditions: {
              boolean: [
                {
                  value1: '{{ $json.age }}',
                  operation: 'largerEqual',
                  value2: 18,
                },
              ],
            },
          },
          inputData: { name: 'John', age: 25 },
          useCase: 'Conditional workflow routing',
        },
      ],
    },
  };
}

/**
 * Database of function documentation
 */
function getFunctionDocumentationDatabase(): FunctionDocumentation[] {
  return [
    // Date functions
    {
      name: 'DateTime.now',
      category: 'date',
      description: 'Gets the current date and time',
      syntax: 'DateTime.now()',
      returnType: 'DateTime',
      examples: [
        {
          description: 'Get current timestamp',
          code: '{{ DateTime.now() }}',
          result: '2023-12-01T10:30:00.000Z',
          context: 'Any expression field',
        },
      ],
    },
    {
      name: 'DateTime.format',
      category: 'date',
      description: 'Formats a date according to the specified format string',
      syntax: 'DateTime.format(formatString)',
      parameters: [
        {
          name: 'formatString',
          type: 'string',
          required: true,
          description: 'The format pattern (e.g., "yyyy-MM-dd")',
        },
      ],
      returnType: 'string',
      examples: [
        {
          description: 'Format current date as YYYY-MM-DD',
          code: '{{ DateTime.now().format("yyyy-MM-dd") }}',
          result: '2023-12-01',
          context: 'Date formatting',
        },
        {
          description: 'Format with time',
          code: '{{ DateTime.now().format("yyyy-MM-dd HH:mm:ss") }}',
          result: '2023-12-01 10:30:00',
          context: 'DateTime formatting',
        },
      ],
    },

    // String functions
    {
      name: 'String.toLowerCase',
      category: 'string',
      description: 'Converts a string to lowercase',
      syntax: 'string.toLowerCase()',
      returnType: 'string',
      examples: [
        {
          description: 'Convert to lowercase',
          code: '{{ "HELLO WORLD".toLowerCase() }}',
          result: 'hello world',
          context: 'String manipulation',
        },
        {
          description: 'Convert field value',
          code: '{{ $json.name.toLowerCase() }}',
          result: 'john doe',
          context: 'Field transformation',
        },
      ],
    },
    {
      name: 'String.toUpperCase',
      category: 'string',
      description: 'Converts a string to uppercase',
      syntax: 'string.toUpperCase()',
      returnType: 'string',
      examples: [
        {
          description: 'Convert to uppercase',
          code: '{{ "hello world".toUpperCase() }}',
          result: 'HELLO WORLD',
          context: 'String manipulation',
        },
      ],
    },
    {
      name: 'String.trim',
      category: 'string',
      description: 'Removes whitespace from both ends of a string',
      syntax: 'string.trim()',
      returnType: 'string',
      examples: [
        {
          description: 'Remove whitespace',
          code: '{{ "  hello world  ".trim() }}',
          result: 'hello world',
          context: 'String cleaning',
        },
      ],
    },

    // Number functions
    {
      name: 'Math.floor',
      category: 'number',
      description: 'Rounds a number down to the nearest integer',
      syntax: 'Math.floor(number)',
      parameters: [
        {
          name: 'number',
          type: 'number',
          required: true,
          description: 'The number to round down',
        },
      ],
      returnType: 'number',
      examples: [
        {
          description: 'Round down decimal',
          code: '{{ Math.floor(4.7) }}',
          result: '4',
          context: 'Number rounding',
        },
      ],
    },
    {
      name: 'Math.round',
      category: 'number',
      description: 'Rounds a number to the nearest integer',
      syntax: 'Math.round(number)',
      returnType: 'number',
      examples: [
        {
          description: 'Round to nearest integer',
          code: '{{ Math.round(4.7) }}',
          result: '5',
          context: 'Number rounding',
        },
      ],
    },

    // Array functions
    {
      name: 'Array.length',
      category: 'array',
      description: 'Gets the length of an array',
      syntax: 'array.length',
      returnType: 'number',
      examples: [
        {
          description: 'Get array length',
          code: '{{ $json.items.length }}',
          result: '3',
          context: 'Array size checking',
        },
      ],
    },
    {
      name: 'Array.map',
      category: 'array',
      description:
        'Creates a new array with the results of calling a function for every array element',
      syntax: 'array.map(callback)',
      returnType: 'Array',
      examples: [
        {
          description: 'Transform array elements',
          code: '{{ $json.numbers.map(x => x * 2) }}',
          result: '[2, 4, 6]',
          context: 'Array transformation',
        },
      ],
    },

    // Object functions
    {
      name: 'Object.keys',
      category: 'object',
      description: 'Returns an array of object property names',
      syntax: 'Object.keys(object)',
      parameters: [
        {
          name: 'object',
          type: 'Object',
          required: true,
          description: 'The object to get keys from',
        },
      ],
      returnType: 'Array<string>',
      examples: [
        {
          description: 'Get object keys',
          code: '{{ Object.keys($json) }}',
          result: '["name", "age", "email"]',
          context: 'Object inspection',
        },
      ],
    },
    {
      name: 'Object.values',
      category: 'object',
      description: 'Returns an array of object property values',
      syntax: 'Object.values(object)',
      returnType: 'Array',
      examples: [
        {
          description: 'Get object values',
          code: '{{ Object.values($json) }}',
          result: '["John", 30, "john@example.com"]',
          context: 'Object inspection',
        },
      ],
    },

    // Workflow functions
    {
      name: '$input.all',
      category: 'workflow',
      description: 'Gets all input items',
      syntax: '$input.all()',
      returnType: 'Array',
      examples: [
        {
          description: 'Get all input items',
          code: '{{ $input.all() }}',
          result: '[{...}, {...}]',
          context: 'Input data access',
        },
      ],
    },
    {
      name: '$input.first',
      category: 'workflow',
      description: 'Gets the first input item',
      syntax: '$input.first()',
      returnType: 'Object',
      examples: [
        {
          description: 'Get first input item',
          code: '{{ $input.first() }}',
          result: '{...}',
          context: 'Input data access',
        },
      ],
    },
  ];
}
