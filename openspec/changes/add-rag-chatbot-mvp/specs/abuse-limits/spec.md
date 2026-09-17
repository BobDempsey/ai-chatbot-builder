# Spec Delta

## Purpose

Keeps a public app with no login from becoming an open bill: bounds what any one session can upload, index and ask, and turns away automated traffic before it reaches the paid APIs.

## ADDED Requirements

### Requirement: Uploads are bounded

The system SHALL cap the size of a single upload and the number of documents a session may hold, and SHALL reject anything beyond those caps with a message that names the limit.

#### Scenario: Oversized file

- **WHEN** a visitor uploads a file larger than the cap
- **THEN** the system rejects it, states the size limit, and charges no embedding cost for it

#### Scenario: Too many documents

- **WHEN** a session already holds the maximum number of documents and the visitor adds another
- **THEN** the system refuses, states the document limit, and leaves the existing documents intact

### Requirement: Chat volume is bounded per session

The system SHALL limit how many questions a session may ask in a given period, and SHALL respond with a clear, non-erroring message when the limit is reached rather than silently failing.

#### Scenario: Hitting the chat limit

- **WHEN** a session exceeds its question allowance
- **THEN** the bot replies that the demo limit has been reached, and no request is sent to the answering model

#### Scenario: Limit resets

- **WHEN** the rate-limit window passes
- **THEN** the same session can ask questions again

### Requirement: The remaining allowance is visible before it runs out

Once a visitor has used part of their question allowance, the chat SHALL show how many questions remain, and at zero SHALL say to try again shortly and disable sending rather than letting a request fail.

#### Scenario: Warning before the limit

- **WHEN** a visitor has used enough of the allowance to approach it
- **THEN** the chat shows the number of questions remaining

#### Scenario: Allowance spent

- **WHEN** the count reaches zero, or the edge refuses a question
- **THEN** the chat says to try again in a few minutes and disables sending until the window passes

### Requirement: Automated traffic is filtered at the edge

Edge rules SHALL rate-limit and bot-filter requests before they reach the API, covering the chat, upload and URL-fetch endpoints. These rules SHALL be the abuse control that replaces authentication.

#### Scenario: Burst from one client

- **WHEN** a client sends requests far faster than a person could
- **THEN** the edge rejects the excess before the API spends embedding or model tokens on them

#### Scenario: Ordinary use is unaffected

- **WHEN** a person uses the demo at human pace, uploading a document and holding a conversation
- **THEN** no request of theirs is blocked or throttled
