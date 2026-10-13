const SVG = "http://www.w3.org/2000/svg";

function node(name, attrs) {
  const element = document.createElementNS(SVG, name);
  Object.entries(attrs).forEach(([key, value]) => {
    element.setAttribute(key, value);
  });
  return element;
}

function hatNodes(kind) {
  if (kind === "crown") {
    return [
      node("path", { d: "M38 40 L46 24 H74 L82 40 Z", fill: "#f4e2b4", stroke: "#1f1a14", "stroke-width": "2" }),
      node("circle", { cx: "60", cy: "30", r: "3", fill: "#c23b2e" }),
    ];
  }
  if (kind === "helmet") {
    return [node("path", { d: "M40 42 Q60 16 80 42 Z", fill: "#d7d1c6", stroke: "#1f1a14", "stroke-width": "2" })];
  }
  if (kind === "rider") {
    return [node("ellipse", { cx: "60", cy: "32", rx: "20", ry: "10", fill: "#6b4b2a", stroke: "#1f1a14", "stroke-width": "2" })];
  }
  if (kind === "poet") {
    return [node("circle", { cx: "60", cy: "24", r: "7", fill: "#1f1a14" })];
  }
  if (kind === "craft") {
    return [node("rect", { x: "42", y: "30", width: "36", height: "8", rx: "3", fill: "#c23b2e" })];
  }
  if (kind === "engineer") {
    return [
      node("path", { d: "M40 36 H80 L74 28 H46 Z", fill: "#243e73", stroke: "#1f1a14", "stroke-width": "2" }),
      node("rect", { x: "34", y: "36", width: "52", height: "5", rx: "2", fill: "#1f1a14" }),
    ];
  }
  if (kind === "ru") {
    return [node("path", { d: "M36 34 H84 L78 26 H42 Z", fill: "#1f1a14" })];
  }
  return [node("rect", { x: "44", y: "24", width: "32", height: "12", rx: "3", fill: "#1f1a14" })];
}

/** 简笔头像：几何图形 + 姓氏印章，不用照片。 */
export function createAvatar(person, size = 96) {
  const robe = /^#[0-9a-fA-F]{6}$/.test(person.robe || "") ? person.robe : "#243e73";
  const svg = node("svg", {
    viewBox: "0 0 120 120",
    width: String(size),
    height: String(size),
    role: "img",
    "aria-label": `${person.name}的简笔头像`,
  });
  svg.append(
    node("circle", { cx: "60", cy: "60", r: "56", fill: "#fff9f0", stroke: "#1f1a14", "stroke-width": "3" }),
    node("path", {
      d: "M24 112 Q60 62 96 112",
      fill: robe,
      stroke: "#1f1a14",
      "stroke-width": "2",
    }),
    node("circle", { cx: "60", cy: "48", r: "16", fill: "#f3d2b5", stroke: "#1f1a14", "stroke-width": "2" }),
    node("circle", { cx: "54", cy: "48", r: "1.6", fill: "#1f1a14" }),
    node("circle", { cx: "66", cy: "48", r: "1.6", fill: "#1f1a14" }),
    node("path", { d: "M55 54 Q60 58 65 54", fill: "none", stroke: "#1f1a14", "stroke-width": "1.6", "stroke-linecap": "round" })
  );
  hatNodes(person.hat).forEach((part) => svg.append(part));
  const seal = node("circle", { cx: "92", cy: "92", r: "16", fill: "#c23b2e", stroke: "#fff9f0", "stroke-width": "2" });
  const label = node("text", {
    x: "92",
    y: "97",
    "text-anchor": "middle",
    "font-size": "16",
    "font-family": "Songti SC, STSong, Noto Serif SC, serif",
    fill: "#fff9f0",
  });
  label.textContent = person.seal || person.name.slice(0, 1);
  svg.append(seal, label);
  return svg;
}
