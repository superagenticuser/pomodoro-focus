# 🍅 Focus — Pomodoro Timer

A clean, no-frills Pomodoro timer built with plain HTML, CSS, and JavaScript — no libraries, no build step.

## Try it

**Live:** https://superagenticuser.github.io/pomodoro-focus/

## Features

- 25-minute focus sessions, 5-minute short breaks, 15-minute long breaks (all adjustable)
- Animated progress ring that changes color per mode
- Cycle tracker — long break after every 4 focus sessions
- Daily stats: minutes focused, sessions completed, day streak (saved in your browser)
- Gentle chime + browser notification when a session ends
- Tab title shows the live countdown
- Auto-start option for hands-free cycles
- Space bar to start/pause

## Run locally

Just open `index.html` in a browser, or serve the folder:

```bash
npx serve .
```

## Files

- `index.html` — page structure, timer UI, settings modal
- `styles.css` — dark theme, progress ring, responsive layout
- `app.js` — timer engine, cycle logic, stats, WebAudio chime

Deployed with GitHub Pages from the `main` branch.
