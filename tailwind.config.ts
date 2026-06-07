import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#f8fafc",
        panel: "#10121b",
        line: "#262a38",
        action: "#5657ff"
      }
    }
  },
  plugins: []
};

export default config;
