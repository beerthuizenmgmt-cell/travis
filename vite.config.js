import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
        verkoopgids: resolve(__dirname, 'docs/nathanisya-verkoopgids.html'),
        commissie: resolve(__dirname, 'docs/nathanisya-commissie-overzicht.html'),
      },
    },
  },
});
