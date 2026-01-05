const { PrismaClient } = require('@prisma/client');
const { convertUnitsToGallons, convertGallonsToUnits, validateQuantity, validateWholeQuantity } = require('./src/lib/inventory');

const prisma = new PrismaClient();

async function test() {
  console.log('Testing inventory tracking changes...\n');

  // Get some test chemicals
  const rlc = await prisma.chemical.findUnique({ where: { name: 'RLC' }, include: { inventory: true } });
  const cleanKit = await prisma.chemical.findUnique({ where: { name: 'Clean' }, include: { inventory: true } });
  const nova = await prisma.chemical.findUnique({ where: { name: 'Nova' }, include: { inventory: true } });

  console.log('1. Testing RLC (BUCKET, 5 gal per bucket):');
  console.log(`   Current inventory: ${rlc.inventory.shelfQty} gallons on shelf`);
  console.log(`   Converting to units: ${convertGallonsToUnits(rlc, rlc.inventory.shelfQty)} buckets`);
  console.log(`   Picking up 2 buckets converts to: ${convertUnitsToGallons(rlc, 2)} gallons`);

  console.log('\n2. Testing Clean Kit (BOX, no gallon conversion):');
  console.log(`   Current inventory: ${cleanKit.inventory.shelfQty} boxes on shelf`);
  console.log(`   Converting to units: ${convertGallonsToUnits(cleanKit, cleanKit.inventory.shelfQty)} (should be same)`);
  console.log(`   Picking up 3 boxes converts to: ${convertUnitsToGallons(cleanKit, 3)} (should be same)`);

  console.log('\n3. Testing Nova (BOX, 5 gal per box):');
  console.log(`   Current inventory: ${nova.inventory.shelfQty} gallons on shelf`);
  console.log(`   Converting to units: ${convertGallonsToUnits(nova, nova.inventory.shelfQty)} boxes`);

  console.log('\n4. Testing validation:');
  const gallonValidation = validateQuantity(rlc, 'SHELF', 25.5);
  console.log(`   25.5 gallons for RLC on SHELF: ${gallonValidation.valid ? '✓ Valid' : '✗ Invalid - ' + gallonValidation.error}`);

  const wholeValidation = validateWholeQuantity(rlc, 'SHELF', 2);
  console.log(`   2 whole buckets for RLC pickup: ${wholeValidation.valid ? '✓ Valid' : '✗ Invalid - ' + wholeValidation.error}`);

  const cleanKitValidation = validateQuantity(cleanKit, 'SHELF', 3);
  console.log(`   3 boxes for Clean Kit: ${cleanKitValidation.valid ? '✓ Valid' : '✗ Invalid - ' + cleanKitValidation.error}`);

  const cleanKitInvalidValidation = validateQuantity(cleanKit, 'SHELF', 2.5);
  console.log(`   2.5 boxes for Clean Kit: ${cleanKitInvalidValidation.valid ? '✓ Valid' : '✗ Invalid - ' + cleanKitInvalidValidation.error}`);

  console.log('\n✅ All tests completed!');
}

test()
  .catch((e) => {
    console.error('Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
