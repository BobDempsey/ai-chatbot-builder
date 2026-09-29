# Spec Delta

## Purpose

The screen a business owner works in: configure the bot, try it immediately beside the settings, and read back what visitors asked, how they rated the answers, and which questions the documents failed to cover.

## ADDED Requirements

### Requirement: Bot settings are editable and take effect

The system SHALL let the session configure the bot's name, colors, greeting and tone. Saved settings SHALL apply to both the preview chat and the embedded widget.

#### Scenario: Saving settings

- **WHEN** a visitor changes the bot name, color, greeting or tone and saves
- **THEN** the change persists for that session and the preview chat reflects it without a page reload

#### Scenario: Rejected settings

- **WHEN** a visitor submits a setting that fails validation, such as an empty name or a malformed color
- **THEN** the system rejects the save, explains which field is wrong, and keeps the previous values

### Requirement: A preview chat sits beside the settings

The dashboard SHALL show a working chat against the session's own bot alongside the settings, so a question can be asked without leaving the page or embedding anything.

#### Scenario: Asking in the preview

- **WHEN** a visitor types a question into the preview chat
- **THEN** the answer streams in with citations, exactly as it would in the embedded widget

#### Scenario: Preview reflects the current documents

- **WHEN** a document finishes indexing
- **THEN** the preview chat can cite it on the next question, with no reload

### Requirement: Conversations, ratings and gaps are visible

The dashboard SHALL show the session's conversation log, the thumbs-up and thumbs-down ratings left on answers, and a list of questions the bot could not answer.

#### Scenario: Reading a conversation

- **WHEN** a visitor opens the conversation log and selects an exchange
- **THEN** the questions, answers and citations of that conversation are shown

#### Scenario: Rating an answer

- **WHEN** a visitor rates an answer up or down
- **THEN** the rating is recorded against that answer and appears in the dashboard's rating summary

#### Scenario: Unanswered questions drive the next docs

- **WHEN** the bot has declined questions for lack of coverage
- **THEN** those questions are listed together, so the visitor can see which documents are missing
