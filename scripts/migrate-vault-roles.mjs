
import fs from 'fs';
import path from 'path';

function walk(d) {
  let r = [];
  if (!fs.existsSync(d)) return r;
  for (const f of fs.readdirSync(d)) {
    if (f.startsWith('.')) continue;
    const p = path.join(d, f);
    if (fs.statSync(p).isDirectory()) r = r.concat(walk(p));
    else if (f.endsWith('.md')) r.push(p);
  }
  return r;
}

const vaultDir = 'C:/Users/josef/Documents/2nd brain v7';
const allFiles = walk(vaultDir);

let updatedCount = 0;
let addedTagCount = 0;

for (const file of allFiles) {
  const norm = file.replace(/\\/g, '/');
  if (norm.includes('/References/Templates/')) continue;
  if (norm.includes('/.obsidian/')) continue;

  const content = fs.readFileSync(file, 'utf8');
  const fmMatch = content.match(/^(---\r?\n)([\s\S]*?)(\r?\n---)/);
  if (!fmMatch) continue;

  let fm = fmMatch[2];
  const roleMatch = fm.match(/^role:\s*(.*)$/m);
  if (!roleMatch) continue;

  const rawRole = roleMatch[1].trim().replace(/^["']|["']$/g, '');
  let roleTag = null;
  if (rawRole === 'yo-manager' || rawRole === 'role/yo-manager') roleTag = 'role/yo-manager';
  else if (rawRole === 'josef-selfcare' || rawRole === 'role/josef-selfcare') roleTag = 'role/josef-selfcare';
  else if (rawRole === 'rj-supportive' || rawRole === 'role/rj-supportive') roleTag = 'role/rj-supportive';

  // Parse existing tags
  let tags = [];
  const tagBracketMatch = fm.match(/^tags:\s*\[(.*?)\]/m);
  const tagListMatch = fm.match(/^tags:\r?\n((?:\s*-\s*.*\r?\n)+)/m);

  if (tagBracketMatch) {
    tags = tagBracketMatch[1]
      .split(',')
      .map(t => t.trim().replace(/^["']|["']$/g, ''))
      .filter(t => t.length > 0);
  } else if (tagListMatch) {
    tags = tagListMatch[1]
      .split('\n')
      .map(l => l.replace(/^\s*-\s*/, '').trim().replace(/^["']|["']$/g, ''))
      .filter(t => t.length > 0);
  }

  if (roleTag && !tags.includes(roleTag)) {
    tags.push(roleTag);
    addedTagCount++;
  }

  // Remove role line
  fm = fm.replace(/^role:.*\r?\n?/m, '');

  // Replace or insert tags
  const newTagsStr =
    tags.length > 0
      ? 'tags:\n' + tags.map(t => `  - ${t}`).join('\n')
      : 'tags: []';

  if (tagBracketMatch) {
    fm = fm.replace(/^tags:\s*\[.*?\]/m, newTagsStr);
  } else if (tagListMatch) {
    fm = fm.replace(/^tags:\r?\n(?:\s*-\s*.*\r?\n)+/m, newTagsStr + '\n');
  } else if (/^tags:/m.test(fm)) {
    fm = fm.replace(/^tags:.*$/m, newTagsStr);
  } else {
    fm = fm.trimEnd() + '\n' + newTagsStr + '\n';
  }

  // Clean up trailing newlines in frontmatter
  fm = fm.replace(/\n{3,}/g, '\n\n').trim() + '\n';
  const newContent = `---\n${fm}---${content.slice(fmMatch[0].length)}`;
  fs.writeFileSync(file, newContent, 'utf8');
  updatedCount++;
}

console.log(`Migration complete! Files updated: ${updatedCount}, Tags added: ${addedTagCount}`);
