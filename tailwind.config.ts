import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#f4f4f5",
        panel: "#111113",
        line: "#242428",
        action: "#fafafa"
      }
    }
  },
  plugins: []
};

export default config;
