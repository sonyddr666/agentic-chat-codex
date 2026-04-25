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
        ink: "rgb(var(--color-ink) / <alpha-value>)",
        paper: "rgb(var(--color-paper) / <alpha-value>)",
        panel: "rgb(var(--color-panel) / <alpha-value>)",
        line: "rgb(var(--color-line) / <alpha-value>)",
        muted: "rgb(var(--color-muted) / <alpha-value>)",
        teal: "rgb(var(--color-teal) / <alpha-value>)",
        berry: "rgb(var(--color-berry) / <alpha-value>)",
        amber: "rgb(var(--color-amber) / <alpha-value>)"
      },
      boxShadow: {
        soft: "0 1px 2px rgb(var(--color-shadow) / 0.16)"
      }
    }
  },
  plugins: []
};

export default config;

