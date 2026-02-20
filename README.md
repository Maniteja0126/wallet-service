# Wallet Service — Ledger-Based Internal Wallet

A production-grade wallet service implementing:

- Idempotent transactions
- Double-entry accounting
- Serializable concurrency control
- System wallets (Treasury / Revenue)
- Ledger history
- Cursor pagination
- Dockerized setup
- Stress-tested transactional integrity

Built with **Fastify + Prisma + PostgreSQL**.

---

## Architecture Overview

Each user owns one wallet per asset type.

Each asset also has two system wallets:

- TREASURY → source of TOPUP / BONUS
- REVENUE  → sink for SPEND

Every transaction creates exactly **two ledger entries**:

- User wallet (DEBIT or CREDIT)
- System wallet (opposite direction)

Balances are cached but ledger is source of truth.

---

## Tech Stack

- Node.js (TypeScript)
- Fastify
- Prisma ORM
- PostgreSQL
- Docker + Docker Compose
- Vitest (testing)

---

## Why Fastify (instead of Express / NestJS)

### Express

Express is minimal but:

- No built-in schema validation
- No native OpenAPI support
- Weak typing
- Middleware-based error flow
- Lower performance under load

You must assemble everything manually.

---

### NestJS

NestJS is powerful but:

- Heavy abstraction layers
- Dependency Injection overhead
- Steep learning curve
- Boilerplate-heavy for small services
- Adds latency for high-throughput transactional systems

Great for large teams — overkill here.

---

### Fastify (chosen)

Fastify gives:

- Native JSON schema validation
- Automatic OpenAPI generation
- Extremely high performance
- Simple plugin architecture
- First-class TypeScript
- Built-in error handling
- Minimal abstraction

Most importantly:

Fastify is **close to the metal**.

For a transactional system where latency, correctness, and control matter — Fastify is ideal.

---

## Concurrency Strategy

This service uses **database-level pessimistic locking**.

Inside a Prisma transaction:

```sql
SELECT ... FOR UPDATE

is used on:
	•	User wallet
	•	System wallet

This guarantees:

- Only one transaction can modify a wallet at a time
- No race conditions
- No double-spend
- Serializable behavior

Flow:

1. Create transaction record (idempotency enforced)
2. Lock user wallet
3. Lock system wallet
4. Validate balances
5. Apply balance updates
6. Insert double ledger entries
7. Commit transaction

If two SPEND requests arrive simultaneously:

- One succeeds
- The other blocks until lock release
- Then fails with Insufficient funds

This was stress-tested with:

- Concurrent requests
- 1M simulated spends
- Batch execution
- Idempotency collisions


---

## Idempotency

Every transaction requires:

Header:

Idempotency-Key: uuid

The database enforces uniqueness.

If the same key is reused:

- Completed transaction returns cached response
- In-progress transaction returns conflict


---

## Running Locally (Docker)

### Prerequisites

- Docker
- Docker Compose

---

### Start Everything

```bash
docker compose up --build

This will automatically:
	•	Start PostgreSQL
	•	Run Prisma migrations
	•	Run seed script
	•	Start Fastify server

⸻

Services
	•	API: http://localhost:3000
	•	Swagger: http://localhost:3000/docs
	•	PostgreSQL: localhost:5432

⸻

Database Seeding

Seeding happens automatically inside Docker.

Manually:

npm run seed

Seed creates:
	•	AssetTypes
	•	Users
	•	User wallets (pre-funded)
	•	System wallets (Treasury + Revenue)

⸻

Environment Variables

.env

DATABASE_URL=postgresql://postgres:postgres@db:5432/wallet_service


⸻

API Summary

Transactions

POST /transactions/topup
POST /transactions/bonus
POST /transactions/spend

Header:

Idempotency-Key: uuid

Body:

{
  "walletId": "...",
  "amount": 100
}


⸻

GET /transactions/:transactionId

⸻

Wallet

GET /wallet?userId=…

GET /wallet/:walletId

GET /wallet/:walletId/ledger

Supports cursor pagination.

⸻

Testing

Unit + Integration:

npm test

Includes:
	•	Balance correctness
	•	Idempotency
	•	Double-entry ledger validation
	•	Concurrent spend race tests
	•	High-volume stress simulation



