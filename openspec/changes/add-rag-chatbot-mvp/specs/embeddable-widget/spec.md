# Spec Delta

## Purpose

The visitor-facing half of the product: a chat bubble any website can add with one script tag, which must look like the bot its owner configured and must not disturb, or be disturbed by, the page it lands on.

## ADDED Requirements

### Requirement: One script tag mounts the widget

The system SHALL provide a single copyable `<script>` tag that loads the widget onto any third-party page and connects it to the bot it was issued for. Mounting SHALL require no other markup, stylesheet or build step on the host page.

#### Scenario: Embedding on a third-party page

- **WHEN** the tag is pasted into a page and the page loads
- **THEN** a chat bubble appears in the corner and opens a working chat with that bot

#### Scenario: Copying the tag

- **WHEN** a visitor copies the tag from the dashboard
- **THEN** it carries the identifier of that session's bot, so the embedded widget answers from that bot's documents

### Requirement: The widget is isolated from the host page

The widget SHALL render inside a shadow root. The host page's styles SHALL NOT alter the widget's appearance, and the widget's styles SHALL NOT alter the host page.

#### Scenario: Hostile host styles

- **WHEN** the host page sets aggressive global styles, such as a universal font, box-sizing or color rule
- **THEN** the widget still renders with its own configured appearance

#### Scenario: The host page is unchanged

- **WHEN** the widget is mounted on a page
- **THEN** no host element changes appearance, and no global style or reset is introduced

### Requirement: The widget presents answers as the dashboard does

The widget SHALL stream answers with numbered citations that open the cited section, SHALL apply the bot's configured name, colors and greeting, and SHALL offer the human handoff when the bot cannot answer.

#### Scenario: Visitor asks a question

- **WHEN** a website visitor asks the embedded bot a question the documents cover
- **THEN** the answer streams in with citations, matching what the preview chat would show

#### Scenario: Bot cannot answer

- **WHEN** retrieval finds nothing relevant
- **THEN** the widget says so and offers the "talk to a human" option

### Requirement: The widget is addressed by a public bot id, not a session cookie

The embedded widget SHALL identify its bot by a public id carried in the script tag, since a session cookie is not sent from a third-party page. The chat endpoint SHALL accept cross-origin requests that name a valid bot id, and SHALL refuse a request naming no bot or an unknown one.

#### Scenario: Chat from a third-party origin

- **WHEN** the widget on another site posts a question naming its bot id
- **THEN** the request is answered, and the answer draws only on that bot's documents

#### Scenario: Unknown bot

- **WHEN** a request names a bot id that does not exist or whose session has expired
- **THEN** the system refuses it with a readable sentence and calls no paid API

#### Scenario: The public id grants chat only

- **WHEN** a request carrying only a bot id attempts to change settings, upload a document or read the conversation log
- **THEN** the system refuses it, because those actions require the owning session's cookie

### Requirement: The script tag stays small and loads the chat on demand

The tag SHALL add no more than a few kilobytes to the host page on load. The chat interface and its dependencies SHALL download only when a visitor first reaches for the bubble, by hovering, focusing or clicking it.

#### Scenario: Cost to a page that is never used

- **WHEN** a page carrying the tag loads and nobody opens the chat
- **THEN** only the small entry script is fetched, and the chat bundle is never requested

#### Scenario: Opening the chat

- **WHEN** a visitor hovers or focuses the bubble and then clicks it
- **THEN** the chat opens, having started its download on the first of those events

#### Scenario: A failed download stays recoverable

- **WHEN** the chat bundle fails to download
- **THEN** the bubble remains usable for another attempt rather than sitting dead

### Requirement: The widget is usable by keyboard and screen reader

The widget SHALL be operable by keyboard alone, SHALL move focus into the panel when it opens and return it to the bubble when it closes, and SHALL pass an automated accessibility check with an answer, a citation list and a table on screen.

#### Scenario: Keyboard only

- **WHEN** a visitor tabs to the bubble and presses Enter
- **THEN** the chat opens, focus lands in the message field, and Escape closes it and returns focus to the bubble

#### Scenario: Wide content does not break the panel

- **WHEN** an answer contains a table wider than the panel
- **THEN** the table scrolls sideways inside its own focusable region, and neither the panel nor the host page scrolls sideways

### Requirement: The landing page leads with the chat

The product's landing page SHALL lead with a headline, a question box and a few starting prompts, and SHALL embed the live widget against the demo bot, so a visitor gets a cited answer before reaching the dashboard.

#### Scenario: Asking from the landing page

- **WHEN** a visitor types a question into the landing page's box and sends it
- **THEN** the chat opens with that question already sent, and the answer streams in with citations

#### Scenario: Starting prompts

- **WHEN** a visitor picks one of the offered starting prompts
- **THEN** the chat opens and answers it, with no navigation and no dashboard visit first
