-- MSQPay MySQL Initialization Script
-- SPEC-DB-001: Pay-Server Database Integration
-- This script runs automatically when MySQL container starts for the first time
-- Schema aligned with Prisma schema (INT AUTO_INCREMENT IDs)

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
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    network_id INT NOT NULL UNIQUE COMMENT 'EIP-155 chain ID',
    name VARCHAR(255) NOT NULL,
    rpc_url VARCHAR(500) NOT NULL,
    gateway_address VARCHAR(42) NULL COMMENT 'PaymentGateway proxy address',
    forwarder_address VARCHAR(42) NULL COMMENT 'ERC2771Forwarder address',
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
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    chain_id INT NOT NULL COMMENT 'Logical reference to chains.id',
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
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
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
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    merchant_id INT NOT NULL COMMENT 'Logical reference to merchants.id',
    token_id INT NOT NULL COMMENT 'Logical reference to tokens.id',
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
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    payment_hash VARCHAR(66) NOT NULL UNIQUE COMMENT 'Keccak256 hash (bytes32)',
    merchant_id INT NOT NULL COMMENT 'Logical reference to merchants.id',
    payment_method_id INT NOT NULL COMMENT 'Logical reference to merchant_payment_methods.id',
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
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    relay_ref VARCHAR(255) NOT NULL UNIQUE COMMENT 'Unique relay reference',
    payment_id INT NOT NULL COMMENT 'Logical reference to payments.id',
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
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    payment_id INT NOT NULL COMMENT 'Logical reference to payments.id',
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

-- Chains (7 networks)
-- id=1: Localhost (Hardhat/Anvil) - with deployed contracts
-- id=2: Sepolia (Ethereum Testnet) - no contracts yet
-- id=3: Amoy (Polygon Testnet) - with deployed contracts
-- id=4: BNB Chain Testnet - no contracts yet
-- id=5: Polygon (Mainnet) - no contracts yet
-- id=6: Ethereum (Mainnet) - no contracts yet
-- id=7: BNB Chain (Mainnet) - no contracts yet
-- Deployment order: MockERC20 → Forwarder → GatewayV1 → Proxy
INSERT INTO chains (network_id, name, rpc_url, gateway_address, forwarder_address, is_testnet) VALUES
(31337, 'Localhost', 'http://hardhat:8545', '0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9', '0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512', TRUE),
(11155111, 'Sepolia', 'https://ethereum-sepolia-rpc.publicnode.com', NULL, NULL, TRUE),
(80002, 'Amoy', 'https://rpc-amoy.polygon.technology', '0x2256bedB57869AF4fadF16e1ebD534A7d47513d7', '0x0d9A0fAf9a8101368aa01B88442B38f82180520E', TRUE),
(97, 'BNB Chain Testnet', 'https://data-seed-prebsc-1-s1.binance.org:8545', NULL, NULL, TRUE),
(137, 'Polygon', 'https://polygon-rpc.com', NULL, NULL, FALSE),
(1, 'Ethereum', 'https://eth.llamarpc.com', NULL, NULL, FALSE),
(56, 'BNB Chain', 'https://bsc-dataseed.binance.org', NULL, NULL, FALSE);

-- Tokens (3 tokens)
-- id=1: TEST on Localhost (chain_id=1) - MockERC20 is first deployed contract
-- id=2: SUT on Polygon (chain_id=5)
-- id=3: SUT on Amoy (chain_id=3)
INSERT INTO tokens (chain_id, address, symbol, decimals) VALUES
(1, '0x5FbDB2315678afecb367f032d93F642f64180aa3', 'TEST', 18),
(5, '0x98965474EcBeC2F532F1f780ee37b0b05F77Ca55', 'SUT', 18),
(3, '0xE4C687167705Abf55d709395f92e254bdF5825a2', 'SUT', 18);

-- Demo Merchant (id=1)
-- API Key: sk_test_demo123456 -> SHA-256 hash
INSERT INTO merchants (merchant_key, name, api_key_hash, webhook_url) VALUES
('merchant_demo_001', 'Demo Store', 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', 'https://webhook.site/demo');

-- Demo Payment Methods
-- id=1: Demo Merchant + TEST on Localhost (token_id=1)
-- id=2: Demo Merchant + SUT on Amoy (token_id=3)
INSERT INTO merchant_payment_methods (merchant_id, token_id, recipient_address) VALUES
(1, 1, '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'),
(1, 3, '0x31d45F29071e73836F67ec9dFf53e8af67A74f39');

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
