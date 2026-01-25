import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const watch = process.argv.includes('--watch');

// Ensure dist exists
mkdirSync('dist', { recursive: true });

// Copy static assets from public/
const assets = ['style.css', 'sw.js', 'manifest.json',
                'icon.svg', 'icon-192.png', 'icon-512.png'];
for (const file of assets) {
  cpSync(`public/${file}`, `dist/${file}`);
}

// Copy index.html (no SVG injection needed - outlines are in JS module)
cpSync('public/index.html', 'dist/index.html');

// Build bundle
const ctx = await esbuild.context({
  entryPoints: ['src/app.js'],
  bundle: true,
  outfile: 'dist/bundle.js',
  format: 'iife',
  minify: !watch,
});

if (watch) {
  await ctx.watch();
  console.log('Watching for changes...');
} else {
  await ctx.rebuild();
  await ctx.dispose();
  console.log('Build complete: dist/bundle.js');
}
