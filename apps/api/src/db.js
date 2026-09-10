// Shared Prisma client (Postgres / Supabase). Import { prisma } wherever the database is needed —
// one instance keeps the connection pool healthy. This is the foundation the store swap builds on;
// the in-memory store (store.js / customer-store.js) is still the live path until each domain moves.
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();
