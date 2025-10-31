const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const dbFile = path.join(__dirname, 'data.sqlite');
const db = new Database(dbFile);

const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

module.exports = db;
