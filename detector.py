"""
Inactivity detector for a SaaS desktop app (e.g. OneNote) that bills by
time-open. Watches for two conditions and notifies you to close the app:

1. The app is the foreground window but there's been no keyboard/mouse
   activity for IDLE_THRESHOLD_SECONDS.
2. The app is running but has NOT been the foreground window for
   BACKGROUND_THRESHOLD_SECONDS (i.e. it's open in the background, racking
   up charges while you work elsewhere).

Windows only (uses win32gui/win32process for foreground window + process
name, pynput for global input hooks, win10toast for notifications).
"""
import time

import psutil
import win32gui
import win32process
from pynput import keyboard, mouse
from win10toast_click import ToastNotifier

import config

toaster = ToastNotifier()

_last_input_time = time.monotonic()


def _on_input(*_args, **_kwargs):
    global _last_input_time
    _last_input_time = time.monotonic()


def _get_foreground_process_name():
    hwnd = win32gui.GetForegroundWindow()
    if not hwnd:
        return None
    try:
        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        return psutil.Process(pid).name().lower()
    except (psutil.NoSuchProcess, psutil.AccessDenied):
        return None


def _is_target_running():
    targets = {name.lower() for name in config.TARGET_PROCESS_NAMES}
    for proc in psutil.process_iter(["name"]):
        if (proc.info["name"] or "").lower() in targets:
            return True
    return False


def _notify(title, message):
    toaster.show_toast(title, message, duration=8, threaded=True)
    print(f"[NOTIFY] {title}: {message}")


def main():
    targets = {name.lower() for name in config.TARGET_PROCESS_NAMES}

    kb_listener = keyboard.Listener(on_press=_on_input)
    ms_listener = mouse.Listener(on_move=_on_input, on_click=_on_input, on_scroll=_on_input)
    kb_listener.start()
    ms_listener.start()

    last_foreground_time = time.monotonic()  # last time target was foreground
    last_idle_notify = 0.0
    last_background_notify = 0.0

    print(f"Watching for: {sorted(targets)}")
    print(f"Idle threshold: {config.IDLE_THRESHOLD_SECONDS}s, "
          f"Background threshold: {config.BACKGROUND_THRESHOLD_SECONDS}s")

    try:
        while True:
            now = time.monotonic()

            if not _is_target_running():
                last_foreground_time = now  # reset so it doesn't fire stale alerts
                time.sleep(config.POLL_INTERVAL_SECONDS)
                continue

            foreground_name = _get_foreground_process_name()
            is_foreground = foreground_name in targets

            if is_foreground:
                last_foreground_time = now
                idle_for = now - _last_input_time
                if idle_for >= config.IDLE_THRESHOLD_SECONDS:
                    if now - last_idle_notify >= config.NOTIFICATION_COOLDOWN_SECONDS:
                        _notify(
                            "Inactivity Detected",
                            f"No activity in {foreground_name} for "
                            f"{int(idle_for)}s. Close it to stop the meter.",
                        )
                        last_idle_notify = now
            else:
                background_for = now - last_foreground_time
                if background_for >= config.BACKGROUND_THRESHOLD_SECONDS:
                    if now - last_background_notify >= config.NOTIFICATION_COOLDOWN_SECONDS:
                        _notify(
                            "App Running in Background",
                            f"It's been open but not in focus for "
                            f"{int(background_for)}s. Close it to stop the meter.",
                        )
                        last_background_notify = now

            time.sleep(config.POLL_INTERVAL_SECONDS)
    except KeyboardInterrupt:
        pass
    finally:
        kb_listener.stop()
        ms_listener.stop()


if __name__ == "__main__":
    main()
