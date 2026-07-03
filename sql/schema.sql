CREATE TABLE IF NOT EXISTS locations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(191) NOT NULL,
  external_robot_id VARCHAR(191) NULL,
  name VARCHAR(191) NOT NULL,
  zone VARCHAR(191) NULL,
  details VARCHAR(255) NULL,
  floor_label VARCHAR(100) NULL,
  description TEXT NULL,
  robot_can_navigate TINYINT(1) NOT NULL DEFAULT 0,
  is_currently_available TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  source ENUM('manual', 'robot', 'mixed') NOT NULL DEFAULT 'manual',
  last_seen_by_robot_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_locations_slug (slug),
  UNIQUE KEY uniq_locations_external_robot_id (external_robot_id)
);

CREATE TABLE IF NOT EXISTS location_aliases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  location_id BIGINT UNSIGNED NOT NULL,
  alias VARCHAR(191) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_location_alias (location_id, alias),
  CONSTRAINT fk_location_aliases_location
    FOREIGN KEY (location_id) REFERENCES locations(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS location_translations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  location_id BIGINT UNSIGNED NOT NULL,
  language_code VARCHAR(10) NOT NULL,
  name VARCHAR(191) NULL,
  zone VARCHAR(191) NULL,
  details VARCHAR(255) NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_location_translation (location_id, language_code),
  CONSTRAINT fk_location_translations_location
    FOREIGN KEY (location_id) REFERENCES locations(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  category VARCHAR(191) NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_items_slug (slug)
);

CREATE TABLE IF NOT EXISTS item_aliases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  item_id BIGINT UNSIGNED NOT NULL,
  alias VARCHAR(191) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_item_alias (item_id, alias),
  CONSTRAINT fk_item_aliases_item
    FOREIGN KEY (item_id) REFERENCES items(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS item_translations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  item_id BIGINT UNSIGNED NOT NULL,
  language_code VARCHAR(10) NOT NULL,
  name VARCHAR(191) NULL,
  category VARCHAR(191) NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_item_translation (item_id, language_code),
  CONSTRAINT fk_item_translations_item
    FOREIGN KEY (item_id) REFERENCES items(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS location_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  location_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  priority INT NOT NULL DEFAULT 100,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  notes VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_location_item (location_id, item_id),
  KEY idx_location_items_item (item_id),
  CONSTRAINT fk_location_items_location
    FOREIGN KEY (location_id) REFERENCES locations(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_location_items_item
    FOREIGN KEY (item_id) REFERENCES items(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS store_information (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(191) NOT NULL,
  title VARCHAR(191) NOT NULL,
  kind ENUM('general', 'hours', 'phone', 'email', 'event', 'service', 'policy') NOT NULL DEFAULT 'general',
  value_text TEXT NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  starts_at DATETIME NULL,
  ends_at DATETIME NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_store_information_slug (slug),
  KEY idx_store_information_kind (kind, is_active)
);

CREATE TABLE IF NOT EXISTS store_information_translations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  store_information_id BIGINT UNSIGNED NOT NULL,
  language_code VARCHAR(10) NOT NULL,
  title VARCHAR(191) NULL,
  value_text TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_store_information_translation (store_information_id, language_code),
  CONSTRAINT fk_store_information_translations_store_information
    FOREIGN KEY (store_information_id) REFERENCES store_information(id)
    ON DELETE CASCADE
);
