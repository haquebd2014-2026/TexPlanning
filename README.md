# TexPlanning ERP - Unified Textile Planning System

A comprehensive, production-grade textile manufacturing ERP engine designed to consolidate **Knitting**, **Dyeing**, and **Delivery** tracking into a single synchronized database structure and single-screen production dashboard.

---

## Architecture Overview

```
TexPlanning/
├── controllers/
│   ├── orderController.js      # Pagination, multi-field filtering, atomic plan updates
│   └── uploadController.js     # Excel/CSV parser (xlsx), memory buffer & bulkWrite upserts
├── middleware/
│   └── auth.js                 # JWT verification, Admin check, and Buyer-level scoping
├── models/
│   ├── UnifiedOrder.js         # Unified document schema (knitting, dyeing, delivery)
│   └── User.js                 # Bcrypt hashing (salt 10), select: false, comparePassword
├── public/
│   ├── index.html              # Responsive single-screen dashboard & Excel dropzone
│   ├── styles.css              # Sticky multi-tier headers, color-coded stage badges
│   └── app.js                  # JWT management, inline PUT editing, real-time balances
├── routes/
│   ├── auth.js                 # Midnight-expiring JWT login, protected user administration
│   ├── orders.js               # Secured order retrieval, inline editing, Excel upload
│   └── upload.js               # File storage, protected download & confirmed clear-all
├── scripts/
│   └── seed.js                 # Database seeder (Admin & Planner users, sample orders)
├── .env.example                # Environment configuration template
├── docker-compose.yml          # Containerized MongoDB + Node.js backend
├── Dockerfile                  # Production Alpine Dockerfile
├── package.json                # Express, Mongoose, Multer, XLSX, BcryptJS, JWT
├── sample_planning_data.csv    # Representative production planning template
└── server.js                   # Application bootstrap & static frontend serving
```

---

## Quick Start Guide

### 1. Prerequisites
- **Node.js**: v18+ or v20+ LTS
- **MongoDB**: v6.0+ or v7.0+ (running locally on `mongodb://127.0.0.1:27017/texplanning` or via Docker)

### 2. Local Installation

```bash
# 1. Clone or navigate to the project directory
cd TexPlanning

# 2. Configure environment
cp .env.example .env

# 3. Install dependencies
npm install

# 4. Seed the database with initial users and sample orders
npm run seed

# 5. Start the application
npm start
```
The server and unified frontend dashboard will be available at: **`http://localhost:5000`**

---

### 3. Docker Deployment

To launch the full system including MongoDB in containers:

```bash
# Start MongoDB and TexPlanning backend
docker compose up -d --build

# Run database seed inside container (first time setup)
docker compose exec texplanning-app node scripts/seed.js
```

Access the application in your browser at `http://localhost:5000`.

---

## Seeded User Credentials

| Username | Password | Role | Allowed Buyers Scope |
| :--- | :--- | :--- | :--- |
| **`admin`** | `AdminPassword123!` | `Admin` | Full Unrestricted Access |
| **`planner`** | `PlannerPassword123!` | `User` | Restricted to: `H&M`, `Zara`, `Next` |

---

## Spreadsheet / CSV Import Format

The importer (`/api/orders/upload-excel`) processes multi-sheet workbooks (`.xlsx`, `.xls`) as well as `.csv` files buffered directly into memory. 

A pre-built sample file is included at [`sample_planning_data.csv`](sample_planning_data.csv) with the following standard columns:

| Column Header | Target Field | Description |
| :--- | :--- | :--- |
| **Order No** | `orderNo` | Unique PO / Order number (required) |
| **Buyer** | `buyer` | Brand / Buyer name (scoped by user permissions) |
| **Style** | `style` | Garment style number / name |
| **Item** | `fabricConstruction` | Fabric construction (e.g. Single Jersey, 1x1 Rib) |
| **Order Qty** | `totalOrderQty` | Total ordered pieces or fabric kilograms |
| **Yarn Count** | `fabricNotes` | Yarn details (e.g. 26s Combed Cotton) |
| **Knit Qty** | `knitQty` | Total knitted fabric quantity (Kg) |
| **Knit Status** | `knittingPlan.status` | `Pending`, `In Progress`, `Completed` |
| **Color** | `color` | Fabric shade name |
| **Dye Qty** | `dyeQty` | Total dyed fabric quantity (Kg) |
| **Dye Status** | `dyeingPlan.status` | `Pending`, `In Progress`, `Completed` |
| **Ex-Factory Date**| `lastShipDate` | Final target delivery / shipping date |
| **Delivery Qty** | `deliveredQty` | Delivered fabric quantity (Kg) |
| **Delivery Status**| `overallStatus` | Overall order execution status |

---

## Key Security Features

1. **Password Hashing**: Bcrypt salt factor 10 pre-save hook on the User model. Password is never selected by default (`select: false`).
2. **Midnight JWT Expiry**: Tokens automatically expire at the next upcoming midnight (12:00:00 AM) to align with daily production shift handovers.
3. **Buyer Scoping**: Non-admin users are strictly restricted to orders matching their `allowedBuyers` array.
4. **Administrative Confirmation**: Critical destructive actions (such as `DELETE /api/upload/clear-all-planning`) require Bearer token + Admin role + manual `adminPassword` confirmation.
5. **Path Traversal Defense**: File downloads sanitize filenames with `path.basename`.
