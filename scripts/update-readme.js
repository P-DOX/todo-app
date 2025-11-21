const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const README_PATH = path.join(ROOT, 'README.md');
const MARKER_START = '<!-- AUTO-GENERATED:START -->';
const MARKER_END = '<!-- AUTO-GENERATED:END -->';

const IGNORED = new Set(['.git', 'node_modules', 'hooks']);

function walk(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const ent of entries) {
    if (IGNORED.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    const rel = path.join(base, ent.name);
    if (ent.isDirectory()) {
      files = files.concat(walk(full, rel));
    } else if (ent.isFile()) {
      const stat = fs.statSync(full);
      files.push({ path: rel.replace(/\\/g, '/'), size: stat.size, mtime: stat.mtime });
    }
  }
  return files;
}

function formatBytes(bytes) {
  if (bytes < 1024) return bytes + ' B';
  const units = ['KB','MB','GB','TB'];
  let i = -1; do { bytes = bytes/1024; i++; } while (bytes >= 1024 && i < units.length-1);
  return bytes.toFixed(1) + ' ' + units[i];
}

function generateSection(files) {
  const lines = [];
  lines.push('');
  lines.push(`**Generated:** ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`- Total files: ${files.length}`);
  lines.push('');
  lines.push('**Files:**');
  lines.push('');
  files.sort((a,b) => a.path.localeCompare(b.path));
  for (const f of files) {
    lines.push(`- \`${f.path}\` — ${formatBytes(f.size)}, modified ${f.mtime.toISOString()}`);
  }
  lines.push('');
  return lines.join('\n');
}

function main() {
  const files = walk(ROOT);
  const generated = generateSection(files);

  let readme = '';
  if (fs.existsSync(README_PATH)) {
    readme = fs.readFileSync(README_PATH, 'utf8');
  } else {
    readme = '# todo-app\n\n';
  }

  const startIdx = readme.indexOf(MARKER_START);
  const endIdx = readme.indexOf(MARKER_END);

  let newReadme;
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    const before = readme.slice(0, startIdx + MARKER_START.length);
    const after = readme.slice(endIdx);
    newReadme = before + '\n\n' + generated + '\n' + after;
  } else {
    // Append markers and section
    newReadme = readme.trimEnd() + '\n\n' + MARKER_START + '\n\n' + generated + '\n' + MARKER_END + '\n';
  }

  fs.writeFileSync(README_PATH, newReadme, 'utf8');
  console.log('README.md updated with', files.length, 'files');
}

if (require.main === module) main();
