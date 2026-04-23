PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS care_packages (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  sender_name TEXT,
  comment TEXT,
  upload_code_id TEXT,
  quota_mode TEXT NOT NULL,
  declared_bytes INTEGER NOT NULL,
  committed_bytes INTEGER NOT NULL DEFAULT 0,
  reserved_bytes INTEGER NOT NULL,
  file_count INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  expires_at TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  request_headers_json TEXT,
  request_cf_json TEXT,
  FOREIGN KEY (upload_code_id) REFERENCES upload_codes(id)
);

CREATE TABLE IF NOT EXISTS care_package_files (
  id TEXT PRIMARY KEY,
  care_package_id TEXT NOT NULL,
  relative_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  object_key TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  content_type TEXT,
  last_modified INTEGER,
  upload_strategy TEXT NOT NULL,
  status TEXT NOT NULL,
  upload_id TEXT,
  part_size_bytes INTEGER,
  uploaded_parts_json TEXT NOT NULL DEFAULT '[]',
  uploaded_bytes INTEGER NOT NULL DEFAULT 0,
  completed_parts INTEGER NOT NULL DEFAULT 0,
  etag TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (care_package_id) REFERENCES care_packages(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS upload_codes (
  id TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL UNIQUE,
  label TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  notes TEXT,
  bypass_public_hourly_cap INTEGER NOT NULL DEFAULT 1,
  bypass_public_package_cap INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_care_packages_status ON care_packages(status);
CREATE INDEX IF NOT EXISTS idx_care_packages_created_at ON care_packages(created_at);
CREATE INDEX IF NOT EXISTS idx_care_package_files_package_id ON care_package_files(care_package_id);
CREATE INDEX IF NOT EXISTS idx_care_package_files_status ON care_package_files(status);
CREATE INDEX IF NOT EXISTS idx_upload_codes_status_expires ON upload_codes(status, expires_at);
