# Ronny's Car Wash - Chemical Inventory System - Development Journal

## Project Overview

This is a web-based chemical inventory tracking system built for Ronny's Car Wash. It provides a mobile-first, high-contrast dark-theme interface for tracking chemical inventory across two locations: "On the Shelf" and "On the Line".

### Key Features

- **Current Inventory Dashboard**: Real-time tally of all chemicals with breakdown by gallons, boxes, barrels, and buckets
- **Pick Up Chemicals**: Add quantities to shelf inventory (whole numbers only)
- **Request Chemicals**: Create batch requests for chemicals (whole numbers only)
- **Update Inventory**: Set absolute quantities for shelf or line locations (supports partial quantities per chemical rules)
- **Request Fulfillment**: Fulfill open requests by picking up chemicals and logging them
- **Activity Log**: Track all inventory changes with detailed history
- **Google Sheets Sync**: Optional real-time synchronization with Google Sheets

## Tech Stack

- **Backend**: Node.js + Express
- **Database**: SQLite with Prisma ORM
- **Frontend**: Server-rendered EJS templates + vanilla JavaScript
- **Styling**: Plain CSS (mobile-first, dark theme)
- **Validation**: Zod for request validation
- **External Services**: Google Sheets API v4 (optional)

## Project Structure

```
ronnys/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.js                # Seed data for chemicals
├── src/
│   ├── server.js              # Express server setup
│   ├── routes/
│   │   └── index.js           # All API routes
│   ├── lib/
│   │   ├── prisma.js          # Prisma client singleton
│   │   ├── inventory.js       # Business rules (increments, validation)
│   │   ├── validation.js      # Zod schemas
│   │   └── sheets.js          # Google Sheets integration
│   ├── views/
│   │   └── index.ejs          # Main dashboard template
│   └── public/
│       ├── styles.css         # All CSS
│       └── app.js             # Client-side JavaScript
├── .env.example               # Environment variables template
└── README.md                  # Setup instructions
```

## Database Schema

### Models

#### Chemical
Stores all chemical definitions with their tracking rules.

```prisma
model Chemical {
  id             String   @id @default(cuid())
  name           String   @unique
  unit           String   // "BARREL", "BUCKET", or "BOX"
  increment      Float    // Minimum increment (0.25, 0.5, or 1.0)
  trackOnShelf   Boolean  @default(true)
  trackOnLine    Boolean  @default(false)
  gallonsPerUnit Float?   // For calculating total gallons
  active         Boolean  @default(true)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  inventory       InventoryState?
  activityLogs    ActivityLog[]
}
```

#### InventoryState
Current inventory quantities for each chemical.

```prisma
model InventoryState {
  chemicalId String   @id
  shelfQty   Float    @default(0)
  lineQty    Float    @default(0)
  updatedAt  DateTime @updatedAt
  chemical   Chemical @relation(...)
}
```

#### ActivityLog
Records all inventory changes (PICKUP, UPDATE, REQUEST).

```prisma
model ActivityLog {
  id         String   @id @default(cuid())
  type       String   // "PICKUP", "UPDATE", or "REQUEST"
  chemicalId String
  location   String?  // "SHELF" or "LINE" (null for REQUEST)
  setQty     Float?   // For UPDATE
  addQty     Float?   // For PICKUP
  requestQty Float?   // For REQUEST (legacy, now tracked in RequestBatch)
  note       String?
  createdBy  String?
  createdAt  DateTime @default(now())
  chemical   Chemical @relation(...)
}
```

#### RequestBatch
Batch request for multiple chemicals.

```prisma
model RequestBatch {
  id         String        @id @default(cuid())
  status     String        @default("OPEN") // "OPEN" or "FULFILLED"
  note       String?
  createdBy  String?
  createdAt  DateTime      @default(now())
  fulfilledAt DateTime?
  items      RequestItem[]
}
```

#### RequestItem
Individual chemical within a request batch.

```prisma
model RequestItem {
  id          String   @id @default(cuid())
  batchId     String
  chemicalId  String
  requestedQty Float
  pickedUpQty  Float?  @default(0)
  batch       RequestBatch @relation(...)
  chemical    Chemical     @relation(...)
}
```

## Business Rules & Chemical Configuration

### Inventory Increment Rules

Different chemicals have different increment rules based on their unit type and specific configuration:

1. **Tire Shine**: 30 gal barrels, 0.25 increments, tracked on shelf + line
2. **Clean and Fresh Blast**: 15 gal barrels, 0.25 increments, tracked on shelf + line
3. **Clean**: boxes, whole numbers only (1.0), shelf only
4. **Glass Cleaner & RLC**: 5 gal buckets
   - Shelf: whole buckets (1.0)
   - Line: 0.25 increments
5. **5-gallon/box chemicals** (Nova, Prizm Red, Prizm Gold, Prizm Blue, Low PH Shampoo, Silk, Bubblicious, Road Rage, EZ Polish Red): 0.5 increments (half boxes), both shelf + line
6. **Air Fresheners** (Black Ice, Pina Colada, Cool Water, Berry Blast, New Car): 0.25 increments, shelf only
7. **Bottles & Bottle Triggers**: 0.25 increments, shelf only

### Operation Rules

- **Pickup**: Always adds to SHELF only, whole numbers only (1.0 increment)
- **Request**: Whole numbers only (1.0 increment), doesn't change inventory
- **Update**: Supports partial quantities per chemical rules, sets absolute quantity for a single location (SHELF or LINE)

## API Routes

### GET `/`
Renders the main dashboard with:
- Total inventory tally and subtext totals (gallons, boxes, barrels, buckets)
- Three action buttons (Pickup, Request, Update)
- Activity log (latest 50 entries)
- Inventory breakdown modal trigger
- Open request notification status

### POST `/pickup`
Adds quantities to shelf inventory.

**Payload:**
```json
{
  "pickups": {
    "<chemicalId>": { "qty": 5 },
    "<chemicalId2>": { "qty": 3 }
  },
  "note": "Optional note"
}
```

**Validation:**
- Quantities must be whole numbers (validated with `validateWholeQuantity`)
- Always adds to SHELF location
- Creates ActivityLog entries for each pickup

### POST `/request`
Creates a batch request for multiple chemicals.

**Payload:**
```json
{
  "items": [
    { "chemicalId": "...", "qty": 5 },
    { "chemicalId": "...", "qty": 3 }
  ],
  "note": "Optional note"
}
```

**Validation:**
- Quantities must be whole numbers
- Creates RequestBatch with status "OPEN"
- Creates RequestItem entries for each item
- Creates a single ActivityLog entry (type REQUEST)

### POST `/update`
Sets absolute quantities for chemicals at specific locations.

**Payload:**
```json
{
  "location": "SHELF" | "LINE",
  "updates": {
    "<chemicalId>": { "qty": 2.5 },
    "<chemicalId2>": { "qty": 1.0 }
  },
  "note": "Optional note"
}
```

**Validation:**
- Quantities must match chemical increment rules (validated with `validateQuantity`)
- Sets absolute quantity for the specified location
- Creates ActivityLog entries for each update

### GET `/requests/open`
Returns JSON for the current open request batch.

**Response:**
```json
{
  "batchId": "...",
  "createdAt": "...",
  "note": "...",
  "items": [
    {
      "chemicalId": "...",
      "chemicalName": "...",
      "requestedQty": 5,
      "increment": 1.0,
      "unit": "BOX"
    }
  ]
}
```

### POST `/requests/fulfill`
Fulfills a request batch by picking up chemicals.

**Payload:**
```json
{
  "batchId": "...",
  "pickups": [
    { "chemicalId": "...", "qty": 5 },
    { "chemicalId": "...", "qty": 3 }
  ]
}
```

**Validation:**
- Quantities must be whole numbers
- Always adds to SHELF inventory
- Updates RequestItem.pickedUpQty
- Marks RequestBatch as FULFILLED
- Creates ActivityLog entries for each pickup

### GET `/log/:id`
Returns JSON detail view for a single ActivityLog entry.

### GET `/requests/:batchId`
Returns JSON for a specific RequestBatch with all items.

## Frontend Architecture

### Main Dashboard (`src/views/index.ejs`)

Server-rendered EJS template that receives:
- `chemicals`: Array of chemicals with inventory data and business rules
- `activityLogs`: Formatted activity log entries
- `totals`: Aggregated totals (units, gallons, boxes, barrels, buckets)
- `hasOpenRequest`: Boolean indicating if there's an open request
- `openRequestBatchId`: ID of open request batch (if exists)
- `lastUpdatedFormatted`: Formatted timestamp string
- `sheetsEnabled`: Boolean for Google Sheets status

### Key UI Components

1. **Current Inventory Tally Box**: Clickable box showing total units with subtext breakdowns, opens inventory breakdown modal
2. **Pickup Requested Notification**: Glowing truck icon (when open request exists) that opens fulfill request modal
3. **Action Buttons**: Three buttons for Pickup, Request, and Update operations
4. **Activity Log**: Scrollable list of recent activity entries (clickable for details)

### Modals

All modals use a consistent structure:
- `.modal` container with backdrop
- `.modal-content` with header, body, and form
- `.modal-body` with flex layout and max-height constraints
- `.chemical-list` with scrollable content (max-height: 400px)

**Pickup Modal**: Lists all chemicals with quantity dropdowns (whole numbers only)

**Request Modal**: Lists all chemicals with quantity dropdowns (whole numbers only), note icon toggle

**Update Modal**: Tabbed interface (Shelf/Line), dynamically populates chemicals based on location support, note icon toggle

**Fulfill Request Modal**: Shows requested items + additional items, quantity dropdowns for actual pickups, note icon toggle

**Inventory Breakdown Modal**: Table showing all chemicals with shelf/line/combined quantities

**Log Detail Modal**: Shows full details of an activity log entry, including request batch details if applicable

### Client-Side JavaScript (`src/public/app.js`)

Key functions:
- `openModal(id)` / `closeModal(id)`: Modal management
- `openInventoryModal()`: Populates and opens inventory breakdown
- `openPickupModal()`: Opens pickup modal
- `openRequestModal()`: Opens request modal
- `openUpdateModal()`: Opens update modal, initializes tabs
- `switchUpdateTab(location)`: Switches between Shelf/Line tabs in update modal
- `openFulfillModal()`: Fetches open request and populates fulfill modal
- `openLogDetailModal(logId)`: Fetches and displays log details
- `toggleNoteField(noteGroupId)`: Toggles note field visibility
- `generateQuantityOptions(increment, max)`: Generates dropdown options

Form submissions use `fetch()` API with JSON payloads, then reload page on success.

## Google Sheets Integration

### Configuration

Set in `.env`:
- `GOOGLE_SHEETS_ENABLED=true`
- `GOOGLE_SHEET_ID=...`
- `GOOGLE_SERVICE_ACCOUNT_JSON_PATH=./secrets/google-service-account.json`

### Sync Behavior

On server startup (if enabled):
1. Ensures headers exist in all 3 tabs
2. Syncs all chemicals
3. Syncs all inventory state

On operations:
- After any ActivityLog creation: Appends row to `activity_log` tab
- After pickup/update: Syncs entire `inventory_state` tab

**Important**: Sheets failures are caught and logged but never break the main application flow. The database is always the source of truth.

### Sheet Structure

**chemicals** tab: All chemical definitions (id, name, unit, increment, tracking flags, etc.)

**inventory_state** tab: Current inventory (chemicalId, chemicalName, shelfQty, lineQty, combinedQty, gallonsTotal, updatedAt)

**activity_log** tab: All activity log entries (id, type, chemicalId, chemicalName, location, quantities, note, dates)

## Key Implementation Details

### Custom Chemical Ordering

Chemicals are displayed in a specific custom order (defined in `src/routes/index.js`):
1. Clean, Nova, Silk, EZ Polish Red, Low PH Shampoo, Prizm Red, Prizm Blue, Prizm Gold
2. (separator)
3. Clean and Fresh Blast, Tire Shine, Road Rage, Bubblicious, Glass Cleaner, RLC
4. (separator)
5. Air Fresheners (Black Ice, New Car, Berry Blast, Pina Colada, Cool Water)
6. (separator)
7. Bottles, Bottle Triggers

### Date Formatting

Last updated timestamp uses custom formatting:
- "Today at 7:42 AM" for today
- "Yesterday at 4:10 PM" for yesterday
- "Sep 18 at 9:03 AM" for older dates

### Validation Functions

Located in `src/lib/inventory.js`:
- `validateQuantity(chemical, location, quantity)`: Validates against chemical increment rules
- `validateWholeQuantity(chemical, location, quantity)`: Validates whole numbers only
- `getIncrementForLocation(chemical, location)`: Returns increment for a location (handles BUCKET line rule)
- `getAllowedLocations(chemical)`: Returns array of allowed locations

### Null Handling

All nullable database fields are properly handled:
- Zod schemas use `.nullable().optional()` for optional fields
- Google Sheets sync converts null/undefined to empty strings
- Frontend checks for existence before accessing values

## Development Workflow

### Setup

1. Clone repository
2. `npm install`
3. Copy `.env.example` to `.env` and configure
4. `npx prisma generate`
5. `npx prisma migrate dev --name init`
6. `npx prisma db seed`
7. `npm run dev`

### Adding a New Chemical

1. Add to `prisma/seed.js` with correct unit, increment, and tracking flags
2. Run `npx prisma db seed` (or manually insert via Prisma Studio)
3. Chemical will appear in all modals automatically

### Making Changes

- **Routes**: Modify `src/routes/index.js`
- **Business Rules**: Modify `src/lib/inventory.js`
- **Validation**: Modify `src/lib/validation.js`
- **UI**: Modify `src/views/index.ejs` and `src/public/styles.css`
- **Client Logic**: Modify `src/public/app.js`

### Database Migrations

After schema changes:
1. `npx prisma migrate dev --name <description>`
2. Test thoroughly
3. Commit migration files

## Testing Considerations

Key areas to test:
- Increment validation for all chemical types
- Location restrictions (shelf-only chemicals)
- Whole number enforcement for pickup/request
- Partial quantity support for update
- Request batch workflow (create → fulfill)
- Activity log accuracy
- Google Sheets sync (if enabled)
- Modal overflow on mobile devices
- Note field toggle functionality

## Known Design Decisions

1. **SQLite instead of Postgres**: Chosen for simplicity and portability
2. **Server-rendered instead of SPA**: Better for mobile, simpler architecture
3. **Plain CSS instead of framework**: Full control, no dependencies
4. **Vanilla JS instead of framework**: Minimal complexity, easy to maintain
5. **String enums instead of Prisma enums**: SQLite limitation workaround
6. **Google Sheets as optional sync**: Database is source of truth, Sheets is convenience

## Future Enhancement Ideas

- User authentication and createdBy tracking
- Inventory alerts/low stock warnings
- Export/import functionality
- Historical inventory reports
- Chemical expiration date tracking
- Multi-location support (beyond shelf/line)
- Barcode scanning for quick updates
- Mobile app wrapper (PWA)

## Deployment Notes

For Ubuntu server deployment:
1. Ensure Node.js 18+ is installed
2. Set up PM2 or similar process manager
3. Configure environment variables
4. Run migrations on first deploy
5. Set up Google Sheets service account (if using sync)
6. Configure reverse proxy (nginx) for production
7. Set up SSL certificate for HTTPS

## Contact & Handoff

This project was built as an MVP for Ronny's Car Wash. All code follows mobile-first, high-contrast design principles for outdoor use in bright sunlight.

For questions about implementation decisions or to continue development, refer to:
- This JOURNAL.md file
- Inline code comments
- Prisma schema for data structure
- `src/lib/inventory.js` for business rules

