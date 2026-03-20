#!/usr/bin/env node
/**
 * Submit a community actor as a pull request.
 *
 * Usage: pnpm submit:actor <actor-name>
 *
 * Validates, builds, creates a branch, commits, pushes, and opens a PR.
 * Requires: gh CLI installed and authenticated.
 */

import { existsSync, statSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
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

function main() {
  const name = process.argv[2];

  if (!name) {
    console.error('Usage: pnpm submit:actor <actor-name>');
    console.error('Example: pnpm submit:actor rainbow-waves');
    process.exit(1);
  }

  // Validate kebab-case
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name)) {
    fail(`Actor name must be kebab-case (e.g., "rainbow-waves"). Got: "${name}"`);
  }

  // Check actor directory exists
  const actorDir = join(COMMUNITY_DIR, name);
  if (!existsSync(actorDir)) {
    fail(`Actor directory not found: actors/community/${name}/\nRun "pnpm new:actor ${name}" first.`);
  }

  // Check gh CLI is available
  try {
    run('gh --version');
  } catch {
    fail('GitHub CLI (gh) is not installed. Install from https://cli.github.com/');
  }

  // Check gh is authenticated
  try {
    run('gh auth status');
  } catch {
    fail('GitHub CLI is not authenticated. Run "gh auth login" first.');
  }

  // Step 1: Validate
  info(`Validating actor "${name}"...`);
  try {
    runInherit(`pnpm --filter @art/actor-${name} validate`);
  } catch {
    fail('Validation failed. Fix the errors above and try again.');
  }

  // Step 2: Build
  info(`Building actor "${name}"...`);
  try {
    runInherit(`pnpm --filter @art/actor-${name} build`);
  } catch {
    fail('Build failed. Fix the errors above and try again.');
  }

  // Step 3: Check bundle
  const bundlePath = join(actorDir, 'dist/index.js');
  if (!existsSync(bundlePath)) {
    fail(`Built bundle not found at actors/community/${name}/dist/index.js`);
  }
  const bundleSize = statSync(bundlePath).size;
  if (bundleSize > 102400) {
    fail(`Bundle too large: ${bundleSize} bytes (max 100KB)`);
  }
  console.log(`   Bundle size: ${bundleSize} bytes ✓`);

  // Step 4: Create branch
  const branchName = `actor/${name}`;
  info(`Creating branch "${branchName}"...`);

  // Save current branch to return to later
  let originalBranch;
  try {
    originalBranch = run('git rev-parse --abbrev-ref HEAD');
  } catch {
    originalBranch = null;
  }

  // Check if branch already exists locally
  try {
    run(`git rev-parse --verify ${branchName}`);
    // Branch exists, switch to it and reset to main
    run(`git checkout ${branchName}`);
    try {
      run('git merge main --no-edit');
    } catch {
      // If merge fails, just continue — we'll overwrite with our commit
    }
  } catch {
    // Branch doesn't exist, create from current HEAD
    run(`git checkout -b ${branchName}`);
  }

  // Step 5: Stage files
  info('Staging files...');
  run(`git add actors/community/${name}/`);

  // Also stage pnpm-lock.yaml if it changed (new workspace package modifies it)
  try {
    const lockStatus = run('git diff --name-only pnpm-lock.yaml');
    if (lockStatus) {
      run('git add pnpm-lock.yaml');
    }
  } catch {
    // No changes to lockfile, that's fine
  }

  // Check if there's anything to commit
  const staged = run('git diff --cached --name-only');
  if (!staged) {
    console.log('   No changes to commit (actor already committed on this branch)');
  } else {
    // Step 6: Commit
    info('Committing...');
    run(`git commit -m "Add community actor: ${name}"`);
  }

  // Step 7: Push
  info('Pushing to remote...');
  try {
    runInherit(`git push -u origin ${branchName}`);
  } catch {
    fail('Push failed. Check your git remote configuration.');
  }

  // Step 8: Create PR (or find existing one)
  info('Creating pull request...');
  let prUrl;
  try {
    // Check if PR already exists for this branch
    prUrl = run(`gh pr view ${branchName} --json url --jq .url 2>/dev/null`);
    if (prUrl) {
      console.log(`   PR already exists: ${prUrl}`);
    }
  } catch {
    // No existing PR, create one
  }

  if (!prUrl) {
    try {
      // Try to read actor description from source
      let actorDescription = '';
      try {
        const indexSrc = readFileSync(join(actorDir, 'src/index.ts'), 'utf-8');
        const descMatch = indexSrc.match(/description:\s*['"`]([^'"`]+)['"`]/);
        if (descMatch) actorDescription = descMatch[1];
      } catch {
        // Can't read description, that's fine
      }

      const body = [
        '## Summary',
        '',
        `Adds community actor: **${name}**`,
        actorDescription ? `\n${actorDescription}` : '',
        '',
        `Bundle size: ${bundleSize} bytes`,
        '',
        '## Preview',
        '',
        `\`https://live.polychorus.art/?actor=${name}\``,
        '',
        '---',
        '*Submitted via `pnpm submit:actor`*',
      ].join('\n');

      prUrl = run(
        `gh pr create --title "Add community actor: ${name}" --body "${body.replace(/"/g, '\\"')}" --base main`
      );
      console.log(`   PR created: ${prUrl}`);
    } catch (e) {
      console.error(`   Warning: Could not create PR: ${e.message}`);
      console.error('   You can create it manually: gh pr create');
    }
  }

  // Step 9: Return to original branch
  if (originalBranch && originalBranch !== branchName) {
    try {
      run(`git checkout ${originalBranch}`);
    } catch {
      // Best effort
    }
  }

  console.log(`
✅ Actor "${name}" submitted!

The CI will automatically validate and merge your PR.
Once merged, the actor will be deployed and appear on the live canvas within 30 seconds.
`);
  if (prUrl) {
    console.log(`PR: ${prUrl}`);
  }
}

main();
