# Icons

These icons are **checked into the repo** so the Tauri build works out of the box on any machine.

The source is a 1024×1024 gradient PNG. To regenerate from your own artwork, run from the repo root:

```bash
./node_modules/.bin/tauri icon /path/to/your-1024x1024.png --output desktop/src-tauri/icons
```

Then delete the auto-generated `ios/`, `android/`, `Square*.png`, and `StoreLogo.png` — this project only ships desktop builds.
