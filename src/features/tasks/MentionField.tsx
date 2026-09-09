import { useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { AtSign } from "lucide-react";
import { memberName, type Member } from "./types";

function mentionHandle(member: Member): string {
  return `${member.first_name}${member.last_name}`.replace(/[^A-Za-z0-9]/g, "");
}

interface MentionFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  members: Member[];
  placeholder?: string;
  multiline?: boolean;
  rows?: number;
  maxLength?: number;
  disabled?: boolean;
  "aria-label"?: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

function findMentionQuery(value: string, caret: number): { start: number; query: string } | null {
  const uptoCaret = value.slice(0, caret);
  const at = uptoCaret.lastIndexOf("@");
  if (at === -1) return null;
  const between = uptoCaret.slice(at + 1);
  if (/\s/.test(between)) return null;
  const before = uptoCaret.charAt(at - 1);
  if (before && !/\s/.test(before)) return null;
  return { start: at, query: between };
}

export default function MentionField({
  id, value, onChange, members, placeholder, multiline, rows = 3, maxLength, disabled,
  "aria-label": ariaLabel, "aria-invalid": ariaInvalid, "aria-describedby": ariaDescribedBy,
}: MentionFieldProps) {
  const ref = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const setRef = (node: HTMLTextAreaElement | HTMLInputElement | null) => { ref.current = node; };
  const [mention, setMention] = useState<{ start: number; query: string } | null>(null);

  const suggestions = mention
    ? members.filter(member => memberName(member).toLowerCase().replace(/\s+/g, "").includes(mention.query.toLowerCase())).slice(0, 6)
    : [];

  function syncMentionState() {
    const node = ref.current;
    if (!node) return;
    const caret = node.selectionStart ?? node.value.length;
    setMention(findMentionQuery(node.value, caret));
  }

  function handleChange(event: ChangeEvent<HTMLTextAreaElement | HTMLInputElement>) {
    onChange(event.target.value);
    requestAnimationFrame(syncMentionState);
  }

  function selectMember(member: Member) {
    const node = ref.current;
    if (!node || !mention) return;
    const handle = mentionHandle(member);
    const caret = node.selectionStart ?? value.length;
    const next = `${value.slice(0, mention.start)}@${handle} ${value.slice(caret)}`;
    onChange(next);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = mention.start + handle.length + 2;
      node.focus();
      node.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) {
    if (mention && suggestions.length && event.key === "Escape") {
      setMention(null);
    }
  }

  const sharedProps = {
    id,
    value,
    placeholder,
    maxLength,
    disabled,
    "aria-label": ariaLabel,
    "aria-invalid": ariaInvalid,
    "aria-describedby": ariaDescribedBy,
    onChange: handleChange,
    onKeyUp: syncMentionState,
    onClick: syncMentionState,
    onKeyDown: handleKeyDown,
    onBlur: () => setTimeout(() => setMention(null), 120),
  };

  return (
    <div className="etm-mention-field">
      {multiline
        ? <textarea ref={setRef} rows={rows} {...sharedProps} />
        : <input ref={setRef} type="text" {...sharedProps} />}
      {mention && suggestions.length > 0 && (
        <ul className="etm-mention-suggestions" role="listbox">
          {suggestions.map(member => (
            <li key={member.id}>
              <button type="button" onMouseDown={event => event.preventDefault()} onClick={() => selectMember(member)}>
                <AtSign size={11} />
                <span>{memberName(member)}</span>
                {member.position && <small>{member.position}</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
