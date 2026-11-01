#pragma once
#include <BLEDevice.h>
#include <BLEServer.h>
#include <atomic>

constexpr char REMOTE_SERVICE[] = "0c4a0001-8c10-4a73-9fa3-43b1a5d2c600";
constexpr char REMOTE_CHARACTERISTIC[] = "0c4a0002-8c10-4a73-9fa3-43b1a5d2c600";
constexpr char REMOTE_ORDER[] = "0c4a0003-8c10-4a73-9fa3-43b1a5d2c600";
struct RemoteCommand { unsigned id; char action; uint16_t mode; char data[14] = {}; };
QueueHandle_t remoteQueue;
BLECharacteristic *remoteCharacteristic = nullptr;
BLECharacteristic *remoteOrder = nullptr;
std::atomic<bool> remoteConnected{false};
std::atomic<uint16_t> remoteConnectionId{0xFFFF};
std::atomic<uint32_t> remoteOpenedAt{0};
std::atomic<bool> remoteWindow{false};
bool remoteAdvertising = false;
std::atomic<bool> remoteResetUpload{false};

struct RemoteUpload {
  String body;
  uint16_t expected = 0;
  uint32_t updatedAt = 0;
  void clear() { body = ""; expected = 0; }
  void begin(uint16_t length, uint32_t now) { clear(); expected = length; updatedAt = now; }
  bool append(const char *chunk, uint32_t now) {
    if (!expected || now - updatedAt > 10000 || body.length() + strlen(chunk) > expected) { clear(); return false; }
    body += chunk; updatedAt = now; return true;
  }
  bool complete(uint32_t now) const { return expected && body.length() == expected && now - updatedAt <= 10000; }
} remoteUpload;

bool parseRemoteCommand(const String &text, RemoteCommand &command) {
  unsigned id = 0, mode = 0; char verb[7] = {}, extra;
  const int fields = sscanf(text.c_str(), "%u %6s %u %c", &id, verb, &mode, &extra);
  if (!id || id > 65535 || text.length() > 20) return false;
  if (fields == 3 && strcmp(verb, "SCREEN") == 0 && mode < SCREEN_COUNT &&
      text == String(id) + " SCREEN " + mode) command = {id, 'S', uint8_t(mode)};
  else if (fields == 3 && strcmp(verb, "BEGIN") == 0 && mode > 0 && mode <= 512 &&
      text == String(id) + " BEGIN " + mode) command = {id, 'B', uint16_t(mode)};
  else if (strcmp(verb, "DATA") == 0 && text.startsWith(String(id) + " DATA ")) {
    const String chunk = text.substring((String(id) + " DATA ").length());
    if (!chunk.length() || chunk.length() > 13 || chunk.length() != strlen(chunk.c_str())) return false;
    command = {id, 'D', 0}; chunk.toCharArray(command.data, sizeof(command.data));
  }
  else if (fields == 2 && text == String(id) + " SAVE") command = {id, 'C', 0};
  else if (fields == 2 && text == String(id) + " GET") command = {id, 'G', 0};
  else if (fields == 2 && text == String(id) + " NEXT") command = {id, 'N', 0};
  else if (fields == 2 && text == String(id) + " FLIP") command = {id, 'F', 0};
  else return false;
  return true;
}

class RemoteWrites : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic, esp_ble_gatts_cb_param_t *param) override {
    RemoteCommand command;
    if (remoteConnected && param->write.conn_id == remoteConnectionId &&
        parseRemoteCommand(characteristic->getValue(), command))
      xQueueSend(remoteQueue, &command, 0);
  }
};
class RemoteConnections : public BLEServerCallbacks {
  void onConnect(BLEServer *server, esp_ble_gatts_cb_param_t *param) override {
    if (!remoteWindow || millis() - remoteOpenedAt >= 60000 || remoteConnected) {
      server->disconnect(param->connect.conn_id); return;
    }
    remoteConnectionId = param->connect.conn_id; remoteResetUpload = true; remoteConnected = true; remoteWindow = false;
  }
  void onDisconnect(BLEServer *, esp_ble_gatts_cb_param_t *param) override {
    if (param->disconnect.conn_id != remoteConnectionId) return;
    remoteConnected = false; remoteConnectionId = 0xFFFF; remoteResetUpload = true; xQueueReset(remoteQueue);
  }
};

void startRemote() {
  remoteQueue = xQueueCreate(8, sizeof(RemoteCommand));
  if (!remoteQueue) { Serial.println("Bluetooth queue allocation failed"); return; }
  BLEDevice::init("Tabletop ESP32");
  BLEServer *server = BLEDevice::createServer();
  server->setCallbacks(new RemoteConnections());
  BLEService *service = server->createService(REMOTE_SERVICE);
  remoteCharacteristic = service->createCharacteristic(REMOTE_CHARACTERISTIC,
    BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE);
  remoteCharacteristic->setCallbacks(new RemoteWrites());
  remoteCharacteristic->setValue("0 2 0 0 0");
  remoteOrder = service->createCharacteristic(REMOTE_ORDER, BLECharacteristic::PROPERTY_READ);
  remoteOrder->setValue(encodeInitiative(currentInitiative));
  service->start();
  BLEDevice::getAdvertising()->addServiceUUID(REMOTE_SERVICE);
  BLEDevice::getAdvertising()->setScanResponse(true);
  Serial.printf("Bluetooth ready; free heap: %u\n", ESP.getFreeHeap());
}
void openRemoteWindow(uint32_t now) {
  if (!remoteCharacteristic || remoteConnected) return;
  remoteOpenedAt = now; remoteWindow = true;
  BLEDevice::startAdvertising(); remoteAdvertising = true;
}
void updateRemoteAdvertising(uint32_t now) {
  if (remoteAdvertising && (remoteConnected || now - remoteOpenedAt >= 60000)) {
    BLEDevice::getAdvertising()->stop(); remoteAdvertising = false; remoteWindow = false;
  }
}
void checkRemote() {
  RemoteCommand command;
  assert(parseRemoteCommand("1 SCREEN 4", command) && command.action == 'S' && command.mode == 4);
  assert(parseRemoteCommand("65535 NEXT", command) && command.action == 'N');
  assert(parseRemoteCommand("2 BEGIN 512", command) && command.mode == 512);
  assert(parseRemoteCommand("3 DATA Aria\nGob", command) && strcmp(command.data, "Aria\nGob") == 0);
  assert(parseRemoteCommand("4 SAVE", command) && command.action == 'C');
  for (const char *invalid : {"0 GET", "65536 GET", "1 SCREEN 5", "1 SCREEN -1", "1 NEXT junk", "01 GET", "1 FLIP\n"})
    assert(!parseRemoteCommand(invalid, command));
  RemoteUpload upload;
  upload.begin(5, 100); assert(upload.append("Aria", 200)); assert(!upload.complete(200));
  assert(upload.append("\n", 300)); assert(upload.complete(300));
  assert(!upload.append("x", 400) && !upload.complete(400));
  upload.begin(1, 0xFFFFFF00u); assert(upload.append("x", 0)); assert(upload.complete(0));
  assert(!upload.complete(10001));
}
