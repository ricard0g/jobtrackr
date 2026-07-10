import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vitest/config";

// https://vite.dev/config/
export default defineConfig({
	plugins: [react(), tailwindcss()],
	server: {
		allowedHosts: [".ngrok-free.app", ".ngrok.app"],
		hmr: process.env.VITE_HMR_HOST
			? {
					host: process.env.VITE_HMR_HOST,
					protocol: "wss",
					clientPort: 443,
				}
			: true,
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
