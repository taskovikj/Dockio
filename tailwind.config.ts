import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#111827",
        panel: "#f5f7f4",
        line: "#d9e2d7",
        action: "#0f766e"
      }
    }
  },
  plugins: []
};

export default config;
