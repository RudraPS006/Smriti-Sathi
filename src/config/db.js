// Two databases, two jobs:
//   PostgreSQL via Prisma  -> users, roles, care links, reminders, alerts (relational)
//   MongoDB via Mongoose   -> game sessions, memories, family, activity log, chat, journal
const mongoose = require('mongoose');
const { PrismaClient } = require('@prisma/client');
const config = require('./index');

const prisma = new PrismaClient();

async function connectDatabases() {
  await mongoose.connect(config.mongoUri);
  await prisma.$connect();
  if (!config.isTest) console.log('[db] MongoDB and PostgreSQL connected');
}

async function disconnectDatabases() {
  await mongoose.disconnect();
  await prisma.$disconnect();
}

module.exports = { prisma, mongoose, connectDatabases, disconnectDatabases };
