/**
 * Product definitions - Server-side source of truth for pricing and payment config
 *
 * ⚠️ SECURITY: Product prices and chainId MUST be looked up server-side
 * Never trust client-provided amounts or chain selection!
 */

export interface Product {
  id: string;
  name: string;
  description: string;
  price: string; // Price in token units (e.g., "10" = 10 USDC)
  chainId: number; // Blockchain chain ID for payment (e.g., 80002 = Polygon Amoy)
  decimals: number; // Token decimals (e.g., 18 for most ERC20, 6 for USDC mainnet)
  token: string; // Payment token symbol (e.g., 'SUT', 'USDC')
  image?: string;
}

/**
 * Products catalog - Single source of truth for product info and payment config
 * This is used by:
 * - Frontend: Display only (name, description, image, price)
 * - Backend API: Price and chainId lookup (id → price, chainId)
 */
export const PRODUCTS: Product[] = [
  {
    id: "product-1",
    name: "Digital Art Pack",
    description: "Collection of 10 unique digital artworks",
    price: "10",
    chainId: 31337, // Hardhat local
    decimals: 18, // TEST token decimals
    token: "TEST", // Payment token symbol
    image: "/images/art.png",
  },
  {
    id: "product-2",
    name: "Premium Membership",
    description: "1 month access to premium features",
    price: "50",
    chainId: 31337, // Hardhat local
    decimals: 18, // TEST token decimals
    token: "TEST", // Payment token symbol
    image: "/images/membership.png",
  },
  {
    id: "product-3",
    name: "Game Credits",
    description: "1000 in-game credits for your account",
    price: "25",
    chainId: 31337, // Hardhat local
    decimals: 18, // TEST token decimals
    token: "TEST", // Payment token symbol
    image: "/images/credits.png",
  },
  {
    id: "product-4",
    name: "NFT Mint Pass",
    description: "Whitelist access to upcoming NFT drop",
    price: "100",
    chainId: 31337, // Hardhat local
    decimals: 18, // TEST token decimals
    token: "TEST", // Payment token symbol
    image: "/images/nft.png",
  },
];

/**
 * Find product by ID - Used by API route for price lookup
 * @param productId Product ID to find
 * @returns Product or undefined if not found
 */
export function getProductById(productId: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === productId);
}

/**
 * Get product price by ID - Server-side price lookup
 * @param productId Product ID
 * @returns Price string or null if product not found
 */
export function getProductPrice(productId: string): string | null {
  const product = getProductById(productId);
  return product?.price ?? null;
}
