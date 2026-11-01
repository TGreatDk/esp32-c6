#pragma once
#include <Preferences.h>

struct InitiativeState {
  uint32_t revision = 0;
  uint8_t current = 0;
  uint8_t count = 0;
  char names[16][25] = {};
};

InitiativeState currentInitiative;
Preferences initiativeStorage;
bool initiativeStorageReady = false;

String encodeInitiative(const InitiativeState &state) {
  String data = String("INITIATIVE/2 ") + state.current + " " + state.revision + "\n";
  for (uint8_t i = 0; i < state.count; ++i) data += String(state.names[i]) + "\n";
  return data;
}

bool saveInitiative(const InitiativeState &state) {
  if (!initiativeStorageReady) return false;
  const String data = encodeInitiative(state);
  return initiativeStorage.putString("order", data) == data.length();
}
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
  InitiativeState restored;
  assert(parseInitiative(encodeInitiative(sample), restored));
  assert(restored.current == 1 && restored.count == 2 && restored.revision == 42);
}

bool loadInitiative() {
  initiativeStorageReady = initiativeStorage.begin("dnd", false);
  if (!initiativeStorageReady) return false;
  const String saved = initiativeStorage.getString("order", "");
  if (!saved.length()) return true;
  InitiativeState restored;
  if (!parseInitiative(saved, restored)) return false;
  currentInitiative = restored;
  return true;
}


