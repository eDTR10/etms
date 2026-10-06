// A task's description (`details`) is stored as small, sanitised HTML — bold, italic, underline, bullet / numbered
// lists and links — instead of plain text. Descriptions written before that are plain text (line breaks and all) and
// keep working: they are recognised by having no tags in them and converted when shown or edited.

const TAG_PATTERN = /<\/?(?:b|strong|i|em|u|p|div|br|ul|ol|li|a)\b/i;
const ALLOWED = new Set(["A", "B", "STRONG", "I", "EM", "U", "UL", "OL", "LI", "P", "DIV", "BR"]);
const URL_PATTERN = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function isHtml(value: string): boolean {
  return TAG_PATTERN.test(value);
}

// Bare http(s):// and www. addresses in the text become links.
function linkify(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const texts: Text[] = [];
  while (walker.nextNode()) texts.push(walker.currentNode as Text);
  texts.forEach(node => {
    if (node.parentElement?.closest("a") || !(node.textContent && /(?:https?:\/\/|www\.)/i.test(node.textContent))) return;
    const fragment = document.createDocumentFragment();
    let last = 0;
    const text = node.textContent;
    for (const match of text.matchAll(URL_PATTERN)) {
      const url = match[0].replace(/[.,;:!?)\]]+$/, "");
      const start = match.index ?? 0;
      if (start > last) fragment.append(text.slice(last, start));
      const anchor = document.createElement("a");
      anchor.setAttribute("href", /^www\./i.test(url) ? `https://${url}` : url);
      anchor.textContent = url;
      fragment.append(anchor);
      last = start + url.length;
    }
    if (last < text.length) fragment.append(text.slice(last));
    node.replaceWith(fragment);
  });
}

// Only the tags the editor can make survive; every attribute is dropped, and a link only keeps an http(s) address.
export function sanitizeDetails(value: string): string {
  const documentNode = new DOMParser().parseFromString(value, "text/html");
  linkify(documentNode.body);
  documentNode.body.querySelectorAll("*").forEach(node => {
    if (!ALLOWED.has(node.tagName)) { node.replaceWith(...Array.from(node.childNodes)); return; }
    const href = node.tagName === "A" ? node.getAttribute("href") ?? "" : "";
    Array.from(node.attributes).forEach(attribute => node.removeAttribute(attribute.name));
    if (node.tagName === "A") {
      if (/^https?:\/\//i.test(href)) {
        node.setAttribute("href", href);
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      } else {
        node.replaceWith(...Array.from(node.childNodes));
      }
    }
  });
  return documentNode.body.innerHTML;
}

// Anything stored (plain text from before, or HTML) -> safe HTML to render or to seed the editor with.
export function detailsToHtml(value: string | null | undefined): string {
  const text = value ?? "";
  if (!text.trim()) return "";
  return sanitizeDetails(isHtml(text) ? text : escapeHtml(text).replace(/\r?\n/g, "<br>"));
}

// The same content as plain text — for table cells, tooltips and sorting, where markup would be noise.
export function detailsToText(value: string | null | undefined): string {
  const text = value ?? "";
  if (!isHtml(text)) return text.trim();
  const documentNode = new DOMParser().parseFromString(text, "text/html");
  documentNode.body.querySelectorAll("br").forEach(node => node.replaceWith("\n"));
  documentNode.body.querySelectorAll("p, div, li").forEach(node => node.append("\n"));
  return (documentNode.body.textContent ?? "").replace(/ /g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

// What is saved for an edited description: sanitised HTML, or "" when the editor holds nothing visible.
export function cleanDetails(value: string): string {
  return detailsToText(value) ? sanitizeDetails(value) : "";
}

export function RichDetails({ value, className, empty }: { value: string | null | undefined; className?: string; empty?: string }) {
  const html = detailsToHtml(value);
  if (!detailsToText(value)) return empty ? <div className={className}>{empty}</div> : null;
  // eslint-disable-next-line react/no-danger
  return <div className={`etm-rich-details ${className ?? ""}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
