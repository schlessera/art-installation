#!/usr/bin/env node
/**
 * Generate a community actor from a text description using Claude API.
 *
 * Usage:
 *   pnpm generate:actor "spiraling fractals that react to music"
 *   pnpm generate:actor "aurora borealis background" --name aurora-bg --role background
 *   pnpm generate:actor "film grain effect" --role filter --author "Jane Doe"
 *
 * Requires ANTHROPIC_API_KEY environment variable.
 * If not set, prints the prompt for manual use.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const GUIDE_PATH = join(ROOT, 'docs/ACTOR_GUIDE.md');
const COMMUNITY_DIR = join(ROOT, 'actors/community');

function run(cmd, opts = {}) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf-8', ...opts }).trim();
}

function runInherit(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function fail(msg) {
  console.error(`\n❌ ${msg}`);
  process.exit(1);
}

function info(msg) {
  console.log(`\n→ ${msg}`);
}

function parseArgs(argv) {
  const args = argv.slice(2);
  const result = { description: '', name: '', role: '', author: '', github: '' };
  const positional = [];

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith('--name=')) result.name = args[i].split('=')[1];
    else if (args[i] === '--name') result.name = args[++i] || '';
    else if (args[i].startsWith('--role=')) result.role = args[i].split('=')[1];
    else if (args[i] === '--role') result.role = args[++i] || '';
    else if (args[i].startsWith('--author=')) result.author = args[i].split('=')[1];
    else if (args[i] === '--author') result.author = args[++i] || '';
    else if (args[i].startsWith('--github=')) result.github = args[i].split('=')[1];
    else if (args[i] === '--github') result.github = args[++i] || '';
    else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`Usage: pnpm generate:actor "<description>" [options]

Options:
  --name <name>      Actor name (kebab-case). Auto-generated from description if omitted.
  --role <role>       Actor role: foreground (default), background, filter
  --author <name>     Author name (default: "Hackathon Dev")
  --github <handle>   GitHub username

Examples:
  pnpm generate:actor "spiraling fractals that react to music"
  pnpm generate:actor "calm ocean waves" --name ocean-drift --role background
  pnpm generate:actor "retro VHS glitch" --role filter`);
      process.exit(0);
    }
    else positional.push(args[i]);
  }

  result.description = positional.join(' ');
  return result;
}

function descriptionToName(description) {
  // Take first 3-4 meaningful words, convert to kebab-case
  const stopWords = new Set(['a', 'an', 'the', 'that', 'which', 'with', 'and', 'or', 'to', 'in', 'on', 'for', 'of', 'from']);
  const words = description
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .split(/\s+/)
    .filter(w => w.length > 1 && !stopWords.has(w))
    .slice(0, 3);

  if (words.length === 0) return 'generated-actor';
  return words.join('-');
}

async function callClaudeAPI(systemPrompt, userPrompt, apiKey) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Claude API error (${response.status}): ${errorBody}`);
  }

  const data = await response.json();
  return data.content[0].text;
}

function extractCode(response) {
  // Extract TypeScript code from markdown code blocks if present
  const codeBlockMatch = response.match(/```(?:typescript|ts)?\s*\n([\s\S]*?)```/);
  if (codeBlockMatch) return codeBlockMatch[1].trim();
  // Otherwise assume the entire response is code
  return response.trim();
}

async function main() {
  const args = parseArgs(process.argv);

  if (!args.description) {
    console.error('Usage: pnpm generate:actor "<description>"');
    console.error('Example: pnpm generate:actor "spiraling fractals that react to music"');
    process.exit(1);
  }

  // Read the actor guide
  if (!existsSync(GUIDE_PATH)) {
    fail('docs/ACTOR_GUIDE.md not found. This file is required for code generation.');
  }
  const guide = readFileSync(GUIDE_PATH, 'utf-8');

  // Determine actor name
  const name = args.name || descriptionToName(args.description);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    fail(`Generated name "${name}" is not valid kebab-case. Use --name to specify manually.`);
  }

  // Check for conflicts
  const actorDir = join(COMMUNITY_DIR, name);
  if (existsSync(actorDir)) {
    fail(`Actor directory already exists: actors/community/${name}/`);
  }
  if (existsSync(join(ROOT, 'actors/builtin', name))) {
    fail(`"${name}" conflicts with a builtin actor. Use --name to specify a different name.`);
  }

  const role = args.role || 'foreground';
  const author = args.author || 'Hackathon Dev';
  const github = args.github || 'hackathon';

  // Build the prompt
  const systemPrompt = `You are an expert creative coder building actors for a Pixi.js art installation. You produce clean, working TypeScript code that follows all constraints precisely.

${guide}`;

  const userPrompt = `Create a complete actor implementation for: "${args.description}"

Requirements:
- Role: ${role}
- Actor ID: ${name}
- Author: ${author} (github: ${github})
- Follow ALL mandatory constraints from the guide (memory management, gradient coordinates, blend modes, etc.)
- Pre-allocate everything in setup(), use object pools where needed
- Support dark/light mode via api.context.display.isDarkMode()
- Use numeric colors (0xRRGGBB) with separate alpha for performance
- Keep draw calls under 300 per frame
- The code must be a complete, self-contained src/index.ts file
- Must import from '@art/actor-sdk' and '@art/types'
- Must call registerActor(actor) and export default actor

Return ONLY the TypeScript code for src/index.ts. No explanations, no markdown fences.`;

  const apiKey = process.env.ANTHROPIC_API_KEY;

  if (!apiKey) {
    console.log('\n⚠️  ANTHROPIC_API_KEY not set. Printing prompt for manual use.\n');
    console.log('=== SYSTEM PROMPT ===');
    console.log(systemPrompt);
    console.log('\n=== USER PROMPT ===');
    console.log(userPrompt);
    console.log('\n=== INSTRUCTIONS ===');
    console.log(`1. Use the prompts above with Claude or another LLM`);
    console.log(`2. Run: pnpm new:actor ${name}`);
    console.log(`3. Paste the generated code into actors/community/${name}/src/index.ts`);
    console.log(`4. Run: cd actors/community/${name} && pnpm validate`);
    console.log(`5. Submit: pnpm submit:actor ${name}`);
    process.exit(0);
  }

  // Step 1: Scaffold
  info(`Scaffolding actor "${name}"...`);
  try {
    runInherit(`node tools/create-actor.mjs ${name}`);
  } catch {
    fail('Failed to scaffold actor.');
  }

  // Step 2: Generate code
  info(`Generating actor code with Claude API...`);
  let code;
  try {
    const response = await callClaudeAPI(systemPrompt, userPrompt, apiKey);
    code = extractCode(response);
  } catch (e) {
    fail(`Claude API call failed: ${e.message}`);
  }

  // Step 3: Write generated code
  const indexPath = join(actorDir, 'src/index.ts');
  writeFileSync(indexPath, code + '\n');
  console.log(`   Written to actors/community/${name}/src/index.ts`);

  // Step 4: Install workspace
  info('Registering workspace package...');
  try {
    runInherit('pnpm install');
  } catch {
    fail('pnpm install failed.');
  }

  // Step 5: Validate
  info('Validating...');
  let validationPassed = false;
  try {
    runInherit(`pnpm --filter @art/actor-${name} validate`);
    validationPassed = true;
  } catch {
    console.log('\n⚠️  Validation failed. Attempting self-repair...');
  }

  // Step 6: Self-repair if needed
  if (!validationPassed) {
    info('Feeding errors back to Claude for a fix...');
    let errors;
    try {
      errors = run(`cd actors/community/${name} && npx tsx ../../../packages/actor-devtools/bin/validate-actor.ts src/index.ts 2>&1 || true`);
    } catch (e) {
      errors = e.message;
    }

    const fixPrompt = `The following actor code failed validation:

\`\`\`typescript
${code}
\`\`\`

Validation errors:
${errors}

Fix all issues and return ONLY the corrected TypeScript code. No explanations.`;

    try {
      const fixedResponse = await callClaudeAPI(systemPrompt, fixPrompt, apiKey);
      const fixedCode = extractCode(fixedResponse);
      writeFileSync(indexPath, fixedCode + '\n');
      console.log('   Applied fix attempt.');

      // Re-validate
      try {
        runInherit(`pnpm --filter @art/actor-${name} validate`);
        validationPassed = true;
      } catch {
        console.error('\n⚠️  Validation still failing after self-repair.');
        console.error(`   Manually fix: actors/community/${name}/src/index.ts`);
        console.error(`   Then run: cd actors/community/${name} && pnpm validate`);
      }
    } catch (e) {
      console.error(`   Self-repair API call failed: ${e.message}`);
    }
  }

  // Step 7: Build
  if (validationPassed) {
    info('Building...');
    try {
      runInherit(`pnpm --filter @art/actor-${name} build`);
      console.log('   Build successful.');
    } catch {
      console.error('\n⚠️  Build failed. Check the code for TypeScript errors.');
    }
  }

  console.log(`
✅ Actor "${name}" generated at actors/community/${name}/

Next steps:
  Preview:  pnpm dev → http://localhost:3000?actor=${name}
  Submit:   pnpm submit:actor ${name}
`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
