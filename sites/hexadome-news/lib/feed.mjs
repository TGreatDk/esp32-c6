export const defaults = [
  "Maximus wins yet another match at the HexaDome!",
  "Major Lunah with another clean 5-0 win streak!",
  "Mushashi cuts through the competition - crowd goes wild!",
  "Gata steals the spotlight with a last-second scoring run!",
  "Parvati patches up the team - comeback victory secured!",
  "8-Ball sends another rival flying out of the scoring zone!",
  "Hexxer turns the tables - a stunning upset in the HexaDome!",
  "Wild Bill delivers a perfect shot as the final buzzer sounds!",
];
export function validateHeadlines(value) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 16) throw new Error("Use 1 to 16 headlines.");
  return value.map((line) => {
    if (typeof line !== "string" || !/^[\x20-\x7E]{1,120}$/.test(line) || !line.trim()) {
      throw new Error("Each headline needs 1 to 120 plain English characters (no emoji or line breaks).");
    }
    return line.trim();
  });
}

export function validateSettings(value) {
  const headlines = validateHeadlines(value?.headlines);
  if (!Number.isInteger(value.speed) || value.speed < 30 || value.speed > 180) throw new Error("Speed must be 30 to 180 pixels per second.");
  if (typeof value.color !== "string" || !/^#[0-9a-f]{6}$/i.test(value.color)) throw new Error("Choose a valid text colour.");
  return { headlines, speed: value.speed, color: value.color.toLowerCase() };
}
