# Repository Guidelines

## Project Structure & Module Organization

This repository contains a Dockerized real-time chat system. `frontend/` is a Next.js 16 React app with routes in `src/app`, UI in `src/components`, contexts in `src/context`, and helpers in `src/utils`. `backend/user`, `backend/chat`, and `backend/mail` are TypeScript Node services with source in each `src/` directory. User and chat tests live in `backend/user/tests` and `backend/chat/tests`. Root infrastructure includes `docker-compose.yml`, `nginx.conf`, and `scripts/`.

## Build, Test, and Development Commands

Run commands from the service directory unless noted.

- `docker compose up --build`: build and run the full stack through Nginx and RabbitMQ.
- `npm install`: install dependencies for the current service or frontend package.
- `npm run dev`: start a service in watch mode, or the Next.js dev server in `frontend/`.
- `npm run build`: compile TypeScript services or create a production Next.js build.
- `npm test`: run Vitest tests in `backend/user` and `backend/chat`.
- `npm run lint`: run ESLint for the frontend.
- `node scripts/generate-keys.mjs`: generate JWT keys.

## Coding Style & Naming Conventions

Use TypeScript and ES modules. Keep service code organized by responsibility: `config`, `controller`, `routes`, `model`, and `middleware` or `middlewares`. Use PascalCase for React components and Mongoose models, camelCase for functions and variables, and lowercase route filenames such as `chat.ts`. Keep environment access centralized in each service's `src/config/env.ts`. Follow frontend ESLint/Next.js rules before opening a PR.

## Testing Guidelines

Backend tests use Vitest with Supertest for HTTP routes. Name tests `*.test.ts` and place them in the service-level `tests/` directory. Add or update tests when changing routes, auth contracts, RabbitMQ events, call flows, or validation logic. The mail service currently has no meaningful test script.

## Commit & Pull Request Guidelines

Recent history mostly follows Conventional Commits, for example `feat(call): add end-to-end video calling flow`, `fix(frontend): improve socket reconnection and error handling`, and `test(services): add vitest coverage`. Prefer `type(scope): summary` with scopes such as `frontend`, `user`, `chat`, `mail`, `infra`, or `services`.

Pull requests should include a behavior summary, commands run, linked issues when applicable, and screenshots or recordings for UI changes. Call out environment variables, migrations, queue or event changes, and known test gaps.

## Security & Configuration Tips

Never commit `.env` files, private keys, SMTP credentials, Cloudinary secrets, or production JWT material. Keep service ownership boundaries clear: user data is owned by `user-service`; chat uses `UserSnapshot` data synchronized through RabbitMQ.
