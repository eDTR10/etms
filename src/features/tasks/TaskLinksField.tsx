import { useEffect, useState } from "react";
import { ExternalLink, Link2, Plus, X } from "lucide-react";
import { quickLinkService } from "../quicklinks/quickLinkService";
import type { QuickLink } from "../quicklinks/types";
import type { TaskLinkInput } from "./types";

interface TaskLinksFieldProps {
  value: TaskLinkInput[];
  onChange: (links: TaskLinkInput[]) => void;
  idPrefix: string;
}

function normalizeUrl(raw: string): string | null {
  const text = raw.trim();
  if (!text) return null;
  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export default function TaskLinksField({ value, onChange, idPrefix }: TaskLinksFieldProps) {
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    quickLinkService.list().then(rows => { if (!cancelled) setQuickLinks(rows); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  const taggedIds = new Set(value.map(link => link.quick_link).filter((id): id is number => typeof id === "number"));
  const available = quickLinks.filter(link => !taggedIds.has(link.id));

  function addUrl() {
    const normalized = normalizeUrl(url);
    if (!normalized) {
      setError("Enter a valid http(s) link.");
      return;
    }
    if (value.some(link => !link.quick_link && link.url === normalized)) {
      setError("That link is already added.");
      return;
    }
    onChange([...value, { title: title.trim(), url: normalized, quick_link: null }]);
    setUrl("");
    setTitle("");
    setError("");
  }

  function tagQuickLink(rawId: string) {
    const link = quickLinks.find(item => item.id === Number(rawId));
    if (!link) return;
    onChange([...value, { title: link.title, url: link.url, quick_link: link.id }]);
  }

  return (
    <div className="etm-task-links-field">
      {value.length > 0 && <ul className="etm-task-links-list">{value.map((link, index) => (
        <li key={`${link.quick_link ?? "url"}-${link.url}-${index}`}>
          <Link2 size={14} aria-hidden="true" />
          <span className="etm-task-links-text"><strong>{link.title || link.url}</strong>{link.title && <small>{link.url}</small>}</span>
          {link.quick_link && <span className="etm-task-links-tag">Quick link</span>}
          <button type="button" className="etm-icon-button" aria-label={`Remove link ${link.title || link.url}`} onClick={() => onChange(value.filter((_, i) => i !== index))}><X size={14} /></button>
        </li>
      ))}</ul>}
      <div className="etm-task-links-add">
        <input id={`${idPrefix}-link-url`} value={url} onChange={event => { setUrl(event.target.value); setError(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addUrl(); } }} placeholder="Paste a link (https://…)" maxLength={2000} aria-label="Link URL" />
        <input value={title} onChange={event => setTitle(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); addUrl(); } }} placeholder="Label (optional)" maxLength={255} aria-label="Link label" />
        <button type="button" className="etm-button primary small" onClick={addUrl} disabled={!url.trim()}><Plus size={14} /> Add link</button>
      </div>
      {error && <p className="etm-field-error" role="alert">{error}</p>}
      <div className="etm-task-links-quick">
        <label htmlFor={`${idPrefix}-quick-link`}><ExternalLink size={13} /> Or tag an existing quick link</label>
        <select id={`${idPrefix}-quick-link`} value="" onChange={event => tagQuickLink(event.target.value)} disabled={available.length === 0}>
          <option value="">{available.length ? "Choose a quick link…" : quickLinks.length ? "All quick links are tagged" : "No quick links available"}</option>
          {available.map(link => <option key={link.id} value={link.id}>{link.title}</option>)}
        </select>
      </div>
    </div>
  );
}
