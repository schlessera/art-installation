#!/usr/bin/env node
/**
 * Actor Validation CLI
 *
 * Validates actors for security, API compliance, and optionally performance.
 *
 * Usage:
 *   actor-validate <entry-file>
 *   actor-validate <entry-file> --performance
 *   actor-validate <entry-file> --full
 */

import { readFileSync } from 'fs';
import { resolve } from 'path';
import { ActorValidator } from '../src/ActorValidator';

// Colors for output
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  dim: '\x1b[2m',
};

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
${colors.blue}Actor Validator${colors.reset}

Validates actors for the Art Installation project.

${colors.dim}Usage:${colors.reset}
  actor-validate <entry-file> [options]

${colors.dim}Options:${colors.reset}
  --performance    Run performance tests
  --full           Run all tests including performance
  --help, -h       Show this help

${colors.dim}Examples:${colors.reset}
  actor-validate src/index.ts
  actor-validate src/index.ts --performance
  actor-validate ./my-actor/src/index.ts --full
`);
    process.exit(0);
  }

  const entryFile = args.find((a) => !a.startsWith('--'));
  const runPerformance = args.includes('--performance') || args.includes('--full');

  if (!entryFile) {
    console.error(`${colors.red}Error: No entry file specified${colors.reset}`);
    process.exit(1);
  }

  const resolvedPath = resolve(process.cwd(), entryFile);
  console.log(`\n${colors.blue}Validating actor:${colors.reset} ${resolvedPath}\n`);

  const validator = new ActorValidator();

  // Read source file
  let source: string;
  try {
    source = readFileSync(resolvedPath, 'utf-8');
  } catch (error) {
    console.error(`${colors.red}Error reading file:${colors.reset} ${error}`);
    process.exit(1);
  }

  // Validate source
  console.log(`${colors.dim}Running static analysis...${colors.reset}`);
  const sourceResult = await validator.validateSource(source);

  // Print source validation results
  printSection('Static Analysis', sourceResult.valid);
  if (sourceResult.errors.length > 0) {
    for (const error of sourceResult.errors) {
      const location = error.line ? ` (line ${error.line})` : '';
      console.log(`  ${colors.red}${error.type}${colors.reset}: ${error.message}${location}`);
    }
  }
  if (sourceResult.warnings.length > 0) {
    for (const warning of sourceResult.warnings) {
      console.log(`  ${colors.yellow}${warning.type}${colors.reset}: ${warning.message}`);
      if (warning.suggestion) {
        console.log(`    ${colors.dim}Suggestion: ${warning.suggestion}${colors.reset}`);
      }
    }
  }
  if (sourceResult.errors.length === 0 && sourceResult.warnings.length === 0) {
    console.log(`  ${colors.green}All checks passed${colors.reset}`);
  }

  // Print stats
  console.log(`\n${colors.dim}Stats:${colors.reset}`);
  console.log(`  Code size: ${sourceResult.stats.codeSize} bytes`);
  console.log(`  Has setup: ${sourceResult.stats.hasSetup ? 'Yes' : 'No'}`);
  console.log(`  Has teardown: ${sourceResult.stats.hasTeardown ? 'Yes' : 'No'}`);
  console.log(`  Has onContextChange: ${sourceResult.stats.hasContextChange ? 'Yes' : 'No'}`);
  console.log(`  Required contexts: ${sourceResult.stats.requiredContexts.join(', ') || 'None'}`);

  // Try to import and validate actor instance
  console.log(`\n${colors.dim}Checking API compliance...${colors.reset}`);
  let actor: unknown;
  try {
    // Use dynamic import
    const module = await import(resolvedPath);
    actor = module.default;
  } catch (error) {
    console.log(`  ${colors.yellow}Warning: Could not import actor for runtime validation${colors.reset}`);
    console.log(`  ${colors.dim}${error}${colors.reset}`);
  }

  if (actor) {
    const actorResult = validator.validateActor(actor);
    printSection('API Compliance', actorResult.valid);
    if (actorResult.errors.length > 0) {
      for (const error of actorResult.errors) {
        console.log(`  ${colors.red}${error.type}${colors.reset}: ${error.message}`);
      }
    }
    if (actorResult.errors.length === 0) {
      console.log(`  ${colors.green}All checks passed${colors.reset}`);
    }

    // Run performance tests if requested
    if (runPerformance) {
      console.log(`\n${colors.dim}Running performance tests (5 seconds)...${colors.reset}`);
      const perfResult = await validator.testPerformance(actor as any, 5000);
      printSection('Performance', perfResult.passed);
      console.log(`  Average FPS: ${perfResult.avgFPS.toFixed(1)}`);
      console.log(`  Minimum FPS: ${perfResult.minFPS.toFixed(1)}`);
      if (perfResult.errors.length > 0) {
        for (const error of perfResult.errors) {
          console.log(`  ${colors.red}${error.type}${colors.reset}: ${error.message}`);
        }
      }
    }
  }

  // Summary
  const allPassed = sourceResult.valid;
  console.log(`\n${colors.dim}─────────────────────────────────────${colors.reset}`);
  if (allPassed) {
    console.log(`${colors.green}Validation PASSED${colors.reset} - Actor is ready for submission\n`);
    process.exit(0);
  } else {
    console.log(`${colors.red}Validation FAILED${colors.reset} - Please fix the errors above\n`);
    process.exit(1);
  }
}

function printSection(name: string, passed: boolean) {
  const status = passed
    ? `${colors.green}PASS${colors.reset}`
    : `${colors.red}FAIL${colors.reset}`;
  console.log(`\n${colors.blue}${name}${colors.reset} [${status}]`);
}

main().catch((error) => {
  console.error(`${colors.red}Fatal error:${colors.reset}`, error);
  process.exit(1);
});
