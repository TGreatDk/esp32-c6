export function validateNames(names) {
  if (!Array.isArray(names) || names.length < 1 || names.length > 16) throw new Error("Enter 1 to 16 names in initiative order.");
  return names.map((name) => {
    if (typeof name !== "string" || !/^[\x20-\x7e]{1,24}$/.test(name) || !name.trim()) throw new Error("Each name needs 1 to 24 plain English characters.");
    return name.trim();
  });
}
export function nextTurn(current, count) {
  if (!Number.isInteger(current) || !Number.isInteger(count) || count < 1 || current < 0 || current >= count) throw new Error("Set a valid turn order first.");
  return (current + 1) % count;
}

export function initiativeFeed(state, version = 1) {
  return `INITIATIVE/${version} ${state.current}${version === 2 ? ` ${state.revision}` : ""}\n` +
    (state.names.length ? state.names.join("\n") + "\n" : "");
}
