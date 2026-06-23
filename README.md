# Inactivity Detector

Watches a billed-by-the-minute SaaS desktop app (defaults to OneNote for
testing) and pops a Windows notification telling you to close it when:

- It's the foreground window but no keystrokes/mouse activity for 15s, or
- It's open but hasn't been the foreground window for 15s.

## Setup (Windows)

```
pip install -r requirements.txt
python detector.py
```

## Configuring the target app

Edit `config.py`:

- `TARGET_PROCESS_NAMES` — executable name(s) to watch, e.g. `["onenote.exe"]`.
  Find the right name via Task Manager > Details tab.
- `IDLE_THRESHOLD_SECONDS` / `BACKGROUND_THRESHOLD_SECONDS` — seconds before
  notifying.
- `NOTIFICATION_COOLDOWN_SECONDS` — minimum gap between repeat notifications
  for the same ongoing condition.

To switch to your real SaaS app, just point `TARGET_PROCESS_NAMES` at its
process name(s) instead of OneNote.

## Building a standalone .exe

No Python needed on the target machine once built. From the project folder
on Windows:

```
pip install pyinstaller
pyinstaller --onefile --console --name InactivityDetector --distpath packagedGood detector.py
```

The binary lands at `packagedGood\InactivityDetector.exe`. Copy that single
file anywhere and run it directly.
