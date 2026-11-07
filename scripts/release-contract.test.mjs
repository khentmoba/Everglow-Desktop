import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { extractReleaseNotes } from './release-notes.mjs';

test('desktop package, lockfiles and native app advertise the same version', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  const config = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
  const cargo = readFileSync('src-tauri/Cargo.toml', 'utf8');
  const cargoLock = readFileSync('src-tauri/Cargo.lock', 'utf8');
  assert.equal(config.version, pkg.version);
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
  assert.equal(cargo.match(/^version = "([^"]+)"/m)[1], pkg.version);
  assert.equal(cargoLock.match(/name = "everglow-desktop"\r?\nversion = "([^"]+)"/)[1], pkg.version);
  // The vendored NSIS template must be reviewed alongside bundler upgrades.
  assert.equal(pkg.devDependencies['@tauri-apps/cli'], '2.12.1');
  assert.equal(lock.packages['node_modules/@tauri-apps/cli'].version, '2.12.1');
  if (process.env.GITHUB_REF_TYPE === 'tag') {
    assert.equal(process.env.GITHUB_REF_NAME, `v${pkg.version}`);
  }
});

test('CHANGELOG.md has user-facing notes for the package version', () => {
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
  const notes = extractReleaseNotes(readFileSync('CHANGELOG.md', 'utf8'), pkg.version);
  assert.match(notes, /^- /m);
});

test('release notes extraction rejects missing, empty and commit-style sections', () => {
  const changelog = [
    '# Changelog',
    '## [2.0.0] - 2026-01-02',
    '- Added a thing.',
    '  More detail for the thing.',
    '- Fixed another thing.',
    '## [1.9.0]',
    '',
    '## [1.8.0]',
    '- Merge pull request #11 from owner/branch',
    '## [1.7.0]',
    '- chore(release): prepare 1.7.0',
  ].join('\n');
  assert.equal(
    extractReleaseNotes(changelog, 'v2.0.0'),
    '- Added a thing.\n  More detail for the thing.\n- Fixed another thing.',
  );
  assert.throws(() => extractReleaseNotes(changelog, '3.0.0'), /no "## \[3\.0\.0\]" section/);
  assert.throws(() => extractReleaseNotes(changelog, '1.9.0'), /no "- " bullets/);
  assert.throws(() => extractReleaseNotes(changelog, '1.8.0'), /commit-style bullet/);
  assert.throws(() => extractReleaseNotes(changelog, '1.7.0'), /commit-style bullet/);
});
