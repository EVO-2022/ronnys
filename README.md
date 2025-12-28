# Ronny's Car Wash - Chemical Inventory System

A clean, high-contrast dark-theme web app for tracking chemical inventory at Ronny's Car Wash.

## Features

- Track chemical inventory across two locations: "On the Shelf" and "On the Line"
- Record chemical pickups (adds to inventory)
- Update absolute inventory quantities
- Request chemicals (logs requests without changing inventory)
- View current inventory totals with breakdown
- Activity log showing latest 50 entries
- Mobile-first responsive design

## Tech Stack

- Node.js + Express
- SQLite database
- Prisma ORM
- Server-rendered views with EJS
- Vanilla JavaScript for modals and forms
- Plain CSS (no frameworks)

## Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy the environment file:
   ```bash
   cp .env.example .env
   ```

4. Generate Prisma client:
   ```bash
   npm run prisma:generate
   ```

5. Create and run database migrations:
   ```bash
   npx prisma migrate dev --name init
   ```

6. Seed the database with initial chemical data:
   ```bash
   npm run prisma:seed
   ```

## Running the Application

### Development
```bash
npm run dev
```
This starts the server with nodemon for auto-reloading.

### Production
```bash
npm start
```

The application will be available at `http://localhost:3000` (or the port specified in your `.env` file).

## Available Scripts

- `npm run dev` - Start development server with nodemon
- `npm start` - Start production server
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run Prisma migrations (alias for `prisma migrate dev`)
- `npm run prisma:seed` - Seed the database

## Routes

- `GET /` - Main dashboard showing inventory totals, action buttons, and activity log
- `POST /pickup` - Record a chemical pickup (adds to inventory)
- `POST /update` - Update absolute inventory quantity for a location
- `POST /request` - Log a chemical request (does not change inventory)

## Google Sheets Sync

Google Sheets synchronization is currently stubbed and disabled by default. To enable it:

1. Set `GOOGLE_SHEETS_ENABLED=true` in your `.env` file
2. Configure the Google Sheets credentials:
   - `GOOGLE_SHEET_ID` - The ID of the Google Sheet
   - `GOOGLE_SERVICE_ACCOUNT_EMAIL` - Service account email
   - `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` - Service account private key

The sync functions will sync three tabs: `chemicals`, `inventory_state`, and `activity_log`. The implementation is currently stubbed and will need to be completed.

## Database Schema

The application uses Prisma with SQLite. The schema includes:

- **Chemical**: Defines all chemicals with units, increments, and tracking rules
- **InventoryState**: Current inventory quantities for each chemical (shelf and line)
- **ActivityLog**: Log of all inventory actions (pickup, update, request)

See `prisma/schema.prisma` for the complete schema definition.

## Deployment to Ubuntu Server

1. Push code to GitHub
2. Pull code onto Ubuntu server
3. Install Node.js and npm
4. Run installation and setup steps (install, migrate, seed)
5. Set up a process manager (PM2, systemd, etc.) to run `npm start`
6. Configure a reverse proxy (nginx) to point to the application
7. Set up SSL certificate for ronnys.app domain

## License

ISC

