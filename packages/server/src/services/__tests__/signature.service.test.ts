import { describe, it, expect, beforeEach } from 'vitest';
import { SignatureService } from '../signature.service';

describe('SignatureService', () => {
  let signatureService: SignatureService;
  const forwarderAddress = '0x1234567890123456789012345678901234567890' as const;
  const chainId = 31337;

  beforeEach(() => {
    signatureService = new SignatureService(forwarderAddress, chainId);
  });

  describe('initialization', () => {
    it('should initialize with valid config', () => {
      expect(signatureService).toBeDefined();
    });

    it('should throw error with invalid forwarder address', () => {
      expect(() => new SignatureService('invalid' as any, chainId)).toThrow();
    });

    it('should throw error with invalid chain ID', () => {
      expect(() => new SignatureService(forwarderAddress, 0)).toThrow();
    });

    it('should throw error with negative chain ID', () => {
      expect(() => new SignatureService(forwarderAddress, -1)).toThrow();
    });
  });

  describe('getDomain', () => {
    it('should return valid EIP-712 domain', () => {
      const domain = signatureService.getDomain();

      expect(domain).toBeDefined();
      expect(domain.name).toBe('MSQPay');
      expect(domain.version).toBe('1');
      expect(domain.chainId).toBe(chainId);
      expect(domain.verifyingContract).toBe(forwarderAddress);
    });

    it('should return consistent domain on multiple calls', () => {
      const domain1 = signatureService.getDomain();
      const domain2 = signatureService.getDomain();

      expect(domain1).toEqual(domain2);
    });
  });

  describe('getForwardRequestTypes', () => {
    it('should return ForwardRequest type definition', () => {
      const types = signatureService.getForwardRequestTypes();

      expect(types).toBeDefined();
      expect(types.ForwardRequest).toBeDefined();
      expect(Array.isArray(types.ForwardRequest)).toBe(true);
    });

    it('should include all required fields', () => {
      const types = signatureService.getForwardRequestTypes();
      const fieldNames = types.ForwardRequest.map((field) => field.name);

      expect(fieldNames).toContain('from');
      expect(fieldNames).toContain('to');
      expect(fieldNames).toContain('value');
      expect(fieldNames).toContain('gas');
      expect(fieldNames).toContain('nonce');
      expect(fieldNames).toContain('deadline');
      expect(fieldNames).toContain('data');
    });

    it('should have correct types for each field', () => {
      const types = signatureService.getForwardRequestTypes();
      const fieldMap = Object.fromEntries(
        types.ForwardRequest.map((field) => [field.name, field.type])
      );

      expect(fieldMap.from).toBe('address');
      expect(fieldMap.to).toBe('address');
      expect(fieldMap.value).toBe('uint256');
      expect(fieldMap.gas).toBe('uint256');
      expect(fieldMap.nonce).toBe('uint256');
      expect(fieldMap.deadline).toBe('uint256');
      expect(fieldMap.data).toBe('bytes');
    });
  });

  describe('verifySignature', () => {
    const validRequest = {
      from: '0x0000000000000000000000000000000000000001' as const,
      to: '0x0000000000000000000000000000000000000002' as const,
      value: '0',
      gas: '100000',
      nonce: '0',
      deadline: '9999999999',
      data: '0x',
    };

    it('should return false for invalid signature format', async () => {
      const result = await signatureService.verifySignature(validRequest, 'invalid');

      expect(result).toBe(false);
    });

    it('should return false for missing signature', async () => {
      const result = await signatureService.verifySignature(validRequest, '');

      expect(result).toBe(false);
    });

    it('should return false for invalid request address format', async () => {
      const invalidRequest = {
        ...validRequest,
        from: 'invalid' as any,
      };

      const signature = '0x' + 'aa'.repeat(65);
      const result = await signatureService.verifySignature(invalidRequest, signature);

      expect(result).toBe(false);
    });

    it('should return false for missing request.from', async () => {
      const invalidRequest = {
        ...validRequest,
        from: '' as any,
      };

      const signature = '0x' + 'aa'.repeat(65);
      const result = await signatureService.verifySignature(invalidRequest, signature);

      expect(result).toBe(false);
    });

    it('should return false for non-numeric nonce', async () => {
      const invalidRequest = {
        ...validRequest,
        nonce: 'invalid' as any,
      };

      const signature = '0x' + 'aa'.repeat(64) + '1b';
      const result = await signatureService.verifySignature(invalidRequest, signature);

      expect(result).toBe(false);
    });

    it('should return false for incorrect signature', async () => {
      // Use signature with valid V value (1b = 27)
      const signature = '0x' + 'aa'.repeat(64) + '1b';
      const result = await signatureService.verifySignature(validRequest, signature);

      expect(result).toBe(false);
    });
  });

  describe('recoverSignerAddress', () => {
    const validRequest = {
      from: '0x0000000000000000000000000000000000000001' as const,
      to: '0x0000000000000000000000000000000000000002' as const,
      value: '0',
      gas: '100000',
      nonce: '0',
      deadline: '9999999999',
      data: '0x',
    };

    it('should return null for invalid signature format', async () => {
      const result = await signatureService.recoverSignerAddress(validRequest, 'invalid');

      expect(result).toBeNull();
    });

    it('should return null for signature with invalid V value', async () => {
      // Use signature with invalid V value (ff is not 27 or 28)
      const signature = '0x' + 'aa'.repeat(64) + 'ff';
      const result = await signatureService.recoverSignerAddress(validRequest, signature);

      expect(result).toBeNull();
    });

    it('should return null for invalid request', async () => {
      const invalidRequest = {
        ...validRequest,
        from: 'invalid' as any,
      };

      const signature = '0x' + 'aa'.repeat(64) + '1b';
      const result = await signatureService.recoverSignerAddress(invalidRequest, signature);

      expect(result).toBeNull();
    });
  });
});
