import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import pkg from "@prisma/client";
const { PrismaClient } = pkg;
import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import multer from "multer";
import path from "path";
import fs from "fs";
import { execFile } from "child_process";

dotenv.config();

const app = express();
const PORT = 5000;

// ─────────────────────────────────────────────
// DATABASE
// ─────────────────────────────────────────────

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is missing from the backend .env file.");
}

const database = new URL(databaseUrl);
const databaseName = database.pathname.replace(/^\//, "");

if (!databaseName) {
  throw new Error("DATABASE_URL must include a database name.");
}

const adapter = new PrismaMariaDb({
  host: database.hostname,
  port: Number(database.port || 3306),
  user: decodeURIComponent(database.username),
  password: decodeURIComponent(database.password),
  database: databaseName,
  connectionLimit: 5,
});

const prisma = new PrismaClient({ adapter });

// ─────────────────────────────────────────────
// MIDDLEWARE
// ─────────────────────────────────────────────

app.use(
  cors({
    origin: [
      "http://localhost:8443",
      "http://192.168.221.245:8443",
    ],
  })
);

app.use(express.json());

// ─────────────────────────────────────────────
// FILE UPLOAD CONFIGURATION
// ─────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },

  filename: (req, file, cb) => {
    const uniqueName =
      Date.now() +
      "-" +
      Math.round(Math.random() * 1e9) +
      path.extname(file.originalname);

    cb(null, uniqueName);
  },
});

const upload = multer({
  storage,

  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB per file
  },

  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-powerpoint",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Only PDF, DOCX, XLSX, and images are allowed."));
    }
  },
});

// Allows uploaded files to be opened from:
// http://localhost:5000/uploads/FILENAME
const uploadsDirectory = path.resolve("uploads");
const FILE_RETENTION_MS = 24 * 60 * 60 * 1000;
const STORAGE_SETTINGS_PATH = path.resolve("storage-settings.json");

function readStorageSettings() {
  try {
    if (fs.existsSync(STORAGE_SETTINGS_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(STORAGE_SETTINGS_PATH, "utf8"));
      return { autoCleanupEnabled: parsed.autoCleanupEnabled !== false };
    }
  } catch (error) {
    console.error("Unable to read storage settings; using automatic cleanup.", error);
  }
  return { autoCleanupEnabled: true };
}

function writeStorageSettings(settings) {
  fs.writeFileSync(STORAGE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n", "utf8");
}

let storageSettings = readStorageSettings();

fs.mkdirSync(uploadsDirectory, { recursive: true });
app.use("/uploads", express.static(uploadsDirectory));

async function cleanupExpiredFiles(force = false) {
  if (!force && !storageSettings.autoCleanupEnabled) {
    return { deleted: 0, missing: 0, failed: 0, scanned: 0, skipped: true };
  }

  const cutoff = new Date(Date.now() - FILE_RETENTION_MS);
  const fileRows = await prisma.orderFile.findMany({
    where: { createdAt: { lt: cutoff } },
  });

  let deleted = 0;
  let missing = 0;
  let failed = 0;

  for (const file of fileRows) {
    const filePath = path.join(uploadsDirectory, file.storedName);

    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        deleted++;
      } else {
        missing++;
      }

      await prisma.orderFile.delete({ where: { id: file.id } });
    } catch (error) {
      failed++;
      console.error(`Storage cleanup failed for ${file.storedName}:`, error);
    }
  }

  return { deleted, missing, failed, scanned: fileRows.length };
}

async function scanStorageFiles() {
  const files = await prisma.orderFile.findMany({
    include: { order: true },
    orderBy: { createdAt: "desc" },
  });

  const now = Date.now();
  return files.map((file) => {
    const filePath = path.join(uploadsDirectory, file.storedName);
    const exists = fs.existsSync(filePath);
    const ageHours = Math.max(0, (now - file.createdAt.getTime()) / 3600000);

    return {
      id: file.id,
      orderId: file.orderId,
      originalName: file.originalName,
      storedName: file.storedName,
      mimeType: file.mimeType,
      size: file.size,
      createdAt: file.createdAt,
      ageHours: Number(ageHours.toFixed(1)),
      isExpired: ageHours >= 24,
      exists,
      customer: file.order?.customer || "Unknown customer",
      service: file.order?.service || "document",
    };
  });
}

// Storage is deterministic: clean on startup and once per hour while the API runs.
if (storageSettings.autoCleanupEnabled) {
  cleanupExpiredFiles()
    .then((result) => console.log("Initial storage cleanup:", result))
    .catch((error) => console.error("Initial storage cleanup failed:", error));
} else {
  console.log("Automatic storage cleanup is disabled.");
}

setInterval(() => {
  if (!storageSettings.autoCleanupEnabled) return;
  cleanupExpiredFiles()
    .then((result) => console.log("Hourly storage cleanup:", result))
    .catch((error) => console.error("Hourly storage cleanup failed:", error));
}, 60 * 60 * 1000);

// ─────────────────────────────────────────────
// TEST ROUTE
// ─────────────────────────────────────────────

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Inkory backend is running!",
  });
});

// ─────────────────────────────────────────────
// ADMIN AUTHENTICATION MIDDLEWARE
// ─────────────────────────────────────────────

function requireAdmin(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Admin authentication required.",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.admin = decoded;

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired admin session.",
    });
  }
}

// ─────────────────────────────────────────────
// LEDGER / DEBT API
// ─────────────────────────────────────────────
//
// Supports:
// 1. Online order debt
// 2. Walk-in customer debt
// 3. Payments
// 4. Clearing debt
// 5. Debt history
//
// Active debt threshold used by the Reports page:
// ₹45 or more
// ─────────────────────────────────────────────


// ─────────────────────────────────────────────
// GET ALL LEDGER ENTRIES
// GET /api/ledger
// ─────────────────────────────────────────────

app.get("/api/ledger", requireAdmin, async (req, res) => {
  try {
    const entries = await prisma.ledgerEntry.findMany({
      include: {
        order: true,
        payments: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

const formattedEntries = entries.map((entry) => ({
  id: entry.id,

  // For online debt, use the linked Order as a fallback.
  customer:
    entry.customer?.trim() ||
    entry.order?.customer?.trim() ||
    "Unknown Customer",

  phone:
    entry.phone?.trim() ||
    entry.order?.phone?.trim() ||
    "",

  orderId:
    entry.orderId ||
    entry.order?.id ||
    null,

  // Send the linked order information to the frontend.
  order: entry.order
    ? {
        id: entry.order.id,
        customer: entry.order.customer,
        phone: entry.order.phone,
        service: entry.order.service,
        color: entry.order.color,
        paper: entry.order.paper,
        copies: entry.order.copies,
        sides: entry.order.sides,
        estimatedAmount: entry.order.estimatedAmount,
        finalAmount: entry.order.finalAmount,
        status: entry.order.status,
        createdAt: entry.order.createdAt,
      }
    : null,

  totalAmount: entry.totalAmount,
  amountPaid: entry.amountPaid,

  remaining: Math.max(
    0,
    entry.totalAmount - entry.amountPaid
  ),

  status: entry.status,
  notes: entry.notes,

  source: entry.orderId
    ? "online"
    : "walk-in",

  createdAt: entry.createdAt,
  updatedAt: entry.updatedAt,

  payments: entry.payments.map((payment) => ({
    id: payment.id,
    amount: payment.amount,
    note: payment.note,
    createdAt: payment.createdAt,
  })),
}));

    return res.json({
      success: true,
      entries: formattedEntries,
    });

  } catch (error) {
    console.error("Get ledger error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load ledger.",
    });
  }
});


// ─────────────────────────────────────────────
// GET ACTIVE LEDGER ENTRIES
// GET /api/ledger/active
// Reports page uses this endpoint.
// Only unpaid debts of ₹45 or more are returned.
// Settled debts automatically disappear from this list.
// ─────────────────────────────────────────────

app.get("/api/ledger/active", requireAdmin, async (req, res) => {
  try {
    const entries = await prisma.ledgerEntry.findMany({
      where: {
        status: {
          in: ["due", "partial"],
        },
        totalAmount: {
          // The actual outstanding amount is calculated below.
          // We still fetch all due/partial records here because
          // Prisma cannot compare totalAmount - amountPaid directly.
          gt: 0,
        },
      },
      include: {
        order: true,
        payments: {
          orderBy: {
            createdAt: "asc",
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });
const formattedEntries = entries
  .map((entry) => ({
    id: entry.id,

    customer:
      entry.customer?.trim() ||
      entry.order?.customer?.trim() ||
      "Unknown Customer",

    phone:
      entry.phone?.trim() ||
      entry.order?.phone?.trim() ||
      "",

    orderId:
      entry.orderId ||
      entry.order?.id ||
      null,

    order: entry.order
      ? {
          id: entry.order.id,
          customer: entry.order.customer,
          phone: entry.order.phone,
          service: entry.order.service,
          color: entry.order.color,
          paper: entry.order.paper,
          copies: entry.order.copies,
          sides: entry.order.sides,
          estimatedAmount: entry.order.estimatedAmount,
          finalAmount: entry.order.finalAmount,
          status: entry.order.status,
          createdAt: entry.order.createdAt,
        }
      : null,

    totalAmount: entry.totalAmount,
    amountPaid: entry.amountPaid,

    remaining: Math.max(
      0,
      entry.totalAmount - entry.amountPaid
    ),

    status: entry.status,
    notes: entry.notes,

    source: entry.orderId
      ? "online"
      : "walk-in",

    createdAt: entry.createdAt,
    updatedAt: entry.updatedAt,

    payments: entry.payments.map((payment) => ({
      id: payment.id,
      amount: payment.amount,
      note: payment.note,
      createdAt: payment.createdAt,
    })),
  }))
  .filter((entry) => entry.remaining >= 45);

    return res.json({
      success: true,
      entries: formattedEntries,
    });
  } catch (error) {
    console.error("Get active ledger error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to load active ledger entries.",
    });
  }
});

// ─────────────────────────────────────────────
// GET ONE LEDGER ENTRY
// GET /api/ledger/:id
// ─────────────────────────────────────────────

app.get(
  "/api/ledger/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id = Number(req.params.id);

      if (!Number.isInteger(id)) {
        return res.status(400).json({
          success: false,
          message: "Invalid ledger ID.",
        });
      }

      const entry =
        await prisma.ledgerEntry.findUnique({
          where: {
            id,
          },

          include: {
            order: true,

            payments: {
              orderBy: {
                createdAt: "asc",
              },
            },
          },
        });

      if (!entry) {
        return res.status(404).json({
          success: false,
          message: "Ledger entry not found.",
        });
      }

      return res.json({
        success: true,

        entry: {
          id: entry.id,

          customer: entry.customer,
          phone: entry.phone,

          orderId: entry.orderId,

          totalAmount:
            entry.totalAmount,

          amountPaid:
            entry.amountPaid,

          remaining:
            Math.max(
              0,
              entry.totalAmount -
              entry.amountPaid
            ),

          status: entry.status,

          notes: entry.notes,

          source:
            entry.orderId
              ? "online"
              : "walk-in",

          createdAt:
            entry.createdAt,

          updatedAt:
            entry.updatedAt,

          payments:
            entry.payments.map(
              (payment) => ({
                id: payment.id,
                amount:
                  payment.amount,
                note:
                  payment.note,
                createdAt:
                  payment.createdAt,
              })
            ),
        },
      });

    } catch (error) {
      console.error(
        "Get ledger entry error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to load ledger entry.",
      });
    }
  }
);


// ─────────────────────────────────────────────
// CREATE WALK-IN DEBT
// POST /api/ledger
// ─────────────────────────────────────────────
//
// This is the important part for customers who
// come physically to the shop.
//
// orderId is intentionally NOT required.
//
// Example:
//
// {
//   "customer": "Ahmed",
//   "phone": "9876543210",
//   "totalAmount": 45,
//   "amountPaid": 0,
//   "notes": "15 A4 Xerox copies"
// }
//
// ─────────────────────────────────────────────

app.post(
  "/api/ledger",
  requireAdmin,
  async (req, res) => {
    try {
      const {
        customer,
        phone,
        totalAmount,
        amountPaid,
        notes,
      } = req.body;

      // Validate customer name
      if (
        typeof customer !== "string" ||
        !customer.trim()
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Customer name is required.",
        });
      }

      const total =
        Number(totalAmount);

      const paid =
        amountPaid === undefined ||
        amountPaid === null ||
        amountPaid === ""
          ? 0
          : Number(amountPaid);

      // Validate amounts
      if (
        !Number.isFinite(total) ||
        total <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Total amount must be greater than zero.",
        });
      }

      if (
        !Number.isFinite(paid) ||
        paid < 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Paid amount cannot be negative.",
        });
      }

      if (paid > total) {
        return res.status(400).json({
          success: false,
          message:
            "Paid amount cannot be greater than the total amount.",
        });
      }

      const status =
        paid >= total
          ? "settled"
          : paid > 0
            ? "partial"
            : "due";

      const entry =
        await prisma.ledgerEntry.create({
          data: {
            customer:
              customer.trim(),

            phone:
              typeof phone === "string" &&
              phone.trim()
                ? phone.trim()
                : null,

            totalAmount: total,

            amountPaid: paid,

            status,

            notes:
              typeof notes === "string" &&
              notes.trim()
                ? notes.trim()
                : null,

            // IMPORTANT:
            // No orderId here.
            // This makes it a walk-in debt.

            payments:
              paid > 0
                ? {
                    create: {
                      amount: paid,
                      note:
                        "Initial payment",
                    },
                  }
                : undefined,
          },

          include: {
            payments: true,
          },
        });

      return res.status(201).json({
        success: true,

        message:
          "Walk-in debt added successfully.",

        entry,
      });

    } catch (error) {
      console.error(
        "Create ledger error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to create debt entry.",
      });
    }
  }
);


// ─────────────────────────────────────────────
// UPDATE LEDGER ENTRY
// PATCH /api/ledger/:id
// ─────────────────────────────────────────────
//
// Used for editing customer information,
// notes, etc.
//
// Payments should use the dedicated payment
// endpoint below.
// ─────────────────────────────────────────────

app.patch(
  "/api/ledger/:id",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        Number(req.params.id);

      if (!Number.isInteger(id)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid ledger ID.",
        });
      }

      const existing =
        await prisma.ledgerEntry.findUnique({
          where: {
            id,
          },
        });

      if (!existing) {
        return res.status(404).json({
          success: false,
          message:
            "Ledger entry not found.",
        });
      }

      const {
        customer,
        phone,
        notes,
      } = req.body;

      const data = {};

      if (
        customer !== undefined
      ) {
        if (
          typeof customer !== "string" ||
          !customer.trim()
        ) {
          return res.status(400).json({
            success: false,
            message:
              "Customer name cannot be empty.",
          });
        }

        data.customer =
          customer.trim();
      }

      if (
        phone !== undefined
      ) {
        data.phone =
          typeof phone === "string" &&
          phone.trim()
            ? phone.trim()
            : null;
      }

      if (
        notes !== undefined
      ) {
        data.notes =
          typeof notes === "string" &&
          notes.trim()
            ? notes.trim()
            : null;
      }

      const updated =
        await prisma.ledgerEntry.update({
          where: {
            id,
          },

          data,

          include: {
            payments: {
              orderBy: {
                createdAt: "asc",
              },
            },
          },
        });

      return res.json({
        success: true,
        message:
          "Ledger entry updated successfully.",
        entry: updated,
      });

    } catch (error) {
      console.error(
        "Update ledger error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to update ledger entry.",
      });
    }
  }
);


// ─────────────────────────────────────────────
// ADD PAYMENT
// POST /api/ledger/:id/payments
// ─────────────────────────────────────────────
//
// Example:
//
// {
//   "amount": 25,
//   "note": "Cash"
// }
//
// ─────────────────────────────────────────────

app.post(
  "/api/ledger/:id/payments",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        Number(req.params.id);

      const amount =
        Number(req.body.amount);

      const note =
        typeof req.body.note === "string"
          ? req.body.note.trim()
          : null;

      if (!Number.isInteger(id)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid ledger ID.",
        });
      }

      if (
        !Number.isFinite(amount) ||
        amount <= 0
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Payment amount must be greater than zero.",
        });
      }

      const result =
        await prisma.$transaction(
          async (tx) => {

            const entry =
              await tx.ledgerEntry.findUnique({
                where: {
                  id,
                },
              });

            if (!entry) {
              throw new Error(
                "LEDGER_NOT_FOUND"
              );
            }

            const remaining =
              entry.totalAmount -
              entry.amountPaid;

            if (remaining <= 0) {
              throw new Error(
                "ALREADY_SETTLED"
              );
            }

            if (amount > remaining) {
              throw new Error(
                "PAYMENT_EXCEEDS_DUE"
              );
            }

            const newPaid =
              entry.amountPaid +
              amount;

            const newStatus =
              newPaid >=
              entry.totalAmount
                ? "settled"
                : "partial";

            const payment =
              await tx.ledgerPayment.create({
                data: {
                  ledgerId: entry.id,
                  amount,
                  note:
                    note || null,
                },
              });

            const updated =
              await tx.ledgerEntry.update({
                where: {
                  id: entry.id,
                },

                data: {
                  amountPaid:
                    newPaid,

                  status:
                    newStatus,
                },

                include: {
                  payments: {
                    orderBy: {
                      createdAt: "asc",
                    },
                  },
                },
              });

            return {
              updated,
              payment,
            };
          }
        );

      return res.json({
        success: true,

        message:
          "Payment recorded successfully.",

        entry: {
          ...result.updated,

          remaining:
            Math.max(
              0,
              result.updated.totalAmount -
              result.updated.amountPaid
            ),
        },

        payment:
          result.payment,
      });

    } catch (error) {

      if (
        error instanceof Error &&
        error.message ===
          "LEDGER_NOT_FOUND"
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Ledger entry not found.",
        });
      }

      if (
        error instanceof Error &&
        error.message ===
          "ALREADY_SETTLED"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "This debt is already settled.",
        });
      }

      if (
        error instanceof Error &&
        error.message ===
          "PAYMENT_EXCEEDS_DUE"
      ) {
        return res.status(400).json({
          success: false,
          message:
            "Payment cannot be greater than the outstanding amount.",
        });
      }

      console.error(
        "Add ledger payment error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to record payment.",
      });
    }
  }
);


// ─────────────────────────────────────────────
// CLEAR DEBT
// POST /api/ledger/:id/clear
// ─────────────────────────────────────────────
//
// This records the remaining amount as a payment
// and marks the ledger entry as settled.
//
// The history is NOT deleted.
// ─────────────────────────────────────────────

app.post(
  "/api/ledger/:id/clear",
  requireAdmin,
  async (req, res) => {
    try {
      const id =
        Number(req.params.id);

      if (!Number.isInteger(id)) {
        return res.status(400).json({
          success: false,
          message:
            "Invalid ledger ID.",
        });
      }

      const result =
        await prisma.$transaction(
          async (tx) => {

            const entry =
              await tx.ledgerEntry.findUnique({
                where: {
                  id,
                },
              });

            if (!entry) {
              throw new Error(
                "LEDGER_NOT_FOUND"
              );
            }

            const remaining =
              Math.max(
                0,
                entry.totalAmount -
                entry.amountPaid
              );

            if (remaining <= 0) {
              return {
                entry,
                payment: null,
              };
            }

            const payment =
              await tx.ledgerPayment.create({
                data: {
                  ledgerId: entry.id,
                  amount: remaining,
                  note:
                    "Debt cleared",
                },
              });

            const updated =
              await tx.ledgerEntry.update({
                where: {
                  id,
                },

                data: {
                  amountPaid:
                    entry.totalAmount,

                  status:
                    "settled",
                },

                include: {
                  payments: {
                    orderBy: {
                      createdAt: "asc",
                    },
                  },
                },
              });

            return {
              entry: updated,
              payment,
            };
          }
        );

      return res.json({
        success: true,

        message:
          "Debt cleared successfully.",

        entry: result.entry,

        payment:
          result.payment,
      });

    } catch (error) {

      if (
        error instanceof Error &&
        error.message ===
          "LEDGER_NOT_FOUND"
      ) {
        return res.status(404).json({
          success: false,
          message:
            "Ledger entry not found.",
        });
      }

      console.error(
        "Clear debt error:",
        error
      );

      return res.status(500).json({
        success: false,
        message:
          "Failed to clear debt.",
      });
    }
  }
);
// ─────────────────────────────────────────────
// STORAGE API
// ─────────────────────────────────────────────

app.get("/api/storage/settings", requireAdmin, (req, res) => {
  return res.json({ success: true, settings: storageSettings });
});

app.patch("/api/storage/settings", requireAdmin, (req, res) => {
  if (typeof req.body?.autoCleanupEnabled !== "boolean") {
    return res.status(400).json({ success: false, message: "autoCleanupEnabled must be a boolean." });
  }

  storageSettings = { ...storageSettings, autoCleanupEnabled: req.body.autoCleanupEnabled };
  writeStorageSettings(storageSettings);

  return res.json({
    success: true,
    settings: storageSettings,
    message: storageSettings.autoCleanupEnabled
      ? "Automatic cleanup enabled."
      : "Automatic cleanup disabled. Manual cleanup remains available.",
  });
});

app.get("/api/storage/files", requireAdmin, async (req, res) => {
  try {
    return res.json({ success: true, files: await scanStorageFiles() });
  } catch (error) {
    console.error("Storage scan error:", error);
    return res.status(500).json({ success: false, message: "Failed to scan storage." });
  }
});

app.post("/api/storage/cleanup", requireAdmin, async (req, res) => {
  try {
    const result = await cleanupExpiredFiles(true);
    return res.json({
      success: true,
      ...result,
      message: `Removed ${result.deleted} expired file(s). ${result.missing} missing file record(s) cleaned up.`,
    });
  } catch (error) {
    console.error("Manual storage cleanup error:", error);
    return res.status(500).json({ success: false, message: "Failed to clean storage." });
  }
});

app.delete("/api/storage/files/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      return res.status(400).json({ success: false, message: "Invalid file ID." });
    }

    const file = await prisma.orderFile.findUnique({ where: { id } });
    if (!file) {
      return res.status(404).json({ success: false, message: "File not found." });
    }

    const filePath = path.join(uploadsDirectory, file.storedName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    await prisma.orderFile.delete({ where: { id } });

    return res.json({
      success: true,
      message: "File deleted. The order history was preserved.",
    });
  } catch (error) {
    console.error("Storage file deletion error:", error);
    return res.status(500).json({ success: false, message: "Failed to delete file." });
  }
});

// ─────────────────────────────────────────────
// DELETE WALK-IN LEDGER RECORDS ONLY
// Website-order ledger records are intentionally protected.
// DELETE /api/ledger/walk-in
// ─────────────────────────────────────────────

app.delete("/api/ledger/walk-in", requireAdmin, async (req, res) => {
  try {
    const requestedIds = Array.isArray(req.body?.ids)
      ? req.body.ids.map((id) => Number(id)).filter(Number.isInteger)
      : null;

    const where = requestedIds && requestedIds.length > 0
      ? { id: { in: requestedIds }, orderId: null }
      : { orderId: null };

    const result = await prisma.ledgerEntry.deleteMany({ where });

    return res.json({
      success: true,
      deletedCount: result.count,
      skippedWebsiteRecords: requestedIds
        ? Math.max(0, requestedIds.length - result.count)
        : 0,
      message: requestedIds
        ? `Deleted ${result.count} walk-in record(s). Website-linked records were skipped.`
        : `Deleted ${result.count} walk-in record(s). Website-linked records were preserved.`,
    });
  } catch (error) {
    console.error("Delete walk-in ledger records error:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to delete walk-in ledger records.",
    });
  }
});

// ─────────────────────────────────────────────
// ADMIN LOGIN
// ─────────────────────────────────────────────

app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required.",
      });
    }

    // Admin can use:
    // admin
    // OR
    // admin@moosasstore.local

    const email =
      username.trim().toLowerCase() === "admin"
        ? "admin@moosasstore.local"
        : username.trim().toLowerCase();

    const admin = await prisma.admin.findUnique({
      where: {
        email,
      },
    });

    if (!admin) {
      return res.status(401).json({
        success: false,
        message: "Incorrect username or password.",
      });
    }

    const passwordCorrect = await bcrypt.compare(
      password,
      admin.passwordHash
    );

    if (!passwordCorrect) {
      return res.status(401).json({
        success: false,
        message: "Incorrect username or password.",
      });
    }

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET is missing from .env");

      return res.status(500).json({
        success: false,
        message: "Server configuration error.",
      });
    }

    const token = jwt.sign(
      {
        adminId: admin.id,
        email: admin.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "8h",
      }
    );

    return res.json({
      success: true,
      message: "Login successful.",
      token,

      admin: {
        id: admin.id,
        name: admin.name,
        email: admin.email,
      },
    });
  } catch (error) {
    console.error("Admin login error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while logging in.",
    });
  }
});

// ─────────────────────────────────────────────
// MENU API
// ─────────────────────────────────────────────

// GET PUBLISHED/CURRENT MENU
// Customer Portal uses this endpoint.
app.get("/api/menu", async (req, res) => {
  try {
    const categories = await prisma.menuCategory.findMany({
      where: {
        isActive: true,
      },

      orderBy: {
        sortOrder: "asc",
      },

      include: {
        items: {
          where: {
            isActive: true,
          },

          orderBy: {
            sortOrder: "asc",
          },
        },
      },
    });

    const settings = await prisma.menuSettings.findUnique({
      where: {
        id: 1,
      },
    });

    return res.json({
      success: true,
      publishedAt: settings?.publishedAt ?? null,
      categories,
    });
  } catch (error) {
    console.error("Get menu error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while loading the menu.",
    });
  }
});


// GET FULL MENU FOR ADMIN
app.get("/api/admin/menu", requireAdmin, async (req, res) => {
  try {
    const categories = await prisma.menuCategory.findMany({
      orderBy: {
        sortOrder: "asc",
      },

      include: {
        items: {
          orderBy: {
            sortOrder: "asc",
          },
        },
      },
    });

    const settings = await prisma.menuSettings.findUnique({
      where: {
        id: 1,
      },
    });

    return res.json({
      success: true,
      publishedAt: settings?.publishedAt ?? null,
      categories,
    });
  } catch (error) {
    console.error("Get admin menu error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while loading the admin menu.",
    });
  }
});


// ADD CATEGORY
app.post("/api/admin/menu/categories", requireAdmin, async (req, res) => {
  try {
    const {
      name,
      description,
      sortOrder,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Category name is required.",
      });
    }

    const category = await prisma.menuCategory.create({
      data: {
        name: name.trim(),

        description:
          typeof description === "string" && description.trim()
            ? description.trim()
            : null,

        sortOrder:
          sortOrder !== undefined
            ? Number(sortOrder)
            : 0,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Category created successfully.",
      category,
    });
  } catch (error) {
    console.error("Create category error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while creating the category.",
    });
  }
});


// UPDATE CATEGORY
app.patch("/api/admin/menu/categories/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID.",
      });
    }

    const {
      name,
      description,
      sortOrder,
      isActive,
    } = req.body;

    const category = await prisma.menuCategory.update({
      where: {
        id,
      },

      data: {
        ...(name !== undefined && {
          name: String(name).trim(),
        }),

        ...(description !== undefined && {
          description:
            typeof description === "string" && description.trim()
              ? description.trim()
              : null,
        }),

        ...(sortOrder !== undefined && {
          sortOrder: Number(sortOrder),
        }),

        ...(isActive !== undefined && {
          isActive: Boolean(isActive),
        }),
      },
    });

    return res.json({
      success: true,
      message: "Category updated successfully.",
      category,
    });
  } catch (error) {
    console.error("Update category error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while updating the category.",
    });
  }
});


// DELETE CATEGORY
app.delete("/api/admin/menu/categories/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid category ID.",
      });
    }

    await prisma.menuCategory.delete({
      where: {
        id,
      },
    });

    return res.json({
      success: true,
      message: "Category deleted successfully.",
    });
  } catch (error) {
    console.error("Delete category error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while deleting the category.",
    });
  }
});


// ADD MENU ITEM / SERVICE
app.post("/api/admin/menu/items", requireAdmin, async (req, res) => {
  try {
    const {
      categoryId,
      name,
      description,
      price,
      unit,
      sortOrder,
    } = req.body;

    if (!categoryId || !name || price === undefined) {
      return res.status(400).json({
        success: false,
        message: "Category, service name and price are required.",
      });
    }

    const category = await prisma.menuCategory.findUnique({
      where: {
        id: Number(categoryId),
      },
    });

    if (!category) {
      return res.status(404).json({
        success: false,
        message: "Category not found.",
      });
    }

    const numericPrice = Number(price);

    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      return res.status(400).json({
        success: false,
        message: "Price must be a valid non-negative number.",
      });
    }

    const item = await prisma.menuItem.create({
      data: {
        categoryId: Number(categoryId),

        name: String(name).trim(),

        description:
          typeof description === "string" && description.trim()
            ? description.trim()
            : null,

        price: numericPrice,

        unit:
          typeof unit === "string" && unit.trim()
            ? unit.trim()
            : "page",

        sortOrder:
          sortOrder !== undefined
            ? Number(sortOrder)
            : 0,
      },
    });

    return res.status(201).json({
      success: true,
      message: "Menu item created successfully.",
      item,
    });
  } catch (error) {
    console.error("Create menu item error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while creating the menu item.",
    });
  }
});


// UPDATE MENU ITEM / SERVICE
app.patch("/api/admin/menu/items/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID.",
      });
    }

    const {
      categoryId,
      name,
      description,
      price,
      unit,
      sortOrder,
      isActive,
    } = req.body;

    const data = {
      ...(categoryId !== undefined && {
        categoryId: Number(categoryId),
      }),

      ...(name !== undefined && {
        name: String(name).trim(),
      }),

      ...(description !== undefined && {
        description:
          typeof description === "string" && description.trim()
            ? description.trim()
            : null,
      }),

      ...(price !== undefined && {
        price: Number(price),
      }),

      ...(unit !== undefined && {
        unit: String(unit).trim(),
      }),

      ...(sortOrder !== undefined && {
        sortOrder: Number(sortOrder),
      }),

      ...(isActive !== undefined && {
        isActive: Boolean(isActive),
      }),
    };

    if (data.price !== undefined) {
      if (
        !Number.isFinite(data.price) ||
        data.price < 0
      ) {
        return res.status(400).json({
          success: false,
          message: "Price must be a valid non-negative number.",
        });
      }
    }

    const item = await prisma.menuItem.update({
      where: {
        id,
      },

      data,
    });

    return res.json({
      success: true,
      message: "Menu item updated successfully.",
      item,
    });
  } catch (error) {
    console.error("Update menu item error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while updating the menu item.",
    });
  }
});


// DELETE MENU ITEM / SERVICE
app.delete("/api/admin/menu/items/:id", requireAdmin, async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid menu item ID.",
      });
    }

    await prisma.menuItem.delete({
      where: {
        id,
      },
    });

    return res.json({
      success: true,
      message: "Menu item deleted successfully.",
    });
  } catch (error) {
    console.error("Delete menu item error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while deleting the menu item.",
    });
  }
});


// PUBLISH MENU
app.post("/api/admin/menu/publish", requireAdmin, async (req, res) => {
  try {
    const settings = await prisma.menuSettings.upsert({
      where: {
        id: 1,
      },

      create: {
        id: 1,
        publishedAt: new Date(),
      },

      update: {
        publishedAt: new Date(),
      },
    });

    return res.json({
      success: true,
      message: "Menu published successfully.",
      publishedAt: settings.publishedAt,
    });
  } catch (error) {
    console.error("Publish menu error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while publishing the menu.",
    });
  }
});
// ─────────────────────────────────────────────
// PRINTER DETECTION
// GET /api/admin/printers
// Detects printers installed in Windows.
// Supports USB, Wi-Fi and network printers.
// ─────────────────────────────────────────────

app.get("/api/admin/printers", requireAdmin, async (req, res) => {
  try {
    // This endpoint is intended for the Windows Inkory shop PC.
    if (process.platform !== "win32") {
      return res.status(400).json({
        success: false,
        message: "Printer detection is currently supported on Windows only.",
      });
    }

    const powershellScript = `
      $printers = Get-Printer | ForEach-Object {
        $printer = $_

        $port = $null

        try {
          $port = Get-PrinterPort -Name $printer.PortName -ErrorAction Stop
        } catch {
          $port = $null
        }

        [PSCustomObject]@{
          name = $printer.Name
          driverName = $printer.DriverName
          portName = $printer.PortName
          printerStatus = [string]$printer.PrinterStatus
          shared = [bool]$printer.Shared
          computerName = $printer.ComputerName
          published = [bool]$printer.Published

          protocol = if ($port) {
            [string]$port.Protocol
          } else {
            $null
          }

          printerHostAddress = if ($port) {
            [string]$port.PrinterHostAddress
          } else {
            $null
          }

          portNumber = if ($port) {
            [string]$port.PortNumber
          } else {
            $null
          }
        }
      }

      $printers | ConvertTo-Json -Depth 5
    `;

    execFile(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        powershellScript,
      ],
      {
        windowsHide: true,
        maxBuffer: 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          console.error(
            "Printer detection error:",
            error
          );

          if (stderr) {
            console.error(
              "PowerShell stderr:",
              stderr
            );
          }

          return res.status(500).json({
            success: false,
            message:
              "Unable to detect Windows printers.",
          });
        }

        try {
          const output = stdout.trim();

          if (!output) {
            return res.json({
              success: true,
              printers: [],
            });
          }

          let rawPrinters = JSON.parse(output);

          // PowerShell returns an object instead of an array
          // when only one printer exists.
          if (!Array.isArray(rawPrinters)) {
            rawPrinters = [rawPrinters];
          }

          const printers = rawPrinters.map((printer) => {
            const portName =
              printer.portName || "";

            const protocol =
              printer.protocol || "";

            const hostAddress =
              printer.printerHostAddress || "";

            const lowerPort =
              portName.toLowerCase();

            const lowerProtocol =
              protocol.toLowerCase();

            let connection = "Windows";

            // USB printers
            if (
              lowerPort.startsWith("usb") ||
              lowerPort.includes("usb")
            ) {
              connection = "USB";
            }

            // Wi-Fi / network printers
            else if (
              lowerPort.startsWith("wsd") ||
              lowerPort.startsWith("tcp") ||
              lowerPort.startsWith("ip_") ||
              lowerProtocol.includes("tcp") ||
              lowerProtocol.includes("lpr") ||
              hostAddress
            ) {
              connection = "Network";
            }

            return {
              name: printer.name || "Unknown Printer",

              model:
                printer.driverName ||
                "Unknown Model",

              connection,

              portName,

              status:
                printer.printerStatus ||
                "Unknown",

              shared:
                Boolean(printer.shared),

              computerName:
                printer.computerName || null,

              hostAddress:
                hostAddress || null,

              protocol:
                protocol || null,

              portNumber:
                printer.portNumber || null,

              published:
                Boolean(printer.published),
            };
          });

          return res.json({
            success: true,
            printers,
          });
        } catch (parseError) {
          console.error(
            "Printer detection JSON parse error:",
            parseError
          );

          console.error(
            "PowerShell output:",
            stdout
          );

          return res.status(500).json({
            success: false,
            message:
              "Windows returned an invalid printer list.",
          });
        }
      }
    );
  } catch (error) {
    console.error(
      "Printer detection route error:",
      error
    );

    return res.status(500).json({
      success: false,
      message:
        "Something went wrong while detecting printers.",
    });
  }
});
// ─────────────────────────────────────────────
// OFFICE DOCUMENT PREVIEW
// Converts Word, Excel, and PowerPoint files to PDF on demand.
// LibreOffice must be installed on the computer running this backend.
// ─────────────────────────────────────────────
app.get("/api/files/preview/:storedName", (req, res) => {
  const storedName = path.basename(req.params.storedName);
  const sourcePath = path.join(uploadsDirectory, storedName);
  if (!fs.existsSync(sourcePath)) {
    return res.status(404).json({ success: false, message: "File not found." });
  }

  const extension = path.extname(storedName).toLowerCase();
  if ([".pdf", ".jpg", ".jpeg", ".png"].includes(extension)) {
    return res.sendFile(sourcePath);
  }

  const previewDir = path.join(uploadsDirectory, ".previews");
  fs.mkdirSync(previewDir, { recursive: true });
  const outputName = `${path.basename(storedName, extension)}.pdf`;
  const outputPath = path.join(previewDir, outputName);

  const sendPreview = () => {
    if (!fs.existsSync(outputPath)) {
      return res.status(500).json({ success: false, message: "Unable to create document preview." });
    }
    res.type("application/pdf").sendFile(outputPath);
  };

  if (fs.existsSync(outputPath)) return sendPreview();
  execFile("libreoffice", ["--headless", "--convert-to", "pdf", "--outdir", previewDir, sourcePath], { timeout: 120000 }, (error) => {
    if (error) {
      console.error("Document preview conversion failed:", error);
      return res.status(500).json({ success: false, message: "This document could not be converted to a preview." });
    }
    sendPreview();
  });
});

// ─────────────────────────────────────────────
// CREATE ORDER + UPLOAD FILES
// POST /api/orders
// ─────────────────────────────────────────────

app.post("/api/orders", upload.array("files", 10), async (req, res) => {
  try {
    const {
      id,
      customer,
      phone,
      service,
      color,
      paper,
      copies,
      sides,
      estimatedAmount,
      notes,
      fileCopies,
      filePages,
      fileOptions,
    } = req.body;

    const uploadedFiles = req.files || [];
    let parsedCopies = [];
    let parsedPages = [];
    let parsedOptions = [];
    try { parsedCopies = fileCopies ? JSON.parse(fileCopies) : []; } catch { parsedCopies = []; }
    try { parsedPages = filePages ? JSON.parse(filePages) : []; } catch { parsedPages = []; }
    try { parsedOptions = fileOptions ? JSON.parse(fileOptions) : []; } catch { parsedOptions = []; }

    // ─────────────────────────────────────────
    // Validate required order information
    // ─────────────────────────────────────────

    if (
      !id ||
      !customer ||
      !service ||
      !color ||
      !paper ||
      !copies ||
      !sides ||
      estimatedAmount === undefined
    ) {
      return res.status(400).json({
        success: false,
        message: "Missing required order information.",
      });
    }

    // ─────────────────────────────────────────
    // Create order + file records
    // ─────────────────────────────────────────

    const order = await prisma.order.create({
      data: {
        id,

        customer: customer.trim(),

        phone:
          typeof phone === "string" && phone.trim()
            ? phone.trim()
            : null,

        service,
        color,
        paper,

        copies: Number(copies),

        sides,

        // Number of actual files received by Multer
        files: uploadedFiles.length,

        estimatedAmount: Number(estimatedAmount),

        status: "received",

        notes:
          typeof notes === "string" && notes.trim()
            ? notes.trim()
            : null,

        // Save information about each uploaded file
        uploadedFiles: {
          create: uploadedFiles.map((file, index) => ({
            originalName: file.originalname,
            storedName: file.filename,
            mimeType: file.mimetype,
            size: file.size,
            pages: Math.max(1, Number(parsedPages[index] || 1)),
            copies: Math.max(1, Number(parsedCopies[index] || 1)),
            color: parsedOptions[index]?.color || null,
            paper: parsedOptions[index]?.paper || null,
            sides: parsedOptions[index]?.sides || null,
            color: parsedOptions[index]?.color || null,
            paper: parsedOptions[index]?.paper || null,
            sides: parsedOptions[index]?.sides || null,
            color: parsedOptions[index]?.color || null,
            paper: parsedOptions[index]?.paper || null,
            sides: parsedOptions[index]?.sides || null,
            color: parsedOptions[index]?.color || null,
            paper: parsedOptions[index]?.paper || null,
            sides: parsedOptions[index]?.sides || null,
          })),
        },
      },

      include: {
        uploadedFiles: true,
      },
    });

    console.log(
      `New order created: ${order.id} (${uploadedFiles.length} file(s))`
    );

    return res.status(201).json({
      success: true,
      message: "Order created successfully.",
      order,
    });
  } catch (error) {
    console.error("Create order error:", error);

    // Duplicate order ID
    if (error.code === "P2002") {
      return res.status(409).json({
        success: false,
        message: "An order with this ID already exists.",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Something went wrong while creating the order.",
    });
  }
});

// ─────────────────────────────────────────────
// GET ALL ORDERS
// GET /api/orders
// ─────────────────────────────────────────────

app.get("/api/orders", async (req, res) => {
  try {
    const orders = await prisma.order.findMany({
      orderBy: {
        createdAt: "desc",
      },

      include: {
        uploadedFiles: true,
      },
    });

    return res.json({
      success: true,
      orders,
    });
  } catch (error) {
    console.error("Get orders error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while loading orders.",
    });
  }
});

// ─────────────────────────────────────────────
// GET ONE ORDER
// GET /api/orders/:id
// ─────────────────────────────────────────────

app.get("/api/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const order = await prisma.order.findUnique({
      where: {
        id,
      },

      include: {
        uploadedFiles: true,
      },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    return res.json({
      success: true,
      order,
    });
  } catch (error) {
    console.error("Get order error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while loading the order.",
    });
  }
});

// ─────────────────────────────────────────────
// ADD EDITED FILE TO ORDER
// POST /api/orders/:id/edited-files
// ─────────────────────────────────────────────

app.post("/api/orders/:id/edited-files", upload.single("file"), async (req, res) => {
  try {
    const { id } = req.params;

    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "No file uploaded.",
      });
    }

    const existingOrder = await prisma.order.findUnique({
      where: { id },
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    const newFile = await prisma.orderFile.create({
      data: {
        orderId: id,
        originalName: req.file.originalname,
        storedName: req.file.filename,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });

    // Update order file count
    await prisma.order.update({
      where: { id },
      data: { files: { increment: 1 } },
    });

    return res.status(201).json({
      success: true,
      message: "Edited file saved successfully.",
      file: newFile,
    });
  } catch (error) {
    console.error("Error adding edited file:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error while saving edited file.",
    });
  }
});

// ─────────────────────────────────────────────
// CREATE / UPDATE DEBT FOR AN ONLINE ORDER
// POST /api/orders/:id/debt
//
// Used by the admin when a website customer collects
// the printed order without paying the full amount.
//
// Example:
// {
//   "amountPaid": 0,
//   "notes": "Customer will pay later"
// }
//
// The order itself stays in the Orders table.
// The debt is linked to it through LedgerEntry.orderId.
// ─────────────────────────────────────────────

app.post("/api/orders/:id/debt", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { amountPaid, notes } = req.body;

    const order = await prisma.order.findUnique({
      where: { id },
    });

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    const total = Number(
      order.finalAmount ?? order.estimatedAmount
    );

    if (!Number.isFinite(total) || total <= 0) {
      return res.status(400).json({
        success: false,
        message: "Order does not have a valid amount.",
      });
    }

    const paid =
      amountPaid === undefined ||
      amountPaid === null ||
      amountPaid === ""
        ? 0
        : Number(amountPaid);

    if (!Number.isFinite(paid) || paid < 0) {
      return res.status(400).json({
        success: false,
        message: "Paid amount cannot be negative.",
      });
    }

    if (paid > total) {
      return res.status(400).json({
        success: false,
        message: "Paid amount cannot be greater than the order total.",
      });
    }

    const status =
      paid >= total
        ? "settled"
        : paid > 0
          ? "partial"
          : "due";

    const existing = await prisma.ledgerEntry.findUnique({
      where: {
        orderId: id,
      },
    });

    let entry;

    if (existing) {
      // Do not create a second debt record for the same order.
      // This replaces the current debt snapshot.
      entry = await prisma.ledgerEntry.update({
        where: {
          id: existing.id,
        },
        data: {
          customer: order.customer,
          phone: order.phone,
          totalAmount: total,
          amountPaid: paid,
          status,
          notes:
            typeof notes === "string" && notes.trim()
              ? notes.trim()
              : existing.notes,
        },
        include: {
          payments: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });
    } else {
      entry = await prisma.ledgerEntry.create({
        data: {
          orderId: order.id,
          customer: order.customer,
          phone: order.phone,
          totalAmount: total,
          amountPaid: paid,
          status,
          notes:
            typeof notes === "string" && notes.trim()
              ? notes.trim()
              : null,
          payments:
            paid > 0
              ? {
                  create: {
                    amount: paid,
                    note: "Initial payment",
                  },
                }
              : undefined,
        },
        include: {
          payments: {
            orderBy: {
              createdAt: "asc",
            },
          },
        },
      });
    }

    return res.status(existing ? 200 : 201).json({
      success: true,
      message: existing
        ? "Order debt updated successfully."
        : "Order debt added successfully.",
      entry: {
        ...entry,
        remaining: Math.max(
          0,
          entry.totalAmount - entry.amountPaid
        ),
      },
    });
  } catch (error) {
    console.error("Create order debt error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to create order debt.",
    });
  }
});


// ─────────────────────────────────────────────
// UPDATE ORDER
// PATCH /api/orders/:id
// ─────────────────────────────────────────────

app.patch("/api/orders/:id", async (req, res) => {
  try {
    const { id } = req.params;

    const {
      status,
      finalAmount,
      notes,
      cancelReason,
    } = req.body;

    // Check order exists
    const existingOrder = await prisma.order.findUnique({
      where: {
        id,
      },
    });

    if (!existingOrder) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    // ─────────────────────────────────────────
    // Validate status
    // ─────────────────────────────────────────

    const allowedStatuses = [
      "received",
      "reviewing",
      "printing",
      "ready",
      "completed",
      "cancelled",
    ];

    if (status && !allowedStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status.",
      });
    }

    // ─────────────────────────────────────────
    // Update order
    // ─────────────────────────────────────────

    const order = await prisma.order.update({
      where: {
        id,
      },

      data: {
        ...(status !== undefined && {
          status,
        }),

        ...(finalAmount !== undefined && {
          finalAmount:
            finalAmount === null || finalAmount === ""
              ? null
              : Number(finalAmount),
        }),

        ...(notes !== undefined && {
          notes:
            typeof notes === "string" && notes.trim()
              ? notes.trim()
              : null,
        }),

        ...(cancelReason !== undefined && {
          cancelReason:
            typeof cancelReason === "string" &&
            cancelReason.trim()
              ? cancelReason.trim()
              : null,
        }),
      },

      include: {
        uploadedFiles: true,
      },
    });

    return res.json({
      success: true,
      message: "Order updated successfully.",
      order,
    });
  } catch (error) {
    console.error("Update order error:", error);

    return res.status(500).json({
      success: false,
      message: "Something went wrong while updating the order.",
    });
  }
});

// ─────────────────────────────────────────────
// BULK DELETE ORDERS
// DELETE /api/orders
// ─────────────────────────────────────────────

app.delete("/api/orders", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        message: "No order IDs provided for deletion.",
      });
    }

    // 1. Fetch orders with their files first to get the storedNames
    const ordersWithFiles = await prisma.order.findMany({
      where: {
        id: { in: ids },
      },
      include: {
        uploadedFiles: true,
      },
    });

    // 2. Remove linked website-ledger records first. The Prisma relation uses
    // SetNull, so deleting the order alone would incorrectly leave an orphan
    // debt that could appear as a walk-in record in Reports.
    await prisma.ledgerEntry.deleteMany({
      where: {
        orderId: { in: ids },
      },
    });

    // 3. Delete database records (OrderFile rows cascade from Order).
    await prisma.order.deleteMany({
      where: {
        id: { in: ids },
      },
    });

    // 4. Delete physical files from uploads directory
    let deletedFilesCount = 0;
    for (const order of ordersWithFiles) {
      if (order.uploadedFiles && order.uploadedFiles.length > 0) {
        for (const file of order.uploadedFiles) {
          const filePath = path.join("uploads", file.storedName);
          try {
            if (fs.existsSync(filePath)) {
              fs.unlinkSync(filePath);
              deletedFilesCount++;
            }
          } catch (err) {
            console.error(`Failed to delete file ${filePath}:`, err);
          }
        }
      }
    }

    console.log(`Deleted ${ordersWithFiles.length} orders and ${deletedFilesCount} associated files.`);

    return res.json({
      success: true,
      message: `Successfully deleted ${ordersWithFiles.length} orders and associated files.`,
    });
  } catch (error) {
    console.error("Bulk delete error:", error);
    return res.status(500).json({
      success: false,
      message: "Something went wrong while deleting orders.",
    });
  }
});


// ─────────────────────────────────────────────
// MULTER ERROR HANDLER
// ─────────────────────────────────────────────

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message: "A file is too large. Maximum size is 25 MB per file.",
      });
    }

    if (error.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        success: false,
        message: "Maximum 10 files are allowed per order.",
      });
    }

    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }

  if (error) {
    console.error("Server error:", error);

    return res.status(400).json({
      success: false,
      message: error.message || "Something went wrong.",
    });
  }

  next();
});

// ─────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Inkory backend running on port ${PORT}`);
});
