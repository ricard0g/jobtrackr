import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		allowedHosts: [".ngrok-free.app", ".ngrok.app"],
		proxy: {
			"/api": "http://localhost:8080",
			"/auth": "http://localhost:8080",
		},
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
		},
	},
	test: {
		environment: "jsdom",
		globals: true,
	},
});
