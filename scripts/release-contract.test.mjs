import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

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
  if (process.env.GITHUB_REF_TYPE === 'tag') {
    assert.equal(process.env.GITHUB_REF_NAME, `v${pkg.version}`);
  }
});
