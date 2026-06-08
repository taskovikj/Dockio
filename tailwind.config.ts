import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#f5f5f5",
        panel: "#0b0b0d",
        line: "#242427",
        action: "#6557ff"
      }
    }
  },
  plugins: []
};

export default config;
