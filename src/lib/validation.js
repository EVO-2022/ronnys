const { z } = require('zod');

const pickupSchema = z.object({
  chemicalId: z.string().min(1, 'Chemical ID is required'),
  location: z.enum(['SHELF', 'LINE'], {
    errorMap: () => ({ message: 'Location must be SHELF or LINE' }),
  }),
  qty: z.number().min(0, 'Quantity must be greater than or equal to 0'),
  note: z.string().nullable().optional(),
});

const updateSchema = z.object({
  chemicalId: z.string().min(1, 'Chemical ID is required'),
  location: z.enum(['SHELF', 'LINE'], {
    errorMap: () => ({ message: 'Location must be SHELF or LINE' }),
  }),
  qty: z.number().min(0, 'Quantity must be greater than or equal to 0'),
  note: z.string().nullable().optional(),
});

const requestSchema = z.object({
  chemicalId: z.string().min(1, 'Chemical ID is required'),
  requestQty: z.number().min(0, 'Request quantity must be greater than or equal to 0').nullable().optional(),
  note: z.string().nullable().optional(),
});

module.exports = {
  pickupSchema,
  updateSchema,
  requestSchema,
};

