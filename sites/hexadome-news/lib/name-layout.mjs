export function layoutName(name, height, maximumSize) {
  for (let size = maximumSize; size >= 1; --size) {
    const lines = [];
    let remaining = name;
    const capacity = Math.floor(288 / (6 * size));
    while (remaining.length && lines.length < 2) {
      let split = Math.min(remaining.length, capacity);
      if (remaining.length > capacity) {
        const space = remaining.lastIndexOf(" ", capacity);
        if (space > 0) split = space;
      }
      lines.push(remaining.slice(0, split));
      remaining = remaining.slice(split).trim();
    }
    if (!remaining.length && lines.length * 8 * size <= height - 12) return { size, lines };
  }
  return { size: 1, lines: ["?"] };
}
