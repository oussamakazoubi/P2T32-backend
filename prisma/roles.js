const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const db = new PrismaClient();

async function main() {
  const users = [
    {
      firstName: "Erwin",
      lastName: "Smith",
      email: "aot@aot.com",
      role: "ADMIN", // valid
      password: "shinzo",
    },
    {
      firstName: "Sami",
      lastName: "Supervisor",
      email: "sami.supervisor@example.com",
      role: "SUPERVISOR", // fixed
      password: "supervisorpass",
    },
    {
      firstName: "Lina",
      lastName: "Client",
      email: "lina.client@example.com",
      role: "CLIENT", // valid
      password: "clientpass",
    }
  ];

  for (const user of users) {
    const existing = await db.user.findUnique({ where: { email: user.email } });

    if (!existing) {
      const hashedPassword = await bcrypt.hash(user.password, 10);
      await db.user.create({
        data: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          password: hashedPassword,
        }
      });
      console.log(`✅ Created ${user.role}: ${user.firstName} ${user.lastName}`);
    } else {
      console.log(`ℹ️  User already exists: ${user.email}`);
    }
  }
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
