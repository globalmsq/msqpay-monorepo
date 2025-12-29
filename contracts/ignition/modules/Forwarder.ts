import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

/**
 * Standalone ERC2771Forwarder deployment module
 *
 * Deploys ERC2771Forwarder as the FIRST contract (nonce 0)
 * to ensure consistent addresses across deployment modes:
 *
 * - Standalone mode: Forwarder at nonce 0 = 0x5FbDB2315678afecb367f032d93F642f64180aa3
 * - Relayer mode: msq-relayer-service also deploys Forwarder at nonce 0
 *
 * This ensures Token is always at nonce 1 = 0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512
 */
const ForwarderModule = buildModule("Forwarder", (m) => {
  // Domain name must match client (PaymentModal.tsx) and relay-api (signature-verifier.service.ts)
  const forwarder = m.contract("ERC2771Forwarder", ["MSQForwarder"]);

  return { forwarder };
});

export default ForwarderModule;
