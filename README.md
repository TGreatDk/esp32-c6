# Waveshare ESP32-C6 tabletop display

Arduino firmware currently configured for **ESP32-C6-LCD-1.47**, with large landscape
24-hour time, seconds, date, and Wi-Fi status. Copenhagen time includes
automatic summer/winter changes. Internet access via 2.4 GHz Wi-Fi is required
after each power-on to get the time. Once synced, the clock keeps running
through Wi-Fi outages and reconnects automatically.

The board starts in **D&D-only mode**. Press and release **BOOT** to advance the
shared initiative turn. It requires Wi-Fi and a recent turn-order download; presses
are ignored while another advance is pending. A lost or conflicting request is
not automatically retried, preventing accidental double advances.

Clock and news code are retained behind a startup unlock: press and hold BOOT
for at least 300 ms **as the screen lights up**, within its 1.8-second startup
window, then release. This enables **clock → Aristeia! news → D&D initiative**
cycling for that run; short BOOT presses then switch modes instead of advancing.
Do not hold BOOT before applying power or while resetting: the chip's ROM can
enter download mode before the firmware can read the button.
The ticker cycles through eight fictional HexaDome
headlines by default, including Maximus and Major Lunah results. BOOT uses the
platform's `BOOT_PIN` (GPIO9 on this board). It runs without internet;
Wi-Fi reconnects and time synchronization continue in the background. It starts
in D&D mode after a normal reset. BOOT presses are debounced, so holding the button
does not repeatedly switch modes. Do not hold BOOT while resetting or powering
on: that can enter firmware download mode.

Hold BOOT for **one second** during normal operation to rotate the entire display
180 degrees. Hold it again to return to the original orientation. A hold keeps the
current screen mode; releasing it does not count as a short press. Rotation applies
to clock, news, and initiative, and returns to the default orientation after reset.

## Headline website

Open **https://hexadome-news.tgreatdk.chatgpt.site** and sign in with your ChatGPT
account. Enter one headline per line, select a scroll speed and text colour, then
click **Send to ESP32**. Up to 16 headlines of 120 printable ASCII characters
are supported. The default speed is 90 px/s, about 50% faster than the original
ticker; the slider supports 30–180 px/s.
The preview's screen area is fixed at 320 × 172 CSS pixels in landscape, matching
the firmware's orientation. It scrolls one headline at a time without separators.

## D&D initiative

Open **https://hexadome-news.tgreatdk.chatgpt.site/initiative**. Enter one character
or monster per line in initiative order, then click **Set turn order**. This starts
at the first name. **Next turn** advances to the next entry, wrapping to the first
after the last. Click any saved name to make it the current turn. Editing the list
requires saving it before advancing. Up to 16 names of 24 printable ASCII
characters are supported. The order and current turn are stored on the site.

In the default D&D-only mode, tap BOOT to advance the turn. In unlocked multi-screen
mode, tap BOOT twice from the clock to show initiative. The current name occupies the
upper 60% of the display and the next name the lower 40%. Both are centered and
automatically wrap and resize for long names. The screen shows names and a divider,
with no initiative title or BOOT instructions. BOOT hints appear only on the clock.
Mode changes use a short top-to-bottom wipe. Initiative changes instead scroll the
current name up and off the top, promote the next name upward into its place,
and bring the following name in from below. The promoted name grows to fit the
larger area during the roughly one-second transition. The website preview mirrors
this motion. The device checks the turn feed every two seconds in
the background. Network latency can add a few seconds; after 10 seconds without a
successful update a small amber dot marks the displayed turn as cached. The website
can also advance turns in either mode. After restarting, it waits for the saved
order to download. A dedicated device control key authorizes only the next-turn
endpoint; the platform read token alone cannot advance or edit initiative.

`DEVICE_CONTROL_KEY` must match between ignored `Clock/secrets.h` and the Site's
runtime environment. The endpoint checks the expected revision before advancing,
so a repeated request cannot advance twice. Firmware reads the revision-aware
`/api/initiative/feed?v=2`; the original feed remains compatible with older firmware.

The device checks the private feed every 60 seconds in a background task so that
downloads do not block the screen or button. HTTPS certificates are verified.
The device credential in ignored `Clock/secrets.h` permits reading the feed;
editing requires a signed-in user. Treat that credential as private. The last
valid feed stays in RAM through network failures; after power loss the built-in
headlines, white text, and 90 px/s return until the next successful download.

Site source is in `sites/hexadome-news` and includes persistent D1 storage,
validation tests, migrations, and the device feed endpoint. The feed is a bounded
plain-text protocol: `HEXADOME/1 <speed> <RRGGBB>` followed by one headline per line.

The initial touch-model configuration produced a lit black screen. An I2C
probe on GPIO18/19 found no devices, so the current firmware uses the non-touch
model's ST7789 pinout: SCK 7, MOSI 6, CS 14, DC 15, reset 21, backlight 22.
The user confirmed the clock is visible with this pinout. A second I2C scan
after the vendor's touch reset sequence also found no devices. These checks
strongly indicate the non-touch model; screen touches cannot be detected without
a touch controller. The touch version uses different pins and a different panel
initialization sequence.

## Setup and upload

1. Install Arduino IDE 2. In Preferences, add this additional boards URL:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`.
2. In Boards Manager install **esp32 by Espressif Systems**, version **3.2.0**.
   In Library Manager install **GFX Library for Arduino**, version **1.5.9**.
   Wi-Fi and time support are included with the ESP32 board package.
3. Copy `Clock/secrets.example.h` to `Clock/secrets.h`, then enter the Wi-Fi
   name and password. This file is ignored by Git. Credentials are included
   in the firmware, so do not share a compiled firmware containing them.
4. Open `Clock/Clock.ino`. Select **ESP32C6 Dev Module** and set:
   - Flash Size: **8MB (64Mb)**
   - Partition Scheme: **8M with spiffs (3MB APP/1.5MB SPIFFS)**
   - USB CDC On Boot: **Enabled**
   - Upload Speed: **115200**
5. Connect with a USB data cable and select the board's port under Tools > Port.
   Click **Verify**, then **Upload**. Upload replaces the existing program.
   If connection fails, hold BOOT, press and release RESET, release BOOT,
   select the port again, and retry. Press RESET after upload if needed.

The screen first shows connection/sync status, then time and date. If it stays
on connecting, check the credentials and that the network offers 2.4 GHz.
If it stays on syncing, check that the network allows NTP (UDP port 123).
The serial monitor uses 115200 baud.

## Verification and scope

Boot-time assertions check Copenhagen's winter and summer UTC offsets.
They also check button bounce, a held press, release, and timer rollover.
Short clicks fire on release; hold checks ensure a single flip event, no click on
release after a hold, and correct timing across timer rollover.
Feed checks cover parsing, RGB565 conversion, invalid settings, excess headlines,
HTML login responses, and the 2048-byte response cap.
Compiled successfully with ESP32 core 3.2.0 and GFX Library for Arduino 1.5.9.
Uploaded to COM5 on 2026-10-31; esptool verified all written flash hashes and
detected 8 MB flash. Serial output confirmed network time synchronization and
a clock advancing once per second in Copenhagen time. The user confirmed that
the clock is visible on the physical screen. The latest flash confirmed via USB:
`Feed downloaded: 8 headlines, 90 px/s`. The site passed its three validation tests,
TypeScript checks, a production build, authenticated local save/read checks, and
deployed feed access checks. Device credentials were confirmed unable to edit.
USB output also confirmed `Mode: Aristeia! news` after a physical BOOT press.
Ticker appearance and browser visual QA remain unverified; the browser preview
tool could not initialize. Initiative adds two passing unit tests and authenticated
HTTP checks for saving, cycling, selecting a turn, stale revision conflicts, and
device write rejection. Its deployed feed returned HTTP 200 using the device token.
Latest USB checks confirmed `Initiative feed connected`, a physical hold producing
`Orientation: flipped 180 degrees` while keeping clock mode, then short presses
switching to news and D&D initiative.
The names-only 60/40 display and buffered wipe were compiled and flashed. USB
confirmed both feeds, live changes from `Dravos 19` to `Jasper 18`, and a physical
180-degree flip while remaining in initiative mode. Six site tests, including
long-name wrapping bounds, passed. Physical animation appearance remains unverified.
The subsequent scrolling firmware was flashed and USB logs confirmed the scrolling
transition path for Jasper → Silvers → Martin → Fjende. Name-fitting assertions also
cover intermediate sizes during promotion from the lower to the upper region.

The local Arduino CLI and dependencies are installed in the ignored `.tools`
folder. Rebuild and upload from PowerShell in this directory:

```powershell
$board = 'esp32:esp32:esp32c6:FlashSize=8M,PartitionScheme=default_8MB,CDCOnBoot=cdc,UploadSpeed=115200'
./.tools/arduino-cli.exe compile --fqbn $board --build-path build Clock --config-file .tools/arduino-cli.yaml
# Run upload only if compilation succeeds; confirm the port if reconnecting.
./.tools/arduino-cli.exe upload --fqbn $board --port COM5 --input-dir build Clock --config-file .tools/arduino-cli.yaml
```

Touch input, IMU, SD storage, and battery features are unused. The backlight is
set below half brightness. After a complete power loss, the clock waits for
network time again; it does not restore a saved time.

Hardware pins follow [Waveshare's non-touch board reference](https://docs.waveshare.com/ESP32-C6-LCD-1.47).
The panel uses the library's standard ST7789 initialization.
