import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Deployment module for PaymentGateway contracts
 *
 * Deploys:
 * 1. ERC2771Forwarder - Trusted forwarder for meta-transactions (or reuses existing)
 * 2. PaymentGatewayV1 - Implementation contract
 * 3. ERC1967Proxy - Proxy contract pointing to implementation
 *
 * Parameters:
 * - owner: Address of the PaymentGateway owner (default: Account #0)
 * - forwarderAddress: Optional existing ERC2771Forwarder address to reuse
 *   - If provided: Uses existing forwarder (e.g., from msq-relayer-service)
 *   - If not provided: Deploys new MSQPayForwarder
 *
 * Note: MockERC20 is deployed separately via MockERC20.ts module
 */
const PaymentGatewayModule = buildModule("PaymentGateway", (m) => {
  // Get deployment parameters
  const owner = m.getParameter("owner", m.getAccount(0));
  const forwarderAddress = m.getParameter<string>("forwarderAddress", "");

  // Deploy or reuse ERC2771Forwarder
  // Note: Ignition's getParameter returns a Future, so we can't use conditional logic directly.
  // Instead, we use contractAt when forwarderAddress is provided via parameters file.
  let forwarder;

  if (forwarderAddress) {
    // Reuse existing forwarder (e.g., from msq-relayer-service)
    forwarder = m.contractAt("ERC2771Forwarder", forwarderAddress, {
      id: "ExternalForwarder",
    });
  } else {
    // Deploy new forwarder
    forwarder = m.contract("ERC2771Forwarder", ["MSQPayForwarder"]);
  }

  // Deploy PaymentGatewayV1 implementation (with trustedForwarder in constructor)
  const implementation = m.contract("PaymentGatewayV1", [forwarder]);

  // Encode initialization data (owner only - forwarder is set in constructor)
  const initData = m.encodeFunctionCall(implementation, "initialize", [owner]);

  // Deploy ERC1967Proxy
  const proxy = m.contract("ERC1967Proxy", [implementation, initData], {
    id: "PaymentGatewayProxy",
  });

  return {
    forwarder,
    implementation,
    proxy,
  };
});

export default PaymentGatewayModule;
