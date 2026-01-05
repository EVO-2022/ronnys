const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Starting migration: Converting inventory from units to gallons...');

  // Get all chemicals with their inventory
  const chemicals = await prisma.chemical.findMany({
    include: {
      inventory: true,
    },
  });

  for (const chemical of chemicals) {
    if (!chemical.inventory) {
      console.log(`Skipping ${chemical.name} - no inventory record`);
      continue;
    }

    const oldShelfQty = chemical.inventory.shelfQty;
    const oldLineQty = chemical.inventory.lineQty;

    if (chemical.gallonsPerUnit) {
      // Convert units to gallons
      const newShelfQty = oldShelfQty * chemical.gallonsPerUnit;
      const newLineQty = oldLineQty * chemical.gallonsPerUnit;

      await prisma.inventoryState.update({
        where: { chemicalId: chemical.id },
        data: {
          shelfQty: newShelfQty,
          lineQty: newLineQty,
        },
      });

      console.log(`Converted ${chemical.name}:`);
      console.log(`  Shelf: ${oldShelfQty} ${chemical.unit}s → ${newShelfQty} gallons`);
      console.log(`  Line: ${oldLineQty} ${chemical.unit}s → ${newLineQty} gallons`);
    } else {
      // Clean Kit - keep as boxes (no conversion needed)
      console.log(`Kept ${chemical.name} as boxes (no conversion): ${oldShelfQty} boxes on shelf`);
    }
  }

  // Also update Clean and Fresh Blast from BARREL to BOX in the database
  console.log('\nUpdating Clean and Fresh Blast...');
  const cleanAndFreshBlast = await prisma.chemical.findUnique({
    where: { name: 'Clean and Fresh Blast' },
  });

  if (cleanAndFreshBlast) {
    if (cleanAndFreshBlast.unit === 'BARREL' && cleanAndFreshBlast.gallonsPerUnit === 15) {
      await prisma.chemical.update({
        where: { name: 'Clean and Fresh Blast' },
        data: {
          unit: 'BOX',
          increment: 1.0,
          gallonsPerUnit: 5,
        },
      });
      console.log('Updated Clean and Fresh Blast: BARREL (15 gal) → BOX (5 gal)');
    } else {
      console.log('Clean and Fresh Blast already updated or has different values');
    }
  }

  console.log('\nMigration completed successfully!');
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
