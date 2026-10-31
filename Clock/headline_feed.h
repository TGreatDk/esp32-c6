#pragma once
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include "feed_ca.h"

struct HeadlineFeed {
  uint16_t speed = 90;
  uint16_t color = 0xFFFF;
  uint8_t count = 0;
  char headlines[16][121] = {};
};

QueueHandle_t feedQueue;
HeadlineFeed currentFeed;
bool extraModesEnabled = false;
struct InitiativeState {
  uint32_t revision = 0;
  uint8_t current = 0;
  uint8_t count = 0;
  char names[16][25] = {};
};
QueueHandle_t initiativeQueue;
QueueHandle_t nextTurnQueue;
QueueHandle_t nextTurnResultQueue;
InitiativeState currentInitiative;
uint32_t lastInitiativeUpdate = 0;

bool parseInitiative(const String &body, InitiativeState &state) {
  if (body.length() > 512) return false;
  int end = body.indexOf('\n');
  if (end < 0 || end > 30) return false;
  unsigned current;
  unsigned revision = 0;
  char extra;
  const String header = body.substring(0, end);
  if (header.startsWith("INITIATIVE/2 ")) {
    if (sscanf(header.c_str(), "INITIATIVE/2 %u %u %c", &current, &revision, &extra) != 2) return false;
  } else if (sscanf(header.c_str(), "INITIATIVE/1 %u %c", &current, &extra) != 1) return false;
  if (current >= 16) return false;
  state = InitiativeState{};
  state.revision = revision;
  state.current = current;
  unsigned start = end + 1;
  while (start < body.length()) {
    end = body.indexOf('\n', start);
    if (end < 0) end = body.length();
    const unsigned length = end - start;
    if (!length || length > 24 || state.count >= 16) return false;
    bool visible = false;
    for (unsigned i = start; i < static_cast<unsigned>(end); ++i) {
      if (body[i] < 32 || body[i] > 126) return false;
      visible |= body[i] != ' ';
    }
    if (!visible) return false;
    body.substring(start, end).toCharArray(state.names[state.count++], 25);
    start = end + 1;
  }
  return state.count ? state.current < state.count : state.current == 0;
}

void checkInitiative() {
  InitiativeState sample;
  assert(parseInitiative("INITIATIVE/1 1\nAria\nGoblin\n", sample));
  assert(sample.count == 2 && sample.current == 1 && strcmp(sample.names[1], "Goblin") == 0);
  assert(!parseInitiative("INITIATIVE/1 2\nAria\nGoblin\n", sample));
  assert(!parseInitiative("INITIATIVE/1 0\nName much longer than twenty-four characters\n", sample));
  assert(!parseInitiative("INITIATIVE/1 0\n \n", sample));
  assert(parseInitiative("INITIATIVE/1 0\n", sample) && sample.count == 0);
  assert(!parseInitiative("<html>Sign in</html>", sample));
  assert(parseInitiative("INITIATIVE/2 1 42\nAria\nGoblin\n", sample));
  assert(sample.current == 1 && sample.revision == 42);
  assert(!parseInitiative("INITIATIVE/2 0 missing\nAria\n", sample));
}

class FeedBuffer : public Stream {
 public:
  String body;
  bool overflow = false;
  size_t write(uint8_t value) override { return write(&value, 1); }
  size_t write(const uint8_t *data, size_t length) override {
    if (body.length() + length > 2048) { overflow = true; return 0; }
    return body.concat(reinterpret_cast<const char *>(data), length) ? length : 0;
  }
  int available() override { return 0; }
  int read() override { return -1; }
  int peek() override { return -1; }
  void flush() override {}
};

bool parseFeed(const String &body, HeadlineFeed &feed) {
  if (body.length() > 2048) return false;
  int end = body.indexOf('\n');
  if (end < 0 || end > 40) return false;
  unsigned speed;
  char color[7], extra;
  if (sscanf(body.substring(0, end).c_str(), "HEXADOME/1 %u %6[0-9a-fA-F] %c", &speed, color, &extra) != 2 ||
      speed < 30 || speed > 180 || strlen(color) != 6) return false;
  const unsigned rgb = strtoul(color, nullptr, 16);
  feed.speed = speed;
  feed.color = ((rgb >> 8) & 0xF800) | ((rgb >> 5) & 0x07E0) | ((rgb >> 3) & 0x001F);
  feed.count = 0;
  unsigned start = end + 1;
  while (start < body.length()) {
    end = body.indexOf('\n', start);
    if (end < 0) end = body.length();
    const unsigned length = end - start;
    if (!length || length > 120 || feed.count >= 16) return false;
    bool visible = false;
    for (unsigned i = start; i < static_cast<unsigned>(end); ++i) {
      if (body[i] < 32 || body[i] > 126) return false;
      visible |= body[i] != ' ';
    }
    if (!visible) return false;
    body.substring(start, end).toCharArray(feed.headlines[feed.count++], 121);
    start = end + 1;
  }
  return feed.count > 0;
}

void checkFeed() {
  HeadlineFeed sample;
  assert(parseFeed("HEXADOME/1 90 FF0000\nMaximus wins!\nLunah wins!\n", sample));
  assert(sample.count == 2 && sample.speed == 90 && sample.color == 0xF800);
  assert(!parseFeed("HEXADOME/1 29 FFFFFF\nNews\n", sample));
  assert(!parseFeed("HEXADOME/1 90 FFFFFF\n", sample));
  assert(!parseFeed("HEXADOME/1 90 GGGGGG\nNews\n", sample));
  assert(!parseFeed("<html>Sign in</html>", sample));
  String tooMany = "HEXADOME/1 90 FFFFFF\n";
  for (int i = 0; i < 17; ++i) tooMany += "News\n";
  assert(!parseFeed(tooMany, sample));
  FeedBuffer buffer;
  assert(buffer.write(reinterpret_cast<const uint8_t *>("News"), 4) == 4);
  assert(buffer.write(reinterpret_cast<const uint8_t *>("x"), 2049) == 0 && buffer.overflow);
}

bool readPrivateFeed(const String &url, FeedBuffer &buffer, const String &payload = "") {
      WiFiClientSecure client;
      client.setCACert(FEED_CA);
      client.setHandshakeTimeout(5);
      HTTPClient http;
      http.setConnectTimeout(3000);
      http.setTimeout(3000);
      if (http.begin(client, url)) {
        http.addHeader("OAI-Sites-Authorization", String("Bearer ") + FEED_TOKEN);
        int status;
        if (payload.length()) {
          http.addHeader("X-Device-Key", DEVICE_CONTROL_KEY);
          http.addHeader("Content-Type", "application/json");
          status = http.POST(payload);
        } else status = http.GET();
        const bool valid = status == HTTP_CODE_OK && http.getSize() <= 2048 &&
          http.writeToStream(&buffer) > 0 && !buffer.overflow;
        if (!valid) Serial.printf("Feed unavailable (HTTP %d); keeping cached data\n", status);
        http.end();
        return valid;
      }
      return false;
}

void downloadFeed(void *) {
  uint32_t lastNews = millis() - 60000;
  uint32_t lastTurn = millis() - 2000;
  String initiativeUrl(FEED_URL);
  initiativeUrl.replace("/api/feed", "/api/initiative/feed?v=2");
  String nextTurnUrl(FEED_URL);
  nextTurnUrl.replace("/api/feed", "/api/initiative/next");
  for (;;) {
    uint32_t revision;
    if (xQueueReceive(nextTurnQueue, &revision, pdMS_TO_TICKS(100)) == pdPASS) {
      FeedBuffer buffer;
      InitiativeState downloaded;
      const bool success = WiFi.status() == WL_CONNECTED && time(nullptr) > 1704067200 &&
        readPrivateFeed(nextTurnUrl, buffer, String("{\"revision\":") + revision + "}") && parseInitiative(buffer.body, downloaded);
      if (success) xQueueOverwrite(initiativeQueue, &downloaded);
      else lastTurn = millis() - 2000;
      xQueueOverwrite(nextTurnResultQueue, &success);
      Serial.println(success ? "BOOT advanced the shared initiative turn" : "BOOT advance failed; refreshing turn without retrying");
    }
    if (WiFi.status() == WL_CONNECTED && time(nullptr) > 1704067200) {
      if (extraModesEnabled && millis() - lastNews >= 60000) {
        lastNews = millis();
        FeedBuffer buffer;
        HeadlineFeed downloaded;
        if (readPrivateFeed(FEED_URL, buffer) && parseFeed(buffer.body, downloaded)) {
          xQueueOverwrite(feedQueue, &downloaded);
          Serial.printf("Feed downloaded: %u headlines, %u px/s\n", downloaded.count, downloaded.speed);
        }
      }
      if (millis() - lastTurn >= 2000) {
        lastTurn = millis();
        FeedBuffer buffer;
        InitiativeState downloaded;
        if (readPrivateFeed(initiativeUrl, buffer) && parseInitiative(buffer.body, downloaded)) {
          xQueueOverwrite(initiativeQueue, &downloaded);
        }
      }
    }
  }
}
