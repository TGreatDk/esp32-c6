#pragma once
#include <LittleFS.h>

constexpr uint32_t ART_BYTES = 320 * 172 * 2;
bool artMounted = false, artUploading = false;
File artUpload;
uint32_t artReceived = 0, artExpectedCrc = 0, artCrc = 0xFFFFFFFFu, artLastActivity = 0;

uint32_t updateArtCrc(uint32_t crc, const uint8_t *data, size_t length) {
  for (size_t i = 0; i < length; ++i) {
    crc ^= data[i];
    for (int bit = 0; bit < 8; ++bit) crc = (crc >> 1) ^ ((crc & 1) ? 0xEDB88320u : 0);
  }
  return crc;
}

bool mountArt() {
  if (artMounted) return true;
  Preferences settings;
  if (!settings.begin("pixel-art", false)) return false;
  const bool initialized = settings.getBool("initialized", false);
  artMounted = LittleFS.begin(false);
  // Initialize this feature's unused filesystem once; never reformat saved artwork on a mount failure.
  if (!artMounted && !initialized) artMounted = LittleFS.format() && LittleFS.begin(false);
  if (artMounted) settings.putBool("initialized", true);
  settings.end();
  return artMounted;
}

void cancelArtUpload() {
  if (artUpload) artUpload.close();
  if (artMounted) LittleFS.remove("/art.tmp");
  artUploading = false;
}

bool beginArtUpload(uint32_t bytes, uint32_t crc) {
  if (bytes != ART_BYTES || !mountArt()) return false;
  cancelArtUpload();
  artUpload = LittleFS.open("/art.tmp", "w");
  if (!artUpload) return false;
  artReceived = 0; artExpectedCrc = crc; artCrc = 0xFFFFFFFFu;
  artLastActivity = millis(); artUploading = true;
  return true;
}

const char *writeArtPart(const uint8_t *data, size_t length) {
  if (!artUploading || !length || length > 512 || artReceived + length > ART_BYTES) return "Invalid image chunk";
  if (artUpload.write(data, length) != length) { cancelArtUpload(); return "Could not write image"; }
  artCrc = updateArtCrc(artCrc, data, length); artReceived += length; artLastActivity = millis();
  if (artReceived == ART_BYTES) {
    if ((artCrc ^ 0xFFFFFFFFu) != artExpectedCrc) { cancelArtUpload(); return "Image checksum failed; previous image kept"; }
    artUpload.flush(); artUpload.close();
    if (!LittleFS.rename("/art.tmp", "/art.rgb")) { cancelArtUpload(); return "Could not save image; previous image kept"; }
    artUploading = false;
  }
  return nullptr;
}

bool readArtInfo(uint32_t &crc) {
  if (!mountArt()) return false;
  File image = LittleFS.open("/art.rgb", "r");
  if (!image || image.size() != ART_BYTES) return false;
  uint8_t buffer[512]; size_t count, total = 0; crc = 0xFFFFFFFFu;
  while ((count = image.read(buffer, sizeof(buffer)))) { crc = updateArtCrc(crc, buffer, count); total += count; }
  crc ^= 0xFFFFFFFFu;
  image.close();
  return total == ART_BYTES;
}

void checkArt() {
  const uint8_t sample[] = "123456789";
  assert((updateArtCrc(0xFFFFFFFFu, sample, 9) ^ 0xFFFFFFFFu) == 0xCBF43926u);
  assert(ART_BYTES == 110080);
}
