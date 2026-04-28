# Improvement Plan

Use this checklist as the project backlog for production readiness. When starting new work, prefer the highest unfinished priority that matches the requested scope.

## P0 - Security

- [x] Do not expose MongoDB, Redis, RabbitMQ, or internal services directly in production; expose only the gateway.
- [x] Add authentication for local Docker MongoDB, Redis, and RabbitMQ when running in a production-like mode.
- [x] Replace default RabbitMQ `guest` credentials outside local development.
- [x] Add rate limiting for OTP login and verification endpoints at the gateway or user service.
- [x] Serve the gateway over HTTPS for deployed environments.
- [x] Keep all secrets in `.env` or deployment secret stores; commit only `.env.example` templates.

## P1 - Reliability

- [x] Move Redis client creation out of service entrypoints into dedicated `config/redis.ts` modules.
- [x] Define Redis reconnect/backoff behavior and reduce noisy transient timeout logging.
- [x] Add RabbitMQ retry handling and dead-letter queues for mail and user events.
- [x] Make health checks report critical dependency state, not only HTTP server availability.
- [x] Add graceful shutdown for HTTP servers, MongoDB, RabbitMQ, Redis, and Socket.IO.

## P2 - Scalability

- [x] Store presence and user-to-socket mapping in Redis so multiple chat-service instances stay consistent.
- [x] Verify Socket.IO rooms, typing, message, read receipt, and call events across multiple chat-service replicas.
- [x] Review chat-service memory maps and move cross-instance state to Redis or another shared store.
- [x] Add load-test notes for concurrent socket connections and message throughput.

## P3 - Product Features

- [x] Add group chat admin roles.
- [x] Add group member management: add member, remove member, leave group.
- [x] Add edit group name and avatar.
- [x] Support uploading a group avatar instead of only accepting an avatar URL.
- [x] Add chat and message search.
- [x] Add edit/delete message flows if needed by the product scope.

## P4 - Engineering Quality

- [x] Add GitHub Actions for lint, build, and backend tests.
- [ ] Add tests for group chat creation, validation, and participant authorization.
- [ ] Add tests for Redis and RabbitMQ failure paths.
- [ ] Add meaningful tests for the mail service or document why it remains integration-only.
- [ ] Keep README environment examples aligned with `.env.example` files.
- [ ] Prefer small commits grouped by feature, fix, test, docs, or infra scope.
