const { PrismaClient } = require('@prisma/client');
const { validateQuantity, getGallonIncrement } = require('./src/lib/inventory');

const prisma = new PrismaClient();

async function test() {
  console.log('Testing fractional box inputs...\n');

  const bottles = await prisma.chemical.findUnique({ where: { name: 'Bottles' } });
  const triggers = await prisma.chemical.findUnique({ where: { name: 'Bottle Triggers' } });
  const airFreshener = await prisma.chemical.findUnique({ where: { name: 'Air Freshener - Black Ice' } });
  const cleanKit = await prisma.chemical.findUnique({ where: { name: 'Clean' } });

  console.log('1. Testing Bottles (should allow 0.25 increments):');
  console.log(`   Increment: ${bottles.increment}`);
  console.log(`   Gallon increment: ${getGallonIncrement(bottles)}`);

  const test025 = validateQuantity(bottles, 'SHELF', 0.25);
  console.log(`   0.25 boxes: ${test025.valid ? '✓ Valid' : '✗ Invalid - ' + test025.error}`);

  const test05 = validateQuantity(bottles, 'SHELF', 0.5);
  console.log(`   0.5 boxes: ${test05.valid ? '✓ Valid' : '✗ Invalid - ' + test05.error}`);

  const test075 = validateQuantity(bottles, 'SHELF', 0.75);
  console.log(`   0.75 boxes: ${test075.valid ? '✓ Valid' : '✗ Invalid - ' + test075.error}`);

  const test1 = validateQuantity(bottles, 'SHELF', 1);
  console.log(`   1 box: ${test1.valid ? '✓ Valid' : '✗ Invalid - ' + test1.error}`);

  const testInvalid = validateQuantity(bottles, 'SHELF', 0.3);
  console.log(`   0.3 boxes: ${testInvalid.valid ? '✓ Valid' : '✗ Invalid - ' + testInvalid.error}`);

  console.log('\n2. Testing Clean Kit (should only allow whole boxes):');
  console.log(`   Increment: ${cleanKit.increment}`);
  console.log(`   Gallon increment: ${getGallonIncrement(cleanKit)}`);

  const cleanTest1 = validateQuantity(cleanKit, 'SHELF', 1);
  console.log(`   1 box: ${cleanTest1.valid ? '✓ Valid' : '✗ Invalid - ' + cleanTest1.error}`);

  const cleanTestInvalid = validateQuantity(cleanKit, 'SHELF', 0.5);
  console.log(`   0.5 boxes: ${cleanTestInvalid.valid ? '✓ Valid' : '✗ Invalid - ' + cleanTestInvalid.error}`);

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
