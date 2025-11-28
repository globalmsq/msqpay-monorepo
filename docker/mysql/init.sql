-- MSQPay MySQL Initialization Script
-- This script runs automatically when MySQL container starts for the first time

-- Create database if not exists (docker-compose already creates it)
CREATE DATABASE IF NOT EXISTS msqpay CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE msqpay;

-- Payments table (MVP - minimal schema)
CREATE TABLE IF NOT EXISTS payments (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    payment_id VARCHAR(66) NOT NULL UNIQUE COMMENT 'Keccak256 hash (0x...)',
    store_id VARCHAR(255) NOT NULL,
    order_id VARCHAR(255) NOT NULL,
    amount VARCHAR(78) NOT NULL COMMENT 'Wei amount as string',
    token VARCHAR(42) NOT NULL COMMENT 'ERC20 token address',
    merchant VARCHAR(42) NOT NULL COMMENT 'Merchant address',
    status ENUM('pending', 'completed', 'expired', 'failed') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TIMESTAMP NULL DEFAULT NULL,
    tx_hash VARCHAR(66) NULL DEFAULT NULL COMMENT 'Transaction hash (0x...)',
    INDEX idx_payment_id (payment_id),
    INDEX idx_store_order (store_id, order_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Store API keys table (MVP - environment variable alternative)
CREATE TABLE IF NOT EXISTS store_api_keys (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    api_key VARCHAR(255) NOT NULL UNIQUE,
    store_id VARCHAR(255) NOT NULL,
    name VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_api_key (api_key),
    INDEX idx_store_id (store_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Insert demo store API key
INSERT INTO store_api_keys (api_key, store_id, name) VALUES
('sk_test_demo123', 'store_001', 'Demo Store');

-- Gasless relay requests table (optional - for debugging)
CREATE TABLE IF NOT EXISTS relay_requests (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    payment_id VARCHAR(66) NOT NULL,
    user_address VARCHAR(42) NOT NULL,
    signature TEXT NOT NULL,
    relay_tx_hash VARCHAR(66) NULL DEFAULT NULL,
    status ENUM('pending', 'submitted', 'confirmed', 'failed') NOT NULL DEFAULT 'pending',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_payment_id (payment_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Show created tables
SHOW TABLES;
