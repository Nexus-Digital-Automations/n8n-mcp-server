const TaskManager = require('/Users/jeremyparker/Desktop/Claude Coding Projects/infinite-continue-stop-hook/lib/taskManager');

async function createQualityTasks() {
  const tm = new TaskManager('./TODO.json');
  
  try {
    const data = await tm.readTodo();
    const timestamp = Date.now();
    
    const tasksToAdd = [
      {
        id: `fix-linter-create-quality-tasks-${timestamp}`,
        title: 'Fix Linter Errors in create-quality-tasks.js',
        description: 'Resolve 7 errors and 5 warnings in create-quality-tasks.js by configuring CommonJS environment globals for ESLint',
        mode: 'development',
        priority: 'high',
        status: 'pending',
        success_criteria: [
          'All 7 linter errors resolved in create-quality-tasks.js',
          'All 5 linter warnings addressed',
          'ESLint passes without errors for the file',
          'CommonJS environment properly configured in eslint.config.js'
        ],
        important_files: ['create-quality-tasks.js', 'eslint.config.js'],
        estimate: '30 minutes',
        created_at: new Date().toISOString()
      },
      {
        id: `fix-typescript-test-compilation-${timestamp + 1}`,
        title: 'Fix TypeScript Test Compilation Errors',
        description: 'Resolve TypeScript compilation errors preventing Jest from running tests, specifically fixing type issues with mocks and test utilities',
        mode: 'testing',
        priority: 'high',
        status: 'pending',
        success_criteria: [
          'All TypeScript compilation errors in test files resolved',
          'Jest can compile and execute tests without TS errors',
          'Mock configurations properly typed',
          'Global test utilities properly declared and typed'
        ],
        important_files: [
          'tests/setup.ts',
          'tests/unit/client/n8nClient.test.ts',
          'tests/unit/tools/workflow.test.ts',
          'tests/integration/fastmcp-server.test.ts',
          'jest.config.js'
        ],
        estimate: '2-3 hours',
        created_at: new Date().toISOString()
      },
      {
        id: `improve-test-coverage-quality-${timestamp + 2}`,
        title: 'Improve Test Coverage to 80% Minimum',
        description: 'Fix failing tests and add comprehensive unit tests to achieve minimum 80% test coverage across all source modules',
        mode: 'testing',
        priority: 'high',
        status: 'pending',
        success_criteria: [
          'All existing tests pass without errors',
          'Test coverage reaches minimum 80% across all src/ modules',
          'Unit tests cover core functionality of n8nClient and tools',
          'Integration tests validate FastMCP server functionality',
          'Coverage reporting shows consistent quality metrics'
        ],
        important_files: [
          'tests/unit/',
          'tests/integration/',
          'src/client/n8nClient.ts',
          'src/tools/',
          'jest.config.js'
        ],
        estimate: '4-6 hours',
        dependencies: [`fix-typescript-test-compilation-${timestamp + 1}`],
        created_at: new Date().toISOString()
      }
    ];
    
    // Insert tasks before existing quality improvement tasks but after regular development tasks
    const insertIndex = data.tasks.findIndex(task => task.id.includes('quality-improvement'));
    if (insertIndex !== -1) {
      data.tasks.splice(insertIndex, 0, ...tasksToAdd);
    } else {
      data.tasks.push(...tasksToAdd);
    }
    
    await tm.writeTodo(data);
    console.log('✅ Created 3 quality improvement tasks to address project quality gaps');
    console.log('');
    console.log('Quality Analysis Summary:');
    console.log('- Strike 1 (Build): 100% ✅');
    console.log('- Strike 2 (Lint): 60% ❌ (Lint check failed)');
    console.log('- Strike 3 (Tests): 30% ❌ (Tests failing, coverage failed)');
    console.log('');
    console.log('Tasks created to address quality issues:');
    tasksToAdd.forEach((task, index) => {
      console.log(`${index + 1}. ${task.title} (${task.id})`);
      console.log(`   Priority: ${task.priority} | Mode: ${task.mode} | Estimate: ${task.estimate}`);
    });
    console.log('');
    console.log('Next Steps:');
    console.log('1. Fix linter errors in create-quality-tasks.js (this file)');
    console.log('2. Resolve TypeScript compilation issues in test files');
    console.log('3. Improve test coverage to reach 80% minimum');
    console.log('');
    console.log('These tasks will bring all quality strikes to 100%');
    
  } catch (error) {
    console.error('❌ Error creating quality tasks:', error.message);
    process.exit(1);
  }
}

createQualityTasks();