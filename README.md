# ESP32-C6 tabletop display

Firmware for the Waveshare ESP32-C6-LCD-1.47. The board owns the initiative
order, current turn, validation, animation, and persistent storage.

## Configure over USB

1. Connect the ESP32 to your computer with a USB data cable.
2. Open https://hexadome-news.tgreatdk.chatgpt.site/initiative in desktop Chrome
   or Edge, sign in if requested, and click **Connect ESP32 by USB**.
3. Choose the Espressif USB serial device (normally COM5 on this computer).
4. Enter one character or monster per line in initiative order, then click
   **Save to ESP32**. Saving a list selects its first entry.
5. Click **Disconnect USB** and move the board to a USB power source to play.

The page is a USB control panel. It does not fetch or save initiative through a
web API. Player configuration and current turn live in the ESP32's flash, and
normal D&D mode turns Wi-Fi off. Internet may be needed to initially load the
page; initiative gameplay does not need it. Close Arduino Serial Monitor or any
other application using the serial port before connecting the browser.

Up to 16 names of 24 printable ASCII characters each are supported. While USB
is connected, **Next turn** asks the board to advance; clicking a saved name asks
it to select that entry. Physical BOOT presses update the connected preview too.

## Board controls

- Short BOOT press: advance to the next combatant, wrapping after the last.
- Hold BOOT for one second: rotate the whole display 180 degrees without advancing.
- The current name uses the upper 60% of the screen; the next name uses the lower
  40%. Long names wrap and resize. Turn changes scroll upward.
- Every accepted configuration or turn change is saved before the display changes.
  A failed save leaves the previous order intact and shows a small amber dot.
- The saved list and current turn return after power loss. Orientation resets.

Clock and Aristeia! news code remain behind a startup unlock. Hold BOOT for at
least 300 ms as the screen lights up, within its 1.8-second startup window, then
release. Short presses then cycle clock, news, and initiative for that run.
Holding BOOT before power-on or during reset can enter the chip's flashing mode.
Only this unlocked mode starts Wi-Fi, NTP, and the optional news download.

## Firmware build and flash

Install ESP32 Arduino core 3.2.0 and GFX Library for Arduino 1.5.9. The normal
D&D mode needs no Wi-Fi credentials. If `Clock/secrets.h` is absent, the firmware
uses `Clock/secrets.example.h`; optional network features need real credentials.
Never commit `secrets.h` or compiled firmware containing credentials.

Arduino IDE settings: ESP32C6 Dev Module, 8 MB flash, 8M with spiffs partition,
USB CDC On Boot enabled, upload speed 115200. Open `Clock/Clock.ino` and upload.

The ignored `.tools` folder contains the local CLI and dependencies used here:

```powershell
$board = 'esp32:esp32:esp32c6:FlashSize=8M,PartitionScheme=default_8MB,CDCOnBoot=cdc,UploadSpeed=115200'
./.tools/arduino-cli.exe compile --fqbn $board --build-path build Clock --config-file .tools/arduino-cli.yaml
# Upload only after compilation succeeds; confirm the port when reconnecting.
./.tools/arduino-cli.exe upload --fqbn $board --port COM5 --input-dir build Clock --config-file .tools/arduino-cli.yaml
```

The confirmed non-touch screen pinout is SCK 7, MOSI 6, CS 14, DC 15, reset 21,
backlight 22. BOOT is GPIO9. The chip reports 8 MB flash. Touch input is absent.

## USB protocol

115200 baud, ASCII, newline-delimited headers with byte-counted payloads:

```text
DND <id> GET
DND <id> NEXT
DND <id> SET <length>
<initiative payload of exactly length bytes>
```

Replies are `DND <id> STATE <length>` followed by the payload, or
`DND <id> ERROR <message>`. ID 0 reports physical-button changes. IDs 1 through
2147483647 correlate browser requests. The payload is:

```text
INITIATIVE/2 <current index> <revision>
<name 1>
<name 2>
```

Payloads are capped at 512 bytes. SET validates the entire list before saving;
its supplied revision is ignored because the board assigns revisions. Invalid,
oversized, or incomplete requests cannot partially replace the saved order.
Browser request and firmware receive timeouts handle disconnects safely.

## Web source and checks

`sites/hexadome-news` contains the hosted configurator and the preserved news site.
`lib/dnd-serial.mjs` implements Web Serial; the initiative page has no initiative
API calls. Older cloud API files are retained but are not used by USB initiative.
Local `.dev.vars`, device keys, dependencies, builds, and tool state are ignored.

Tests cover serial chunk boundaries, unsolicited BOOT updates, invalid states,
browser command routing, stream lock cleanup, validation, and name fitting.
Firmware self-checks cover parsing, persistence serialization, button debounce,
short/long press separation, timer rollover, and animation layout bounds.

Hardware checks passed for USB GET/SET/NEXT, invalid-input rejection, preservation
of the original order and turn during migration, and exact restoration of names,
current turn, and revision after a hardware reset. The browser permission picker
and physical animation appearance still need a manual visual check.
