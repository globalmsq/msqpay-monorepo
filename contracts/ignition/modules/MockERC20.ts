import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deployment module for MockERC20 test token
 *
 * This module is used ONLY for local Hardhat development.
 * Deploys MockERC20 token contract for testing payments.
 *
 * Note: Separated from PaymentGateway module because Ignition's
 * m.getParameter() returns Future objects, not actual values,
 * making conditional deployment (if chainId === 31337) impossible.
 */
const MockERC20Module = buildModule("MockERC20", (m) => {
  const mockToken = m.contract("MockERC20", ["Test Token", "TEST", 18]);
  return { mockToken };
});

export default MockERC20Module;
