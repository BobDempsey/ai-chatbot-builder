# Spec Delta

## Purpose

Produces the answers the product exists to give: grounded in the session's own documents, streamed as they are written, carrying citations a reader can check, and admitting ignorance instead of guessing when the documents do not cover the question.

## ADDED Requirements

### Requirement: Answers are grounded in the session's documents

The system SHALL retrieve the most relevant chunks from the asking session's ready documents and SHALL instruct the model to answer only from that retrieved text. Chunks belonging to another session SHALL never be retrieved.

#### Scenario: Answer from the documents

- **WHEN** a visitor asks a question the documents cover
- **THEN** the answer reflects the retrieved text rather than general knowledge, and every claim in it traces to a retrieved chunk

#### Scenario: Retrieval is scoped to the session

- **WHEN** two sessions hold documents that answer the same question differently
- **THEN** each session's answer matches only its own documents

### Requirement: Answers stream with numbered citations

The system SHALL stream answer text to the client as it is generated, and SHALL attach numbered citations that identify the source document and section. Each citation SHALL link to that section, and the numbers SHALL match the sources listed with the answer.

#### Scenario: Streaming

- **WHEN** a visitor sends a question
- **THEN** answer text begins appearing before the full answer is complete

#### Scenario: Citations resolve

- **WHEN** an answer displays a numbered citation
- **THEN** activating it opens the cited document at the section the text came from

#### Scenario: No citation without a source

- **WHEN** the model produces an answer
- **THEN** every citation number shown corresponds to a chunk that was actually retrieved for that question

### Requirement: Low confidence yields a handoff, not a guess

When retrieval returns nothing above the relevance threshold, the system SHALL state that the documents do not cover the question, SHALL NOT fabricate an answer, and SHALL offer to pass the question to a human by collecting an email address.

#### Scenario: Question the documents do not cover

- **WHEN** a visitor asks something absent from the indexed documents
- **THEN** the bot says it cannot answer from the available documents and shows a "talk to a human" option

#### Scenario: Collecting the email

- **WHEN** a visitor submits an email address through that option
- **THEN** the system records the address with the unanswered question and confirms that it was received

#### Scenario: Invalid email

- **WHEN** a visitor submits a malformed email address
- **THEN** the system rejects it with a message and records nothing

### Requirement: Provider failures are reported as plain sentences

When the answering or embedding provider times out, rate-limits, returns nothing, or is not configured, the system SHALL show the visitor one plain sentence saying what happened and what to do, SHALL NOT surface a stack trace, status code or provider name, and SHALL leave the rest of the app working.

#### Scenario: Provider times out

- **WHEN** the answering model does not respond within the request budget
- **THEN** the chat shows a sentence saying the assistant took too long and to try again, and the conversation remains usable

#### Scenario: No API key configured

- **WHEN** the deployment has no answering-model key set
- **THEN** the chat says the assistant is not set up yet, and the dashboard, documents and logs still work

#### Scenario: A failed reply is not sent back as history

- **WHEN** a visitor asks another question after a failure message
- **THEN** the failure sentence is not included in the conversation history sent to the model

### Requirement: Request size and history are bounded on the server

The system SHALL cap the length of a single question, the length and number of prior turns replayed to the model, and the total request body size, and SHALL apply those caps on the server regardless of what the client sends.

#### Scenario: Oversized body

- **WHEN** a client posts a body larger than the cap
- **THEN** the system refuses it before parsing it and before calling any paid API

#### Scenario: Long history

- **WHEN** a conversation grows past the replay limit
- **THEN** only the most recent turns are sent to the model, each truncated to its cap

### Requirement: Questions and outcomes are recorded

The system SHALL record each question, its answer, its citations and whether it was answered or unanswered, within the asking session's workspace.

#### Scenario: Unanswered question is logged

- **WHEN** the bot declines a question for lack of coverage
- **THEN** that question appears in the session's unanswered-question list

#### Scenario: Conversation is logged

- **WHEN** a visitor holds a conversation with the bot
- **THEN** the exchange appears in that session's conversation log with its citations
