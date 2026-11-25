// Care codes: a short code a patient's family shares so a caregiver can connect.
// No 0/O or 1/I/L, so it is easy to read out over the phone.
const crypto = require('crypto');
const { prisma } = require('../config/db');

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const LENGTH = 6;

function randomCode() {
  let code = '';
  for (let i = 0; i < LENGTH; i++) code += ALPHABET[crypto.randomInt(ALPHABET.length)];
  return code;
}

// Make a code that no other patient has yet
async function uniqueCode() {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = randomCode();
    const taken = await prisma.patientProfile.findUnique({ where: { careCode: code } });
    if (!taken) return code;
  }
  throw new Error('Could not create a unique care code');
}

const normalise = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

module.exports = { uniqueCode, normalise, LENGTH };
