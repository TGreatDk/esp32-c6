#pragma once

int blinkHeight(uint32_t age) {
  if (age < 120) return 94 - 92 * age / 120;
  if (age < 190) return 2;
  if (age < 370) return 2 + 92 * (age - 190) / 180;
  return 94;
}
struct EyesMotion {
  float x = 0, y = 0;
  int targetX = 0, targetY = 0, height = 94;
  bool blinking = false;
  uint32_t lastFrame = 0, nextLook = 0, nextBlink = 0, blinkStart = 0;
  void reset(uint32_t now) {
    x = y = 0; targetX = targetY = 0; height = 94; blinking = false;
    lastFrame = now; nextLook = now + 700; nextBlink = now + 1800;
  }
  bool tick(uint32_t now) {
    if (now - lastFrame < 40) return false;
    lastFrame = now;
    if (int32_t(now - nextLook) >= 0) {
      targetX = random(-22, 23); targetY = random(-12, 13);
      nextLook = now + random(900, 2601);
    }
    x += (targetX - x) * 0.18f; y += (targetY - y) * 0.18f;
    if (blinking && now - blinkStart >= 370) {
      blinking = false; nextBlink = now + random(2500, 6001);
    }
    if (!blinking && int32_t(now - nextBlink) >= 0) { blinking = true; blinkStart = now; }
    height = blinking ? blinkHeight(now - blinkStart) : 94;
    return true;
  }
};
void checkEyes() {
  assert(blinkHeight(0) == 94 && blinkHeight(120) == 2 && blinkHeight(370) == 94);
  for (uint32_t age = 0; age < 400; ++age) assert(blinkHeight(age) >= 2 && blinkHeight(age) <= 94);
  EyesMotion eyes; eyes.reset(0xFFFFFF00u);
  assert(!eyes.tick(0xFFFFFF10u)); assert(eyes.tick(0));
}
