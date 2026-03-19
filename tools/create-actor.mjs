#!/usr/bin/env node
/**
 * Create a new community actor from the template.
 *
 * Usage: pnpm new:actor <actor-name>
 */

import { cpSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const TEMPLATE_DIR = join(ROOT, 'packages/actor-template');
const COMMUNITY_DIR = join(ROOT, 'actors/community');

function toTitleCase(kebab) {
  return kebab
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function toPascalCase(kebab) {
  return kebab
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join('');
}

function main() {
  const name = process.argv[2];

  if (!name) {
    console.error('Usage: pnpm new:actor <actor-name>');
    console.error('Example: pnpm new:actor rainbow-waves');
    process.exit(1);
  }

  // Validate kebab-case
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    console.error(`Error: Actor name must be kebab-case (e.g., "rainbow-waves"). Got: "${name}"`);
    process.exit(1);
  }

  const targetDir = join(COMMUNITY_DIR, name);

  if (existsSync(targetDir)) {
    console.error(`Error: Directory already exists: ${targetDir}`);
    process.exit(1);
  }

  // Check for conflicts with builtin actors
  if (existsSync(join(ROOT, 'actors/builtin', name))) {
    console.error(`Error: "${name}" conflicts with a builtin actor`);
    process.exit(1);
  }

  console.log(`Creating actor "${name}" in actors/community/${name}/...`);

  // Copy template (exclude preview/, test files, dist/, node_modules/)
  cpSync(TEMPLATE_DIR, targetDir, {
    recursive: true,
    filter: (src) => {
      const rel = src.replace(TEMPLATE_DIR, '');
      return (
        !rel.startsWith('/preview') &&
        !rel.startsWith('/dist') &&
        !rel.startsWith('/node_modules') &&
        !rel.includes('.test.')
      );
    },
  });

  // Update package.json
  const pkgPath = join(targetDir, 'package.json');
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
  pkg.name = `@art/actor-${name}`;
  pkg.description = `${toTitleCase(name)} actor for the art installation`;
  pkg.scripts = {
    dev: `npx open-cli http://localhost:3000?actor=${name}`,
    build: 'vite build',
    validate: 'tsx ../../../packages/actor-devtools/bin/validate-actor.ts src/index.ts',
  };
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

  // Create vite.config.ts (library build, like builtin actors)
  const viteConfig = `import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: '${toPascalCase(name)}',
      fileName: 'index',
      formats: ['es'],
    },
    rollupOptions: {
      external: ['@art/types'],
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});
`;
  writeFileSync(join(targetDir, 'vite.config.ts'), viteConfig);

  // Fix tsconfig.json paths (template is at packages/ depth, community is at actors/ depth)
  const tsconfigPath = join(targetDir, 'tsconfig.json');
  const tsconfig = JSON.parse(readFileSync(tsconfigPath, 'utf-8'));
  tsconfig.extends = '../../../tsconfig.base.json';
  tsconfig.references = [
    { path: '../../../packages/types' },
    { path: '../../../packages/actor-sdk' },
  ];
  writeFileSync(tsconfigPath, JSON.stringify(tsconfig, null, 2) + '\n');

  // Update src/index.ts — replace metadata and add registerActor call
  const indexPath = join(targetDir, 'src/index.ts');
  let index = readFileSync(indexPath, 'utf-8');

  // Update metadata
  index = index.replace("id: 'template-actor'", `id: '${name}'`);
  index = index.replace("name: 'Template Actor'", `name: '${toTitleCase(name)}'`);
  index = index.replace(
    "description: 'A template actor that demonstrates the API'",
    `description: 'TODO: Describe what your actor does'`
  );

  // Add registerActor import and call
  index = index.replace(
    "import type {",
    "import { registerActor } from '@art/actor-sdk';\nimport type {"
  );
  index = index.replace(
    '// Export the actor as default\nexport default actor;',
    '// Register and export the actor\nregisterActor(actor);\nexport default actor;'
  );

  writeFileSync(indexPath, index);

  console.log(`
Actor created successfully!

Next steps:
  1. Edit actors/community/${name}/src/index.ts
  2. Preview: pnpm dev (then visit http://localhost:3000?actor=${name})
  3. Validate: cd actors/community/${name} && pnpm validate
  4. Submit: Create a PR with your actor folder
`);
}

main();
