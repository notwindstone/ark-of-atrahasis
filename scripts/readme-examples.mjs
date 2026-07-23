const executableFenceLanguages = new Set([
  "bash",
  "javascript",
  "js",
  "shell",
  "sh",
  "ts",
  "typescript",
]);

export function extractReadmeFences(readme) {
  if (typeof readme !== "string") throw new TypeError("README contents must be a string");
  const lines = readme.split(/\r?\n/u);
  const fences = [];

  for (let index = 0; index < lines.length; index += 1) {
    const opening = /^( {0,3})(`{3,}|~{3,})(.*)$/u.exec(lines[index]);
    if (!opening) continue;
    const indentation = opening[1].length;
    const marker = opening[2];
    const info = opening[3].trim();
    if (marker[0] === "`" && info.includes("`")) continue;
    const language = (info.split(/\s+/u)[0] ?? "").toLowerCase();
    const codeLines = [];
    let closingIndex = index + 1;
    while (closingIndex < lines.length) {
      const closing = /^( {0,3})(`+|~+)[ \t]*$/u.exec(lines[closingIndex]);
      if (
        closing
        && closing[2][0] === marker[0]
        && closing[2].length >= marker.length
      ) {
        break;
      }
      const content = lines[closingIndex];
      const leadingSpaces = /^ */u.exec(content)?.[0].length ?? 0;
      codeLines.push(content.slice(Math.min(indentation, leadingSpaces)));
      closingIndex += 1;
    }
    if (closingIndex === lines.length) {
      throw new Error(`unclosed README fence beginning on line ${index + 1}`);
    }
    fences.push(Object.freeze({
      code: `${codeLines.join("\n")}\n`,
      executable: executableFenceLanguages.has(language),
      info,
      language,
      line: index + 1,
    }));
    index = closingIndex;
  }

  return Object.freeze(fences);
}
