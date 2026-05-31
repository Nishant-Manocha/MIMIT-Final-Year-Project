import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type PluginOption } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command }) => {
  const plugins: Array<PluginOption | false> = [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({
      server: { entry: "server" },
    }),
    command === "build" && cloudflare(),
    react(),
  ];

  return {
    server: {
      host: "::",
      port: 8080,
    },
    resolve: {
      dedupe: ["react", "react-dom"],
    },
    plugins: plugins.filter(Boolean) as PluginOption[],
  };
});
