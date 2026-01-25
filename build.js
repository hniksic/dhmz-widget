import * as esbuild from 'esbuild';
import { cpSync, mkdirSync } from 'fs';

const watch = process.argv.includes('--watch');

// Ensure dist exists
mkdirSync('dist', { recursive: true });

// Copy static assets
const assets = ['index.html', 'style.css', 'sw.js', 'manifest.json',
                'icon.svg', 'icon-192.png', 'icon-512.png'];
for (const file of assets) {
  cpSync(file, `dist/${file}`);
}

// Build bundle
const ctx = await esbuild.context({
  entryPoints: ['src/app.js'],
  bundle: true,
  outfile: 'dist/bundle.js',
  format: 'iife',
});

if (watch) {
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('Build complete: dist/bundle.js');
}
