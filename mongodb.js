const { MongoClient } = require('mongodb');

let client, db;

async function connect() {
  if (db) return db;
  const uri = process.env.MONGODB_URI;
  const dbName = process.env.MONGODB_DB || 'mirano';
  client = new MongoClient(uri, { ignoreUndefined: true });
  await client.connect();
  db = client.db(dbName);
  // index utiles
  await db.collection('messages').createIndex({ applicationId: 1, createdAt: 1 });
  return db;
}

function getDb() {
  if (!db) throw new Error('MongoDB not connected yet');
  return db;
}

module.exports = { connect, getDb };
