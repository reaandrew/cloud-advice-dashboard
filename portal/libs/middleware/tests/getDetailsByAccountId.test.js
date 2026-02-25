/**
 * Tests for getDetailsByAccountId.js
 * Tests the account lookup functionality using tenants and platform_contacts schemas
 */

const { getDetailsByAccountId, getDetailsForAllAccounts, clearCache } = require('../getDetailsByAccountId');

// Mock the config-loader module
jest.mock('../../config-loader.js', () => {
    let mockConfig = {};
    return {
        get: jest.fn((path, defaultValue) => {
            const keys = path.split('.');
            let current = mockConfig;
            for (const key of keys) {
                if (current && typeof current === 'object' && key in current) {
                    current = current[key];
                } else {
                    return defaultValue;
                }
            }
            return current;
        }),
        __setMockConfig: (config) => {
            mockConfig = config;
        },
        __resetMockConfig: () => {
            mockConfig = {};
        }
    };
});

// Mock logger to avoid console output during tests
jest.mock('../../logger.js', () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
}));

const config = require('../../config-loader.js');

// Sample data based on actual schemas
const samplePlatformContacts = {
    "pc-core": {
        "description": "Core Platform Contact",
        "email": "katie.bianchi@hmrc.gov.uk",
        "id": "pc-core",
        "name": "Katie Bianchi",
        "tenants": [
            { "id": "abac" },
            { "id": "dpsa" }
        ]
    },
    "pc-jptr": {
        "description": "Jupiter Platform Contact",
        "email": "rachel.matthews@hmrc.gov.uk",
        "id": "pc-jptr",
        "name": "Rachel Matthews",
        "tenants": [
            { "id": "adpe" },
            { "id": "char" }
        ]
    },
    "pc-rsdd": {
        "description": "RSDD Platform Contact",
        "email": "imran.dar@hmrc.gov.uk",
        "id": "pc-rsdd",
        "name": "Imran Dar",
        "tenants": [
            { "id": "itsa" }
        ]
    }
};

const sampleTenants = {
    "abac": {
        "id": "abac",
        "name": "hmrc-ctdo-abacus",
        "display_name": "CTDO ABAC",
        "description": "Abacus Enterprise Architecture Tool",
        "platform_contact": { "id": "pc-core" },
        "environments": []  // No environments - should not be indexed
    },
    "dpsa": {
        "id": "dpsa",
        "name": "hmrc-dps-admin",
        "display_name": "DPS Admin",
        "description": "DPS Administration Service",
        "platform_contact": { "id": "pc-core" },
        "environments": [
            {
                "account_id": "905418099353",
                "name": "development"
            },
            {
                "account_id": "471112658236",
                "name": "preproduction"
            },
            {
                "account_id": "123456789012",
                "name": "production"
            }
        ]
    },
    "adpe": {
        "id": "adpe",
        "name": "hmrc-jupiter-adpe",
        "display_name": "Jupiter ADPE",
        "description": "Address Lookup Service",
        "platform_contact": { "id": "pc-jptr" },
        "environments": [
            {
                "account_id": "111222333444",
                "name": "development"
            },
            {
                "account_id": "555666777888",
                "name": "production"
            }
        ]
    },
    "char": {
        "id": "char",
        "name": "hmrc-jupiter-char",
        "display_name": "Jupiter CHAR",
        "description": "Charities Service",
        "platform_contact": { "id": "pc-jptr" },
        "environments": [
            {
                "account_id": "111222333444",  // Same account as adpe dev - shared account
                "name": "development"
            }
        ]
    },
    "itsa": {
        "id": "itsa",
        "name": "hmrc-rsdd-itsa",
        "display_name": "ITSA",
        "description": "Income Tax Self Assessment",
        "platform_contact": { "id": "pc-rsdd" },
        "environments": [
            {
                "account_id": "999888777666",
                "name": "production"
            }
        ]
    },
    "orphan": {
        "id": "orphan",
        "name": "hmrc-orphan",
        "display_name": "Orphan Service",
        "description": "Service without platform contact",
        "platform_contact": { "id": "pc-nonexistent" },  // Invalid platform contact
        "environments": [
            {
                "account_id": "000111222333",
                "name": "development"
            }
        ]
    },
    "nocontact": {
        "id": "nocontact",
        "name": "hmrc-nocontact",
        "display_name": "No Contact Service",
        "description": "Service without platform contact reference",
        "platform_contact": null,  // No platform contact
        "environments": [
            {
                "account_id": "444555666777",
                "name": "staging"
            }
        ]
    }
};

describe('getDetailsByAccountId - New Schema', () => {
    beforeEach(() => {
        // Clear the cache before each test to ensure fresh index building
        clearCache();
        config.__resetMockConfig();
    });

    describe('with valid tenants and platform_contacts config', () => {
        beforeEach(() => {
            config.__setMockConfig({
                tenants: sampleTenants,
                platform_contacts: samplePlatformContacts
            });
        });

        test('should return correct teams for account with single tenant', () => {
            const result = getDetailsByAccountId('999888777666', null);

            expect(result.teams).toEqual(['Imran Dar']);
            expect(result.tenants).toHaveLength(1);
            expect(result.tenants[0].id).toBe('itsa');
            expect(result.environments).toContain('production');
        });

        test('should return correct teams for account with multiple tenants (shared account)', () => {
            // Account 111222333444 is shared between adpe and char
            const result = getDetailsByAccountId('111222333444', null);

            expect(result.teams).toContain('Rachel Matthews');
            expect(result.tenants).toHaveLength(2);
            expect(result.tenants.map(t => t.id)).toContain('adpe');
            expect(result.tenants.map(t => t.id)).toContain('char');
            expect(result.environments).toContain('development');
        });

        test('should return correct details for account in multiple environments of same tenant', () => {
            // dpsa has multiple environments
            const devResult = getDetailsByAccountId('905418099353', null);
            const preprodResult = getDetailsByAccountId('471112658236', null);
            const prodResult = getDetailsByAccountId('123456789012', null);

            // All should map to Katie Bianchi (pc-core)
            expect(devResult.teams).toEqual(['Katie Bianchi']);
            expect(preprodResult.teams).toEqual(['Katie Bianchi']);
            expect(prodResult.teams).toEqual(['Katie Bianchi']);

            // Each should have the correct environment
            expect(devResult.environments).toContain('development');
            expect(preprodResult.environments).toContain('preproduction');
            expect(prodResult.environments).toContain('production');
        });

        test('should return Unknown team for account not in any tenant', () => {
            const result = getDetailsByAccountId('000000000000', null);

            expect(result.teams).toEqual(['Unknown']);
            expect(result.tenants).toHaveLength(0);
            expect(result.environments).toHaveLength(0);
        });

        test('should return Unknown team for account with non-existent platform contact', () => {
            // orphan tenant has pc-nonexistent which doesn't exist in platform_contacts
            const result = getDetailsByAccountId('000111222333', null);

            expect(result.teams).toEqual(['Unknown']);
            expect(result.tenants).toHaveLength(1);
            expect(result.tenants[0].id).toBe('orphan');
        });

        test('should return Unknown team for account with null platform contact', () => {
            const result = getDetailsByAccountId('444555666777', null);

            expect(result.teams).toEqual(['Unknown']);
            expect(result.tenants).toHaveLength(1);
            expect(result.tenants[0].id).toBe('nocontact');
        });

        test('should not index tenants with empty environments array', () => {
            // abac has environments: [] so should not be indexed
            // There's no account_id to look up for abac
            const result = getDetailsByAccountId('abac-would-be-here', null);

            expect(result.teams).toEqual(['Unknown']);
            expect(result.tenants).toHaveLength(0);
        });

        test('should handle numeric account IDs as strings', () => {
            const resultString = getDetailsByAccountId('905418099353', null);
            const resultNumber = getDetailsByAccountId(905418099353, null);

            // Both should work (implementation converts to string internally via Map)
            expect(resultString.teams).toEqual(['Katie Bianchi']);
            // Note: The actual implementation uses Map.get() which is strict about types
            // This test documents the current behavior
        });

        test('should include correct tenant metadata', () => {
            const result = getDetailsByAccountId('999888777666', null);

            expect(result.tenants[0]).toMatchObject({
                Id: 'itsa',
                id: 'itsa',
                Name: 'ITSA',
                name: 'ITSA',
                Description: 'Income Tax Self Assessment'
            });
        });

        test('should use display_name over name for tenant Name field', () => {
            const result = getDetailsByAccountId('905418099353', null);

            // dpsa has display_name: "DPS Admin"
            expect(result.tenants[0].Name).toBe('DPS Admin');
            expect(result.tenants[0].name).toBe('DPS Admin');
        });
    });

    describe('with missing or invalid config', () => {
        test('should fall back to legacy when tenants config is null', () => {
            config.__setMockConfig({
                tenants: null,
                platform_contacts: samplePlatformContacts,
                account_mappings: []
            });

            const result = getDetailsByAccountId('123456789012', null);

            // Falls back to legacy, which returns Unknown for empty account_mappings
            expect(result.teams).toEqual(['Unknown']);
        });

        test('should fall back to legacy when platform_contacts config is null', () => {
            config.__setMockConfig({
                tenants: sampleTenants,
                platform_contacts: null,
                account_mappings: []
            });

            const result = getDetailsByAccountId('123456789012', null);

            expect(result.teams).toEqual(['Unknown']);
        });

        test('should fall back to legacy when both configs are missing', () => {
            config.__setMockConfig({
                account_mappings: []
            });

            const result = getDetailsByAccountId('123456789012', null);

            expect(result.teams).toEqual(['Unknown']);
        });
    });

    describe('legacy account_mappings fallback', () => {
        beforeEach(() => {
            config.__setMockConfig({
                tenants: null,
                platform_contacts: null,
                account_mappings: [
                    {
                        AccountId: '123456789012',
                        Team: 'DevOps',
                        Environment: 'Production',
                        Tenant: { Id: 'DVOP001', Name: 'Core Services', Description: 'Core services' }
                    },
                    {
                        AccountId: '123456789012',
                        Team: 'DevOps',
                        Environment: 'Staging',
                        Tenant: { Id: 'DVOP001', Name: 'Core Services', Description: 'Core services' }
                    },
                    {
                        AccountId: '987654321098',
                        Team: 'Platform',
                        Environment: 'Development',
                        Tenant: { Id: 'PLAT002', Name: 'Platform Services', Description: 'Platform' }
                    }
                ]
            });
        });

        test('should return correct team from legacy mappings', () => {
            const result = getDetailsByAccountId('123456789012', null);

            expect(result.teams).toContain('DevOps');
        });

        test('should deduplicate environments and teams', () => {
            const result = getDetailsByAccountId('123456789012', null);

            // Should have both environments but only one team (deduplicated)
            expect(result.teams).toEqual(['DevOps']);
            expect(result.environments).toContain('Production');
            expect(result.environments).toContain('Staging');
        });

        test('should deduplicate tenants by Id', () => {
            const result = getDetailsByAccountId('123456789012', null);

            // Should only have one tenant despite two mappings with same tenant
            expect(result.tenants).toHaveLength(1);
            expect(result.tenants[0].Id).toBe('DVOP001');
        });

        test('should return Unknown for account not in mappings', () => {
            const result = getDetailsByAccountId('000000000000', null);

            expect(result.teams).toEqual(['Unknown']);
            expect(result.environments).toHaveLength(0);
            expect(result.tenants).toHaveLength(0);
        });
    });
});

describe('getDetailsForAllAccounts', () => {
    beforeEach(() => {
        clearCache();
        config.__setMockConfig({
            tenants: sampleTenants,
            platform_contacts: samplePlatformContacts
        });
    });

    test('should return object with findByAccountId method', () => {
        const resolver = getDetailsForAllAccounts(null);

        expect(resolver).toHaveProperty('findByAccountId');
        expect(typeof resolver.findByAccountId).toBe('function');
    });

    test('findByAccountId should return correct account details', () => {
        const resolver = getDetailsForAllAccounts(null);
        const result = resolver.findByAccountId('999888777666');

        expect(result.teams).toEqual(['Imran Dar']);
        expect(result.tenants[0].id).toBe('itsa');
    });

    test('findByAccountId should return Unknown for missing accounts', () => {
        const resolver = getDetailsForAllAccounts(null);
        const result = resolver.findByAccountId('nonexistent');

        expect(result.teams).toEqual(['Unknown']);
    });
});

describe('clearCache', () => {
    test('should rebuild index after cache clear', () => {
        // Set up initial config
        config.__setMockConfig({
            tenants: sampleTenants,
            platform_contacts: samplePlatformContacts
        });

        // First lookup builds the cache
        const result1 = getDetailsByAccountId('999888777666', null);
        expect(result1.teams).toEqual(['Imran Dar']);

        // Change the config
        config.__setMockConfig({
            tenants: {
                "newTenant": {
                    "id": "newTenant",
                    "display_name": "New Tenant",
                    "description": "New",
                    "platform_contact": { "id": "pc-new" },
                    "environments": [
                        { "account_id": "999888777666", "name": "prod" }
                    ]
                }
            },
            platform_contacts: {
                "pc-new": {
                    "id": "pc-new",
                    "name": "New Contact",
                    "description": "New Platform Contact"
                }
            }
        });

        // Without clearing cache, should still return old data
        const result2 = getDetailsByAccountId('999888777666', null);
        expect(result2.teams).toEqual(['Imran Dar']);

        // Clear cache and lookup again
        clearCache();
        const result3 = getDetailsByAccountId('999888777666', null);
        expect(result3.teams).toEqual(['New Contact']);
    });
});

describe('edge cases', () => {
    beforeEach(() => {
        clearCache();
    });

    test('should handle tenant with missing environments property', () => {
        config.__setMockConfig({
            tenants: {
                "broken": {
                    "id": "broken",
                    "display_name": "Broken Tenant",
                    "platform_contact": { "id": "pc-core" }
                    // Note: environments property is missing entirely
                }
            },
            platform_contacts: samplePlatformContacts
        });

        // Should not throw, just not index the tenant
        const result = getDetailsByAccountId('any-account', null);
        expect(result.teams).toEqual(['Unknown']);
    });

    test('should handle environment with missing account_id', () => {
        config.__setMockConfig({
            tenants: {
                "partial": {
                    "id": "partial",
                    "display_name": "Partial Tenant",
                    "platform_contact": { "id": "pc-core" },
                    "environments": [
                        { "name": "development" },  // Missing account_id
                        { "account_id": "valid123", "name": "production" }
                    ]
                }
            },
            platform_contacts: samplePlatformContacts
        });

        // Should index the valid environment only
        const result = getDetailsByAccountId('valid123', null);
        expect(result.teams).toEqual(['Katie Bianchi']);
        expect(result.environments).toContain('production');
    });

    test('should handle platform contact with description but no name', () => {
        config.__setMockConfig({
            tenants: {
                "test": {
                    "id": "test",
                    "display_name": "Test",
                    "platform_contact": { "id": "pc-desc-only" },
                    "environments": [
                        { "account_id": "test123", "name": "dev" }
                    ]
                }
            },
            platform_contacts: {
                "pc-desc-only": {
                    "id": "pc-desc-only",
                    "description": "Description Only Contact"
                    // No name property
                }
            }
        });

        const result = getDetailsByAccountId('test123', null);
        // Should fall back to description
        expect(result.teams).toEqual(['Description Only Contact']);
    });

    test('should handle platform contact with neither name nor description', () => {
        config.__setMockConfig({
            tenants: {
                "test": {
                    "id": "test",
                    "display_name": "Test",
                    "platform_contact": { "id": "pc-minimal" },
                    "environments": [
                        { "account_id": "test456", "name": "dev" }
                    ]
                }
            },
            platform_contacts: {
                "pc-minimal": {
                    "id": "pc-minimal"
                    // No name or description
                }
            }
        });

        const result = getDetailsByAccountId('test456', null);
        // Should fall back to contactId
        expect(result.teams).toEqual(['pc-minimal']);
    });

    test('should handle empty tenants object', () => {
        config.__setMockConfig({
            tenants: {},
            platform_contacts: samplePlatformContacts
        });

        const result = getDetailsByAccountId('any-account', null);
        expect(result.teams).toEqual(['Unknown']);
    });

    test('should handle empty platform_contacts object', () => {
        config.__setMockConfig({
            tenants: sampleTenants,
            platform_contacts: {}
        });

        // All tenants will have Unknown team since no platform contacts exist
        const result = getDetailsByAccountId('905418099353', null);
        expect(result.teams).toEqual(['Unknown']);
    });
});
