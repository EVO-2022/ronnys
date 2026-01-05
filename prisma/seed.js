const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Tire Shine
  await prisma.chemical.upsert({
    where: { name: 'Tire Shine' },
    update: {},
    create: {
      name: 'Tire Shine',
      unit: 'BARREL',
      increment: 0.25,
      trackOnShelf: true,
      trackOnLine: true,
      gallonsPerUnit: 30,
      inventory: {
        create: {
          shelfQty: 0,
          lineQty: 0,
        },
      },
    },
  });

  // Clean and Fresh Blast
  await prisma.chemical.upsert({
    where: { name: 'Clean and Fresh Blast' },
    update: {},
    create: {
      name: 'Clean and Fresh Blast',
      unit: 'BOX',
      increment: 1.0,
      trackOnShelf: true,
      trackOnLine: true,
      gallonsPerUnit: 5,
      inventory: {
        create: {
          shelfQty: 0,
          lineQty: 0,
        },
      },
    },
  });

  // Clean
  await prisma.chemical.upsert({
    where: { name: 'Clean' },
    update: {},
    create: {
      name: 'Clean',
      unit: 'BOX',
      increment: 1.0,
      trackOnShelf: true,
      trackOnLine: false,
      gallonsPerUnit: null,
      inventory: {
        create: {
          shelfQty: 0,
          lineQty: 0,
        },
      },
    },
  });

  // Glass Cleaner
  await prisma.chemical.upsert({
    where: { name: 'Glass Cleaner' },
    update: {},
    create: {
      name: 'Glass Cleaner',
      unit: 'BUCKET',
      increment: 1.0, // Shelf uses 1.0, line uses 0.25 (handled in business logic)
      trackOnShelf: true,
      trackOnLine: true,
      gallonsPerUnit: 5,
      inventory: {
        create: {
          shelfQty: 0,
          lineQty: 0,
        },
      },
    },
  });

  // RLC
  await prisma.chemical.upsert({
    where: { name: 'RLC' },
    update: {},
    create: {
      name: 'RLC',
      unit: 'BUCKET',
      increment: 1.0, // Shelf uses 1.0, line uses 0.25 (handled in business logic)
      trackOnShelf: true,
      trackOnLine: true,
      gallonsPerUnit: 5,
      inventory: {
        create: {
          shelfQty: 0,
          lineQty: 0,
        },
      },
    },
  });

  // 5-gal/box chemicals
  const fiveGalBoxChemicals = [
    'Nova',
    'Prizm Red',
    'Prizm Gold',
    'Prizm Blue',
    'Low PH Shampoo',
    'Silk',
    'Bubblicious',
    'Road Rage',
    'EZ Polish Red',
  ];

  for (const name of fiveGalBoxChemicals) {
    await prisma.chemical.upsert({
      where: { name },
      update: {},
      create: {
        name,
        unit: 'BOX',
        increment: 0.5,
        trackOnShelf: true,
        trackOnLine: true,
        gallonsPerUnit: 5,
        inventory: {
          create: {
            shelfQty: 0,
            lineQty: 0,
          },
        },
      },
    });
  }

  // Air Fresheners
  const airFresheners = ['Black Ice', 'Pina Colada', 'Cool Water', 'Berry Blast', 'New Car'];
  for (const name of airFresheners) {
    await prisma.chemical.upsert({
      where: { name: `Air Freshener - ${name}` },
      update: {},
      create: {
        name: `Air Freshener - ${name}`,
        unit: 'BOX',
        increment: 0.25,
        trackOnShelf: true,
        trackOnLine: false,
        gallonsPerUnit: null,
        inventory: {
          create: {
            shelfQty: 0,
            lineQty: 0,
          },
        },
      },
    });
  }

  // Bottles
  await prisma.chemical.upsert({
    where: { name: 'Bottles' },
    update: {},
    create: {
      name: 'Bottles',
      unit: 'BOX',
      increment: 0.25,
      trackOnShelf: true,
      trackOnLine: false,
      gallonsPerUnit: null,
      inventory: {
        create: {
          shelfQty: 0,
          lineQty: 0,
        },
      },
    },
  });

  // Bottle Triggers
  await prisma.chemical.upsert({
    where: { name: 'Bottle Triggers' },
    update: {},
    create: {
      name: 'Bottle Triggers',
      unit: 'BOX',
      increment: 0.25,
      trackOnShelf: true,
      trackOnLine: false,
      gallonsPerUnit: null,
      inventory: {
        create: {
          shelfQty: 0,
          lineQty: 0,
        },
      },
    },
  });

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

