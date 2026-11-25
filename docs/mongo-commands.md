# MongoDB shell commands (Unit IV)

Open the shell: `mongosh`

```js
// create / switch database (created on first insert)
use smriti_sathi
show dbs
db.getName()

// create a collection explicitly
db.createCollection("game_notes")
show collections

// INSERT
db.game_notes.insertOne({ patientId: 1, note: "Enjoyed the colour game", createdAt: new Date() })
db.game_notes.insertMany([
  { patientId: 1, note: "Tired today" },
  { patientId: 2, note: "Remembered all family names" }
])

// FIND
db.game_notes.find()
db.game_notes.find({ patientId: 1 })
db.gamesessions.find({ patientId: 1, gameType: "sequence" }).sort({ completedAt: -1 }).limit(5)
db.gamesessions.find({ score: { $gte: 3 } }, { gameType: 1, score: 1, _id: 0 })   // projection
db.gamesessions.countDocuments({ patientId: 1 })

// pagination by hand: page 2, 10 per page
db.gamesessions.find({ patientId: 1 }).sort({ completedAt: -1 }).skip(10).limit(10)

// UPDATE
db.game_notes.updateOne({ note: "Tired today" }, { $set: { note: "Tired but cheerful" } })
db.game_notes.updateMany({ patientId: 1 }, { $set: { reviewed: true } })

// DELETE
db.game_notes.deleteOne({ note: "Tired but cheerful" })
db.game_notes.deleteMany({ patientId: 2 })

// aggregation used by the dashboard
db.gamesessions.aggregate([
  { $match: { patientId: 1 } },
  { $group: { _id: "$gameType", sessions: { $sum: 1 }, avgAccuracy: { $avg: { $divide: ["$score", "$maxScore"] } } } }
])

// indexes
db.memories.getIndexes()

// DROP
db.game_notes.drop()          // drop a collection
// db.dropDatabase()          // drop the whole current database (careful!)
```

Collections created by the app (Mongoose pluralises model names): `gamesessions`, `memories`, `familymembers`, `activitylogs`, `chatmessages`, `journalentries`.

```js
// family of patient 1, emergency contacts first
db.familymembers.find({ patientId: 1 }, { name: 1, relation: 1, isEmergencyContact: 1 }).sort({ isEmergencyContact: -1, name: 1 })

// what did patient 1 do in the last 7 days? (the caregiver's activity report)
db.activitylogs.aggregate([
  { $match: { patientId: 1, createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } } },
  { $group: { _id: "$type", count: { $sum: 1 } } },
  { $sort: { count: -1 } }
])
```
