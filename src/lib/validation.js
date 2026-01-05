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

const maintenanceTaskSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  urgent: z.boolean().optional().default(false),
  note: z.string().nullable().optional(),
});

const repairLogSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  date: z.coerce.date(),
  cost: z.number().min(0).nullable().optional(),
  note: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
});

const partsReceivedSchema = z.object({
  description: z.string().min(1, 'Description is required'),
  quantity: z.number().min(0).nullable().optional(),
  unit: z.string().nullable().optional(),
  date: z.coerce.date(),
  cost: z.number().min(0).nullable().optional(),
  note: z.string().nullable().optional(),
  createdBy: z.string().nullable().optional(),
});

module.exports = {
  pickupSchema,
  updateSchema,
  requestSchema,
  maintenanceTaskSchema,
  repairLogSchema,
  partsReceivedSchema,
};

