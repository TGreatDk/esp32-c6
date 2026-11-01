#pragma once
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <freertos/FreeRTOS.h>
#include <freertos/queue.h>
#include "feed_ca.h"
#include "initiative_state.h"

struct HeadlineFeed {
  uint16_t speed = 90;
  uint16_t color = 0xFFFF;
  uint8_t count = 0;
  char headlines[16][121] = {};
};

QueueHandle_t feedQueue;
HeadlineFeed currentFeed;
bool networkEnabled = false;
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

bool readPrivateFeed(const String &url, FeedBuffer &buffer) {
  WiFiClientSecure client;
  client.setCACert(FEED_CA);
  client.setHandshakeTimeout(5);
  HTTPClient http;
  http.setConnectTimeout(3000);
  http.setTimeout(3000);
  if (!http.begin(client, url)) return false;
  http.addHeader("OAI-Sites-Authorization", String("Bearer ") + FEED_TOKEN);
  const int status = http.GET();
  const bool valid = status == HTTP_CODE_OK && http.getSize() <= 2048 &&
    http.writeToStream(&buffer) > 0 && !buffer.overflow;
  if (!valid) Serial.printf("News unavailable (HTTP %d); keeping built-in headlines\n", status);
  http.end();
  return valid;
}

void downloadFeed(void *) {
  uint32_t lastNews = millis() - 60000;
  for (;;) {
    if (WiFi.status() == WL_CONNECTED && time(nullptr) > 1704067200 && millis() - lastNews >= 60000) {
      lastNews = millis();
      FeedBuffer buffer;
      HeadlineFeed downloaded;
      if (readPrivateFeed(FEED_URL, buffer) && parseFeed(buffer.body, downloaded)) {
        xQueueOverwrite(feedQueue, &downloaded);
      }
    }
    vTaskDelay(pdMS_TO_TICKS(1000));
  }
}
