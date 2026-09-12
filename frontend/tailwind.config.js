/** @type {import('tailwindcss').Config} */
// Author: Ramprasad — single source of truth: CSS custom properties in globals.css.
// Every color here is `rgb(var(--token) / <alpha-value>)` so light + dark themes
// (data-theme on <html>) both resolve through the same utility classes.
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: "rgb(var(--paper) / <alpha-value>)",
          elevated: "rgb(var(--white) / <alpha-value>)",
          muted: "rgb(var(--hairline-soft) / <alpha-value>)",
          hover: "rgb(var(--bg-hover) / <alpha-value>)",
        },
        ink: "rgb(var(--ink) / <alpha-value>)",
        fg: {
          DEFAULT: "rgb(var(--ink) / <alpha-value>)",
          body: "rgb(var(--ink-soft) / <alpha-value>)",
          muted: "rgb(var(--muted) / <alpha-value>)",
          secondary: "rgb(var(--ink-soft) / <alpha-value>)",
          inverse: "rgb(var(--paper) / <alpha-value>)",
        },
        border: {
          DEFAULT: "rgb(var(--hairline) / <alpha-value>)",
          subtle: "rgb(var(--hairline-soft) / <alpha-value>)",
          strong: "rgb(var(--hairline-strong) / <alpha-value>)",
        },
        accent: {
          DEFAULT: "rgb(var(--accent) / <alpha-value>)",
          strong: "rgb(var(--accent-deep) / <alpha-value>)",
          hover: "rgb(var(--accent-deep) / <alpha-value>)",
          link: "rgb(var(--accent) / <alpha-value>)",
          soft: "rgb(var(--accent-wash) / <alpha-value>)",
        },
        "on-accent": "rgb(var(--paper) / <alpha-value>)",
        ok: {
          DEFAULT: "rgb(var(--leaf) / <alpha-value>)",
          soft: "rgb(var(--leaf-wash) / <alpha-value>)",
        },
        warn: {
          DEFAULT: "rgb(var(--warn) / <alpha-value>)",
          soft: "rgb(var(--warn-wash) / <alpha-value>)",
        },
        bad: {
          DEFAULT: "rgb(var(--red) / <alpha-value>)",
          soft: "rgb(var(--red-wash) / <alpha-value>)",
        },
        footer: {
          DEFAULT: "rgb(var(--paper) / <alpha-value>)",
          border: "rgb(var(--hairline) / <alpha-value>)",
          muted: "rgb(var(--muted) / <alpha-value>)",
        },
      },
      fontFamily: {
        display: ["Newsreader", "Iowan Old Style", "Palatino Linotype", "Georgia", "serif"],
        sans: ["Newsreader", "Iowan Old Style", "Georgia", "serif"],
        label: ["IBM Plex Mono", "ui-monospace", "monospace"],
        drop: ["UnifrakturMaguntia", "UnifrakturCook", "Old English Text MT", "serif"],
      },
      borderRadius: {
        none: "0px",
        sm: "0px",
        DEFAULT: "0px",
        md: "0px",
        lg: "0px",
        xl: "0px",
        pill: "0px",
      },
      boxShadow: {
        lift: "0 18px 40px rgb(var(--ink) / 0.07)",
      },
    },
  },
  plugins: [],
};