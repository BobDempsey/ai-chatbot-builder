# Spec Delta

## Purpose

Makes the app useful in the first ten seconds by giving every new session a fully populated workspace, including documents worth asking questions about, so a visitor never faces an empty screen or has to supply their own content.

## ADDED Requirements

### Requirement: New workspaces are seeded from a template

The system SHALL seed each new session's workspace from a read-only template containing one configured bot, an indexed document set, prior conversations, ratings and analytics. No session SHALL be able to modify the template.

#### Scenario: Every screen has data on first view

- **WHEN** a visitor opens the dashboard for the first time
- **THEN** the bot settings, conversation log, ratings and unanswered-question list all show seeded content rather than an empty state

#### Scenario: The bot answers before anything is uploaded

- **WHEN** a visitor asks the seeded bot a question covered by the seeded documents, having uploaded nothing
- **THEN** the bot answers from those documents with citations

#### Scenario: Edits do not reach the template

- **WHEN** a visitor deletes seeded documents, renames the bot or clears the conversation log
- **THEN** the next new session is seeded with the original template content, unchanged

### Requirement: Three fictional document sets are offered

The system SHALL ship three document sets: a SaaS help center, a recipe collection and an employee handbook. The SaaS help center SHALL be the default. Every set SHALL describe fictional subjects, so that a correct answer requires retrieval rather than the model's own knowledge.

#### Scenario: Switching sets

- **WHEN** a visitor picks a different document set
- **THEN** the workspace's indexed documents are replaced with that set, and the bot answers subsequent questions from it

#### Scenario: Sets are labelled as fictional

- **WHEN** a visitor views any seeded document or the set picker
- **THEN** the content is labelled as fictional demo data

#### Scenario: Retrieval is what produces the answer

- **WHEN** a visitor asks a question whose answer exists only in a seeded document, such as a specific refund window or PTO allowance
- **THEN** the answer matches that document and cites it

### Requirement: Expired workspaces are swept

A scheduled job SHALL run at least daily and delete every workspace whose session has expired, along with all of its records.

#### Scenario: Sweep removes abandoned data

- **WHEN** the scheduled job runs and finds workspaces older than the session lifetime
- **THEN** those workspaces and their documents, chunks, embeddings, conversations and ratings are deleted

#### Scenario: Live workspaces are untouched

- **WHEN** the scheduled job runs while visitors hold unexpired sessions
- **THEN** those sessions continue to work and their data is not altered
