export const ART_WIDTH = 320, ART_HEIGHT = 172, ART_PIXELS = ART_WIDTH * ART_HEIGHT;
export function fitImage(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 || width * height > 20000000) throw new Error("Choose an image up to 20 megapixels.");
  const scale = Math.min(ART_WIDTH / width, ART_HEIGHT / height);
  const fittedWidth = Math.max(1, Math.round(width * scale)), fittedHeight = Math.max(1, Math.round(height * scale));
  return { x: Math.floor((ART_WIDTH - fittedWidth) / 2), y: Math.floor((ART_HEIGHT - fittedHeight) / 2), width: fittedWidth, height: fittedHeight };
}
export function rgbaToPixels(rgba) {
  if (rgba.length !== ART_PIXELS * 4) throw new Error("Image must be 320 by 172 pixels.");
  const pixels = new Uint16Array(ART_PIXELS);
  for (let i = 0; i < pixels.length; ++i) pixels[i] = ((rgba[i * 4] & 0xf8) << 8) | ((rgba[i * 4 + 1] & 0xfc) << 3) | (rgba[i * 4 + 2] >> 3);
  return pixels;
}
export function rgb565(hex) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw new Error("Choose a valid colour.");
  const rgb = Number.parseInt(hex.slice(1), 16);
  return ((rgb >> 8) & 0xf800) | ((rgb >> 5) & 0x07e0) | ((rgb >> 3) & 0x001f);
}
export function rgbFrom565(value) {
  return [Math.round(((value >> 11) & 31) * 255 / 31), Math.round(((value >> 5) & 63) * 255 / 63), Math.round((value & 31) * 255 / 31)];
}
export function hexFrom565(value) { return "#" + rgbFrom565(value).map((channel) => channel.toString(16).padStart(2, "0")).join(""); }
export function encodePixels(pixels) {
  if (!(pixels instanceof Uint16Array) || pixels.length !== ART_PIXELS) throw new Error("Image must be 320 by 172 pixels.");
  const bytes = new Uint8Array(ART_PIXELS * 2), view = new DataView(bytes.buffer);
  for (let i = 0; i < pixels.length; ++i) view.setUint16(i * 2, pixels[i], true);
  return bytes;
}
export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; ++bit) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
  }
  return ((crc ^ 0xffffffff) >>> 0).toString(16).padStart(8, "0").toUpperCase();
}
