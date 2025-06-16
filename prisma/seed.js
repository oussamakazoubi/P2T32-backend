const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcrypt");
const prisma = new PrismaClient();

async function hash(pwd) {
  return await bcrypt.hash(pwd, 10);
}

async function main() {
  // Clear existing data
  await prisma.compostData.deleteMany();
  await prisma.event.deleteMany();
  await prisma.message.deleteMany();
  await prisma.report.deleteMany();
  await prisma.norm.deleteMany();
  await prisma.compost.deleteMany();
  await prisma.site.deleteMany();
  await prisma.user.deleteMany();

  // Create users
  const [
    adminRoot,
    claireSupervisor,
    sophieReferent,
    alexAgent,
    aliceClient,
    bobClient,
    carolClient,
    erwinAdmin,
    samiSupervisor,
    linaClient,
    jbAdmin,
    globalSupervisor
  ] = await Promise.all([
    prisma.user.create({ data: { firstName: "Admin", lastName: "Root", email: "admin@example.com", password: await hash("admin123"), role: "ADMIN" } }),
    prisma.user.create({ data: { firstName: "Claire", lastName: "Supervise", email: "supervisor@example.com", password: await hash("super123"), role: "SUPERVISOR" } }),
    prisma.user.create({ data: { firstName: "Sophie", lastName: "Referent", email: "referent@example.com", password: await hash("ref123"), role: "SITE_REFERENT" } }),
    prisma.user.create({ data: { firstName: "Alex", lastName: "Agent", email: "agent@example.com", password: await hash("agent123"), role: "MAINTENANCE_AGENT" } }),
    prisma.user.create({ data: { firstName: "Alice", lastName: "ClientOne", email: "client1@example.com", password: await hash("client123"), role: "CLIENT" } }),
    prisma.user.create({ data: { firstName: "Bob", lastName: "ClientTwo", email: "client2@example.com", password: await hash("client123"), role: "CLIENT" } }),
    prisma.user.create({ data: { firstName: "Carol", lastName: "ClientMany", email: "client3@example.com", password: await hash("client123"), role: "CLIENT" } }),
    prisma.user.create({ data: { firstName: "Erwin", lastName: "Smith", email: "aot@aot.com", password: await hash("shinzo"), role: "ADMIN" } }),
    prisma.user.create({ data: { firstName: "Sami", lastName: "Supervisor", email: "sami.supervisor@example.com", password: await hash("supervisorpass"), role: "SUPERVISOR" } }),
    prisma.user.create({ data: { firstName: "Lina", lastName: "Client", email: "lina.client@example.com", password: await hash("clientpass"), role: "CLIENT" } }),
    prisma.user.create({ data: { firstName: "Jean-Baptiste", lastName: "Gaborieau", email: "jb.gaborieau@gmail.com", password: await hash("hamorebi123"), role: "ADMIN" } }),
    prisma.user.create({ data: { firstName: "Victor", lastName: "SuperviseurGlobal", email: "superviseur.global@example.com", password: await hash("globalpass"), role: "SUPERVISOR" } }),
  ]);

  const sitesData = [
    {
      name: "Reymond Sur Mer",
      address: "1 Rue de la Plage",
      latitude: 43.2965,
      longitude: 5.3698,
    },
    {
      name: "Camping du Port",
      address: "2 Port Avenue",
      latitude: 43.7,
      longitude: 7.25,
    },
    {
      name: "Hôpital 2 Point O",
      address: "4 Boulevard de la Santé",
      latitude: 48.8566,
      longitude: 2.3522,
    },
  ];

  for (const [siteIndex, siteInfo] of sitesData.entries()) {
    const site = await prisma.site.create({
      data: {
        name: siteInfo.name,
        address: siteInfo.address,
        latitude: siteInfo.latitude,
        longitude: siteInfo.longitude,
        supervisorId: claireSupervisor.id,
        referents: { connect: [{ id: sophieReferent.id }] },
      },
    });

    for (let i = 1; i <= 3; i++) {
      const compost = await prisma.compost.create({
        data: {
          name: `${site.name} Compost ${i}`,
          siteId: site.id,
          referentId: sophieReferent.id,
        },
      });

      await prisma.norm.create({
        data: {
          compostId: compost.id,
          temperatureMax: 70.0,
          humidityMax: 80.0,
          odorLevelMax: "Moyen",
          compostMassMax: 1000.0,
          oxygenationMin: 10.0,
          woodChipsAddedMax: 50.0,
        },
      });

      if (i === 1 && site.name === "Reymond Sur Mer") {
        await prisma.user.update({
          where: { id: aliceClient.id },
          data: { assignedComposts: { connect: [{ id: compost.id }] } },
        });
      }

      if ((i === 1 || i === 2) && (site.name === "Camping du Port" || site.name === "Reymond Sur Mer")) {
        await prisma.user.update({
          where: { id: bobClient.id },
          data: { assignedComposts: { connect: [{ id: compost.id }] } },
        });
      }

      await prisma.user.update({
        where: { id: carolClient.id },
        data: { assignedComposts: { connect: [{ id: compost.id }] } },
      });

      await prisma.user.update({
        where: { id: linaClient.id },
        data: { assignedComposts: { connect: [{ id: compost.id }] } },
      });

      // Nouvel ajout : affecter chaque composteur au superviseur global
      await prisma.user.update({
        where: { email: "superviseur.global@example.com" },
        data: {
          assignedComposts: {
            connect: [{ id: compost.id }],
          },
        },
      });

      for (let j = 1; j <= 4; j++) {
        const recorderId = j % 2 === 0 ? claireSupervisor.id : alexAgent.id;
        await prisma.compostData.create({
          data: {
            compostId: compost.id,
            recordedById: recorderId,
            recordedAt: new Date(Date.now() - j * 86400000),
            temperature: 20 + siteIndex * 3 + i * 2 + j,
            humidity: 40 + siteIndex * 4 + i * 3 + j,
            oxygenation: 60 + siteIndex * 2 + i + j * 0.5,
            woodChipsAdded: 1.2 + i * 0.3 + j * 0.1,
            compostMass: 55 + i * 5 + j * 2,
            odorLevel: j % 2 === 0 ? "Neutral" : "Slight Odor",
            turned: j % 2 === 0,
            redistributed: j % 2 !== 0,
          },
        });
      }
    }

    await prisma.event.create({
      data: {
        siteId: site.id,
        title: "Maintenance visite",
        description: "Vérification mensuelle des composteurs.",
        importance: 2,
        startDate: new Date(),
        completed: false,
      },
    });

    await prisma.report.create({
      data: {
        userId: claireSupervisor.id,
        siteId: site.id,
        generatedAt: new Date(),
        financialGraph: "https://example.com/finance.png",
        compostEvolutionGraph: "https://example.com/compost.png",
        statsSummary: "Rapport automatique généré pour évaluation mensuelle.",
      },
    });

    await prisma.message.create({
      data: {
        senderId: adminRoot.id,
        receiverId: sophieReferent.id,
        content: `Merci de vérifier le site ${site.name} cette semaine.`,
      },
    });
  }

  console.log("✅ Base de données initialisée avec utilisateurs, composteurs, normes et affectations.");
}

main()
  .catch((e) => {
    console.error("❌ Erreur lors de l'initialisation :", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
