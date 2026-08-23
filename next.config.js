const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Proiectul trăiește într-un folder OneDrive care are un package-lock.json străin
  // în părinte; fixăm rădăcina explicit ca Turbopack să nu mai afișeze warning-ul.
  turbopack: {
    root: path.join(__dirname),
  },
  // HTML-ul nu se cache-uiește pe device-uri — altfel PWA-urile instalate pe iOS
  // continuă să ruleze versiuni vechi chiar după deploy (incident 23 august).
  async headers() {
    return [
      {
        source: "/",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
      {
        source: "/manifest.json",
        headers: [{ key: "Cache-Control", value: "no-store, must-revalidate" }],
      },
    ];
  },
};

module.exports = nextConfig;

