const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'data.sqlite');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS influencers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT,
    platform TEXT NOT NULL DEFAULT 'instagram',
    category TEXT,
    profile_url TEXT,
    follower_count INTEGER NOT NULL DEFAULT 0,
    avg_likes REAL NOT NULL DEFAULT 0,
    avg_comments REAL NOT NULL DEFAULT 0,
    posts_sampled INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    last_synced_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 재고 관리: 품목(단품/세트) 및 세트 구성(BOM), 재고 변동 이력
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sku TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    category TEXT,
    is_set INTEGER NOT NULL DEFAULT 0,
    is_sellable INTEGER NOT NULL DEFAULT 1,
    unit TEXT NOT NULL DEFAULT '개',
    stock_qty INTEGER NOT NULL DEFAULT 0,
    reorder_point INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- 세트를 구성하는 하위 단품(BOM). parent_product_id 1개 판매 시 component_product_id가 quantity개씩 차감됨
  CREATE TABLE IF NOT EXISTS bom_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    component_product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(parent_product_id, component_product_id)
  );

  CREATE TABLE IF NOT EXISTS stock_movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    change_qty INTEGER NOT NULL,
    balance_after INTEGER NOT NULL,
    reason TEXT NOT NULL,
    ref_note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_bom_parent ON bom_items(parent_product_id);
  CREATE INDEX IF NOT EXISTS idx_bom_component ON bom_items(component_product_id);
  CREATE INDEX IF NOT EXISTS idx_movements_product ON stock_movements(product_id);
`);

// 이지어드민 재고 현황(공급처) 연동을 위해 나중에 추가된 컬럼. 기존 DB 파일에도 안전하게 추가.
const productColumns = db.prepare('PRAGMA table_info(products)').all().map((c) => c.name);
if (!productColumns.includes('supplier')) {
  db.exec('ALTER TABLE products ADD COLUMN supplier TEXT');
}

module.exports = db;
