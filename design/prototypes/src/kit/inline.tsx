// SPDX-License-Identifier: AGPL-3.0-only
// Announcement bodies are markdown; the prototypes render the one feature they use: **bold**.
export function Inline({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/).map((part, i) =>
        part.startsWith('**') ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: the split is stable for a given text
          <strong key={i} className="font-semibold text-text">
            {part.slice(2, -2)}
          </strong>
        ) : (
          part
        ),
      )}
    </>
  )
}
