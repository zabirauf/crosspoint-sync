#!/usr/bin/env node
// Check actual captured pixels so a native backdrop regression cannot pass
// solely because its controls are still present in the accessibility tree.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const directory = path.resolve(process.argv[2]);
const captures = fs.readdirSync(directory).filter(name => /^native-surface-(dark|light)-.*\.png$/.test(name)).sort();
if (!captures.length) throw new Error('No native surface screenshots found. Run flow 20 first.');

const results = captures.map(name => {
  const file = path.join(directory, name);
  const [width] = execFileSync('magick', [file, '-auto-orient', '-format', '%w %h', 'info:'], { encoding: 'utf8' }).trim().split(' ').map(Number);
  // The middle of the very top edge avoids rounded corners and system controls.
  const crop = `${Math.floor(width * 0.4)}x6+${Math.floor(width * 0.2)}+0`;
  const pixels = execFileSync('magick', [file, '-auto-orient', '-crop', crop, '+repage', '-depth', '8', 'rgb:-']);
  const mean = [0, 0, 0];
  for (let i = 0; i < pixels.length; i++) mean[i % 3] += pixels[i] / (pixels.length / 3);
  const dark = name.startsWith('native-surface-dark-');
  const passed = mean.every(channel => dark ? channel < 64 : channel > 220);
  return { screenshot: name, appearance: dark ? 'dark' : 'light', topEdgeMeanRGB: mean.map(n => Math.round(n * 100) / 100), passed };
});

const passed = results.every(result => result.passed);
fs.writeFileSync(path.join(directory, '..', 'native-surface-results.json'), JSON.stringify({ passed, results }, null, 2) + '\n');
for (const result of results) console.log(`${result.passed ? 'PASS' : 'FAIL'} ${result.screenshot}: top RGB ${result.topEdgeMeanRGB.join(', ')}`);
if (!passed) process.exitCode = 1;
