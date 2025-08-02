import js from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';

export default [
  // Apply to TypeScript files
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      },
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        URLSearchParams: 'readonly',
        process: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      // Recommended JavaScript rules
      ...js.configs.recommended.rules,
      
      // TypeScript specific rules
      'no-unused-vars': 'off', // Turn off base rule for TypeScript files
      '@typescript-eslint/no-unused-vars': ['error', { 
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_'
      }],
      '@typescript-eslint/no-explicit-any': 'off', // Disabled during FastMCP refactoring
      '@typescript-eslint/no-non-null-assertion': 'warn',
      
      // Code quality rules
      'no-console': 'off', // Allow console in application code
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },
  
  // Apply to test files (Jest environment)
  {
    files: ['**/*.test.ts', '**/*.spec.ts', '**/tests/**/*.ts', '**/__tests__/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module'
      },
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        URLSearchParams: 'readonly',
        process: 'readonly',
        global: 'readonly',
        // Jest globals
        jest: 'readonly',
        expect: 'readonly',
        test: 'readonly',
        it: 'readonly',
        describe: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        afterAll: 'readonly',
        afterEach: 'readonly',
        // Node.js globals for test files
        require: 'readonly'
      }
    },
    plugins: {
      '@typescript-eslint': tseslint
    },
    rules: {
      // Recommended JavaScript rules
      ...js.configs.recommended.rules,
      
      // TypeScript specific rules - more permissive for test files
      '@typescript-eslint/no-unused-vars': 'off', // Disable for test files
      'no-unused-vars': 'off', // Turn off base rule
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'warn',
      
      // Code quality rules
      'no-console': 'off',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },
  
  // Apply to JavaScript files (excluding Jest config which has its own config)
  {
    files: ['**/*.js', '**/*.mjs'],
    ignores: ['jest.config.js', '**/jest.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        URLSearchParams: 'readonly',
        process: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-console': 'warn',
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },
  
  // Apply to Jest configuration file specifically (must come after JS config to override)
  {
    files: ['jest.config.js', '**/jest.config.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        // Node.js globals required for Jest configuration
        process: 'readonly',
        Buffer: 'readonly',
        console: 'readonly',
        module: 'readonly',
        require: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        // Additional Node.js globals that might be used in Jest config
        global: 'readonly',
        exports: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-console': 'off', // Allow console in configuration files
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error',
      'no-undef': 'error' // Explicitly enable no-undef rule
    }
  },
  
  // Apply to CommonJS files
  {
    files: ['**/*.cjs', '**/create-quality-tasks.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'commonjs',
      globals: {
        require: 'readonly',
        module: 'readonly',
        exports: 'readonly',
        console: 'readonly',
        process: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly'
      }
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-console': 'off', // Allow console in CommonJS utility scripts
      'no-debugger': 'error',
      'prefer-const': 'error',
      'no-var': 'error'
    }
  },
  
  // Ignore patterns
  {
    ignores: [
      'coverage/',
      'node_modules/',
      'dist/',
      'build/',
      '*.min.js',
      '*.json',
      '*.md',
      '*.txt',
      '*.yml',
      '*.yaml',
      '*.xml',
      '*.csv',
      '*.log',
      // Temporarily ignore AI-centric Phase 3 files for production deployment
      'src/tools/ai-config.ts',
      'src/tools/ai-models.ts',
      'src/tools/ai-testing.ts',
      'src/tools/analytics.ts',
      'src/tools/monitoring.ts',
      'src/tools/templates.ts'
    ]
  }
];