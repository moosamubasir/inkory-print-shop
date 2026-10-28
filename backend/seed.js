import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";
import { PrismaMariaDb } from "@prisma/adapter-mariadb";

const adapter = new PrismaMariaDb({
  host: "localhost",
  port: 3306,
  user: "root",
  password: "",
  database: "moosas_store",
});

const prisma = new PrismaClient({ adapter });

async function main() {
  // ─────────────────────────────────────────────
  // ADMIN ACCOUNT
  // ─────────────────────────────────────────────

  const email = "admin@moosasstore.local";

  const password = process.env.ADMIN_SEED_PASSWORD;

  if (!password) {
    throw new Error("ADMIN_SEED_PASSWORD is missing from .env");
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.admin.upsert({
    where: {
      email: email,
    },

    update: {
      passwordHash,
      name: "Inkory Admin",
    },

    create: {
      email: email,
      passwordHash,
      name: "Inkory Admin",
    },
  });

  console.log(`Admin account created: ${admin.email}`);


  // ─────────────────────────────────────────────
  // MENU DATA
  // ─────────────────────────────────────────────

  console.log("Creating Inkory menu...");


  // Helper function to create a category
  async function createCategory(name, items) {
    const category = await prisma.menuCategory.upsert({
      where: {
        id: 0,
      },

      update: {
        name,
        isActive: true,
      },

      create: {
        name,
        description: null,
        sortOrder: 0,
        isActive: true,
      },
    });

    for (const item of items) {
      await prisma.menuItem.create({
        data: {
          categoryId: category.id,
          name: item.name,
          description: item.description ?? null,
          price: item.price,
          unit: item.unit,
          sortOrder: item.sortOrder,
          isActive: true,
        },
      });
    }

    return category;
  }


  // ─────────────────────────────────────────────
  // DOCUMENT PRINTING – BLACK & WHITE
  // ─────────────────────────────────────────────

  const bwCategory = await prisma.menuCategory.create({
    data: {
      name: "Document Printing – Black & White",
      description: null,
      sortOrder: 0,
      isActive: true,
    },
  });

  await prisma.menuItem.createMany({
    data: [
      {
        categoryId: bwCategory.id,
        name: "A4 Single Side",
        price: 3,
        unit: "page",
        sortOrder: 0,
        isActive: true,
      },
      {
        categoryId: bwCategory.id,
        name: "A4 Double Side",
        price: 4,
        unit: "sheet",
        sortOrder: 1,
        isActive: true,
      },
      {
        categoryId: bwCategory.id,
        name: "A3 Single Side",
        price: 3,
        unit: "page",
        sortOrder: 2,
        isActive: true,
      },
      {
        categoryId: bwCategory.id,
        name: "A3 Double Side",
        price: 4,
        unit: "sheet",
        sortOrder: 3,
        isActive: true,
      },
    ],
  });


  // ─────────────────────────────────────────────
  // COLOR PRINTING
  // ─────────────────────────────────────────────

  const colorCategory = await prisma.menuCategory.create({
    data: {
      name: "Color Printing",
      description: null,
      sortOrder: 1,
      isActive: true,
    },
  });

  await prisma.menuItem.createMany({
    data: [
      {
        categoryId: colorCategory.id,
        name: "A4 Single Side",
        price: 10,
        unit: "page",
        sortOrder: 0,
        isActive: true,
      },
      {
        categoryId: colorCategory.id,
        name: "A4 Double Side",
        price: 18,
        unit: "sheet",
        sortOrder: 1,
        isActive: true,
      },
      {
        categoryId: colorCategory.id,
        name: "A3 Single Side",
        price: 10,
        unit: "page",
        sortOrder: 2,
        isActive: true,
      },
      {
        categoryId: colorCategory.id,
        name: "A3 Double Side",
        price: 18,
        unit: "sheet",
        sortOrder: 3,
        isActive: true,
      },
    ],
  });


  // ─────────────────────────────────────────────
  // PASSPORT PHOTOS
  // ─────────────────────────────────────────────

  const passportCategory = await prisma.menuCategory.create({
    data: {
      name: "Passport Photos",
      description: null,
      sortOrder: 2,
      isActive: true,
    },
  });

  await prisma.menuItem.createMany({
    data: [
      {
        categoryId: passportCategory.id,
        name: "5 Photos",
        price: 60,
        unit: "set",
        sortOrder: 0,
        isActive: true,
      },
      {
        categoryId: passportCategory.id,
        name: "8 Photos",
        price: 90,
        unit: "set",
        sortOrder: 1,
        isActive: true,
      },
    ],
  });


  // ─────────────────────────────────────────────
  // OTHER SERVICES
  // ─────────────────────────────────────────────

  const otherCategory = await prisma.menuCategory.create({
    data: {
      name: "Other Services",
      description: null,
      sortOrder: 3,
      isActive: true,
    },
  });

  await prisma.menuItem.createMany({
    data: [
      {
        categoryId: otherCategory.id,
        name: "Scanning",
        price: 5,
        unit: "page",
        sortOrder: 0,
        isActive: true,
      },
      {
        categoryId: otherCategory.id,
        name: "Scan to PDF",
        description: "Up to 10 pages",
        price: 30,
        unit: "document",
        sortOrder: 1,
        isActive: true,
      },
      {
        categoryId: otherCategory.id,
        name: "Lamination – ID Card",
        price: 30,
        unit: "card",
        sortOrder: 2,
        isActive: true,
      },
      {
        categoryId: otherCategory.id,
        name: "Lamination – A4",
        price: 60,
        unit: "sheet",
        sortOrder: 3,
        isActive: true,
      },
    ],
  });


  // ─────────────────────────────────────────────
  // MENU SETTINGS
  // ─────────────────────────────────────────────

  await prisma.menuSettings.upsert({
    where: {
      id: 1,
    },

    update: {
      publishedAt: new Date(),
    },

    create: {
      id: 1,
      publishedAt: new Date(),
    },
  });


  console.log("Menu created successfully.");
  console.log("4 categories added.");
  console.log("14 services added.");
  console.log("Menu marked as published.");
}


// ─────────────────────────────────────────────
// RUN SEED
// ─────────────────────────────────────────────

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });