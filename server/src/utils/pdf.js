function escapePdfText(text) {
  return String(text)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7E\xA0-\xFF\n\r\t]/g, "?")
    .replace(/[\r\t]+/g, " ")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrapLine(line, maxChars) {
  const words = line.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines = [];
  let current = "";
  for (const originalWord of words) {
    let word = originalWord;
    while (word.length > maxChars) {
      if (current) {
        lines.push(current);
        current = "";
      }
      lines.push(word.slice(0, maxChars));
      word = word.slice(maxChars);
    }
    if (!word) continue;
    if (current && current.length + word.length + 1 > maxChars) {
      lines.push(current);
      current = word;
    } else {
      current = current ? `${current} ${word}` : word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function textToPdf(text, options = {}) {
  const maxChars = Math.max(40, Math.min(110, Number(options.maxChars) || 92));
  const lines = String(text || "").split(/\r?\n/).flatMap((line) => wrapLine(line, maxChars));
  const pageLines = Math.max(20, Math.min(55, Number(options.linesPerPage) || 49));
  const groups = [];
  for (let index = 0; index < lines.length; index += pageLines) groups.push(lines.slice(index, index + pageLines));
  if (!groups.length) groups.push([""]);

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"
  ];
  const pageObjectIds = [];
  for (let index = 0; index < groups.length; index += 1) {
    const pageId = objects.length + 1;
    const contentId = pageId + 1;
    pageObjectIds.push(`${pageId} 0 R`);
    const page = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    const commands = groups[index].map((line, lineIndex) => `${lineIndex ? "T* " : ""}(${escapePdfText(line)}) Tj`).join("\n");
    const content = `BT\n/F1 10 Tf\n52 755 Td\n14 TL\n${commands}\nET`;
    const stream = `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`;
    objects.push(page, stream);
  }
  objects[1] = `<< /Type /Pages /Kids [${pageObjectIds.join(" ")}] /Count ${pageObjectIds.length} >>`;

  let pdf = "%PDF-1.4\r\n";
  const offsets = [0];
  for (const [index, object] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\r\n${object}\r\nendobj\r\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  // Each xref entry must be exactly 20 bytes (PDF 1.7): 10-digit offset, gen, flag, CRLF without trailing space.
  pdf += `xref\r\n0 ${objects.length + 1}\r\n0000000000 65535 f\r\n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n\r\n`;
  pdf += `trailer\r\n<< /Size ${objects.length + 1} /Root 1 0 R >>\r\nstartxref\r\n${xrefOffset}\r\n%%EOF\r\n`;
  return Buffer.from(pdf, "latin1");
}
