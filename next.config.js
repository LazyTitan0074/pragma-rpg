const path = require("path");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Pin the workspace root explicitly (prevents warnings when a foreign
  // package-lock.json exists in a parent directory).
  turbopack: {
    root: path.join(__dirname),
  },
};

module.exports = nextConfig;
