/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
    "./lib/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // ── Ganga night · the river after dark ──────────────────────
        bg: {
          DEFAULT: "#0b0913", // night sky over the water
          elevated: "#151024", // raised stone, lamp-lit
          muted: "#1c1631", // deep shadow stone
          hover: "#262046", // hover warm violet
        },
        ink: "#f4eee1", // pale ivory — primary text
        fg: {
          DEFAULT: "#f4eee1",
          body: "#b9b0cc", // moonlit lavender
          muted: "#8f86a8", // dusk
          secondary: "#b9b0cc",
          inverse: "#0b0913",
        },
        border: {
          DEFAULT: "#2c2447", // violet hairline
          subtle: "#211b38",
          strong: "#5a4b8c",
        },
        accent: {
          // diya flame
          DEFAULT: "#ff9432",
          strong: "#f97e1d",
          hover: "#ffb057",
          link: "#ffb057",
          soft: "#2a1b10",
        },
        "on-accent": "#221204",
        gold: {
          DEFAULT: "#d9b36a", // zari thread
          soft: "#241c33",
          muted: "#8c7a52",
        },
        river: {
          DEFAULT: "#49d6b0", // living water — live states
          soft: "#0e2b26",
        },
        ok: {
          DEFAULT: "#45d09a",
          soft: "#0f2a22",
        },
        warn: {
          DEFAULT: "#e8b75a",
          soft: "#2e2413",
        },
        bad: {
          DEFAULT: "#ff6b5e",
          soft: "#331818",
        },
        footer: {
          DEFAULT: "#0b0913",
          border: "#2c2447",
          muted: "#8f86a8",
        },
      },
      fontFamily: {
        display: ["Newsreader", "Iowan Old Style", "Palatino Linotype", "Georgia", "serif"],
        sans: ["Newsreader", "Iowan Old Style", "Georgia", "serif"],
        label: ["IBM Plex Mono", "ui-monospace", "monospace"],
        deva: ["Tiro Devanagari Hindi", "Noto Serif Devanagari", "serif"],
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
        lift: "0 24px 48px -12px rgba(0, 0, 0, 0.55)",
        glow: "0 0 32px rgba(255, 148, 50, 0.22)",
        "glow-sm": "0 0 14px rgba(255, 148, 50, 0.28)",
      },
    },
  },
  plugins: [],
};
