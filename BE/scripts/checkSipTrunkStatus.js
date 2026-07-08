require('dotenv').config({ path: require('path').join(__dirname, '../config/config.env') });
const VapiIntegration = require('../voip/vapiIntegration');

/**
 * Check SIP Trunk Status
 * 
 * This script checks the status of your SIP trunk credential in Vapi
 * and provides information about registration/connection status.
 */
async function checkSipTrunkStatus() {
    console.log('🔍 Checking SIP Trunk Status...\n');
    
    const credentialId = process.env.SIP_TRUNK_CREDENTIAL_ID;
    
    if (!credentialId) {
        console.error('❌ SIP_TRUNK_CREDENTIAL_ID not configured');
        console.log('   Run: node BE/scripts/setupSipTrunk.js first\n');
        process.exit(1);
    }
    
    const vapi = new VapiIntegration();
    
    try {
        console.log('📋 Configuration:');
        console.log(`   Credential ID: ${credentialId}`);
        console.log(`   Gateway: ${process.env.SIP_TRUNK_GATEWAY}`);
        console.log(`   Username: ${process.env.SIP_TRUNK_USERNAME}\n`);
        
        // Get credential details
        console.log('1️⃣ Fetching credential details from Vapi...');
        const credentials = await vapi.getSipTrunkCredentials();
        
        const credential = credentials.find(c => c.id === credentialId);
        
        if (!credential) {
            console.error(`❌ Credential ${credentialId} not found in Vapi`);
            console.log(`   Found ${credentials.length} credential(s):`);
            credentials.forEach(c => {
                console.log(`   - ${c.name || c.id} (${c.id})`);
            });
            process.exit(1);
        }
        
        console.log(`✅ Credential found: ${credential.name || credentialId}`);
        console.log(`   Provider: ${credential.provider}`);
        console.log(`   Created: ${credential.createdAt || 'N/A'}`);
        
        // Check gateways
        if (credential.gateways && credential.gateways.length > 0) {
            console.log(`\n2️⃣ Gateway Configuration:`);
            credential.gateways.forEach((gw, idx) => {
                console.log(`   Gateway ${idx + 1}:`);
                console.log(`     IP: ${gw.ip || gw.domain || 'N/A'}`);
                console.log(`     Inbound: ${gw.inboundEnabled ? 'Enabled' : 'Disabled'}`);
                console.log(`     Protocol: ${gw.protocol || 'UDP'}`);
            });
        }
        
        // Check authentication
        if (credential.outboundAuthenticationPlan) {
            console.log(`\n3️⃣ Authentication:`);
            console.log(`   Username: ${credential.outboundAuthenticationPlan.authUsername || 'N/A'}`);
            console.log(`   Password: ${credential.outboundAuthenticationPlan.authPassword ? '***' + credential.outboundAuthenticationPlan.authPassword.slice(-4) : 'N/A'}`);
        }
        
        // Check for status/registration info
        console.log(`\n4️⃣ Status Information:`);
        if (credential.status) {
            console.log(`   Status: ${credential.status}`);
        } else {
            console.log(`   Status: Not available in API response`);
        }
        
        if (credential.connected !== undefined) {
            console.log(`   Connected: ${credential.connected ? 'Yes' : 'No'}`);
        } else {
            console.log(`   Connected: Not available in API response`);
        }
        
        if (credential.registered !== undefined) {
            console.log(`   Registered: ${credential.registered ? 'Yes' : 'No'}`);
        } else {
            console.log(`   Registered: Not available in API response`);
        }
        
        // Check phone numbers
        console.log(`\n5️⃣ Phone Numbers:`);
        const phoneNumbers = await vapi.getPhoneNumbers();
        const trunkPhoneNumbers = phoneNumbers.filter(pn => pn.credentialId === credentialId);
        
        if (trunkPhoneNumbers.length > 0) {
            console.log(`   Found ${trunkPhoneNumbers.length} phone number(s):`);
            trunkPhoneNumbers.forEach(pn => {
                console.log(`   - ${pn.number || 'N/A'} (${pn.id})`);
                if (pn.id === process.env.SIP_TRUNK_PHONE_NUMBER_ID) {
                    console.log(`     ✅ This is your configured phone number ID`);
                }
            });
        } else {
            console.log(`   ⚠️ No phone numbers found for this credential`);
        }
        
        // Important notes
        console.log(`\n📝 Important Notes:`);
        console.log(`   1. Vapi may not show registration status in the API`);
        console.log(`   2. Check VoIP247 dashboard to see if trunk is registered`);
        console.log(`   3. Test with Zoiper to verify credentials work`);
        console.log(`   4. If VoIP247 doesn't show registration, Vapi may not be registering`);
        console.log(`   5. Contact VoIP247 support to check registration logs\n`);
        
        // Troubleshooting
        console.log(`🔧 Troubleshooting:`);
        console.log(`   If trunk is not registered in VoIP247:`);
        console.log(`   - Vapi may not support automatic registration`);
        console.log(`   - VoIP247 may require manual registration`);
        console.log(`   - Check VoIP247 dashboard for registration status`);
        console.log(`   - Contact VoIP247 support with credential ID: ${credentialId}\n`);
        
    } catch (error) {
        console.error('\n❌ Error checking SIP trunk status:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

// Run check
checkSipTrunkStatus();






