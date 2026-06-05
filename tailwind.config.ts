import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#ffffff",
        panel: "#12101a",
        line: "#2a2437",
        action: "#8b5cf6"
      }
    }
  },
  plugins: []
};

export default config;
