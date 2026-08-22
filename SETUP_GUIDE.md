# 🚀 SETUP GUIDE — for people who have never done anything like this

> This guide is written as if you're doing everything **for the first time in your life**.
> You don't need to know programming. You don't need to understand the commands.
> Follow the steps exactly like a recipe and, after ~10 minutes, you're playing.
>
> If you get stuck: see the **"TROUBLESHOOTING"** section at the end.

---

## 🎯 What you'll have at the end

Running on your own computer: an app that
1. Invents a complete RPG story for you (missions, characters, secrets)
2. Becomes a **Game Master** you talk to through messages, like WhatsApp
3. Remembers the story and automatically saves every session

Everything runs **on your computer**, free of charge. The only thing it needs
is a free "entrance ticket" from Google (you get it at Step 4).

---

## 🧰 What you need before starting

| You need | Why | Cost |
|---|---|---|
| A computer (Windows, Mac or Linux) | where the game runs | — |
| Internet | you download 2 things + the game talks to AI | — |
| A Google account (Gmail) | for Google's free ticket | free |
| ~10 minutes of patience | that's the whole first install | — |

---

## STEP 1 — Install Node.js (the "engine" that starts the game) ⚙️

1. Open your browser and go to: **https://nodejs.org**
2. Press the big recommended button — it says **"LTS"** — a file named
   something like `node-v22...-x64.msi` downloads
3. Double-click the downloaded file
4. In the installer press **Next → Next → Install → Finish**
   (change nothing)
5. **Restart your computer** (yes, even if it seems useless — this makes the
   new program visible everywhere)

✅ **Check:** press the Windows key, type `cmd`, open "Command Prompt",
type `node -v` and Enter. You should see a number like `v22.14.0`.
If you see "not recognized" — restart the computer and try again.

---

## STEP 2 — Download the project 📦

1. Go to this project's GitHub page
2. Press the green **"< > Code"** button
3. In the small menu press **"Download ZIP"**
4. A file called `pragma-rpg-main.zip` downloads

---

## STEP 3 — Extract it 🔓

1. Find `pragma-rpg-main.zip` (usually in **Downloads**)
2. Right-click → **Extract All...** → press **Extract**
3. You get a folder named `pragma-rpg-main`
4. Move it wherever you want the game to live (recommendation: directly in
   `C:\` or in `Documents`) — **avoid OneDrive-synced Desktop**, it can slow things down

---

## STEP 4 — Get the free "entrance ticket" from Google 🔑

The app talks to Google's Gemini artificial intelligence, and Google asks for
a secret key (a long code of letters and digits) to know who is using it.

1. Go to: **https://aistudio.google.com/apikey**
2. Sign in with your Google account (if asked)
3. Press **"Create API key"**
4. Choose creating it in a new project ("Create API key in new project")
5. A long code appears — press the **copy** button (📋) next to it
6. Paste the code temporarily into a Notepad window — you need it in the next step

⚠️ Treat the code like a password: never send it to anyone, never post it online.

---

## STEP 5 — Put the key into the game (the `.env.local` file) 🗝️

This is where everyone trips at first, so read carefully.

Windows **hides** file extensions (like `note.txt`). We will create a file whose
name starts with a dot: `.env.local`. Here's how, without mistakes:

1. Open the `pragma-rpg-main` folder from Step 3
2. You'll see a file called `.env.local.example` — make a **copy** of it in the
   same folder (right-click → Copy, then right-click → Paste)
3. Rename the copy EXACTLY to: `.env.local`
   (right-click → Rename; delete everything and type just `.env.local`)
   - Windows will warn that "the file may become unusable" → press **Yes**
4. Open the file with **Notepad** (right-click → Open with → Notepad)
5. You'll see the line `GEMINI_API_KEY=your_key_here_no_quotes`
6. Replace everything after `=` with your copied code.
   The line must look like this (with YOUR real key pasted after the `=` sign):
   ```
   GEMINI_API_KEY=paste_your_copied_key_here
   ```
7. Save (Ctrl+S) and close

✅ **Check:** the `.env.local` file exists in the game folder and contains your key.

---

## STEP 6 — Open the "remote control" (terminal) in the game folder 🖥️

A terminal is a black window where you type commands. Sounds scary, but we'll
use only two commands during the whole install.

1. Open the `pragma-rpg-main` folder
2. Click in the address bar at the top of the window (the one showing the folder
   path), delete what's there, type exactly `powershell` and press **Enter**
3. A blue/black window opens — that's the terminal, already in the right place

---

## STEP 7 — Install the game's pieces (once only) 🧩

In the terminal window type exactly:

```
npm install
```

and press Enter. Lots of text scrolls by for 1–2 minutes.
When it finishes, the last line mentions how many packages were installed.

> 💡 This step happens **only once**, at first install.

---

## STEP 8 — Start the game 🎮

In the same terminal type exactly:

```
npm run dev
```

and press Enter. After a few seconds you'll see something like:

```
▲ Next.js
- Local: http://localhost:3000
✓ Ready in ...
```

**Leave this window open!** As long as it's open, the game runs.
Closing it stops the game (restart any time by repeating this step).

---

## STEP 9 — Play! 🏛️

1. Open your browser and go to: **http://localhost:3000**
2. Pick the atmosphere and content level (13+ ... 21+), then press **GENERATE SETTING**
3. After ~10–30 seconds you get the story → press the big golden button
   **"START THE STORY LIVE"**
4. Write what your character does and press Enter. The Game Master answers!

Saves happen automatically. Find them under **📂 SAVED CAMPAIGNS**.

---

## 🔄 Stopping and restarting later

- **Stop:** click inside the terminal window and press `Ctrl+C` (or close the window)
- **Start again later:** open the game folder → address bar → type `powershell`
  → Enter → type `npm run dev` → Enter → open http://localhost:3000
- No need to repeat `npm install` — first install only.

---

## 🆘 TROUBLESHOOTING

| Symptom | Likely cause | Fix |
|---|---|---|
| `'npm' is not recognized...` | Node.js not installed or old terminal | Redo Step 1 and **restart the computer** |
| `http://localhost:3000` doesn't open | game not running | Run `npm run dev` in the terminal (Step 8) and keep the window open |
| `Port 3000 is in use` | another copy of the game is running | Close other terminal windows and try again |
| Generation error: "API key not valid" | key copied incorrectly | Open `.env.local`, check the line (no spaces, no quotes); restart the game |
| `Cannot find module...` at startup | pieces missing | Make sure you're in the right folder and run `npm install` |
| Windows Firewall asks on first start | normal, app listens locally | Press **Allow** (it only serves your own computer) |

---

## 🎁 BONUS — useful things

- **Your saves** live in the browser (localStorage) + JSON export/import inside
  the app. To move a story to another computer: **📥 EXPORT JSON** there,
  **📥 LOAD JSON** here.
- **Your key never leaves your computer** — it's read only from `.env.local`,
  which is never sent to anyone.
- **App updates:** download a new ZIP (Step 2), extract it, copy your old
  `.env.local` into the new folder, run `npm install` and `npm run dev`.

---

*Written with care for brave people with no technical background. If you made it
this far, you installed a complete web application all by yourself. Well done! 🎉*
