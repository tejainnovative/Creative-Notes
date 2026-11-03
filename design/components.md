# Creative Notes: component specs

Tokens: `tokens.json` → `src/styles/tokens.css` (+ `theme.css` for Tailwind).
Tailwind class names are the role names: `bg-bg`, `bg-surface`,
`bg-surface-sunken`, `border-border`, `border-border-input`, `text-fg`,
`text-muted`, `bg-accent`, `text-on-accent`, `bg-accent-soft`, `text-danger`,
`bg-success-soft` and so on. **No raw hex or px in components.**

Icons: **Lucide** (ISC licence), 20px in UI, 24px in the tab bar, stroke 1.75.
Font: **Inter Variable**, self-hosted via `@fontsource-variable/inter` (works
offline, no Google Fonts call). Mono for timers and timestamps.

Global rules for every component:
- Focus: `focus-visible` → 2px `focus` ring with a 2px offset in the page's
  background colour. Never remove the outline without replacing it.
- Touch targets ≥ 44px (`touch-min`) on anything tappable.
- Motion uses `motion-fast` / `motion-base` with `ease`, and stops under
  `prefers-reduced-motion: reduce` (the pulse and waveform become static).
- Long content: titles clamp to 2 lines with an ellipsis and a full `title`
  attribute. Names truncate at one line. Nothing overflows at 320px.
- Copy is our own. Sentence case everywhere.

Patterns noted from the original (layout, not look): a phone-first single
column, a bottom tab bar with 4 items, a big round record action on Home, a
4-way underlined segmented control on a meeting, speaker-labelled transcript
lines with timestamps, a red live dot, a mono timer, pill status badges, and
cards with large corner radii. Not taken: their purple/pink gradient dark look,
glow effects, logo or illustrations.

---

## Button
```
variants  primary (bg accent, text on-accent), secondary (bg surface, border border, text fg),
          ghost (transparent, text fg, hover bg surface-sunken), danger (bg danger, text on-danger),
          icon (square, ghost styling, needs aria-label)
sizes     sm 32px (desktop dense only) · md 44px · lg 52px
states    default, hover (darken via color-mix 8%), active (12%), focus-visible ring,
          disabled (50% opacity, cursor not-allowed, aria-disabled), loading (spinner left of label,
          label kept, aria-busy=true, not clickable)
tokens    radius md, font sm/600 (md, lg: base/600), padding x 16 (lg 20), gap 8
a11y      real <button type="button"> unless it submits. Icon buttons need aria-label.
          A link that looks like a button stays an <a>
used on   all
```

## RecordButton
```
variants  idle (bg danger, mic icon, "Start recording" label under it),
          recording (bg danger, square stop icon, pulsing ring), compact (56px, in S03 footer)
size      record-button 72px circle (compact 56px), shadow record
states    idle, starting (spinner, aria-busy), recording (ring pulse 1.6s, static if reduced motion),
          stopping (spinner), disabled (no mic / unsupported: bg surface-sunken, icon muted)
a11y      <button aria-pressed> with label "Start recording" / "Stop recording";
          Space/Enter toggle; announces state change via the live region in RecordingBadge
used on   S02, S03
```

## NavBar (bottom tab bar on mobile, sidebar on desktop)
```
items     Home, Ask, History, Settings (Lucide: house, sparkles, clock, settings)
mobile    fixed bottom, height tabbar 64px + env(safe-area-inset-bottom), bg surface, border-top border,
          icon 24 + label xs; active: text accent, inactive: text muted
desktop   ≥ lg: left sidebar 240px, items 44px rows with icon + label sm/500, active bg accent-soft text accent
states    active (aria-current="page"), inactive, hover, focus-visible
a11y      <nav aria-label="Main">, real links. Hidden during recording on mobile (S03 is full screen)
used on   S02, S06, S07, S08 (and S12-S14 on desktop)
```

## TopBar
```
variants  title (left title xl/700), back (back icon button + title lg/600 centred on mobile),
          recording (back, title, mono timer, RecordingBadge), actions (up to 2 icon buttons right)
size      topbar 56px + env(safe-area-inset-top), sticky, bg bg at 92% + backdrop blur, border-bottom
          border when scrolled
a11y      title is the page <h1>. Back button label "Back"
used on   S03, S04, S07, S08, S12-S14
```

## StatTile
```
content   number (2xl/700, tabular-nums) + label (xs/500 muted, uppercase not required)
variants  default, zero (number shown as 0, muted)
tokens    bg surface, radius lg, padding 16, shadow card
a11y      <div> with the number and label in one text run so it reads as "3 meetings today"
used on   S02
```

## MeetingRow
```
content   title (base/600, 1-line truncate), meta line (sm muted): time · duration · speakers,
          status pill under the meta line when not done (Summary queued / Summarising / Failed),
          trailing: relative age or start time (xs muted, mono)
states    default, hover (bg surface-sunken), focus-visible, pressed, menu-open
actions   whole row is a link to S04; overflow menu button (⋯) with Delete, Export
height    ≥ 64px, padding 12/16, divider border between rows
a11y      the row is one <a>; the menu button is a sibling, not nested inside the link
used on   S02, S06
```

## SegmentedTabs
```
items     Transcript, Insights, Copilot, Summary (S03/S04). Optional count badge
style     underline: active text fg + 2px accent bar; inactive text muted; scrolls horizontally at 320px
states    active, inactive, hover, focus-visible, disabled (e.g. Summary while still recording: shows
          "after the meeting")
a11y      WAI-ARIA tabs: role=tablist / tab / tabpanel, roving tabindex, ←/→ Home/End move,
          aria-selected, aria-controls. Selected tab mirrored in the URL (?tab=)
used on   S03, S04
```

## TranscriptLine
```
content   speaker label (SpeakerLabel) + mono timestamp (xs muted) on one row, text below (base)
variants  other speaker, you (label "You"), no speaker (offline engine: timestamp only),
          partial (text muted + blinking caret; caret static under reduced motion)
states    final, partial, highlighted (search hit: bg warning-soft), new-insight marker (left accent bar)
a11y      the list is an <ol> in a region with aria-live="polite" while recording, announcing
          final lines only (never partials)
used on   S03, S04
```

## SpeakerLabel
```
content   8px dot in speaker-N colour + name (xs/600 fg)
colours   speaker-1…6 by first appearance, cycling
a11y      the colour is decoration only; the name carries the meaning
used on   S03, S04
```

## Waveform
```
variants  live (bars from the mic level, 24 bars, 32px tall), idle (flat line), offline engine
          (same, with "On device" pill next to it)
tokens    bars accent at 70%, silent bars border
a11y      aria-hidden; the RecordingBadge carries the state
reduced   bars freeze at the mean level
used on   S03
```

## RecordingBadge
```
content   dot + text: "Recording" (danger), "Paused" (warning), "Reconnecting…" (warning)
          + engine pill: "Cloud" (accent-soft) or "On device" (success-soft)
a11y      role=status: announces "Recording started", "Recording paused, tap to resume", etc.
used on   S03, S02 (when a recording is running in the background tab)
```

## InsightCard
```
kinds     decision (lucide check-circle, success), risk (alert-triangle, warning),
          idea (lightbulb, accent), action (list-checks, accent)
content   kind label xs/600 + text sm + mono timestamp linking to the transcript line
states    new (accent-soft background for 4s), seen
used on   S03, S04
```

## Toast
```
variants  info, success, error, with optional action button ("Undo", "View")
position  top on mobile under the TopBar, bottom-right on desktop; max 2 visible
timing    5s, paused on hover or focus; errors stay until dismissed
a11y      role=status (info, success) / role=alert (error); dismiss button; never the only place
          an error is shown
used on   global (S03 insight detected, S06 deleted + Undo, S12 note saved)
```

## SummarySection
```
sections  Overview paragraph, Decisions (list), Action items (ActionItemRow list), Key topics
          (title + detail)
states    streaming (skeleton lines, then text appearing; "Writing summary…" status),
          filled, empty section (hidden, not shown as blank), queued (offline: card with
          "Summary will be written when you're back online" + Retry now),
          failed (error card + Retry)
footer    "Written in 3.1 s · Cloud model" (xs muted)
a11y      each section has an <h2>; streaming region aria-busy=true until final
used on   S04
```

## ActionItemRow
```
content   checkbox, owner (sm/600), task (sm), due (xs muted, "by Fri 7 Nov" when parsed)
states    open, done (text muted + strike), exported (calendar icon)
a11y      real <input type=checkbox> with the task as its label
used on   S04
```

## ScoreDial (could, M3)
```
content   overall 0-100 (display) in a ring, 4 dimension bars with % labels
states    reveal (count-up 800ms, static under reduced motion), static
a11y      text equivalents for each value, ring is aria-hidden
used on   S05, S04
```

## SearchField
```
content   search icon, input, clear button (when it has a value)
states    empty (placeholder "Search meetings and notes"), typing, has-value, no-results (handled by
          EmptyState below)
a11y      <input type=search> with a visible or sr-only label; Esc clears; results count announced
used on   S06
```

## DayHeader
```
content   "Today", "Yesterday", or "Mon 3 Nov" (sm/600 muted), sticky under the TopBar.
          Sits above each day's card: inside an overflow-hidden card, sticky pins over the first row
a11y      <h2> for each group
used on   S06
```

## ChatBubble
```
variants  user (bg accent, text on-accent, right), assistant (bg surface, text fg, left, with
          citation chips that link to meetings)
states    streaming (typing dots, then text), done, error ("Couldn't answer. Retry")
a11y      the thread is a <ol>; new assistant text announced politely once finished
used on   S07, S03/S04 Copilot
```

## SuggestionChip
```
style     pill, bg surface, border border, text sm; hover bg surface-sunken
a11y      <button>; sends the question
used on   S07
```

## Composer
```
variants  chat (single line growing to 5 lines + send icon button), note (multiline, S12 full height)
states    empty (send disabled), typing, sending (disabled + spinner), offline (chat: "Needs a connection"
          hint, send disabled; note: works)
a11y      <textarea> with a label; Enter sends in chat, Shift+Enter new line; Ctrl/⌘+Enter saves a note
used on   S03, S07, S12
```

## SettingsRow
```
variants  link (label + value + chevron), toggle (label + description + Toggle), value (label + text),
          danger (label in danger, e.g. "Delete everything")
height    ≥ 52px, grouped in a card (bg surface, radius lg) with group heading xs/600 muted
a11y      the whole row is the control (label wraps the toggle)
used on   S08, S13
```

## Toggle
```
size      44×28 track, 24px thumb
states    off (track border-input outline, surface-sunken fill), on (track accent, thumb on-accent),
          focus-visible, disabled
a11y      <button role="switch" aria-checked> or <input type=checkbox role=switch>; label required
used on   S08, S13
```

## Avatar
```
content   initials (1-2 letters) on accent-soft with text accent
sizes     32, 56
a11y      aria-hidden when a name is next to it
used on   S02, S08
```

## Sheet / Dialog
```
variants  bottom sheet (< md: slides up, drag handle, max 90vh), dialog (≥ md: centred, max 480px)
content   title (lg), body, actions row (secondary + primary/danger)
states    open, closing
a11y      native <dialog> with showModal(): focus moves inside, Esc closes, focus returns to the
          opener, background inert, aria-labelledby the title
used on   S09 export, confirmations
```

## ConfirmDialog
```
built on  Dialog; destructive variant puts the danger button last and focuses Cancel first
copy      says exactly what is lost ("Delete 'Weekly sync' and its notes? You can undo for 10 seconds.")
used on   S06, S08
```

## EmptyState
```
content   Lucide icon 32 in a 64px accent-soft circle, title (lg), one line (sm muted), optional
          primary button
cases     Home no meetings, History no meetings, History no results, Ask no meetings, Insights none yet
used on   S02, S06, S07, S04
```

## Skeleton
```
variants  line (sm and base heights), row (MeetingRow shape), block
style     bg surface-sunken with a shimmer (static under reduced motion)
a11y      container aria-busy=true and an sr-only "Loading"
used on   S04, S06, S02
```

## Badge / Pill
```
variants  neutral (surface-sunken / fg), accent (accent-soft / accent), success (success-soft / success),
          warning (warning-soft / warning), danger (danger-soft / danger)
size      24px tall, xs/600, radius pill, padding x 8
used on   S03 engine, S04 status, S06 status, S08 "On this device"
```

## ProgressBar (offline model download, storage meter)
```
content   label + value text ("62 of 148 MB"), bar
a11y      <progress> or role=progressbar with aria-valuenow / min / max / valuetext
used on   S13
```

## Banner
```
variants  info (install this app), warning (offline, AI queued), danger (mic blocked)
content   icon, one sentence, optional action, dismiss
a11y      role=status (info/warning) / role=alert (danger)
used on   S02, S03, S14
```
