# Inkory

### Print-shop management, simplified.

Inkory is a QR-based digital print-shop management system. It helps customers upload documents, choose print settings, and track orders while giving shop operators one focused workspace for orders, printing, payments, reports, debts, and storage.

Inkory is currently being developed and tested as a real print-shop workflow before a wider public release.
<img width="1080" height="1623" alt="inkory-project-overview (1)" src="https://github.com/user-attachments/assets/e8dbdc1a-3906-440e-ac30-7bf832de35e9" />


## Project goals

Small print shops often manage files, print instructions, payments, and outstanding balances through messaging apps, notebooks, and disconnected tools. Inkory brings these daily operations into one connected workflow.

The system is designed to make the process easier for both sides:

- Customers can submit files without waiting at the counter.
- Operators receive complete print instructions with each order.
- Orders move through a clear status workflow.
- Payments and outstanding balances remain connected to order history.
- Uploaded files can be managed with automatic storage cleanup.

## Current features

### Customer portal

- Document-printing and passport-photo service selection
- Upload support for PDF, Office documents, and images
- Automatic document page counting where supported
- Individual copy selection for each uploaded file
- File previews during print-option selection
- Order submission with customer contact details
- Live order-status tracking
- Customer-friendly order confirmation

### Admin workspace

- Administrator login
- Live order refresh
- Order filtering and search
- Separate passport and document views
- Order-status management
- Uploaded-file preview, download, and browser print actions
- Per-file page and copy information
- Reports and debt ledger in one workspace
- Website-linked customer balances
- Manual walk-in debt records
- Safe order deletion and ledger cleanup
- Storage usage dashboard
- Persistent automatic-cleanup toggle
- Automatic removal of old customer files while preserving order history

### Order workflow

```text
Received → Reviewing → Printing → Ready → Completed
```

Cancelled orders are excluded from active business reports.

## Technology stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Lucide Icons
- PDF.js
- JSZip
- PDF-Lib
- html2canvas

### Backend

- Node.js
- Express
- Prisma 7
- MariaDB/MySQL
- Multer
- JWT authentication
- bcrypt
- CORS

## Repository structure

```text
inkory-print-shop/
├── backend/
│   ├── index.js
│   ├── package.json
│   ├── prisma.config.ts
│   ├── seed.js
│   └── prisma/
│       ├── schema.prisma
│       └── migrations/
├── src/
│   ├── App.tsx
│   ├── AdminDashboard.tsx
│   ├── CustomerPortal.tsx
│   ├── FileEditorWorkspace.tsx
│   ├── MenuManager.tsx
│   ├── MergedEditorScreen.tsx
│   ├── index.css
│   ├── main.tsx
│   ├── tokens.ts
│   ├── ui.tsx
│   └── imports/
├── docs/
│   └── screenshots/
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
├── .gitignore
└── README.md
```

## Local development setup

### Requirements

Install the following before running Inkory:

- Node.js 20 or newer
- npm
- MariaDB or MySQL
- Git

### Clone the repository

```bash
git clone https://github.com/moosamubasir/inkory-print-shop.git
cd inkory-print-shop
```

### Install frontend dependencies

```bash
npm install
```

### Install backend dependencies

```bash
cd backend
npm install
cd ..
```

### Configure the database

Create a local MariaDB/MySQL database for Inkory, then create a file named:

```text
backend/.env
```

Example configuration:

```env
DATABASE_URL="mysql://USER:PASSWORD@localhost:3306/inkory_store"
ADMIN_SEED_PASSWORD="change-this-local-password"
JWT_SECRET="replace-with-a-long-random-local-secret"
PORT=5000
```

Never commit `backend/.env`. Use a separate `.env.example` file for safe documentation.

### Generate Prisma client and apply the schema

```bash
cd backend
npx prisma generate
npx prisma db push
cd ..
```

Use formal Prisma migrations once the database schema is stable.

### Start the backend

```bash
cd backend
npm run dev
```

### Start the frontend

Open a second terminal in the project root:

```bash
npm run dev
```

Vite will print the local development URL in the terminal.

## Environment and security

The following files and folders must remain local:

```text
backend/.env
node_modules/
dist/
backend/uploads/
backend/storage/
*.sql
customer documents
customer images
```

Do not commit:

- Database passwords
- JWT secrets
- Admin passwords
- API keys
- Customer names and phone numbers in demo screenshots
- Uploaded customer documents
- Database dumps

If a secret is ever committed, rotate it immediately. Removing it from the newest file does not remove it from Git history.

## Product and shop naming

Inkory is the current product and application brand. The long-term plan is to make the shop identity configurable so that multiple print shops can use Inkory without changing the product identity.

## Project status

Inkory is an active development project. The current version is a working print-shop management system under continued testing and improvement.

## Screenshots

Project screenshots are stored in [`docs/screenshots/`](docs/screenshots/).

The recommended screenshot set is:

1. Customer portal home
2. Service selection
3. File upload
4. Per-file print options
5. Live order tracking
6. Admin orders
7. Order details and print actions
8. Reports
9. Debt ledger
10. Storage dashboard
11. Settings and pricing
12. Inkory loading screen

Screenshots should use demo information only.

## Author

Built by Moosa Mubasir as the foundation for Inkory, a print-shop operations platform.

---

**Inkory — Print-shop management, simplified.**
