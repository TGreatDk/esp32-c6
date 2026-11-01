#include <Arduino_GFX_Library.h>
#include <WiFi.h>
#include <assert.h>
#include <string.h>
#include <time.h>

#if __has_include("secrets.h")
#include "secrets.h"
#else
#include "secrets.example.h"
#endif
#include "headline_feed.h"
#include "name_layout.h"
#include "boot_button.h"
#include "pixel_art.h"
#include "screen_selector.h"
#include "eyes.h"
#include "bluetooth_remote.h"

constexpr char TIMEZONE[] = "CET-1CEST,M3.5.0,M10.5.0/3";
constexpr uint16_t BACKGROUND = 0x0000;
constexpr uint16_t FOREGROUND = 0xFFFF;
uint8_t screenMode = 2;
ScreenSelector selector;
EyesMotion eyes;
bool storageHealthy = true;
bool flipped = false;
bool remoteScreenChanged = false;

// ESP32-C6-LCD-1.47 pinout: DC, CS, SCK, MOSI.
Arduino_HWSPI bus(15, 14, 7, 6);
Arduino_ST7789 panel(&bus, 21, 1, true, 172, 320, 34, 0, 34, 0);
Arduino_Canvas display(320, 172, &panel);
Arduino_Canvas ticker(320, 40, &display, 0, 65);

constexpr const char *HEADLINES[] = {
  "Maximus wins yet another match at the HexaDome!",
  "Major Lunah with another clean 5-0 win streak!",
  "Mushashi cuts through the competition - crowd goes wild!",
  "Gata steals the spotlight with a last-second scoring run!",
  "Parvati patches up the team - comeback victory secured!",
  "8-Ball sends another rival flying out of the scoring zone!",
  "Hexxer turns the tables - a stunning upset in the HexaDome!",
  "Wild Bill delivers a perfect shot as the final buzzer sounds!"
};
constexpr size_t HEADLINE_COUNT = sizeof(HEADLINES) / sizeof(HEADLINES[0]);

void present(bool animate) {
  if (!animate) { display.flush(); return; }
  // Reveal the completed frame over the old one without a black intermediate frame.
  for (int y = 0; y < 172; y += 12) {
    panel.draw16bitRGBBitmap(0, y, display.getFramebuffer() + y * 320, 320, min(12, 172 - y));
    delay(12);
  }
}

void drawName(const char *name, int top, int height, uint8_t maximumSize, uint16_t color) {
  const NameLayout layout = layoutName(name, height, maximumSize);
  display.setTextSize(layout.size);
  display.setTextColor(color, BACKGROUND);
  const int startY = top + (height - layout.count * 8 * layout.size) / 2;
  for (uint8_t i = 0; i < layout.count; ++i) {
    display.setCursor((320 - layout.lines[i].length() * 6 * layout.size) / 2, startY + i * 8 * layout.size);
    display.print(layout.lines[i]);
  }
}

void drawArt() {
  display.fillScreen(BACKGROUND);
  if (mountArt()) {
    File image = LittleFS.open("/art.rgb", "r");
    if (image && image.size() == ART_BYTES) {
      uint16_t row[320];
      for (int y = 0; y < 172; ++y) {
        if (image.read(reinterpret_cast<uint8_t *>(row), sizeof(row)) != sizeof(row)) break;
        display.draw16bitRGBBitmap(0, y, row, 320, 1);
      }
      image.close();
      return;
    }
  }
  drawName("Paint over USB", 0, 172, 3, FOREGROUND);
}

void drawInitiative() {
  display.fillScreen(BACKGROUND);
  if (currentInitiative.count) {
    drawName(currentInitiative.names[currentInitiative.current], 0, 103, 6, FOREGROUND);
    display.drawFastHLine(16, 103, 288, 0x3186);
    drawName(currentInitiative.names[(currentInitiative.current + 1) % currentInitiative.count], 104, 68, 3, 0xEE0F);
  } else {
    drawName("Set order on website", 0, 172, 3, FOREGROUND);
  }
  if (!storageHealthy) display.fillCircle(312, 8, 3, 0xFD20);
}

void scrollInitiative(const InitiativeState &previous) {
  if (!previous.count || !currentInitiative.count) {
    drawInitiative();
    present(true);
    return;
  }
  const char *outgoing = previous.names[previous.current];
  const char *incoming = currentInitiative.names[currentInitiative.current];
  const char *following = currentInitiative.names[(currentInitiative.current + 1) % currentInitiative.count];
  Serial.printf("Initiative scroll: %s -> %s\n", outgoing, incoming);
  for (int step = 0; step <= 16; ++step) {
    const float position = step / 16.0f;
    const float progress = position * position * (3 - 2 * position);
    display.fillScreen(BACKGROUND);
    drawName(outgoing, -120 * progress, 103, 6, FOREGROUND);
    drawName(incoming, 104 * (1 - progress), 68 + 35 * progress, 3 + roundf(3 * progress),
             step < 8 ? 0xEE0F : FOREGROUND);
    drawName(following, 172 - 68 * progress, 68, 3, 0xEE0F);
    present(false);
    delay(10);
  }
  drawInitiative();
  present(false);
}

bool applyLocalInitiative(InitiativeState next) {
  next.revision = currentInitiative.revision + 1;
  storageHealthy = saveInitiative(next);
  if (!storageHealthy) {
    if (screenMode == 2 && !selector.active) { drawInitiative(); present(false); }
    return false;
  }
  const InitiativeState previous = currentInitiative;
  currentInitiative = next;
  if (screenMode == 2 && !selector.active) scrollInitiative(previous);
  return true;
}

void replySerialState(uint32_t id) {
  const String body = encodeInitiative(currentInitiative);
  Serial.print(String("DND ") + id + " STATE " + body.length() + "\n" + body);
}

void replySerialError(uint32_t id, const char *error) {
  Serial.printf("DND %u ERROR %s\n", id, error);
}

void replyArt(uint32_t id, uint32_t received, bool saved, uint32_t crc) {
  Serial.printf("DND %u ART %u %u %08X\n", id, received, saved ? 1 : 0, crc);
}

void handleSerial() {
  static String line, payload;
  static bool overflow = false;
  static unsigned expected = 0, requestId = 0;
  static uint32_t started = 0;
  static bool receivingArt = false, discardArt = false;
  static uint8_t artPart[512];
  static unsigned artPartLength = 0;
  if (expected && millis() - started > 5000) {
    expected = 0; payload = "";
    receivingArt = false; cancelArtUpload();
    replySerialError(requestId, "Configuration timed out; nothing changed");
  }
  if (artUploading && millis() - artLastActivity > 30000) cancelArtUpload();
  while (Serial.available()) {
    const char value = Serial.read();
    if (expected) {
      if (receivingArt) artPart[artPartLength++] = static_cast<uint8_t>(value);
      else payload += value;
      if ((receivingArt ? artPartLength : payload.length()) == expected) {
        expected = 0;
        if (receivingArt) {
          receivingArt = false;
          const char *error = discardArt ? "Invalid image offset; retry the upload" : writeArtPart(artPart, artPartLength);
          if (error) { cancelArtUpload(); replySerialError(requestId, error); }
          else {
            const bool saved = artReceived == ART_BYTES;
            if (saved) {
              selector.active = false;
              screenMode = 3; drawArt(); present(false);
            }
            replyArt(requestId, artReceived, saved, artExpectedCrc);
          }
          continue;
        }
        InitiativeState next;
        if (!parseInitiative(payload, next) || !next.count) replySerialError(requestId, "Invalid player list; nothing changed");
        else if (!applyLocalInitiative(next)) replySerialError(requestId, "Could not save configuration");
        else replySerialState(requestId);
        payload = "";
      }
    } else if (value == '\n') {
      if (overflow) replySerialError(0, "Command too long");
      else if (line.startsWith("DND ")) {
        char command[9] = {}, extra;
        unsigned length = 0, second = 0, crc = 0;
        requestId = 0;
        const int fields = sscanf(line.c_str(), "DND %u %8s %u %u %c", &requestId, command, &length, &second, &extra);
        if (requestId == 0 || requestId > 2147483647u) replySerialError(0, "Invalid request ID");
        else if (fields == 2 && line == String("DND ") + requestId + " GET") replySerialState(requestId);
        else if (fields == 2 && line == String("DND ") + requestId + " ARTINFO") {
          uint32_t savedCrc = 0;
          const bool saved = readArtInfo(savedCrc);
          replyArt(requestId, saved ? ART_BYTES : 0, saved, saved ? savedCrc : 0);
        } else if (strcmp(command, "ARTBEGIN") == 0) {
          const int parsed = sscanf(line.c_str(), "DND %u ARTBEGIN %u %8x %c", &requestId, &length, &crc, &extra);
          char canonical[96]; snprintf(canonical, sizeof(canonical), "DND %u ARTBEGIN %u %08X", requestId, length, crc);
          if (parsed != 3 || line != canonical || !beginArtUpload(length, crc)) replySerialError(requestId, "Could not start 320x172 image upload");
          else replyArt(requestId, 0, false, crc);
        } else if (fields == 4 && strcmp(command, "ARTPART") == 0 && second > 0 && second <= 512 &&
                   line == String("DND ") + requestId + " ARTPART " + length + " " + second) {
          expected = second; started = millis(); artPartLength = 0; receivingArt = true;
          discardArt = !artUploading || length != artReceived;
        }
        else if (fields == 2 && line == String("DND ") + requestId + " NEXT") {
          if (!currentInitiative.count) replySerialError(requestId, "Configure players first");
          else {
            InitiativeState next = currentInitiative;
            next.current = (next.current + 1) % next.count;
            if (applyLocalInitiative(next)) replySerialState(requestId);
            else replySerialError(requestId, "Could not save turn");
          }
        } else if (fields == 3 && strcmp(command, "SET") == 0 && length > 0 && length <= 512 &&
                   line == String("DND ") + requestId + " SET " + length) {
          expected = length; started = millis(); payload = "";
        } else replySerialError(requestId, "Invalid command");
      }
      line = ""; overflow = false;
    } else if (value != '\r' && !overflow) {
      if (line.length() >= 96) { line = ""; overflow = true; }
      else line += value;
    }
  }
}

void drawClock() {
  display.fillRect(0, 45, 320, 110, BACKGROUND);
  const time_t now = time(nullptr);
  display.setTextColor(FOREGROUND, BACKGROUND);
  if (now < 1704067200) {
    display.setTextSize(2);
    display.setCursor(16, 72);
    display.print(WiFi.status() == WL_CONNECTED ? "Syncing time..." : "Connecting Wi-Fi...");
  } else {
    struct tm local = {};
    localtime_r(&now, &local);
    char clockText[9], dateText[24];
    strftime(clockText, sizeof(clockText), "%H:%M:%S", &local);
    strftime(dateText, sizeof(dateText), "%a %d %b %Y", &local);
    Serial.printf("%s %s\n", dateText, clockText);
    display.setTextSize(6);
    display.setCursor(16, 60);
    display.print(clockText);
    display.setTextSize(2);
    display.setCursor(16, 122);
    display.print(dateText);
  }
  display.setTextSize(1);
  display.setCursor(16, 145);
  display.print(WiFi.status() == WL_CONNECTED ? "Wi-Fi connected" : "Wi-Fi offline - retrying");
}

void drawEyes() {
  display.fillScreen(BACKGROUND);
  const int h = eyes.height;
  for (int center : {90, 230}) {
    display.fillRoundRect(center - 53, 86 - h / 2, 106, h, min(24, h / 2), 0x07FF);
    if (h > 12) {
      const int radiusY = min(20, (h - 8) / 2);
      const int pupilY = constrain(86 + int(eyes.y), 86 - h / 2 + radiusY + 3, 86 + h / 2 - radiusY - 3);
      display.fillEllipse(center + int(eyes.x), pupilY, 17, radiusY, BACKGROUND);
      if (h > 45) display.fillCircle(center + int(eyes.x) - 5, pupilY - 6, 3, FOREGROUND);
    }
  }
}

void drawSelector(uint32_t now) {
  display.fillScreen(BACKGROUND);
  display.setTextSize(1); display.setTextColor(FOREGROUND);
  display.setCursor(12, 8); display.print("SELECT SCREEN");
  display.setCursor(260, 8); display.printf("%lus", (unsigned long)((5000 - min(uint32_t(5000), now - selector.changedAt) + 999) / 1000));
  for (uint8_t i = 0; i < SCREEN_COUNT; ++i) {
    const int y = 26 + i * 25;
    const bool selected = i == selector.choice;
    if (selected) display.fillRoundRect(8, y, 304, 23, 4, 0xEE0F);
    display.setTextColor(selected ? BACKGROUND : FOREGROUND);
    display.setTextSize(2); display.setCursor(16, y + 4); display.print(SCREEN_NAMES[i]);
  }
  display.setTextSize(1); display.setTextColor(FOREGROUND);
  display.setCursor(12, 156); display.print("Click: next     Wait 5s: open");
  display.fillRect(0, 169, 320 * min(uint32_t(5000), now - selector.changedAt) / 5000, 3, 0x07FF);
}

void startNetwork() {
  if (networkEnabled) return;
  networkEnabled = true;
  WiFi.persistent(false); WiFi.mode(WIFI_STA); WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  configTzTime(TIMEZONE, "pool.ntp.org", "time.cloudflare.com");
  feedQueue = xQueueCreate(1, sizeof(HeadlineFeed));
  if (!feedQueue || xTaskCreate(downloadFeed, "news", 12288, nullptr, 1, nullptr) != pdPASS)
    Serial.println("News downloader initialization failed");
}

void drawMode(uint8_t mode) {
  if (mode == 4) { eyes.reset(millis()); drawEyes(); return; }
  if (mode == 3) { drawArt(); return; }
  if (mode == 2) { drawInitiative(); return; }
  const bool news = mode == 1;
  display.fillScreen(BACKGROUND);
  display.setTextColor(news ? 0x07FF : FOREGROUND, BACKGROUND);
  display.setTextSize(2);
  display.setCursor(16, 12);
  display.print(news ? "ARISTEIA! NEWS" : "COPENHAGEN");
  if (news) {
    display.drawFastHLine(16, 40, 288, 0x07FF);
    display.setTextSize(1);
    display.setCursor(16, 122);
    display.print("HEXADOME // SIMULATED SPORTS FEED");
  }
  if (!news) {
    display.setTextSize(1);
    display.setCursor(16, 158);
    display.print("2x BOOT: screens | hold: flip");
    drawClock();
  }
  display.setTextColor(FOREGROUND, BACKGROUND);
}

void handleRemote() {
  updateRemoteAdvertising(millis());
  if (remoteResetUpload.exchange(false)) remoteUpload.clear();
  RemoteCommand command;
  if (!remoteQueue || xQueueReceive(remoteQueue, &command, 0) != pdPASS) return;
  unsigned error = 0;
  if (command.action == 'B') remoteUpload.begin(command.mode, millis());
  else if (command.action == 'D') {
    if (!remoteUpload.append(command.data, millis())) error = 3;
  } else if (command.action == 'C') {
    InitiativeState next;
    if (!remoteUpload.complete(millis()) || !parseInitiative(remoteUpload.body, next) || !next.count) error = 3;
    else if (applyLocalInitiative(next)) replySerialState(0); else error = 2;
    remoteUpload.clear();
  } else if (command.action == 'S') {
    selector.active = false; screenMode = command.mode;
    if (screenMode <= 1) startNetwork();
    drawMode(screenMode); present(true); remoteScreenChanged = true;
  } else if (command.action == 'F') {
    flipped = !flipped; panel.setRotation(flipped ? 3 : 1);
    if (selector.active) { selector.changedAt = millis(); drawSelector(millis()); }
    else drawMode(screenMode);
    present(false); remoteScreenChanged = true;
  } else if (command.action == 'N') {
    if (!currentInitiative.count) error = 1;
    else {
      InitiativeState next = currentInitiative;
      next.current = (next.current + 1) % next.count;
      if (applyLocalInitiative(next)) replySerialState(0); else error = 2;
    }
  }
  remoteOrder->setValue(encodeInitiative(currentInitiative));
  remoteCharacteristic->setValue(String(command.id) + " " + screenMode + " " + (flipped ? 1 : 0) +
    " " + currentInitiative.revision + " " + error);
}

void checkTimezone() {
  setenv("TZ", TIMEZONE, 1);
  tzset();
  time_t january = 1767225600;  // 2026-01-01 00:00 UTC
  time_t july = 1782864000;     // 2026-07-01 00:00 UTC
  struct tm local = {};
  localtime_r(&january, &local);
  assert(local.tm_hour == 1 && local.tm_isdst == 0);
  localtime_r(&july, &local);
  assert(local.tm_hour == 2 && local.tm_isdst > 0);
}

void setup() {
  Serial.setRxBufferSize(1024);
  Serial.begin(115200);
  checkTimezone();
  checkButton();
  checkFeed();
  checkInitiative();
  checkNameLayout();
  checkArt();
  checkSelector();
  checkEyes();
  checkRemote();
  storageHealthy = loadInitiative();
  Serial.println(storageHealthy ? "Local initiative loaded" : "Local initiative storage needs attention");
  currentFeed.count = HEADLINE_COUNT;
  for (size_t i = 0; i < HEADLINE_COUNT; ++i) strcpy(currentFeed.headlines[i], HEADLINES[i]);
  pinMode(BOOT_PIN, INPUT_PULLUP);
  pinMode(4, OUTPUT);
  digitalWrite(4, HIGH);  // Keep the SD card off the shared SPI bus.
  pinMode(22, OUTPUT);
  digitalWrite(22, LOW);
  if (!panel.begin(20000000) || !display.begin(GFX_SKIP_OUTPUT_BEGIN)) {
    Serial.println("Display initialization failed");
    while (true) delay(1000);
  }
  panel.setRotation(1);
  display.fillScreen(BACKGROUND);
  display.setTextWrap(false);
  display.setTextColor(FOREGROUND, BACKGROUND);
  if (!ticker.begin(GFX_SKIP_OUTPUT_BEGIN)) {
    Serial.println("Ticker buffer allocation failed");
    while (true) delay(1000);
  }
  ticker.setTextWrap(false);
  ticker.setTextSize(3);
  ticker.setTextColor(FOREGROUND, BACKGROUND);
  if (!ledcAttach(22, 5000, 8) || !ledcWrite(22, 100)) {
    Serial.println("Backlight initialization failed");
  }
  drawMode(2);
  present(false);
  WiFi.mode(WIFI_OFF);
  startRemote();
  Serial.println("Startup: initiative; double-click BOOT for screens");
  replySerialState(0);
}

void loop() {
  static time_t lastSecond = 0;
  static uint32_t lastRetry = 0;
  static BootButton button;
  static size_t headline = 0;
  static float tickerX = 320;
  static uint32_t lastFrame = 0;
  handleSerial();
  handleRemote();
  uint32_t nowMs = millis();
  if (remoteScreenChanged) {
    remoteScreenChanged = false; lastSecond = -1; tickerX = display.width(); lastFrame = nowMs;
  }
  const BootButton::Event event = button.update(digitalRead(BOOT_PIN) == LOW, nowMs);
  if (event == BootButton::DoubleClick) {
    selector.open(screenMode, nowMs);
    openRemoteWindow(nowMs);
  } else if (event == BootButton::Hold) {
    flipped = !flipped; panel.setRotation(flipped ? 3 : 1);
    if (selector.active) selector.changedAt = nowMs;
    else { drawMode(screenMode); present(false); nowMs = millis(); }
  } else if (event == BootButton::Click) {
    if (selector.active) selector.next(nowMs);
    else if (screenMode == 2 && currentInitiative.count) {
      InitiativeState next = currentInitiative;
      next.current = (next.current + 1) % next.count;
      if (applyLocalInitiative(next)) replySerialState(0);
      else replySerialError(0, "Could not save turn");
    }
  }
  if (selector.active) {
    if (selector.ready(nowMs) && !button.previous && !button.stable && !button.waiting) {
      screenMode = selector.mode(); selector.active = false;
      if (screenMode <= 1) startNetwork();
      drawMode(screenMode); present(true);
      lastSecond = -1; tickerX = display.width(); lastFrame = millis(); nowMs = lastFrame;
      Serial.printf("Screen selected: %s\n", SCREEN_NAMES[selector.choice]);
    } else {
      static uint32_t menuFrame = 0;
      if (event != BootButton::None || nowMs - menuFrame >= 100) {
        drawSelector(nowMs); present(false); menuFrame = nowMs;
      }
      delay(5); return;
    }
  }

  HeadlineFeed incoming;
  if (feedQueue && xQueueReceive(feedQueue, &incoming, 0) == pdPASS) {
    bool changed = incoming.speed != currentFeed.speed || incoming.color != currentFeed.color ||
      incoming.count != currentFeed.count || memcmp(incoming.headlines, currentFeed.headlines, sizeof(incoming.headlines)) != 0;
    currentFeed = incoming;
    if (changed) {
      headline = 0;
      tickerX = display.width();
      ticker.setTextColor(currentFeed.color, BACKGROUND);
    }
  }
  if (networkEnabled && WiFi.status() != WL_CONNECTED && nowMs - lastRetry >= 30000) {
    lastRetry = nowMs;
    WiFi.reconnect();
  }

  if (screenMode == 4) {
    if (eyes.tick(nowMs)) { drawEyes(); present(false); }
    delay(5); return;
  }

  if (screenMode == 2 || screenMode == 3) {
    delay(20);
    return;
  }

  if (screenMode == 1) {
    if (nowMs - lastFrame >= 33) {
      const uint32_t elapsed = nowMs - lastFrame;
      lastFrame = nowMs;
      ticker.fillScreen(BACKGROUND);
      ticker.setCursor(tickerX, 8);
      ticker.print(currentFeed.headlines[headline]);
      ticker.flush();
      panel.draw16bitRGBBitmap(0, 65, ticker.getFramebuffer(), 320, 40);
      tickerX -= currentFeed.speed * (elapsed / 1000.0f);
      if (tickerX < -static_cast<int>(strlen(currentFeed.headlines[headline]) * 18)) {
        headline = (headline + 1) % currentFeed.count;
        tickerX = display.width();
      }
    }
    delay(5);
    return;
  }

  const time_t now = time(nullptr);
  if (now != lastSecond) {
    lastSecond = now;
    drawClock();
    present(false);
  }
  delay(5);
}


