-- PostgreSQL basics (Unit V). Run with:  psql -d smriti_sathi -f docs/postgres-commands.sql
-- Tables below are the ones Prisma created from prisma/schema.prisma (note the quoted names).

-- list tables / describe one
-- \dt
-- \d "User"

-- READ
SELECT id, name, email, role, language FROM "User" ORDER BY id;
SELECT * FROM "Reminder" WHERE "patientId" = 1 AND active = true ORDER BY time;

-- JOIN: every patient with their care team
SELECT p.name AS patient, c.name AS caregiver, l.relation, pp."careCode"
FROM "CareLink" l
JOIN "User" p ON p.id = l."patientId"
JOIN "User" c ON c.id = l."carerId"
JOIN "PatientProfile" pp ON pp."userId" = p.id
ORDER BY p.name;

-- GROUP BY: open alerts per patient
SELECT u.name, COUNT(*) AS open_alerts
FROM "Alert" a JOIN "User" u ON u.id = a."patientId"
WHERE a.acknowledged = false
GROUP BY u.name;

-- CREATE (practice table so we do not disturb Prisma's tables)
CREATE TABLE IF NOT EXISTS practice_notes (
  id SERIAL PRIMARY KEY,
  patient_id INT REFERENCES "User"(id) ON DELETE CASCADE,
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT now()
);

-- INSERT
INSERT INTO practice_notes (patient_id, note) VALUES (1, 'Remembered the Bihu song');

-- UPDATE
UPDATE practice_notes SET note = 'Remembered the whole Bihu song' WHERE patient_id = 1;

-- DELETE
DELETE FROM practice_notes WHERE patient_id = 1;

-- DROP
DROP TABLE IF EXISTS practice_notes;
