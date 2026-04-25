import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
    "./src/lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#202124",
        paper: "#f4f4f1",
        panel: "#ffffff",
        line: "#d7dad2",
        muted: "#64685f",
        teal: "#187d6f",
        berry: "#8d3f64",
        amber: "#a46617"
      },
      boxShadow: {
        soft: "0 1px 2px rgba(32, 33, 36, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;

