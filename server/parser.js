// Descodifica um pacote "Data Out" do Forza (little-endian).
// FH4/FH5 enviam 324 bytes: secção "sled" (0-231) + 12 bytes extra do Horizon + secção "dash".
// FM7 (311) e FM2023 (331) não têm os 12 bytes extra, por isso o "dash" começa em 232.
export function parsePacket(buf) {
  if (buf.length < 311) return null;
  const dash = buf.length === 324 ? 244 : 232;

  return {
    isRaceOn: buf.readInt32LE(0) === 1,
    timestampMs: buf.readUInt32LE(4),
    maxRpm: buf.readFloatLE(8),
    rpm: buf.readFloatLE(16),
    carOrdinal: buf.readInt32LE(212),
    carClass: buf.readInt32LE(216),
    carPI: buf.readInt32LE(220),
    x: buf.readFloatLE(dash),
    y: buf.readFloatLE(dash + 4),
    z: buf.readFloatLE(dash + 8),
    speed: buf.readFloatLE(dash + 12), // m/s
    throttle: buf.readUInt8(dash + 71), // 0-255
    brake: buf.readUInt8(dash + 72),
    gear: buf.readUInt8(dash + 75),
    steer: buf.readInt8(dash + 76),
  };
}
