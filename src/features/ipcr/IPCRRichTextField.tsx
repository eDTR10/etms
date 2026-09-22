import { useEffect, useRef } from "react";
import { Bold, Italic, List, Underline } from "lucide-react";
import "../tasks/forms.css";

interface IPCRRichTextFieldProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function IPCRRichTextField({ value, onChange, placeholder, disabled }: IPCRRichTextFieldProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current && ref.current.innerHTML !== value) ref.current.innerHTML = value; }, [value]);

  function format(command: "bold" | "italic" | "underline" | "insertUnorderedList") {
    ref.current?.focus();
    document.execCommand(command);
    onChange(ref.current?.innerHTML ?? "");
  }

  return (
    <div className="etm-rich-text">
      <div className="etm-rich-text-toolbar" aria-label="Text formatting">
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => format("bold")} aria-label="Bold"><Bold size={14} /></button>
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => format("italic")} aria-label="Italic"><Italic size={14} /></button>
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => format("underline")} aria-label="Underline"><Underline size={14} /></button>
        <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => format("insertUnorderedList")} aria-label="Bullet list"><List size={14} /></button>
      </div>
      <div
        ref={ref}
        className="etm-rich-text-editor"
        contentEditable={!disabled}
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder}
        onInput={() => onChange(ref.current?.innerHTML ?? "")}
      />
    </div>
  );
}
