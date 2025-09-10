const DashboardMetric = require('./base');

class KmsRotationMetric extends DashboardMetric {
    constructor() {
        super({
            id: 'kms-rotation',
            title: 'KMS Key Rotation',
            description: 'KMS keys with automatic rotation enabled',
            category: 'security',
            order: 4,
            colorScheme: 'success'
        });
    }

    async calculate(req, year, month, day) {
        const kmsCollection = req.collection("kms_keys");
        
        const kmsCursor = await kmsCollection.find({
            year: year,
            month: month,
            day: day
        });
        
        let totalKeys = 0;
        let rotationEnabledKeys = 0;
        
        for await (const doc of kmsCursor) {
            // Only count customer-managed keys (not AWS managed)
            const keyUsage = doc.Configuration?.KeyUsage;
            const keyManager = doc.Configuration?.KeyManager;
            
            if (keyUsage === 'ENCRYPT_DECRYPT' && keyManager === 'CUSTOMER') {
                totalKeys++;
                
                // Check if key rotation is enabled
                const rotationEnabled = doc.Configuration?.KeyRotationEnabled;
                if (rotationEnabled === true) {
                    rotationEnabledKeys++;
                }
            }
        }
        
        return totalKeys === 0 ? 0 : Math.round((rotationEnabledKeys / totalKeys) * 100);
    }
}

module.exports = KmsRotationMetric;