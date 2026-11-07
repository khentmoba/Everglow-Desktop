// Prints the CHANGELOG.md section for one version and fails when it is missing or unusable.
//   node scripts/release-notes.mjs [version] [--out file]
// The version defaults to package.json. The release workflow, the release contract test and
// local previews all use this script so there is one changelog parser.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const COMMIT_STYLE = /^- (?:Merge (?:pull request|branch)\b|(?:feat|fix|chore|ci|docs|test|refactor|perf|build|style)(?:\([^)]*\))?!?:)/i;

export function extractReleaseNotes(changelog, version) {
  const wanted = version.replace(/^v/, '');
  const lines = changelog.split(/\r?\n/);
  const start = lines.findIndex(line => {
    const match = line.match(/^## \[?v?([^\]\s]+)\]?(?:\s|$)/);
    return match && match[1] === wanted;
  });
  if (start === -1) throw new Error(`CHANGELOG.md has no "## [${wanted}]" section`);
  const end = lines.findIndex((line, index) => index > start && /^## /.test(line));
  const notes = lines.slice(start + 1, end === -1 ? undefined : end).join('\n').trim();
  const bullets = notes.split('\n').filter(line => line.startsWith('- '));
  if (bullets.length === 0) throw new Error(`CHANGELOG.md section ${wanted} has no "- " bullets`);
  const commitLike = bullets.find(line => COMMIT_STYLE.test(line));
  if (commitLike) throw new Error(`CHANGELOG.md section ${wanted} has a commit-style bullet: ${commitLike}`);
  return notes;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const args = process.argv.slice(2);
  const outIndex = args.indexOf('--out');
  const out = outIndex === -1 ? null : args.splice(outIndex, 2)[1];
  const version = args[0] || JSON.parse(readFileSync('package.json', 'utf8')).version;
  try {
    const notes = extractReleaseNotes(readFileSync('CHANGELOG.md', 'utf8'), version);
    if (out) writeFileSync(out, notes + '\n');
    else process.stdout.write(notes + '\n');
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
