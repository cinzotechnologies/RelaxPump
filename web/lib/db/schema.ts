// D1 tables (docs/website-brief.md §4). SQL lives in migrations/; keep both in step.
import { integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/** One editable field of a website section. Values are JSON text. */
export const content = sqliteTable(
  'content',
  {
    section: text('section').notNull(),
    key: text('key').notNull(),
    draft: text('draft'),
    published: text('published'),
    updatedAt: integer('updated_at').notNull(),
  },
  (t) => [primaryKey({ columns: [t.section, t.key] })],
);

export const products = sqliteTable('products', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  category: text('category').notNull(), // Kits | Add-ons | Service
  price: integer('price'), // rupees, null = coming soon
  tag: text('tag').notNull().default(''),
  art: text('art').notNull().default('ctrl'), // drawing used when there is no photo
  imageKey: text('image_key'), // R2 key
  visible: integer('visible', { mode: 'boolean' }).notNull().default(true),
  featured: integer('featured', { mode: 'boolean' }).notNull().default(false),
  sort: integer('sort').notNull().default(0),
});

export const media = sqliteTable('media', {
  id: text('id').primaryKey(),
  r2Key: text('r2_key').notNull().unique(),
  name: text('name').notNull(),
  type: text('type').notNull(),
  size: integer('size').notNull(),
  usedIn: text('used_in'),
  createdAt: integer('created_at').notNull(),
});

export const orders = sqliteTable('orders', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  address: text('address').notNull(),
  town: text('town').notNull(),
  pin: text('pin').notNull(),
  payment: text('payment').notNull(), // cod | upi
  items: text('items').notNull(), // JSON [{id, name, qty, price}]
  status: text('status').notNull().default('new'),
  createdAt: integer('created_at').notNull(),
});

export const resetRequests = sqliteTable('reset_requests', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  phone: text('phone').notNull(),
  ip: text('ip'),
  createdAt: integer('created_at').notNull(),
  status: text('status').notNull().default('waiting'), // waiting | done
  handledBy: text('handled_by'),
  handledAt: integer('handled_at'),
});

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

export const auditLog = sqliteTable('audit_log', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  who: text('who').notNull(),
  action: text('action').notNull(),
  detail: text('detail'),
  at: integer('at').notNull(),
});
