require("dotenv").config();
const express = require("express");
const session = require("express-session");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");
const authMiddleware = require("./src/middleware/auth");
const bcrypt = require("bcrypt");

const app = express();
const db = new PrismaClient();

const allowedOrigins = [
  "http://localhost:5173",
  "https://p2t32.netlify.app"
];

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);


app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.set("trust proxy", 1); // ✅ Required for secure cookies on Render

app.use(
  session({
    secret: process.env.JWT_SECRET || "secret_key",
    resave: false,
    saveUninitialized: false,
    proxy: true, // ✅ critical!
    cookie: {
      secure: true,      // ✅ use secure cookies (https)
      httpOnly: true,
      sameSite: "none",
    },
  })
);


// Middleware admin only
function adminOnly(req, res, next) {
  if (req.session.user && req.session.user.role === "ADMIN") {
    next();
  } else {
    res.status(403).json({ error: "Accès réservé aux administrateurs" });
  }
}

// Middleware supervisor or admin only
function supervisorOrAdminOnly(req, res, next) {
  if (
    req.session.user &&
    (req.session.user.role === "ADMIN" || req.session.user.role === "SUPERVISOR")
  ) {
    next();
  } else {
    res.status(403).json({ error: "Accès réservé aux superviseurs et administrateurs" });
  }
}

// Middleware admin or supervisor only (for norm)
function adminOrSupervisorOnly(req, res, next) {
  if (
    req.session.user &&
    (req.session.user.role === "ADMIN" || req.session.user.role === "SUPERVISOR")
  ) {
    next();
  } else {
    res.status(403).json({ error: "Accès réservé aux administrateurs et superviseurs" });
  }
}

// --- ROUTES AUTH ---

app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await db.user.findUnique({ where: { email } });

  if (user && (await bcrypt.compare(password, user.password))) {
    req.session.user = user;
    res.json({ success: true });
  } else {
    res.status(401).json({ success: false, message: "Email ou mot de passe incorrect" });
  }
});

app.get("/me", (req, res) => {
  if (req.session.user) {
    res.json(req.session.user);
  } else {
    res.status(401).json({ message: "Non connecté" });
  }
});

app.post("/signup", async (req, res) => {
  const { firstName, lastName, email, password } = req.body;

  if (!email || !password || !firstName || !lastName) {
    return res.status(400).json({ success: false, message: "Champs requis manquants." });
  }

  const existingUser = await db.user.findUnique({ where: { email } });
  if (existingUser) {
    return res.status(400).json({ success: false, message: "Email déjà utilisé." });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = await db.user.create({
    data: {
      firstName,
      lastName,
      email,
      password: hashedPassword,
      role: "CLIENT",
    },
  });

  req.session.user = newUser;
  res.json({ success: true, user: newUser });
});

app.get("/api/logout", (req, res) => {
  req.session.destroy(() => {
    res.clearCookie("connect.sid");
    res.json({ message: "Déconnecté" });
  });
});

// --- ROUTES SITES / COMPOSTEURS ---

app.get("/api/sites", authMiddleware, async (req, res) => {
  const user = req.session.user;

  // Si on est dans un contexte "carte", on envoie tout
  if (req.query.forMap === "true") {
    const sites = await db.site.findMany({
      select: {
        id: true,
        name: true,
        latitude: true,
        longitude: true,
      },
    });
    return res.json({ sites });
  }

  // Sinon comportement normal : filtré selon le rôle
  if (user.role === "ADMIN") {
    const sites = await db.site.findMany({
      include: {
        composts: true,
        supervisor: true,
        referents: true,
      },
    });
    return res.json({ sites });
  }

  const userWithAssignments = await db.user.findUnique({
    where: { id: user.id },
    include: {
      assignedComposts: {
        include: { site: true },
      },
    },
  });

  const sitesMap = new Map();
  userWithAssignments.assignedComposts.forEach((compost) => {
    if (!sitesMap.has(compost.site.id)) {
      sitesMap.set(compost.site.id, {
        ...compost.site,
        composts: [],
      });
    }
    sitesMap.get(compost.site.id).composts.push(compost);
  });

  res.json({ sites: Array.from(sitesMap.values()) });
});


app.get("/api/composteurs/:id", authMiddleware, async (req, res) => {
  const user = req.session.user;
  const composteurId = parseInt(req.params.id);

  try {
    if (user.role === "ADMIN") {
      const composteur = await db.compost.findUnique({
        where: { id: composteurId },
        include: {
          site: true,
          dataRecords: {
            orderBy: { recordedAt: "asc" },
            include: {
              recordedBy: true,
            },
          },
          norm: true,
        },
      });

      if (!composteur) {
        return res.status(404).json({ error: "Composteur not found" });
      }

      return res.json({ composteur });
    }

    const userWithAssignments = await db.user.findUnique({
      where: { id: user.id },
      include: {
        assignedComposts: {
          where: { id: composteurId },
          include: {
            site: true,
            dataRecords: {
              orderBy: { recordedAt: "asc" },
              include: {
                recordedBy: true,
              },
            },
            norm: true,
          },
        },
      },
    });

    if (!userWithAssignments.assignedComposts.length) {
      return res.status(403).json({ error: "Accès refusé au composteur" });
    }

    return res.json({ composteur: userWithAssignments.assignedComposts[0] });
  } catch (error) {
    console.error("Error fetching composteur:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// --- GESTION DES DONNEES COMPOSTEUR ---

// Fonction utilitaire pour convertir en float ou null
function parseFloatOrNull(value) {
  const f = parseFloat(value);
  return isNaN(f) ? null : f;
}

// Fonction pour vérifier normes et créer notifications si dépassement
async function checkAndNotifyNormExceed(compostData) {
  const norm = await db.norm.findUnique({
    where: { compostId: compostData.compostId },
  });
  if (!norm) return;

  const alerts = [];

  if (norm.temperatureMax != null && compostData.temperature > norm.temperatureMax) {
    alerts.push(`Température (${compostData.temperature}°C) dépasse la norme (${norm.temperatureMax}°C)`);
  }
  if (norm.humidityMax != null && compostData.humidity > norm.humidityMax) {
    alerts.push(`Humidité (${compostData.humidity}%) dépasse la norme (${norm.humidityMax}%)`);
  }
  // OdorLevel qualitative check can be added if you have an order defined
  if (norm.compostMassMax != null && compostData.compostMass > norm.compostMassMax) {
    alerts.push(`Masse (${compostData.compostMass}kg) dépasse la norme (${norm.compostMassMax}kg)`);
  }
  if (
    norm.oxygenationMin != null &&
    compostData.oxygenation != null &&
    compostData.oxygenation < norm.oxygenationMin
  ) {
    alerts.push(`Oxygène (${compostData.oxygenation}%) est en dessous de la norme (${norm.oxygenationMin}%)`);
  }
  
  if (norm.woodChipsAddedMax != null && compostData.woodChipsAdded > norm.woodChipsAddedMax) {
    alerts.push(`Copeaux ajoutés (${compostData.woodChipsAdded}) dépassent la norme (${norm.woodChipsAddedMax})`);
  }

  if (alerts.length > 0) {
    const composteur = await db.compost.findUnique({
      where: { id: compostData.compostId },
      include: { assignedUsers: true },
    });

    const message = `Attention : ${alerts.join(", ")} pour le composteur ${composteur.name}.`;

    await Promise.all(
      composteur.assignedUsers.map((user) =>
        db.notification.create({
          data: {
            userId: user.id,
            message,
          },
        })
      )
    );
  }
}

app.post("/api/composteurs/:composteurId/compostdata", authMiddleware, supervisorOrAdminOnly, async (req, res) => {
  const composteurId = parseInt(req.params.composteurId);
  const {
    temperature,
    humidity,
    odorLevel,
    compostMass,
    oxygenation,
    dryMatter,
    woodChipsAdded,
    turned,
    redistributed,
  } = req.body;

  if (!req.session.user?.id) {
    return res.status(401).json({ error: "Utilisateur non authentifié" });
  }

  try {
    const newRecord = await db.compostData.create({
      data: {
        compostId: composteurId,
        recordedById: req.session.user.id,
        recordedAt: new Date(),
        temperature: temperature !== undefined ? parseFloat(temperature) : null,
        humidity: humidity !== undefined ? parseFloat(humidity) : null,
        odorLevel: odorLevel || null,
        compostMass: compostMass !== undefined ? parseFloat(compostMass) : null,
        oxygenation: oxygenation !== undefined ? parseFloat(oxygenation) : null,
        woodChipsAdded: woodChipsAdded !== undefined ? parseFloat(woodChipsAdded) : null,
        turned: turned === true || turned === "true",
        redistributed: redistributed === true || redistributed === "true",
      },
    });

    await checkAndNotifyNormExceed(newRecord);

    res.json({ success: true, data: newRecord });
  } catch (error) {
    console.error("Erreur ajout compostData :", error);
    res.status(500).json({ error: "Erreur lors de l'ajout des données." });
  }
});


app.put("/api/compostdata/:id", authMiddleware, supervisorOrAdminOnly, async (req, res) => {
  const id = parseInt(req.params.id);
  const updateData = req.body;

  try {
    const updatedRecord = await db.compostData.update({
      where: { id },
      data: updateData,
    });

    await checkAndNotifyNormExceed(updatedRecord);
    
    res.json({ success: true, updatedRecord });
  } catch (error) {
    console.error("Erreur mise à jour compostData :", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.delete("/api/compostdata/:id", authMiddleware, supervisorOrAdminOnly, async (req, res) => {
  const id = parseInt(req.params.id);

  try {
    await db.compostData.delete({ where: { id } });
    res.json({ success: true, message: "Relevé supprimé" });
  } catch (error) {
    console.error("Erreur suppression compostData :", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- ROUTES ADMIN ---

app.get("/api/admin/users", authMiddleware, adminOnly, async (req, res) => {
  try {
    const users = await db.user.findMany({
      where: {
        role: {
          in: ["CLIENT", "SUPERVISOR"],
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        role: true,
        assignedComposts: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: { lastName: "asc" },
    });
    res.json({ users });
  } catch (error) {
    console.error("Erreur récupération utilisateurs:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/api/admin/composteurs", authMiddleware, adminOnly, async (req, res) => {
  try {
    const composteurs = await db.compost.findMany({
      select: {
        id: true,
        name: true,
        site: {
          select: {
            id: true,
            name: true,
          },
        },
        assignedUsers: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            role: true,
          },
        },
      },
      orderBy: { name: "asc" },
    });
    res.json({ composteurs });
  } catch (error) {
    console.error("Erreur récupération composteurs:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.put("/api/admin/users/:userId/assign-composteurs", authMiddleware, adminOnly, async (req, res) => {
  const userId = parseInt(req.params.userId);
  const { composteurIds } = req.body;

  if (!Array.isArray(composteurIds)) {
    return res.status(400).json({ error: "composteurIds doit être un tableau d'entiers" });
  }

  try {
    await db.user.update({
      where: { id: userId },
      data: {
        assignedComposts: {
          set: composteurIds.map((id) => ({ id })),
        },
      },
    });
    res.json({ success: true, message: "Assignations mises à jour." });
  } catch (error) {
    console.error("Erreur mise à jour assignations:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

app.put("/api/admin/users/:userId/change-role", authMiddleware, adminOnly, async (req, res) => {
  const userId = parseInt(req.params.userId);
  const { newRole } = req.body;

  if (!["CLIENT", "SUPERVISOR"].includes(newRole)) {
    return res.status(400).json({ error: "Rôle invalide, doit être CLIENT ou SUPERVISOR" });
  }

  try {
    const updatedUser = await db.user.update({
      where: { id: userId },
      data: { role: newRole },
      select: { id: true, role: true },
    });
    res.json({ success: true, user: updatedUser });
  } catch (error) {
    console.error("Erreur changement rôle:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- ROUTES norm (ADMIN + SUPERVISOR) ---

// Get norm for a composteur
app.get("/api/norm/:compostId", authMiddleware, adminOrSupervisorOnly, async (req, res) => {
  const compostId = parseInt(req.params.compostId);
  try {
    const norm = await db.norm.findUnique({
      where: { compostId },
    });
    if (!norm) return res.status(404).json({ error: "Normes non trouvées pour ce composteur." });
    res.json({ norm });
  } catch (error) {
    console.error("Erreur récupération normes:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Create norm for a composteur
app.post("/api/norm", authMiddleware, adminOrSupervisorOnly, async (req, res) => {
  const { compostId, temperatureMax, humidityMax, odorLevelMax, compostMassMax, oxygenationMin, woodChipsAddedMax } = req.body;
  try {
    const existing = await db.norm.findUnique({ where: { compostId } });
    if (existing) {
      return res.status(400).json({ error: "Normes existent déjà pour ce composteur." });
    }
    const newnorm = await db.norm.create({
      data: {
        compostId,
        temperatureMax,
        humidityMax,
        odorLevelMax,
        compostMassMax,
        oxygenationMin,
        woodChipsAddedMax,
      },
    });
    res.status(201).json({ norm: newnorm });
  } catch (error) {
    console.error("Erreur création normes:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Update norm for a composteur
app.put("/api/norm/:id", authMiddleware, adminOrSupervisorOnly, async (req, res) => {
  const id = parseInt(req.params.id);
  const data = req.body;
  try {
    const updatednorm = await db.norm.update({
      where: { id },
      data,
    });
    res.json({ norm: updatednorm });
  } catch (error) {
    console.error("Erreur mise à jour normes:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- ROUTES NOTIFICATIONS ---

// Get all notifications for logged-in user
app.get("/api/notifications", authMiddleware, async (req, res) => {
  try {
    const notifications = await db.notification.findMany({
      where: { userId: req.session.user.id },
      orderBy: { createdAt: "desc" },
    });
    res.json({ notifications });
  } catch (error) {
    console.error("Erreur récupération notifications :", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Mark a notification as read
app.put("/api/notifications/:id/read", authMiddleware, async (req, res) => {
  const notifId = parseInt(req.params.id);
  try {
    const updated = await db.notification.update({
      where: { id: notifId, userId: req.session.user.id },
      data: { read: true },
    });
    res.json({ success: true, notification: updated });
  } catch (error) {
    console.error("Erreur mise à jour notification :", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// --- ROUTES ADMIN SITES & COMPOSTEURS ---

// Add a new site (ADMIN only)
app.post("/api/sites", authMiddleware, adminOnly, async (req, res) => {
  const { name, address, latitude, longitude } = req.body;

  if (!name) {
    return res.status(400).json({ error: "Le nom du site est requis." });
  }

  try {
    const newSite = await db.site.create({
      data: {
        name,
        address,
        latitude,
        longitude,
      },
    });
    res.status(201).json({ success: true, site: newSite });
  } catch (error) {
    console.error("Erreur création site:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Delete a site by id (ADMIN only)
app.delete("/api/sites/:id", authMiddleware, adminOnly, async (req, res) => {
  const siteId = parseInt(req.params.id);

  try {
    const site = await db.site.findUnique({ where: { id: siteId } });
    if (!site) {
      return res.status(404).json({ error: "Site non trouvé." });
    }

    await db.site.delete({ where: { id: siteId } });
    res.json({ success: true, message: "Site supprimé." });
  } catch (error) {
    console.error("Erreur suppression site:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});

// Add a new composter (ADMIN only)
app.post("/api/composteurs", authMiddleware, adminOnly, async (req, res) => {
  const { name, siteId, latitude, longitude, compostType, capacity, sensors } = req.body;

  if (!name || !siteId) {
    return res.status(400).json({ error: "Nom et siteId sont requis." });
  }

  try {
    const site = await db.site.findUnique({ where: { id: siteId } });
    if (!site) {
      return res.status(400).json({ error: "Site invalide." });
    }

    const newComposter = await db.compost.create({
      data: {
        name,
        siteId,
        latitude,
        longitude,
        compostType,
        capacity,
        sensors,
      },
    });

    // ✅ Ensure norm is created at the same time
    await db.norm.create({
      data: {
        compostId: newComposter.id
      },
    });

    res.status(201).json({ success: true, composteur: newComposter });
  } catch (error) {
    console.error("Erreur création composteur:", error);
    res.status(500).json({ error: "Erreur serveur" });
  }
});


app.delete("/api/composteurs/:id", authMiddleware, adminOnly, async (req, res) => {
  const compostId = parseInt(req.params.id);

  try {
    const compost = await db.compost.findUnique({
      where: { id: compostId },
      include: { norm: true },
    });

    if (!compost) {
      return res.status(404).json({ error: "Composteur non trouvé." });
    }

    // ✅ First delete the norm (if it exists)
    if (compost.norm) {
      await db.norm.delete({
        where: { id: compost.norm.id },
      });
    }

    // ✅ Then delete the compost
    await db.compost.delete({
      where: { id: compostId },
    });

    res.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression composteur:", error);
    res.status(500).json({ error: "Erreur lors de la suppression." });
  }
});





app.get("/api/composteurs/:id/report", authMiddleware, async (req, res) => {
  const compostId = parseInt(req.params.id);

  try {
    const composteur = await db.compost.findUnique({
      where: { id: compostId },
      include: {
        norm: true,
        dataRecords: {
          orderBy: { recordedAt: "asc" },
          include: { recordedBy: true },
        },
      },
    });

    if (!composteur) {
      return res.status(404).json({ error: "Composteur introuvable." });
    }

    const data = composteur.dataRecords;
    const norms = composteur.norm;

    // Moyennes
    const avg = (arr) => (arr.length ? (arr.reduce((sum, val) => sum + val, 0) / arr.length).toFixed(1) : null);

    const avgTemperature = avg(data.filter(d => d.temperature != null).map(d => d.temperature));
    const avgHumidity = avg(data.filter(d => d.humidity != null).map(d => d.humidity));
    const avgOxygenation = avg(data.filter(d => d.oxygenation != null).map(d => d.oxygenation));
    const avgMass = avg(data.filter(d => d.compostMass != null).map(d => d.compostMass));
    const avgWoodChips = avg(data.filter(d => d.woodChipsAdded != null).map(d => d.woodChipsAdded));

    const normViolations = {
      temperatureMax: 0,
      humidityMax: 0,
      compostMassMax: 0,
      oxygenationMin: 0,
      woodChipsAddedMax: 0,
    };

    const violationsDetails = [];

    data.forEach((rec) => {
      const details = [];

      if (norms.temperatureMax != null && rec.temperature > norms.temperatureMax) {
        normViolations.temperatureMax++;
        details.push({ param: "🌡️ Température", value: `${rec.temperature}°C`, norm: `${norms.temperatureMax}°C` });
      }
      if (norms.humidityMax != null && rec.humidity > norms.humidityMax) {
        normViolations.humidityMax++;
        details.push({ param: "💧 Humidité", value: `${rec.humidity}%`, norm: `${norms.humidityMax}%` });
      }
      if (norms.oxygenationMin != null && rec.oxygenation < norms.oxygenationMin) {
        normViolations.oxygenationMin++;
        details.push({ param: "🧪 Oxygène", value: `${rec.oxygenation}%`, norm: `${norms.oxygenationMin}%` });
      }
      if (norms.compostMassMax != null && rec.compostMass > norms.compostMassMax) {
        normViolations.compostMassMax++;
        details.push({ param: "⚖️ Masse", value: `${rec.compostMass}kg`, norm: `${norms.compostMassMax}kg` });
      }
      if (norms.woodChipsAddedMax != null && rec.woodChipsAdded > norms.woodChipsAddedMax) {
        normViolations.woodChipsAddedMax++;
        details.push({ param: "🪵 Copeaux", value: `${rec.woodChipsAdded}kg`, norm: `${norms.woodChipsAddedMax}kg` });
      }

      if (details.length > 0) {
        violationsDetails.push({
          date: rec.recordedAt,
          recordedBy: rec.recordedBy
            ? `${rec.recordedBy.firstName} ${rec.recordedBy.lastName}`
            : "Inconnu",
          details,
        });
      }
    });

    const lastOdor = [...data].reverse().find((r) => r.odorLevel != null)?.odorLevel || null;

    res.json({
      composteurName: composteur.name,
      totalRecords: data.length,
      lastOdorLevel: lastOdor,
      averages: {
        temperature: avgTemperature ?? "N/A",
        humidity: avgHumidity ?? "N/A",
        oxygenation: avgOxygenation ?? "N/A",
        compostMass: avgMass ?? "N/A",
        woodChipsAdded: avgWoodChips ?? "N/A",
      },
      normViolations,
      violationsDetails,
    });
  } catch (error) {
    console.error("Erreur génération rapport:", error);
    res.status(500).json({ error: "Erreur serveur lors de la génération du rapport." });
  }
});



// Fallback 404
app.use("*", (_, res) => {
  res.status(404).json({ error: "Route non trouvée" });
});

// Démarrage serveur
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("✅ Server running on http://localhost:" + PORT);
});