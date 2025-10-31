CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  discord_id TEXT UNIQUE NOT NULL,
  username TEXT,
  discriminator TEXT,
  avatar TEXT,
  access_token TEXT,
  refresh_token TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  discord_tag TEXT,
  age INTEGER,
  availability TEXT,
  rp_experience TEXT,
  mod_experience TEXT,
  motivations TEXT,
  improvements TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending', -- pending | approved | rejected
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id)
);
