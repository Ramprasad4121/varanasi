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
        bg: {
          DEFAULT: "#f3f2ee",
          elevated: "#f7f6f2",
          muted: "#ebe9e3",
          hover: "#e4e1d9",
        },
        ink: "#1c1b18",
        fg: {
          DEFAULT: "#1c1b18",
          body: "#5a564e",
          muted: "#7a756b",
          secondary: "#5a564e",
          inverse: "#f3f2ee",
        },
        border: {
          DEFAULT: "#d8d3c6",
          subtle: "#e6e2d8",
          strong: "#bdb6a6",
        },
        accent: {
          DEFAULT: "#c01010",
          strong: "#9a0c0c",
          hover: "#9a0c0c",
          link: "#c01010",
          soft: "#f4e4e0",
        },
        "on-accent": "#f3f2ee",
        ok: {
          DEFAULT: "#2f6a38",
          soft: "#e6f0e7",
        },
        warn: {
          DEFAULT: "#8a6100",
          soft: "#f6edd6",
        },
        bad: {
          DEFAULT: "#c01010",
          soft: "#f4e4e0",
        },
        footer: {
          DEFAULT: "#f3f2ee",
          border: "#d8d3c6",
          muted: "#7a756b",
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
        lift: "0 18px 40px #1c1b1812",
      },
    },
  },
  plugins: [],
};
