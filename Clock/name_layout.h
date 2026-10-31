#pragma once

struct NameLayout {
  uint8_t size;
  uint8_t count;
  String lines[2];
};

NameLayout layoutName(const char *name, int height, uint8_t maximumSize) {
  for (int size = maximumSize; size >= 1; --size) {
    NameLayout layout = {static_cast<uint8_t>(size), 0, {}};
    String remaining(name);
    const int capacity = 288 / (6 * size);
    while (remaining.length() && layout.count < 2) {
      int split = min(static_cast<int>(remaining.length()), capacity);
      if (static_cast<int>(remaining.length()) > capacity) {
        const int space = remaining.lastIndexOf(' ', capacity);
        if (space > 0) split = space;
      }
      layout.lines[layout.count++] = remaining.substring(0, split);
      remaining = remaining.substring(split);
      remaining.trim();
    }
    if (!remaining.length() && layout.count * 8 * size <= height - 12) return layout;
  }
  return {1, 1, {"?", ""}};
}

void checkNameLayout() {
  for (const char *name : {"Aria", "Goblin Captain", "ABCDEFGHIJKLMNOPQRSTUVWX", "Christopher Longsurname"}) {
    for (const int height : {103, 68}) {
      const NameLayout layout = layoutName(name, height, height == 103 ? 6 : 3);
      assert(layout.count > 0 && layout.count <= 2);
      assert(layout.count * 8 * layout.size <= height - 12);
      for (uint8_t i = 0; i < layout.count; ++i) assert(layout.lines[i].length() * 6 * layout.size <= 288);
    }
    for (int step = 0; step <= 16; ++step) {
      const int height = 68 + 35 * step / 16;
      const NameLayout layout = layoutName(name, height, 3 + 3 * step / 16);
      assert(layout.count * 8 * layout.size <= height - 12);
      for (uint8_t i = 0; i < layout.count; ++i) assert(layout.lines[i].length() * 6 * layout.size <= 288);
    }
  }
}
