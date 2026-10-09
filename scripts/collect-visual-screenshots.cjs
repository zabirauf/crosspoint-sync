#!/usr/bin/env node
// Maestro 2.10 keeps named captures in each flow's takeScreenshot directory.
// Preserve native artifacts and collect those captures for the visual judge.
const fs = require('fs');
const path = require('path');
const root = path.resolve(process.argv[2]);
const destination = path.join(root, 'screenshots');
const captures = new Map();

function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (file === destination) continue;
    if (entry.isDirectory()) visit(file);
    else if (entry.name.endsWith('.png') && !entry.name.startsWith('step-') &&
      ['takeScreenshot', 'screenshots'].includes(path.basename(directory))) {
      const previous = captures.get(entry.name);
      if (!previous || fs.statSync(file).mtimeMs > fs.statSync(previous).mtimeMs) captures.set(entry.name, file);
    }
  }
}
visit(root);
fs.mkdirSync(destination, { recursive: true });
for (const [name, file] of captures) fs.copyFileSync(file, path.join(destination, name));
console.log(`Collected ${captures.size} named screenshots: ${destination}`);
