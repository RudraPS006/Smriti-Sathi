# Smriti Sathi (স্মৃতি সাথী)

**An AI-based cognitive gaming and memory assistance platform for elderly people living with dementia in North East India.**

INT222 Advanced Web Development project. Node.js · Express · Socket.IO · MongoDB/Mongoose · PostgreSQL/Prisma · JWT · OpenAI.

> Every syllabus topic is mapped to its exact file and line in **[docs/SYLLABUS_MAPPING.md](docs/SYLLABUS_MAPPING.md)**.

## The problem
North East India has very few neurologists and memory clinics, and many elderly people speak Assamese, Bengali or Hindi rather than English. Families need a simple way to keep their parents mentally active and to notice early when something changes.

## What it does

| Problem statement asks for | Built as |
|---|---|
| Adaptive memory-training games | 4 games (matching pairs, family faces, colour pattern, picture words). The server adjusts difficulty from 1 to 5 using the last 3 scores ([adaptiveEngine.js](src/services/adaptiveEngine.js)) |
| Voice-enabled multilingual interface | English, हिन्दी, অসমীয়া, বাংলা. Everything can be read aloud. Spoken commands ("games", "help"…). Voice diary. Assamese speech goes to Whisper on the server |
| Caregiver dashboard with alerts | Score trends (SVG chart), per-game stats, live alerts over Socket.IO: **SOS button**, **score decline**, **missed medicine**, **3 days inactive**. Family chat. CSV report |
| Elderly-friendly UI | Text from 20px up, 56px+ buttons, high contrast, icon plus word on everything, one task per screen, always-visible Help and Speak buttons, orientation card with day, date, time and place |
| AI | Smriti companion chat grounded in the family's own memories (embeddings + prompt engineering). Quiz generated from family memories. Distress-word detection raises an SOS alert |

Roles: **patient**, **caregiver** (family), **admin**.

### Caregiver features
- **Connect to a patient** two ways: type the patient's 6-character **care code** (shown on their "My family" page), or **create the account** for a parent who can't sign up themselves. Siblings can join later with the same code or an email invite, and anyone can leave.
- **Activity report**: everything the patient does is logged (sign-ins, games, reminders done, diary, chats with Smriti, quiz, memories and family page viewed, Help button). The caregiver sees today / 7 / 30 days: summary cards, reminder adherence, mood, a per-day chart, and a filterable timeline. It updates live, downloads as CSV, and prints or saves as PDF.
- **Family data**: add family members with photo, phone, city, notes and an emergency-contact flag, or **import a CSV / JSON file**. The family feeds the "Family faces" game, the family quiz, Smriti's conversations, and the patient's "My family" page (with a Call button).

## Run it locally

You need Node 20+, MongoDB and PostgreSQL running.

```bash
# macOS (Homebrew) — one-time
brew install postgresql@17 && brew services start postgresql@17
brew services start mongodb-community
createdb smriti_sathi
```

```bash
npm install
cp .env.example .env          # then edit DATABASE_URL / secrets
npx prisma db push            # creates the PostgreSQL tables
npm run seed                  # demo data in both databases
npm run dev                   # http://localhost:3000
npm run i18n-service          # optional 2nd terminal: language microservice on :4001
```

### Demo accounts
All use the password set in [scripts/seed.js](scripts/seed.js) (`DEMO_PASSWORD`).

| Role | Email | Notes |
|---|---|---|
| Patient | `bina@demo.smriti` | Assamese UI, Guwahati, care code `BINA26`, 6 family members, 6 memories, recent score dip |
| Patient | `lalthansangi@demo.smriti` | English UI, Aizawl, care code `LALR79`, 4 family members |
| Caregiver | `rupam@demo.smriti` | Son of Bina |
| Caregiver | `mary@demo.smriti` | Daughter of Lalthansangi |
| Caregiver | `ananya@demo.smriti` | **Not connected yet.** Use her to try "Connect a patient" with code `BINA26` |
| Admin | `admin@demo.smriti` | Users, roles, logs |

Try it: sign in as Bina in one browser and Rupam in another (or a private window). Press **Help** as Bina and the alert appears on Rupam's dashboard instantly.

### AI
Leave `OPENAI_API_KEY` empty and everything runs in **mock mode** (deterministic replies and embeddings, no cost). Add a key to use real OpenAI chat, embeddings and Whisper. Models are set in `.env`.

### Fake family data for testing
All family members, phone numbers (`+91 00000 …`) and portraits are invented. Portraits are drawn by [scripts/generateAvatars.js](scripts/generateAvatars.js).
- Seeded automatically by `npm run seed`.
- Files to try the import button with, in [public/sample-data](public/sample-data):
  - `family-template.csv`: an empty template with two example rows
  - `fake-family-bina-extra.csv`: 6 relatives for Bina; row 6 has no name on purpose (it gets skipped) and Moni already exists (she gets updated, not duplicated)
  - `fake-family-lalthansangi.json`: 5 people with portraits

## Tests

```bash
npm run test:unit   # Jest unit tests, no database needed
npm run test:api    # Supertest API tests on node --test (uses smriti_test databases)
npm test            # both
```
API collection for Postman: [docs/postman_collection.json](docs/postman_collection.json).

## Project structure

```
src/
  server.js            http.createServer + Socket.IO + scheduler
  app.js               Express app: helmet, cookie-parser, session, routes, errors
  config/              env config, MongoDB + Prisma connections
  middleware/          auth (JWT, RBAC), validate, requestLogger, errorHandler
  routes/v1/           auth, patients, games, memories, reminders, alerts,
                       family, reports, chat, journal, ai, admin, i18n
  routes/v2/           versioned stats endpoint
  models/              Mongoose: GameSession, Memory, ChatMessage, JournalEntry
  services/            adaptiveEngine, aiService, prompts, reportService (streams),
                       logService (fs + zlib), alertService, scheduler
  events/              EventEmitter bus + listeners
  sockets/             Socket.IO + raw WebSocket
prisma/schema.prisma   PostgreSQL models
i18n-service/          separate microservice using only the http module
public/                frontend (HTML/CSS/ES modules, no framework)
tests/                 unit (Jest) + API (Supertest, node --test)
docs/                  syllabus mapping, Mongo + SQL command sheets, Postman
```

## Deploy (Render + MongoDB Atlas, free)
1. **MongoDB Atlas** — create a free M0 cluster, a database user, and under *Network Access* allow `0.0.0.0/0` (Render's addresses change). Copy the connection string and add the database name: `mongodb+srv://USER:PASS@cluster0.xxxxx.mongodb.net/smriti_sathi?retryWrites=true&w=majority`.
2. **Render** — sign in with GitHub, choose **New → Blueprint**, pick this repository. [render.yaml](render.yaml) creates the app, the language microservice and a PostgreSQL database in Singapore. Paste the Atlas string when asked for `MONGO_URI` (leave `OPENAI_API_KEY` empty for mock mode) and click **Apply**.
3. **Demo data (optional)** — on Render open *smriti-postgres → Connect* and copy the **External Database URL**. Create `.env.remote` in this folder (it is git-ignored):
   ```
   MONGO_URI=<Atlas connection string>
   DATABASE_URL=<External Database URL>
   ```
   then run `npm run seed:remote -- --yes` (this replaces all data in those databases).

Notes: free Render services sleep after ~15 minutes idle (the first visit then takes ~30–50 s). Uploaded photos and sessions are stored in MongoDB, so they survive restarts. Render's free PostgreSQL expires after 30 days unless upgraded.

## Notes and limits
- The Assamese, Bengali and Hindi translations should be reviewed by a native speaker before real use.
- Browser speech recognition is good for English, Hindi and Bengali but weak for Assamese, so Assamese goes through Whisper (needs an API key).
- This is a student project, not a medical device. The decline alert is a simple trend rule meant to prompt a human check-in, not a diagnosis.
