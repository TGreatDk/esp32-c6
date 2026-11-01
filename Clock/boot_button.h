#pragma once

struct BootButton {
  enum Event { None, Click, DoubleClick, Hold };
  bool previous = false, stable = false, held = false;
  bool waiting = false, secondPress = false;
  uint32_t changedAt = 0, pressedAt = 0, releasedAt = 0;
  Event update(bool pressed, uint32_t now) {
    if (pressed != previous) { previous = pressed; changedAt = now; }
    if (pressed != stable && now - changedAt >= 35) {
      stable = pressed;
      if (pressed) {
        pressedAt = changedAt; held = false;
        secondPress = waiting && changedAt - releasedAt <= 350;
        if (waiting && !secondPress) { waiting = false; return Click; }
      } else if (!held) {
        if (changedAt - pressedAt >= 1000) { waiting = false; return Hold; }
        if (secondPress) { waiting = false; secondPress = false; return DoubleClick; }
        waiting = true; releasedAt = changedAt;
      }
    }
    if (stable && pressed && !held && now - pressedAt >= 1000) {
      held = true; waiting = false; secondPress = false;
      return Hold;
    }
    if (waiting && !stable && !pressed && now - releasedAt > 350) { waiting = false; return Click; }
    return None;
  }
};

void checkButton() {
  BootButton single;
  assert(!single.update(true, 10)); assert(!single.update(true, 45));
  assert(!single.update(false, 100)); assert(!single.update(false, 135));
  assert(!single.update(false, 450)); assert(single.update(false, 451) == BootButton::Click);
  BootButton twice;
  assert(!twice.update(true, 10)); assert(!twice.update(true, 45));
  assert(!twice.update(false, 100)); assert(!twice.update(false, 135));
  assert(!twice.update(true, 200)); assert(!twice.update(true, 235));
  assert(!twice.update(false, 260)); assert(twice.update(false, 295) == BootButton::DoubleClick);
  assert(!twice.update(false, 1000));
  BootButton hold;
  assert(!hold.update(true, 100)); assert(!hold.update(true, 135));
  assert(hold.update(true, 1100) == BootButton::Hold); assert(!hold.update(true, 3000));
  assert(!hold.update(false, 3010)); assert(!hold.update(false, 3045)); assert(!hold.update(false, 4000));
  BootButton rollover;
  assert(!rollover.update(true, 0xFFFFFF00u)); assert(!rollover.update(true, 0xFFFFFF30u));
  assert(!rollover.update(false, 0xFFFFFFF0u)); assert(!rollover.update(false, 20));
  assert(rollover.update(false, 335) == BootButton::Click);
}
