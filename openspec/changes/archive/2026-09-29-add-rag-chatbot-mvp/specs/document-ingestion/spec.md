# Spec Delta

## Purpose

Turns a visitor's own material into something the bot can answer from, accepting PDFs, Markdown and help-center URLs, and showing the indexing work as it happens so the wait is legible rather than a blank pause.

## ADDED Requirements

### Requirement: Documents are accepted in three forms

The system SHALL accept PDF uploads, pasted Markdown and help-center URLs as document sources for the session's bot. Each accepted source SHALL become a document with a title, a source reference and extracted text.

#### Scenario: PDF upload

- **WHEN** a visitor uploads a PDF within the size cap
- **THEN** the system extracts its text, creates a document and begins indexing it

#### Scenario: Pasted Markdown

- **WHEN** a visitor pastes Markdown and names it
- **THEN** the system creates a document from that text and begins indexing it

#### Scenario: Help-center URL

- **WHEN** a visitor submits a reachable URL
- **THEN** the system fetches the page, extracts its readable text, creates a document and begins indexing it

#### Scenario: Unreadable source

- **WHEN** a submitted file is not a readable PDF, or a URL cannot be fetched or yields no text
- **THEN** the system rejects it with a message naming the reason and creates no partial document

### Requirement: Documents are chunked and embedded

The system SHALL split each document into overlapping chunks that retain their position and section heading, and SHALL store an embedding vector for every chunk alongside its text.

#### Scenario: Chunks keep their origin

- **WHEN** a document finishes indexing
- **THEN** every chunk records which document and which section it came from, so an answer can cite it

#### Scenario: Embedding failure is recoverable

- **WHEN** the embedding provider fails partway through a document
- **THEN** the document is marked failed with a retry available, and no half-indexed chunks are left behind for retrieval to find

### Requirement: Indexing progress is visible

The system SHALL report each document's indexing state, progressing from queued through extracting and embedding to ready or failed, and the dashboard SHALL show that progress while it happens.

#### Scenario: Progress while indexing

- **WHEN** a visitor uploads a document
- **THEN** the dashboard shows its state advancing without a page reload, and shows a chunk count when it reaches ready

#### Scenario: A new document is answerable once ready

- **WHEN** a document reaches the ready state
- **THEN** the bot's next answer can retrieve and cite that document's chunks

#### Scenario: A document that is still indexing is not cited

- **WHEN** a visitor asks a question while a document is still queued or embedding
- **THEN** the answer draws only on documents that are ready, and does not cite the unfinished one
