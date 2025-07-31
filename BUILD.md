# Build Documentation

## Build Requirements

### System Requirements
- **Node.js**: >= 18.0.0 (as specified in package.json engines)
- **npm**: Latest stable version
- **TypeScript**: ^5.3.3 (included in devDependencies)

### Development Dependencies
All required build tools are included in devDependencies:
- TypeScript compiler (`typescript`)
- ESLint for code quality (`eslint`, `@typescript-eslint/*`)
- Prettier for code formatting (`prettier`)
- Jest for testing (`jest`, `ts-jest`)
- Husky for git hooks (`husky`)

## Build Process

### Standard Build
```bash
npm run build
```

This command:
1. Compiles TypeScript using `tsconfig.build.json`
2. Outputs JavaScript files to the `build/` directory
3. Makes executable files (`index.js`, `index-fastmcp.js`) executable with proper permissions
4. Preserves shebang lines for CLI usage

### Build Configuration

#### TypeScript Configuration (`tsconfig.build.json`)
- Extends main `tsconfig.json`
- Sets `rootDir` to `./src`
- Includes all files in `src/**/*`
- Excludes test files (`tests/**/*`, `**/*.test.ts`, `**/*.spec.ts`)

#### Output Structure
```
build/
├── index.js           # Standard MCP server (executable)
├── index-fastmcp.js   # FastMCP server (executable)
├── auth/              # Authentication modules
├── client/            # n8n client
├── resources/         # MCP resources
├── tools/             # MCP tools
├── transport/         # Transport layer
└── types/             # Type definitions
```

## Quality Standards

### Code Quality Checks
```bash
npm run quality
```

This runs:
1. TypeScript compilation check (`npm run lint`)
2. ESLint code quality check (`npm run lint:eslint`)
3. Prettier format check (`npm run format:check`)
4. Test coverage (`npm run test:coverage`)

### Pre-commit Hooks
Husky ensures quality before commits:
- Runs TypeScript compilation check
- Runs ESLint with auto-fix
- Runs Prettier format check
- All checks must pass before commit

## Build Scripts

### Available Scripts
- `npm run build` - Full build process
- `npm run start` - Run standard MCP server
- `npm run start:fastmcp` - Run FastMCP server
- `npm run dev:fastmcp` - Development mode with FastMCP
- `npm run lint` - TypeScript compilation check
- `npm run lint:eslint` - ESLint check
- `npm run lint:fix` - ESLint auto-fix
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting
- `npm run quality` - Run all quality checks
- `npm run prepublishOnly` - Pre-publish build (runs automatically)
- `npm run clean` - Remove build and coverage directories

### Test Scripts
- `npm run test` - Run all tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Run tests with coverage report
- `npm run test:unit` - Run unit tests only
- `npm run test:integration` - Run integration tests only

## Publishing Build

### Pre-publish Process
The `prepublishOnly` script automatically:
1. Runs the full build process
2. Ensures executable permissions are set
3. Validates all files are properly generated

### Package Contents
The published package includes:
- `build/` directory (compiled JavaScript)
- `README.md` (documentation)
- `LICENSE` (MIT license)
- `package.json` (package metadata)

### Binary Executables
Two CLI executables are provided:
- `n8n-mcp-server` - Standard MCP server
- `n8n-mcp-server-fastmcp` - FastMCP-enhanced server

Both are properly configured with:
- Shebang lines (`#!/usr/bin/env node`)
- Executable permissions
- Node.js ES module support

## Development Build

### Watch Mode Development
```bash
npm run dev:fastmcp
```

This provides:
- Live reloading with FastMCP dev tools
- Interactive CLI for testing
- Real-time error reporting

### Testing the Build
```bash
# Test standard server
node build/index.js

# Test FastMCP server  
node build/index-fastmcp.js

# Test as executables
./build/index.js
./build/index-fastmcp.js
```

## Build Validation

### Quality Gates
All builds must pass:
- ✅ TypeScript compilation without errors
- ✅ ESLint code quality checks
- ✅ Prettier formatting standards
- ✅ Test suite with minimum coverage
- ✅ Executable permissions correctly set
- ✅ Shebang lines preserved

### Coverage Requirements
- Minimum 80% test coverage for production builds
- Current coverage: 39.4% (improvement needed for auth, resources, transport modules)

## Troubleshooting

### Common Build Issues

1. **TypeScript Compilation Errors**
   ```bash
   npm run lint
   ```
   Fix any type errors reported

2. **ESLint Issues**
   ```bash
   npm run lint:fix
   ```
   Auto-fix common linting issues

3. **Formatting Issues**
   ```bash
   npm run format
   ```
   Auto-format code with Prettier

4. **Permission Issues**
   ```bash
   chmod +x build/index.js build/index-fastmcp.js
   ```
   Manually set executable permissions

5. **Clean Build**
   ```bash
   npm run clean && npm run build
   ```
   Remove old build artifacts and rebuild

### Build Environment
- Ensure Node.js version >= 18.0.0
- Use npm (not yarn) for consistency
- Run builds in clean environment for production
- Verify all dependencies are properly installed