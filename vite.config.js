import { resolve } from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: Number(process.env.PORT) || 5173,
    strictPort: true,
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        login: resolve(__dirname, 'login/index.html'),
        admin: resolve(__dirname, 'admin/index.html'),
        crm: resolve(__dirname, 'crm/index.html'),
        crmInvoer: resolve(__dirname, 'crm/invoer/index.html'),
        verkoopgids: resolve(__dirname, 'docs/nathanisya-verkoopgids.html'),
        commissie: resolve(__dirname, 'docs/nathanisya-commissie-overzicht.html'),
        bespreking: resolve(__dirname, 'docs/bespreking-nathanisya.html'),
      },
    },
  },
});
