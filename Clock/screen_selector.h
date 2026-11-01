#pragma once

constexpr uint8_t SCREEN_MODES[] = {0, 1, 3, 2, 4};
constexpr const char *SCREEN_NAMES[] = {"Clock", "Aristeia! News", "Pixel Art", "Initiative", "Eyes"};
constexpr uint8_t SCREEN_COUNT = 5;
struct ScreenSelector {
  bool active = false;
  uint8_t choice = 0;
  uint32_t changedAt = 0;
  void open(uint8_t mode, uint32_t now) {
    active = true; changedAt = now; choice = 0;
    for (uint8_t i = 0; i < SCREEN_COUNT; ++i) if (SCREEN_MODES[i] == mode) choice = i;
  }
  void next(uint32_t now) { choice = (choice + 1) % SCREEN_COUNT; changedAt = now; }
  bool ready(uint32_t now) const { return active && now - changedAt >= 5000; }
  uint8_t mode() const { return SCREEN_MODES[choice]; }
};
void checkSelector() {
  ScreenSelector menu;
  assert(!menu.ready(9000));
  menu.open(2, 100); assert(menu.mode() == 2);
  menu.next(200); assert(menu.mode() == 4);
  menu.next(300); assert(menu.mode() == 0);
  assert(!menu.ready(5299)); assert(menu.ready(5300));
  menu.open(3, 0xFFFFFF00u);
  assert(!menu.ready(4743)); assert(menu.ready(4744));
}
