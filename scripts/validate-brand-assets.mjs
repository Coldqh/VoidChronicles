import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

const required = [
  'public/brand/favicon.ico',
  'public/brand/favicon-32.png',
  'public/brand/apple-touch-icon.png',
  'public/brand/void-chronicles-mark-192.png',
  'public/brand/void-chronicles-mark-512.png',
  'public/brand/void-chronicles-mark.webp'
];

const missing = [];
for (const file of required) {
  try {
    await access(new URL(`../${file}`, import.meta.url), constants.R_OK);
  } catch {
    missing.push(file);
  }
}

if (missing.length) {
  console.error('BRAND ASSET VALIDATION FAILED');
  for (const file of missing) console.error(`- missing ${file}`);
  process.exit(1);
}

console.log('Brand assets are valid.');
