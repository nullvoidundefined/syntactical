import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// GitHub Pages serves project sites from https://<user>.github.io/<repo>/,
// so the production build needs a matching `base`. The dev server keeps
// `/` so local URLs stay simple. Update REPO_NAME if the repo is renamed.
const REPO_NAME = 'syntactical';

export default defineConfig(({ command }) => ({
  base: command === 'build' ? `/${REPO_NAME}/` : '/',
  plugins: [react(), tailwindcss()],
}));
