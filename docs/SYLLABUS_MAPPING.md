# INT222 Advanced Web Development: where each syllabus topic is in the code

Use this sheet in the viva. Every row points to the file (and line) that shows the topic in use.

## Unit I: Getting started with Node.js, data I/O

| Topic | Where | What it does in the project |
|---|---|---|
| npm init, npm, `package.json` scripts | [package.json](../package.json) | `npm run dev`, `seed`, `test`, `i18n-service` |
| Core modules | `http`, `fs`, `path`, `zlib`, `stream`, `events`, `crypto` (used across `src/`) | |
| Local modules | e.g. [adaptiveEngine.js](../src/services/adaptiveEngine.js) exported with `module.exports` | |
| Third-party modules | express, mongoose, @prisma/client, socket.io, jsonwebtoken, bcryptjs, helmet, multer, openai | |
| REPL | `node` → `const { nextDifficulty } = require('./src/services/adaptiveEngine')` → try it live | |
| **EventEmitter** | [src/events/bus.js:7](../src/events/bus.js) `class CareEventBus extends EventEmitter`. Emitted in [games.js:81](../src/routes/v1/games.js), handled in [handlers.js](../src/events/handlers.js) | Finishing a game emits `game:completed`, which runs the decline check, which creates an alert, which is pushed live to caregivers |
| **Callbacks** (error-first) | [logService.js:14](../src/services/logService.js) `fs.mkdir(..., cb)` → `fs.appendFile(..., cb)`; Socket.IO acknowledgement callbacks in [sockets/index.js:51](../src/sockets/index.js) | |
| **fs module** | [logService.js](../src/services/logService.js) (log files), [i18n-service/server.js](../i18n-service/server.js) (`readFileSync` of JSON), [memories.js](../src/routes/v1/memories.js) (`fs.unlink` old photos) | |
| **JSON** | Language files [i18n-service/locales/*.json](../i18n-service/locales), API bodies, `JSON.parse` of LLM output in [aiService.js](../src/services/aiService.js) | |
| **Streams** | [reportService.js:13](../src/services/reportService.js) custom `Transform` stream: Mongo cursor → CSV → gzip → HTTP response | |
| **Zlib compress / decompress** | `createGzip` in [reportService.js:35](../src/services/reportService.js) and [logService.js:23](../src/services/logService.js); `createGunzip` in `readArchive()` | |
| **Promises, async/await** | Everywhere; `Promise.all` for parallel DB queries, `stream/promises` `pipeline` | |

## Unit II: Express and HTTP services

| Topic | Where |
|---|---|
| Express app, `GET` / `POST` | [src/app.js](../src/app.js), every file in [src/routes/v1](../src/routes/v1) |
| `express.Router()` | One router per resource: auth, patients, games, memories, family, reminders, alerts, reports, chat, journal, ai, admin, i18n ([index.js](../src/routes/v1/index.js)) |
| Body parsing (body-parser) | `express.json()` / `express.urlencoded()` in [app.js](../src/app.js) (body-parser is built into Express 4.16+) |
| **express-validator** | [auth.js:20](../src/routes/v1/auth.js) sign-up rules, [games.js](../src/routes/v1/games.js) custom rule "score ≤ maxScore", [reminders.js](../src/routes/v1/reminders.js) HH:MM regex; errors collected in [validate.js](../src/middleware/validate.js) |
| **Error handling** | [errorHandler.js:6](../src/middleware/errorHandler.js): 4-argument handler, maps Mongoose/Prisma/Multer errors to 4xx; [httpError.js](../src/middleware/httpError.js) |
| **http module, basic server** | [src/server.js:17](../src/server.js) `http.createServer(app)`; **without Express** in [i18n-service/server.js:39](../i18n-service/server.js) |
| Request / Response / Server objects, manual routing | [i18n-service/server.js](../i18n-service/server.js): `req.method`, `req.url`, `req.headers['if-none-match']`, `res.writeHead`, `res.end` |
| Headers and status codes | Same file: 200 / 204 / 304 / 404 / 405, `ETag`, `Cache-Control`, `Allow`, CORS. Main app: 201 / 401 / 403 / 409 / 422 |
| **Microservices vs monolith** | Main app = monolith. Translations = separate microservice on port 4001. [i18n.js](../src/routes/v1/i18n.js) calls it and **falls back** to the local file if it is down (graceful degradation) |

## Unit III: Sockets, middleware, auth and security

| Topic | Where |
|---|---|
| **WebSocket server (basic)** | [sockets/index.js:78](../src/sockets/index.js) raw `ws` server at `/ws` (heartbeat for the online/offline dot) |
| **Socket.IO** | Same file: JWT-authenticated connection (`io.use`), rooms per patient, live `alert:new`, `reminder:due`, `sos:received` |
| Live activity feed | Every patient action is recorded by [activityService.js](../src/services/activityService.js), emitted on the event bus, and pushed to the caregiver as `activity:new` |
| **Socket.IO chat server** | `chat:join`, `chat:send` (with ack), `chat:typing`, saved to MongoDB; UI in [carer.js](../public/js/views/carer.js) `chatTab` |
| **Custom middleware** | [requestLogger.js](../src/middleware/requestLogger.js) (timing + file log), [auth.js](../src/middleware/auth.js) `requireAuth`, `requireRole`, `requirePatientAccess` |
| **cookie-parser** | [app.js:36](../src/app.js); JWT read from `req.cookies.token` |
| **express-session** | [app.js:37](../src/app.js). Used for real work: [games.js:46](../src/routes/v1/games.js) remembers the game in progress so the **server** measures play time; language preference |
| cookie-session | Not used, because express-session already covers it. Difference: cookie-session stores the data *inside* the cookie, express-session stores only an id in the cookie and the data on the server |
| `app.use()` / `app.all()` | [app.js](../src/app.js); [app.js:55](../src/app.js) `app.all('/api/{*splat}')` → JSON 404 for every method |
| **JWT** | [auth.js:9](../src/middleware/auth.js) `signToken`; stored in an **httpOnly** cookie; Bearer header also accepted |
| **RBAC** | Roles patient / caregiver / admin; [auth.js:48](../src/middleware/auth.js) `requireRole`; data-level check "is this user in the patient's care team?" in [auth.js:63](../src/middleware/auth.js) |
| **Security headers** | [app.js:17](../src/app.js) helmet with a Content-Security-Policy; rate limiting on login and AI routes; bcrypt password hashing; upload type and size limits |

## Unit IV: MongoDB and Mongoose

| Topic | Where |
|---|---|
| Shell commands | [docs/mongo-commands.md](mongo-commands.md) |
| Schema, model | [src/models](../src/models): GameSession (with **virtual** `accuracy`), Memory (text index, hidden `embedding` field), ChatMessage, JournalEntry |
| CRUD | [memories.js](../src/routes/v1/memories.js): create / list / update / delete, plus photo upload |
| Family import | [family.js](../src/routes/v1/family.js): CSV/JSON upload (multer memory storage), a hand-written CSV parser, row validation, `updateOne(..., { upsert: true })` so re-importing never duplicates |
| Activity log | [ActivityLog.js](../src/models/ActivityLog.js) + [activityReport.js](../src/services/activityReport.js): `$group` by type and by day, `$arrayToObject`, `$dateToString` with Asia/Kolkata timezone |
| **Pagination** | [helpers.js:5](../src/routes/v1/helpers.js) `paginate()` → `.skip().limit()` + `countDocuments()`; used for game history, memories, chat, journal |
| Aggregation (extra) | [reportService.js:50](../src/services/reportService.js) `$match` / `$group` / `$avg` / `$dateToString` for dashboard stats |

## Unit V: PostgreSQL and Prisma

| Topic | Where |
|---|---|
| Plain SQL commands | [docs/postgres-commands.sql](postgres-commands.sql) |
| Prisma modelling | [prisma/schema.prisma](../prisma/schema.prisma): User, PatientProfile (1-to-1, holds the unique `careCode`), CareLink (many-to-many between users), Reminder, Alert, plus enums |
| CRUD | [reminders.js](../src/routes/v1/reminders.js), [patients.js](../src/routes/v1/patients.js) (`upsert`, `groupBy`, `include`, and `$transaction` when a caregiver creates a patient account: user + profile + link are saved together or not at all) |
| Why two databases? | PostgreSQL holds the relational data (who cares for whom; foreign keys and cascades matter). MongoDB holds the high-volume, flexible documents (game sessions, memories with nested people, chat) |

## Unit VI: Testing, deployment, LLMs

| Topic | Where |
|---|---|
| **Testing REST APIs** | Supertest + `expect` on Node's built-in test runner: [tests/integration/api.test.js](../tests/integration/api.test.js) (28 tests: auth, RBAC, validation, sessions, CRUD, streams, AI) and [sockets.test.js](../tests/integration/sockets.test.js) (5 tests: live SOS delivery, chat rooms, raw WebSocket). Jest unit tests in [tests/unit](../tests/unit) (16 tests). Postman: [docs/postman_collection.json](postman_collection.json) |
| **Deployment with GitHub** | [.github/workflows/ci.yml](../.github/workflows/ci.yml) runs the tests with Postgres and Mongo service containers on every push |
| **Third-party deployment** | [render.yaml](../render.yaml): Render web services + MongoDB Atlas + Render PostgreSQL |
| **API versioning** | `/api/v1` and `/api/v2` ([routes/v2/index.js](../src/routes/v2/index.js) returns a new stats shape without breaking v1 clients) |
| **OpenAI API** | [aiService.js](../src/services/aiService.js): chat completions (Smriti companion, quiz in JSON mode), Whisper speech-to-text for Assamese |
| **Embeddings** | [aiService.js:60](../src/services/aiService.js) `searchMemories`: embeds memories and queries, then ranks by cosine similarity (retrieval-augmented companion chat) |
| **Prompt engineering** | [prompts.js:5](../src/services/prompts.js): role, language, tone rules for dementia care, safety rules, grounded memory context; quiz prompt forces JSON output, which is then **validated** before use |
| Mock mode | No API key means deterministic mock replies and embeddings, so the app and tests work offline |
