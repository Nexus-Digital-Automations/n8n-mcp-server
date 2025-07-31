# Testing Infrastructure Documentation

## Overview

This document describes the optimized Jest testing infrastructure for the n8n MCP Server project, including coverage thresholds, CI integration, and performance optimizations.

## Jest Configuration

### Coverage Thresholds

The project uses production-ready coverage thresholds to ensure code quality:

- **Global Thresholds**: 80% minimum across all metrics (branches, functions, lines, statements)
- **Module-Specific Thresholds**:
  - **Tools** (`src/tools/`): 95% (highest quality requirement)
  - **Client** (`src/client/`): 95% (critical functionality)
  - **Transport** (`src/transport/`): 90% (core infrastructure)
  - **Auth** (`src/auth/`): 75% (more lenient due to external dependencies)
  - **Resources** (`src/resources/`): 75% (more lenient due to external dependencies)

### Performance Optimizations

#### CI Environment Optimizations

- **Parallel Execution**: Limited to 2 workers in CI, 50% of CPU cores locally
- **Silent Mode**: Reduced output in CI for faster execution
- **Bail Configuration**: Fail-fast in CI (bail on first failure)
- **No Watch Mode**: Explicitly disabled in CI

#### Development Optimizations

- **Caching**: Jest cache enabled with dedicated directory (`.jest-cache`)
- **Open Handle Detection**: Enabled in development, disabled in CI
- **Verbose Output**: Conditional based on environment

## Test Scripts

### Available Commands

| Script | Purpose | Environment |
|--------|---------|-------------|
| `npm test` | Run all tests with default configuration | Development |
| `npm run test:watch` | Run tests in watch mode | Development |
| `npm run test:coverage` | Generate coverage report locally | Development |
| `npm run test:coverage:ci` | Generate coverage report for CI | CI |
| `npm run test:unit` | Run only unit tests | Both |
| `npm run test:integration` | Run only integration tests | Both |
| `npm run test:e2e` | Run only end-to-end tests | Both |
| `npm run test:ci` | Optimized CI test run with coverage | CI |
| `npm run test:fast` | Quick test run with minimal output | Development |

### CI Integration

The GitHub Actions workflow uses optimized test commands:

```yaml
- name: Run unit tests
  run: npm run test:unit

- name: Run integration tests
  run: npm run test:integration

- name: Generate coverage report
  run: npm run test:coverage:ci
```

## Coverage Reporting

### Reporters

- **Local Development**: Text and HTML reports
- **CI Environment**: LCOV, JSON summary, and JUnit XML for integration with external tools

### Coverage Exclusions

The following patterns are excluded from coverage:

- Node modules (`/node_modules/`)
- Build outputs (`/build/`, `/coverage/`)
- Test files (`/tests/`, `*.test.ts`, `*.spec.ts`)
- Type definitions (`*.d.ts`)
- Configuration files (`*.config.js`)

## File Structure

```
tests/
├── __mocks__/          # Jest mocks for external dependencies
├── e2e/               # End-to-end tests
├── fixtures/          # Test data and fixtures
├── integration/       # Integration tests
├── unit/             # Unit tests (mirrors src structure)
├── setup.ts          # Test setup and global configuration
└── types/            # TypeScript type definitions for tests
```

## Current Coverage Status

As of the latest run:

- **Overall Coverage**: 72.15%
- **High-Coverage Modules**:
  - Tools: 98.78%
  - Client: 100%
  - Transport: 98.09%
- **Areas for Improvement**:
  - Entry points (index files): 0% (major impact on global average)
  - Resource Manager: 37.17%

## Best Practices

### Writing Tests

1. **Descriptive Test Names**: Use clear, descriptive test names that explain what is being tested
2. **Test Structure**: Follow Arrange-Act-Assert pattern
3. **Mock External Dependencies**: Use mocks for external APIs and services
4. **Test Edge Cases**: Include tests for error conditions and edge cases
5. **Maintain Test Isolation**: Each test should be independent and not rely on others

### Coverage Guidelines

1. **Focus on Critical Paths**: Prioritize coverage for business-critical functionality
2. **Test Public APIs**: Ensure all public methods and functions have tests
3. **Error Handling**: Test both success and failure scenarios
4. **Integration Points**: Test module boundaries and integration points

## Troubleshooting

### Common Issues

1. **Low Coverage**: Check coverage report to identify untested code paths
2. **Flaky Tests**: Often caused by async operations or external dependencies
3. **Memory Leaks**: Use `detectOpenHandles` in development to identify issues
4. **Slow Tests**: Profile tests and consider using `--maxWorkers` optimization

### Performance Tips

1. **Parallel Execution**: Use appropriate worker count for your environment
2. **Test Filtering**: Use specific test patterns to run subsets of tests
3. **Mock Heavy Operations**: Mock file system, network, and database operations
4. **Cache Configuration**: Ensure Jest cache is properly configured

## Future Improvements

1. **Entry Point Coverage**: Add integration tests for main entry points
2. **Resource Manager**: Improve unit test coverage for resource management logic
3. **Performance Benchmarks**: Add performance regression testing
4. **Visual Regression**: Consider adding visual testing for documentation
5. **Mutation Testing**: Implement mutation testing for critical modules