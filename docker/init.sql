-- MSQPay MySQL Initialization Script
-- SPEC-DB-001: Pay-Server Database Integration
-- This script runs automatically when MySQL container starts for the first time

-- Create database if not exists
CREATE DATABASE IF NOT EXISTS msqpay CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE msqpay;

-- ============================================================
-- ENUMS (MySQL doesn't have native enums, use ENUM type)
-- ============================================================

-- PaymentStatus: CREATED, PENDING, CONFIRMED, FAILED, EXPIRED
-- RelayStatus: QUEUED, SUBMITTED, CONFIRMED, FAILED
-- EventType: CREATED, STATUS_CHANGED, RELAY_SUBMITTED, RELAY_CONFIRMED, EXPIRED

-- ============================================================
-- TABLE 1: chains - Blockchain networks
-- ============================================================
CREATE TABLE IF NOT EXISTS chains (
    id VARCHAR(30) NOT NULL PRIMARY KEY COMMENT 'CUID primary key',
    network_id INT NOT NULL UNIQUE COMMENT 'EIP-155 chain ID',
    name VARCHAR(255) NOT NULL,
    rpc_url VARCHAR(500) NOT NULL,
    is_testnet BOOLEAN NOT NULL DEFAULT FALSE,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_network_id (network_id),
    INDEX idx_is_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE 2: tokens - ERC20 tokens per chain
-- ============================================================
CREATE TABLE IF NOT EXISTS tokens (
    id VARCHAR(30) NOT NULL PRIMARY KEY COMMENT 'CUID primary key',
    chain_id VARCHAR(30) NOT NULL COMMENT 'Logical reference to chains.id',
    address VARCHAR(42) NOT NULL COMMENT 'ERC20 contract address',
    symbol VARCHAR(20) NOT NULL,
    decimals INT NOT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_chain_address (chain_id, address),
    INDEX idx_chain_id (chain_id),
    INDEX idx_symbol (symbol)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE 3: merchants - Merchant accounts
-- ============================================================
CREATE TABLE IF NOT EXISTS merchants (
    id VARCHAR(30) NOT NULL PRIMARY KEY COMMENT 'CUID primary key',
    merchant_key VARCHAR(255) NOT NULL UNIQUE COMMENT 'Public merchant identifier',
    name VARCHAR(255) NOT NULL,
    api_key_hash VARCHAR(64) NOT NULL COMMENT 'SHA-256 hash of API key',
    webhook_url VARCHAR(500) NULL DEFAULT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_merchant_key (merchant_key),
    INDEX idx_is_enabled (is_enabled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE 4: merchant_payment_methods - Payment settings per merchant
-- ============================================================
CREATE TABLE IF NOT EXISTS merchant_payment_methods (
    id VARCHAR(30) NOT NULL PRIMARY KEY COMMENT 'CUID primary key',
    merchant_id VARCHAR(30) NOT NULL COMMENT 'Logical reference to merchants.id',
    token_id VARCHAR(30) NOT NULL COMMENT 'Logical reference to tokens.id',
    recipient_address VARCHAR(42) NOT NULL COMMENT 'Payment recipient address',
    is_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
    deleted_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_merchant_token (merchant_id, token_id),
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_token_id (token_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE 5: payments - Payment records
-- ============================================================
CREATE TABLE IF NOT EXISTS payments (
    id VARCHAR(30) NOT NULL PRIMARY KEY COMMENT 'CUID primary key',
    payment_hash VARCHAR(66) NOT NULL UNIQUE COMMENT 'Keccak256 hash (bytes32)',
    merchant_id VARCHAR(30) NOT NULL COMMENT 'Logical reference to merchants.id',
    payment_method_id VARCHAR(30) NOT NULL COMMENT 'Logical reference to merchant_payment_methods.id',
    amount DECIMAL(65,0) NOT NULL COMMENT 'Payment amount in wei',
    token_decimals INT NOT NULL COMMENT 'Snapshot of token decimals at creation',
    token_symbol VARCHAR(20) NOT NULL COMMENT 'Snapshot of token symbol at creation',
    network_id INT NOT NULL COMMENT 'Snapshot of chain network_id at creation',
    status ENUM('CREATED', 'PENDING', 'CONFIRMED', 'FAILED', 'EXPIRED') NOT NULL DEFAULT 'CREATED',
    tx_hash VARCHAR(66) NULL DEFAULT NULL COMMENT 'Transaction hash (bytes32)',
    expires_at TIMESTAMP NOT NULL,
    confirmed_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_payment_hash (payment_hash),
    INDEX idx_merchant_id (merchant_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE 6: relay_requests - Gasless relay tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS relay_requests (
    id VARCHAR(30) NOT NULL PRIMARY KEY COMMENT 'CUID primary key',
    relay_ref VARCHAR(255) NOT NULL UNIQUE COMMENT 'Unique relay reference',
    payment_id VARCHAR(30) NOT NULL COMMENT 'Logical reference to payments.id',
    status ENUM('QUEUED', 'SUBMITTED', 'CONFIRMED', 'FAILED') NOT NULL DEFAULT 'QUEUED',
    gas_estimate DECIMAL(65,0) NULL DEFAULT NULL COMMENT 'Estimated gas in wei',
    gas_used DECIMAL(65,0) NULL DEFAULT NULL COMMENT 'Actual gas used in wei',
    tx_hash VARCHAR(66) NULL DEFAULT NULL COMMENT 'Relay transaction hash',
    error_message TEXT NULL DEFAULT NULL,
    submitted_at TIMESTAMP NULL DEFAULT NULL,
    confirmed_at TIMESTAMP NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_relay_ref (relay_ref),
    INDEX idx_payment_id (payment_id),
    INDEX idx_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TABLE 7: payment_events - Audit log
-- ============================================================
CREATE TABLE IF NOT EXISTS payment_events (
    id VARCHAR(30) NOT NULL PRIMARY KEY COMMENT 'CUID primary key',
    payment_id VARCHAR(30) NOT NULL COMMENT 'Logical reference to payments.id',
    event_type ENUM('CREATED', 'STATUS_CHANGED', 'RELAY_SUBMITTED', 'RELAY_CONFIRMED', 'EXPIRED') NOT NULL,
    old_status VARCHAR(20) NULL DEFAULT NULL,
    new_status VARCHAR(20) NULL DEFAULT NULL,
    metadata JSON NULL DEFAULT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_payment_id (payment_id),
    INDEX idx_event_type (event_type),
    INDEX idx_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- DEMO DATA FOR DEVELOPMENT
-- ============================================================

-- Demo Chain: Sepolia Testnet
INSERT INTO chains (id, network_id, name, rpc_url, is_testnet) VALUES
('clsepolia00001', 11155111, 'Sepolia', 'https://rpc.sepolia.org', TRUE);

-- Demo Chain: Localhost (Anvil/Hardhat)
INSERT INTO chains (id, network_id, name, rpc_url, is_testnet) VALUES
('cllocalhost001', 31337, 'Localhost', 'http://localhost:8545', TRUE);

-- Demo Token: USDC on Sepolia
INSERT INTO tokens (id, chain_id, address, symbol, decimals) VALUES
('tkusdc_sepolia', 'clsepolia00001', '0x1c7d4b196cb0c7b01d743fbc6116a902379c7238', 'USDC', 6);

-- Demo Token: Mock USDC on Localhost
INSERT INTO tokens (id, chain_id, address, symbol, decimals) VALUES
('tkusdc_local01', 'cllocalhost001', '0x5fbdb2315678afecb367f032d93f642f64180aa3', 'USDC', 6);

-- Demo Merchant
-- API Key: sk_test_demo123456 -> SHA-256 hash
INSERT INTO merchants (id, merchant_key, name, api_key_hash, webhook_url) VALUES
('mcdemo0000001', 'merchant_demo_001', 'Demo Store', 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', 'https://webhook.site/demo');

-- Demo Payment Method (Demo Merchant + USDC on Localhost)
INSERT INTO merchant_payment_methods (id, merchant_id, token_id, recipient_address) VALUES
('pmmethod00001', 'mcdemo0000001', 'tkusdc_local01', '0x70997970c51812dc3a010c7d01b50e0d17dc79c8');

-- Show created tables
SHOW TABLES;

-- Show table row counts
SELECT 'chains' as table_name, COUNT(*) as row_count FROM chains
UNION ALL
SELECT 'tokens', COUNT(*) FROM tokens
UNION ALL
SELECT 'merchants', COUNT(*) FROM merchants
UNION ALL
SELECT 'merchant_payment_methods', COUNT(*) FROM merchant_payment_methods
UNION ALL
SELECT 'payments', COUNT(*) FROM payments
UNION ALL
SELECT 'relay_requests', COUNT(*) FROM relay_requests
UNION ALL
SELECT 'payment_events', COUNT(*) FROM payment_events;
