const { fontFamily } = require("tailwindcss/defaultTheme");

module.exports = {
  mode: "jit",
  purge: ["./index.html", "./src/**/*.{vue,js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Space Grotesk", "Inter var", ...fontFamily.sans],
      },
      borderRadius: {
        DEFAULT: "8px",
        secondary: "4px",
        container: "12px",
        card: "16px",
        modal: "28px",
      },
      boxShadow: {
        DEFAULT: "0 4px 20px rgba(0, 0, 0, 0.4), 0 0 15px rgba(100, 60, 255, 0.08)",
        hover: "0 8px 30px rgba(0, 0, 0, 0.5), 0 0 25px rgba(100, 60, 255, 0.15)",
        float: "0 40px 80px rgba(0, 0, 0, 0.6), 0 0 40px rgba(100, 60, 255, 0.2)",
        "float-hover": "0 50px 100px rgba(0, 0, 0, 0.7), 0 0 60px rgba(100, 60, 255, 0.35)",
        "glow-purple": "0 0 40px rgba(72, 32, 220, 0.3)",
        "glow-pink": "0 0 40px rgba(220, 40, 120, 0.3)",
      },
      colors: {
        primary: {
          DEFAULT: "#4820dc",
          hover: "#5a32f0",
        },
        secondary: {
          DEFAULT: "rgba(255, 255, 255, 0.6)",
          hover: "rgba(255, 255, 255, 0.8)",
        },
        accent: {
          DEFAULT: "#dc2878",
          hover: "#f03c8c",
        },
        surface: {
          DEFAULT: "rgba(255, 255, 255, 0.06)",
          soft: "rgba(255, 255, 255, 0.04)",
          strong: "rgba(255, 255, 255, 0.10)",
        },
        spatial: {
          bg: "#0a0a0f",
          purple: "rgba(72, 32, 220, 0.85)",
          pink: "rgba(220, 40, 120, 0.9)",
        },
      },
      spacing: {
        "form-field": "16px",
        section: "32px",
      },
      backdropBlur: {
        spatial: "24px",
      },
    },
  },
  variants: {
    extend: {
      boxShadow: ["hover", "active"],
    },
  },
};
