import { useMemo, useState } from "react";
import { Search, Users, X } from "lucide-react";
import type { DtmsSignatoryUser } from "./dtmsDocumentTypes";

interface PeopleMultiSelectProps {
  value: string[];
  candidates: DtmsSignatoryUser[];
  onChange: (names: string[], users: DtmsSignatoryUser[]) => void;
}

// Searchable multi-person picker for a "people" form field — ported from DMT-Front-end's
// UserMultiSelect, restyled with ETMS's own member-picker classes. The value is an array of
// full names (matching how DMT's PDF generation joins them), and onChange also hands back the
// matched user objects so the caller can mirror linked fields / auto-add viewers.
export default function PeopleMultiSelect({ value, candidates, onChange }: PeopleMultiSelectProps) {
  const [search, setSearch] = useState("");

  function namesToUsers(names: string[]): DtmsSignatoryUser[] {
    return names.map(name => candidates.find(candidate => candidate.full_name === name)).filter((candidate): candidate is DtmsSignatoryUser => !!candidate);
  }

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return [];
    return candidates
      .filter(candidate => !value.includes(candidate.full_name))
      .filter(candidate => `${candidate.full_name} ${candidate.position} ${candidate.office_name ?? ""}`.toLowerCase().includes(query))
      .slice(0, 8);
  }, [candidates, search, value]);

  function addUser(user: DtmsSignatoryUser) {
    const names = [...value, user.full_name];
    onChange(names, namesToUsers(names));
    setSearch("");
  }

  function removeName(name: string) {
    const names = value.filter(item => item !== name);
    onChange(names, namesToUsers(names));
  }

  return (
    <div className="etm-form-section-body" style={{ padding: 0, gap: 8 }}>
      {value.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {value.map(name => (
            <span key={name} className="etm-subtask-assignee-chip">
              {name}
              <button type="button" aria-label={`Remove ${name}`} onClick={() => removeName(name)} style={{ display: "inline-flex", alignItems: "center", border: 0, background: "none", padding: 0, marginLeft: 2, color: "inherit", cursor: "pointer" }}><X size={11} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="etm-member-picker">
        <div className="etm-member-search"><Search size={14} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Search by name, position, or office…" /></div>
        {search.trim() && (
          <div className="etm-member-options">
            {filtered.map(candidate => (
              <button type="button" key={candidate.id} className="etm-member-option" onClick={() => addUser(candidate)}>
                <span className="etm-member-initials" aria-hidden="true">{candidate.first_name?.charAt(0)}{candidate.last_name?.charAt(0)}</span>
                <span className="etm-member-option-name">{candidate.full_name}{candidate.position && <small>{candidate.position}{candidate.office_name ? ` · ${candidate.office_name}` : ""}</small>}</span>
              </button>
            ))}
            {!filtered.length && <p className="etm-member-empty">No one matches your search.</p>}
          </div>
        )}
      </div>
      {value.length === 0 && !search.trim() && <p className="etm-form-helper"><Users size={12} style={{ verticalAlign: "-2px", marginRight: 4 }} />No one selected yet — search above to add people.</p>}
    </div>
  );
}
