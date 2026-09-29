# Spec Delta

## Purpose

Gives every visitor a private, temporary identity so they can use the whole product without signing up, and guarantees that one visitor's documents, conversations and settings are never visible to another.

## ADDED Requirements

### Requirement: Session is minted on first contact

The system SHALL create a session and its own workspace on a visitor's first request, without any sign-up, login or credential. The session id SHALL be carried in an httpOnly, Secure, SameSite=Lax cookie and SHALL NOT be readable by page scripts.

#### Scenario: First visit

- **WHEN** a visitor loads the app with no session cookie
- **THEN** the system creates a session and a workspace, sets the session cookie, and serves the dashboard with that workspace's data

#### Scenario: Return visit within the session lifetime

- **WHEN** a visitor returns with a valid session cookie
- **THEN** the system serves the same workspace, with the visitor's earlier edits, uploads and conversations intact

#### Scenario: No login is ever presented

- **WHEN** a visitor uses any screen of the app
- **THEN** no sign-up form, login form, password field or account menu is shown

### Requirement: Workspaces are isolated by session

Every stored record SHALL belong to exactly one session. A request SHALL only read or write records belonging to its own session, and the system SHALL reject any request that names a resource belonging to another session.

#### Scenario: Cross-session read is refused

- **WHEN** a request carrying session A's cookie asks for a document, bot, conversation or rating belonging to session B
- **THEN** the system responds 404 and returns no data from session B

#### Scenario: Two visitors at the same time

- **WHEN** two visitors use the app simultaneously and each uploads a document
- **THEN** each visitor's dashboard lists only their own document, and neither bot can cite the other's content

### Requirement: Sessions expire and their data is destroyed

A session SHALL expire 24 hours after it is created. Expired sessions and every record belonging to them SHALL be deleted, and no visitor data SHALL survive its session.

#### Scenario: Expired cookie

- **WHEN** a visitor returns with a cookie whose session has expired
- **THEN** the system mints a new session with a freshly seeded workspace, and none of the previous session's uploads or conversations appear

#### Scenario: Data is gone after expiry

- **WHEN** a session has expired and been swept
- **THEN** no document, chunk, embedding, conversation, rating or bot setting belonging to it remains in storage
