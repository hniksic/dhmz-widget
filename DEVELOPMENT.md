# Development Setup

## Prerequisites

### Install Node.js via nvm

Install [nvm](https://github.com/nvm-sh/nvm) (Node Version Manager):

```bash
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
```

Restart your terminal, then install Node.js LTS:

```bash
nvm install --lts
```

Verify installation:

```bash
node --version
npm --version
```

## Building

Install dependencies:

```bash
npm install
```

Build the bundle:

```bash
npm run build
```

This produces `dist/bundle.js` from the ES modules in `src/`.

## Local Development

Watch mode rebuilds automatically on file changes:

```bash
npm run watch
```

Open `dist/index.html` in your browser (works with `file://`).

## Deployment

Pushing to `master` triggers GitHub Actions, which builds and deploys to GitHub Pages automatically. No need to commit build artifacts.
