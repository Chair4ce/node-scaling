/**
 * Code Swarm - Parallel Code Generation
 * 
 * Concept: Orchestrator (expensive LLM) plans the architecture,
 * Workers (cheap LLMs) generate discrete functions/components in parallel.
 * 
 * The orchestrator "copy-pastes" the results together.
 */

const { Dispatcher } = require('./dispatcher');
const config = require('../config');

class CodeSwarm {
  constructor(options = {}) {
    this.dispatcher = new Dispatcher();
    this.generatedCode = new Map(); // Store generated snippets
    this.pendingTasks = new Map();  // Track in-flight tasks
    this.context = {};              // Shared context (types, interfaces, etc.)
  }

  /**
   * Define the project context that workers need
   */
  setContext(ctx) {
    this.context = {
      language: ctx.language || 'javascript',
      framework: ctx.framework || null,
      types: ctx.types || {},
      interfaces: ctx.interfaces || {},
      existingFunctions: ctx.existingFunctions || [],
      projectStructure: ctx.projectStructure || null,
    };
  }

  /**
   * Spawn a worker to generate a utility function
   * Returns immediately with a placeholder, fills in when done
   */
  async generateFunction(spec) {
    const taskId = `fn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    
    const prompt = this.buildFunctionPrompt(spec);
    
    const task = {
      id: taskId,
      nodeType: 'analyze',
      instruction: prompt,
      metadata: { type: 'function', name: spec.name },
    };

    // Execute asynchronously
    const resultPromise = this.dispatcher.executeTask(task);
    this.pendingTasks.set(taskId, resultPromise);
    
    return {
      taskId,
      placeholder: `// [SWARM] Generating: ${spec.name}...`,
      getResult: async () => {
        const result = await resultPromise;
        this.pendingTasks.delete(taskId);
        if (result.success) {
          const code = this.extractCode(result.result?.response || result.result);
          this.generatedCode.set(spec.name, code);
          return code;
        }
        return `// [SWARM ERROR] Failed to generate ${spec.name}: ${result.error}`;
      }
    };
  }

  /**
   * Generate multiple functions in parallel
   */
  async generateFunctions(specs) {
    console.log(`\n🐝 INITIALIZING CODE SWARM... (${specs.length} functions)`);
    
    const tasks = specs.map(spec => ({
      nodeType: 'analyze',
      instruction: this.buildFunctionPrompt(spec),
      metadata: { type: 'function', name: spec.name },
    }));

    const startTime = Date.now();
    const result = await this.dispatcher.executeParallel(tasks);
    const duration = Date.now() - startTime;

    const generated = {};
    result.results.forEach((r, i) => {
      const name = specs[i].name;
      if (r.success) {
        generated[name] = this.extractCode(r.result?.response || r.result);
      } else {
        generated[name] = `// [SWARM ERROR] ${r.error}`;
      }
    });

    console.log(`🐝 CODE SWARM COMPLETE ✓ ${Object.keys(generated).length} functions in ${(duration/1000).toFixed(1)}s\n`);

    return generated;
  }

  /**
   * Research and implement - worker researches packages then implements
   */
  async researchAndImplement(spec) {
    const phases = [
      {
        name: 'Research',
        tasks: [{
          nodeType: 'search',
          tool: 'web_search',
          input: `${this.context.language} ${spec.description} best library npm package`,
          options: { count: 3 },
        }],
      },
      {
        name: 'Implement',
        tasks: (prev) => {
          const searchResults = prev[0].results[0]?.result?.results || [];
          const packages = searchResults.map(r => r.title).join(', ');
          
          return [{
            nodeType: 'analyze',
            instruction: `
You are a ${this.context.language} developer. 
Based on research showing these packages might help: ${packages}

Task: ${spec.description}
Function name: ${spec.name}
${spec.inputType ? `Input type: ${spec.inputType}` : ''}
${spec.outputType ? `Output type: ${spec.outputType}` : ''}

Generate:
1. Any needed import statements
2. The function implementation
3. Brief usage example as a comment

Use native/built-in solutions if possible, otherwise recommend the simplest package.
Return ONLY the code, no explanations.
            `.trim(),
          }];
        },
      },
    ];

    const result = await this.dispatcher.orchestrate(phases, { silent: false });
    
    const implementResult = result.phases[1]?.results[0];
    if (implementResult?.success) {
      return this.extractCode(implementResult.result?.response || implementResult.result);
    }
    return `// Failed to implement ${spec.name}`;
  }

  /**
   * Generate a complete module with multiple functions
   */
  async generateModule(moduleSpec) {
    console.log(`\n🐝 INITIALIZING CODE SWARM FOR MODULE: ${moduleSpec.name}`);
    console.log(`   ${moduleSpec.functions.length} functions to generate in parallel\n`);

    const startTime = Date.now();

    // Generate all functions in parallel
    const functions = await this.generateFunctions(moduleSpec.functions);

    // Assemble the module
    const moduleCode = this.assembleModule(moduleSpec, functions);
    
    const duration = Date.now() - startTime;
    console.log(`\n🐝 MODULE COMPLETE ✓ ${moduleSpec.name} generated in ${(duration/1000).toFixed(1)}s`);

    return moduleCode;
  }

  // Helper: Build prompt for function generation
  buildFunctionPrompt(spec) {
    return `
You are a ${this.context.language} developer. Generate ONLY code, no explanations.

Function: ${spec.name}
Description: ${spec.description}
${spec.inputType ? `Input: ${spec.inputType}` : ''}
${spec.outputType ? `Output: ${spec.outputType}` : ''}
${spec.example ? `Example: ${spec.example}` : ''}

Requirements:
- Clean, production-ready code
- Include JSDoc/type annotations
- Handle edge cases
- Return ONLY the function code
    `.trim();
  }

  // Helper: Extract code from LLM response
  extractCode(response) {
    if (!response) return '// No response';
    
    // Try to extract code blocks
    const codeBlockMatch = response.match(/```(?:javascript|typescript|js|ts)?\n([\s\S]*?)```/);
    if (codeBlockMatch) {
      return codeBlockMatch[1].trim();
    }
    
    // If no code blocks, return as-is but clean up
    return response
      .replace(/^Here's.*?:\n*/i, '')
      .replace(/^```\n?/, '')
      .replace(/\n?```$/, '')
      .trim();
  }

  // Helper: Assemble functions into a module
  assembleModule(moduleSpec, functions) {
    const parts = [];
    
    // Header
    parts.push(`/**`);
    parts.push(` * ${moduleSpec.name}`);
    parts.push(` * ${moduleSpec.description || 'Generated by Swarm'}`);
    parts.push(` * Generated: ${new Date().toISOString()}`);
    parts.push(` */`);
    parts.push('');

    // Imports (if any specified)
    if (moduleSpec.imports) {
      parts.push(moduleSpec.imports);
      parts.push('');
    }

    // Functions
    for (const spec of moduleSpec.functions) {
      parts.push(`// --- ${spec.name} ---`);
      parts.push(functions[spec.name] || `// [NOT GENERATED] ${spec.name}`);
      parts.push('');
    }

    // Exports
    const exportNames = moduleSpec.functions.map(f => f.name).join(', ');
    parts.push(`module.exports = { ${exportNames} };`);

    return parts.join('\n');
  }

  // Cleanup
  shutdown() {
    this.dispatcher.shutdown();
  }
}

module.exports = { CodeSwarm };
