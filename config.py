# Process executable name(s) of the SaaS app to watch (case-insensitive).
# Default target is OneNote, used for testing.
TARGET_PROCESS_NAMES = ["onenote.exe", "onenoteim.exe"]

# Seconds of no keyboard/mouse activity while the app is the foreground
# window before we consider it "idle".
IDLE_THRESHOLD_SECONDS = 15

# Seconds the app can sit open-but-not-in-foreground before we nag about it.
BACKGROUND_THRESHOLD_SECONDS = 15

# How often (seconds) to poll the foreground window / process list.
POLL_INTERVAL_SECONDS = 1

# Minimum gap (seconds) between repeated notifications for the same
# ongoing condition, so we don't spam the user every poll cycle.
NOTIFICATION_COOLDOWN_SECONDS = 30
