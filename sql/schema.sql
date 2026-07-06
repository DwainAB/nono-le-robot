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

CREATE TABLE IF NOT EXISTS catalogs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_catalogs_slug (slug)
);

CREATE TABLE IF NOT EXISTS catalog_aliases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  catalog_id BIGINT UNSIGNED NOT NULL,
  alias VARCHAR(191) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_catalog_alias (catalog_id, alias),
  CONSTRAINT fk_catalog_aliases_catalog
    FOREIGN KEY (catalog_id) REFERENCES catalogs(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS catalog_translations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  catalog_id BIGINT UNSIGNED NOT NULL,
  language_code VARCHAR(10) NOT NULL,
  name VARCHAR(191) NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_catalog_translation (catalog_id, language_code),
  CONSTRAINT fk_catalog_translations_catalog
    FOREIGN KEY (catalog_id) REFERENCES catalogs(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS catalog_locations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  catalog_id BIGINT UNSIGNED NOT NULL,
  location_id BIGINT UNSIGNED NOT NULL,
  priority INT NOT NULL DEFAULT 100,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  notes VARCHAR(255) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_catalog_location (catalog_id, location_id),
  KEY idx_catalog_locations_location (location_id),
  CONSTRAINT fk_catalog_locations_catalog
    FOREIGN KEY (catalog_id) REFERENCES catalogs(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_catalog_locations_location
    FOREIGN KEY (location_id) REFERENCES locations(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  slug VARCHAR(191) NOT NULL,
  name VARCHAR(191) NOT NULL,
  description TEXT NULL,
  image_url VARCHAR(1000) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  is_new TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_products_slug (slug)
);

CREATE TABLE IF NOT EXISTS product_variants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  label VARCHAR(191) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
  priority INT NOT NULL DEFAULT 100,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_product_variants_product (product_id),
  CONSTRAINT fk_product_variants_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_aliases (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  alias VARCHAR(191) NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_product_alias (product_id, alias),
  CONSTRAINT fk_product_aliases_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS product_translations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  product_id BIGINT UNSIGNED NOT NULL,
  language_code VARCHAR(10) NOT NULL,
  name VARCHAR(191) NULL,
  description TEXT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_product_translation (product_id, language_code),
  CONSTRAINT fk_product_translations_product
    FOREIGN KEY (product_id) REFERENCES products(id)
    ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS catalog_products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  catalog_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  priority INT NOT NULL DEFAULT 100,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_catalog_product (catalog_id, product_id),
  KEY idx_catalog_products_product (product_id),
  CONSTRAINT fk_catalog_products_catalog
    FOREIGN KEY (catalog_id) REFERENCES catalogs(id)
    ON DELETE CASCADE,
  CONSTRAINT fk_catalog_products_product
    FOREIGN KEY (product_id) REFERENCES products(id)
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

CREATE TABLE IF NOT EXISTS app_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY DEFAULT 1,
  killswitch_enabled TINYINT(1) NOT NULL DEFAULT 0,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT IGNORE INTO app_settings (id, killswitch_enabled) VALUES (1, 0);