import { useEffect, useRef } from "react";
import { Bold, Italic, Link2, List, Underline } from "lucide-react";
import Swal from "sweetalert2";
import "../tasks/forms.css";

interface IPCRRichTextFieldProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

// Is the caret exactly at the start of this list item's text (nothing before it inside the item)?
function caretAtStartOf(item: HTMLElement, range: Range): boolean {
  const before = document.createRange();
  before.selectNodeContents(item);
  before.setEnd(range.startContainer, range.startOffset);
  return before.toString() === "";
}

export default function IPCRRichTextField({ value, onChange, placeholder, disabled }: IPCRRichTextFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value; }, [value]);

  const emit = () => onChange(ref.current?.innerHTML ?? "");

  function format(command: "bold" | "italic" | "underline" | "insertUnorderedList") {
    ref.current?.focus();
    document.execCommand(command);
    emit();
  }

  // Link the highlighted words (or insert the address itself when nothing is highlighted). The prompt takes focus
  // away from the editor, so the selection is remembered and put back before the link is applied.
  async function addLink() {
    const editor = ref.current;
    const selection = window.getSelection();
    if (!editor || !selection || !selection.rangeCount || !editor.contains(selection.anchorNode)) return;
    const saved = selection.getRangeAt(0).cloneRange();
    const insideLink = (selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement)?.closest("a");
    const { value: url } = await Swal.fire({
      title: insideLink ? "Edit link" : "Add a link",
      input: "url",
      inputValue: insideLink?.getAttribute("href") ?? "https://",
      inputPlaceholder: "https://example.com",
      showCancelButton: true,
      showDenyButton: !!insideLink,
      denyButtonText: "Remove link",
      confirmButtonText: "Apply",
    }).then(result => result.isDenied ? { value: "" } : result);
    if (url === undefined) return;
    editor.focus();
    selection.removeAllRanges();
    selection.addRange(saved);
    if (url === "") document.execCommand("unlink");
    else if (saved.collapsed) document.execCommand("insertHTML", false, `<a href="${url.replace(/"/g, "&quot;")}">${url.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</a>`);
    else document.execCommand("createLink", false, url);
    emit();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const selection = window.getSelection();
    if (!selection || !selection.rangeCount || !selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    const container = range.startContainer;
    const inItem = (container instanceof Element ? container : container.parentElement)?.closest("li") ?? null;

    // "-" then Space at the start of a line turns the line into a bulleted (indented) list item.
    if (event.key === " " && !inItem && container.nodeType === Node.TEXT_NODE && (container.textContent ?? "").slice(0, range.startOffset) === "-") {
      event.preventDefault();
      const dash = document.createRange();
      dash.setStart(container, 0);
      dash.setEnd(container, 1);
      dash.deleteContents();
      const caret = document.createRange();
      caret.setStart(container, 0);
      caret.collapse(true);
      selection.removeAllRanges();
      selection.addRange(caret);
      document.execCommand("insertUnorderedList");
      emit();
      return;
    }

    // Backspace at the very start of a bullet takes the bullet away and gives the dash back ("- "), so the line
    // can carry on as a dash — typing Space after a lone "-" is what makes a bullet, not a dash followed by text.
    if (event.key === "Backspace" && inItem && ref.current?.contains(inItem) && caretAtStartOf(inItem, range)) {
      event.preventDefault();
      document.execCommand("insertUnorderedList");
      document.execCommand("insertText", false, "- ");
      emit();
    }
  }

  return (
    <div className="etm-rich-text">
      <div className="etm-rich-text-toolbar" aria-label="Text formatting">
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => format("bold")} aria-label="Bold"><Bold size={14} /></button>
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => format("italic")} aria-label="Italic"><Italic size={14} /></button>
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => format("underline")} aria-label="Underline"><Underline size={14} /></button>
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => format("insertUnorderedList")} aria-label="Bullet list" title="Bullet list (or type - then Space)"><List size={14} /></button>
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => void addLink()} aria-label="Link" title="Add or edit a link"><Link2 size={14} /></button>
      </div>
      <div
        ref={ref}
        className="etm-rich-text-editor"
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={emit}
        onKeyDown={onKeyDown}
      />
    </div>
  );
}
