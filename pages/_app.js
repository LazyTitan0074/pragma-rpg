import React from "react";
import Head from "next/head";

// Global wrapper (PWA phase): metadata for installing to the home screen,
// the browser theme color and the icons for Android/iOS.
export default function App({ Component, pageProps }) {
  return (
    <>
      <Head>
        <title>PRAGMA — AI Narrative Campaign Generator & Live Dungeon Master</title>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#1c1b18" />
        <meta name="description" content="Invent complete RPG campaigns in seconds and play them live with an AI Dungeon Master." />
        <link rel="manifest" href="/manifest.json" />
        <link rel="icon" href="/favicon.ico" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="PRAGMA" />
        <meta name="mobile-web-app-capable" content="yes" />
      </Head>
      {/* Global reset: themed background on html+body, no default margins,
          no white bands at edges/overscroll (fix for the white bars in the PWA) */}
      <style>{`
        html, body {
          margin: 0;
          padding: 0;
          width: 100%;
          min-height: 100%;
          background-color: #1c1b18;
          color-scheme: dark;
          overscroll-behavior: none;
          overflow-x: hidden;
        }
        #__next { min-height: 100vh; background-color: #1c1b18; }
      `}</style>
      <Component {...pageProps} />
    </>
  );
}
