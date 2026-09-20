import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./hooks/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: {
          DEFAULT: "#1c1c1f",
          raised: "#28282c",
          sunken: "#141416",
        },
        deck: {
          border: "#3a3a40",
        },
        amber: {
          DEFAULT: "#ffb020",
          dim: "#8a5c14",
        },
        accent: {
          DEFAULT: "#f5c400",
          hot: "#ff5a3c",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
      boxShadow: {
        panel: "inset 0 1px 0 rgba(255,255,255,0.04), 0 8px 24px rgba(0,0,0,0.5)",
        knob: "inset 0 2px 3px rgba(0,0,0,0.6), 0 1px 0 rgba(255,255,255,0.05)",
      },
    },
  },
  plugins: [],
};

export default config;
