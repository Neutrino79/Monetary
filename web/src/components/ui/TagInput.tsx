import { useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { MAX_TAGS, MAX_TAG_LENGTH, addTag, normaliseTag } from "@/lib/utils/tags";

/**
 * Tags as chips: type a word and press Enter or comma to add it, Backspace on an empty box removes the last,
 * and existing tags are offered as one-tap suggestions while typing.
 */
export function TagInput({ value, onChange, suggestions = [], id, className }: {
  value: string[];
  onChange: (tags: string[]) => void;
  /** Tags already in use elsewhere. */
  suggestions?: string[];
  id?: string;
  className?: string;
}) {
  const [text, setText] = useState("");
  const query = normaliseTag(text);
  const matches = suggestions.filter((s) => !value.includes(s) && (!query || s.includes(query))).slice(0, 6);
  const full = value.length >= MAX_TAGS;

  function commit(raw: string) {
    onChange(addTag(value, raw));
    setText("");
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-1.5 rounded-[10px] border border-line-strong bg-paper-raised px-2.5 py-2 focus-within:border-focus-ring">
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-paper-sunken px-2.5 py-0.5 text-[12.5px]">
            {t}
            <button type="button" aria-label={`Remove tag ${t}`} onClick={() => onChange(value.filter((x) => x !== t))} className="rounded-full text-ink-faint hover:text-ink">
              <X size={12} />
            </button>
          </span>
        ))}
        <input
          id={id}
          value={text}
          maxLength={MAX_TAG_LENGTH + 5}
          disabled={full}
          placeholder={full ? `Up to ${MAX_TAGS} tags` : value.length ? "" : "e.g. goa trip"}
          aria-label="Add a tag"
          onChange={(e) => (e.target.value.includes(",") ? commit(e.target.value) : setText(e.target.value))}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();               // never submit the surrounding form
              if (text.trim()) commit(text);
            } else if (e.key === "Backspace" && !text && value.length) {
              onChange(value.slice(0, -1));
            }
          }}
          onBlur={() => text.trim() && commit(text)}
          className={cn("min-w-24 flex-1 bg-transparent py-0.5 text-[13.3px] focus:outline-none", full && "cursor-not-allowed")}
        />
      </div>
      {matches.length > 0 && !full && (
        <div className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Tag suggestions">
          {matches.map((s) => (
            <button key={s} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => commit(s)} className="rounded-full border border-line px-2.5 py-0.5 text-[12px] text-ink-soft hover:bg-paper-sunken">
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
