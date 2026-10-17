/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        pitch: { DEFAULT: "#0F5132", 50: "#ecf6f0", 100: "#d3eadb", 600: "#136a41", 700: "#0F5132", 800: "#0b3d26", 900: "#082d1c" },
        turf: { DEFAULT: "#22C55E", 600: "#16a34a" },
        ball: "#DC2626",
        cream: "#FAF7F0",
      },
      fontFamily: { heading: ["Poppins", "system-ui", "sans-serif"], sans: ["Inter", "system-ui", "sans-serif"] },
      borderRadius: { card: "16px" },
      boxShadow: { soft: "0 2px 14px rgba(15,81,50,.10)" },
    },
  },
  plugins: [],
};
