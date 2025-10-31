// ───────────────────────────────
// 🌙 MIRANO RP — Serveur principal
// ───────────────────────────────

import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy as DiscordStrategy } from "passport-discord";
import mongoose from "mongoose";
import dotenv from "dotenv";
import { Server } from "socket.io";
import http from "http";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// ──────────────── Middleware ────────────────
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ──────────────── Session + Passport ────────────────
app.use(
  session({
    secret: process.env.SESSION_SECRET || "mirano_secret",
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }, // à mettre true si HTTPS
  })
);
app.use(passport.initialize());
app.use(passport.session());

// ──────────────── Discord Auth ────────────────
passport.use(
  new DiscordStrategy(
    {
      clientID: process.env.DISCORD_CLIENT_ID,
      clientSecret: process.env.DISCORD_CLIENT_SECRET,
      callbackURL: process.env.DISCORD_CALLBACK_URL,
      scope: ["identify"],
    },
    (accessToken, refreshToken, profile, done) => done(null, profile)
  )
);

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((obj, done) => done(null, obj));

// ──────────────── MongoDB ────────────────
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => console.log("✅ Connecté à MongoDB"))
  .catch((err) => console.error("❌ Erreur MongoDB :", err));

// ──────────────── Schémas ────────────────
const Application = mongoose.model(
  "Application",
  new mongoose.Schema({
    discord_id: String,
    discord_tag: String,
    age: Number,
    availability: String,
    rp_experience: String,
    mod_experience: String,
    motivations: String,
    improvements: String,
    message: String,
    status: { type: String, default: "en attente" },
    created_at: { type: Date, default: Date.now },
  })
);

const Message = mongoose.model(
  "Message",
  new mongoose.Schema({
    appId: String,
    userId: String,
    userName: String,
    content: String,
    createdAt: { type: Date, default: Date.now },
  })
);

// ──────────────── Auth Routes ────────────────
app.get("/auth/discord", passport.authenticate("discord"));

app.get(
  "/auth/discord/callback",
  passport.authenticate("discord", { failureRedirect: "/" }),
  (req, res) => res.redirect("/dashboard.html")
);

app.post("/auth/logout", (req, res, next) => {
  req.logout((err) => {
    if (err) return next(err);
    req.session.destroy(() => res.redirect("/"));
  });
});

// ──────────────── API Utilisateur ────────────────
app.get("/api/me", (req, res) => {
  res.json({ user: req.user || null });
});

// ──────────────── Dépôt de candidature ────────────────
app.post("/api/apply", async (req, res) => {
  if (!req.user) return res.status(403).json({ error: "Non connecté" });

  try {
    const newApp = new Application({
      ...req.body,
      discord_id: req.user.id,
      discord_tag: req.user.username,
    });

    await newApp.save();
    console.log("📩 Nouvelle candidature de :", req.user.username);
    res.json({ success: true });
  } catch (e) {
    console.error("❌ Erreur enregistrement candidature:", e);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// ──────────────── Candidatures perso ────────────────
app.get("/api/my-applications", async (req, res) => {
  if (!req.user) return res.status(403).json([]);
  try {
    const apps = await Application.find({ discord_id: req.user.id }).sort({
      created_at: -1,
    });
    res.json(apps);
  } catch (e) {
    console.error("❌ Erreur récupération candidatures:", e);
    res.status(500).json([]);
  }
});

// ──────────────── ADMIN ────────────────
const ADMIN_IDS = ["980457085173104740"]; // 👑 Ton ID Discord admin

app.get("/api/is-admin", (req, res) => {
  const isAdmin = req.user && ADMIN_IDS.includes(req.user.id);
  res.json({ isAdmin });
});

app.get("/api/admin/applications", async (req, res) => {
  if (!req.user || !ADMIN_IDS.includes(req.user.id))
    return res.status(403).json({ error: "Non autorisé" });
  const apps = await Application.find().sort({ created_at: -1 });
  res.json(apps);
});

app.post("/api/admin/update", async (req, res) => {
  const { id, status } = req.body;
  if (!req.user || !ADMIN_IDS.includes(req.user.id))
    return res.status(403).json({ error: "Non autorisé" });

  await Application.findByIdAndUpdate(id, { status });
  res.json({ success: true });
});

app.delete("/api/admin/delete/:id", async (req, res) => {
  if (!req.user || !ADMIN_IDS.includes(req.user.id))
    return res.status(403).json({ error: "Non autorisé" });

  await Application.findByIdAndDelete(req.params.id);
  await Message.deleteMany({ appId: req.params.id });
  res.json({ success: true });
});

// ──────────────── Chat ────────────────
app.get("/api/messages/:appId", async (req, res) => {
  const msgs = await Message.find({ appId: req.params.appId }).sort({
    createdAt: 1,
  });
  res.json(msgs);
});

io.on("connection", (socket) => {
  console.log("💬 Client connecté");

  socket.on("joinRoom", (data) => socket.join(data.appId));
  socket.on("leaveRoom", (data) => socket.leave(data.appId));

  socket.on("chatMessage", async (msg) => {
    try {
      const m = new Message(msg);
      await m.save();
      io.to(msg.appId).emit("chatMessage", msg);
    } catch (e) {
      console.error("❌ Erreur envoi message:", e);
    }
  });

  socket.on("disconnect", () => console.log("❌ Client déconnecté"));
});

// ──────────────── Serveur ────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 Mirano RP en ligne sur http://localhost:${PORT}`);
});
