import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import fs from "node:fs";

const certPath = path.resolve(__dirname, "../certs/dev-cert.pem");
const keyPath = path.resolve(__dirname, "../certs/dev-key.pem");

let httpsConfig: { cert: Buffer; key: Buffer } | undefined;

if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
  httpsConfig = {
    cert: fs.readFileSync(certPath),
    key: fs.readFileSync(keyPath),
  };
} else {
  console.warn(
    "\n⚠️  未找到本地 HTTPS 证书，Vite 将以 HTTP 模式启动。\n" +
      "   WebAuthn / __Host- Cookie 等功能将不可用。\n" +
      "   运行 npm run dev:setup 生成证书。\n",
  );
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    https: httpsConfig,
    proxy: {
      "/api/v1": {
        target: "https://127.0.0.1:5100",
        changeOrigin: true,
        secure: false,
      },
    },
  },
});
