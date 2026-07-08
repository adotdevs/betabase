require('dotenv').config({ path: require('path').join(__dirname, '../config/config.env') });
const VapiIntegration = require('../voip/vapiIntegration');

/**
 * Setup SIP Trunk for Vapi Integration
 * 
 * This script will:
 * 1. Create a SIP trunk credential in Vapi
 * 2. Create a phone number linked to the SIP trunk
 * 3. Display the IDs to add to your config.env
 * 
 * Usage:
 *   node BE/scripts/setupSipTrunk.js
 * 
 * Prerequisites:
 * - Set SIP_TRUNK_ENABLED=true in config.env
 * - Configure SIP_TRUNK_GATEWAY, SIP_TRUNK_USERNAME, SIP_TRUNK_PASSWORD
 * - Configure SIP_TRUNK_PHONE_NUMBER (your DID from PBX provider)
 * - Ensure your PBX allows Vapi IPs: 44.229.228.186/32 and 44.238.177.138/32
 */
async function setupSipTrunk() {
    console.log('🚀 Setting up SIP trunk for Vapi integration...\n');
    
    // Check if SIP trunk is enabled
    if (process.env.SIP_TRUNK_ENABLED !== 'true') {
        console.error('❌ SIP trunk is not enabled.');
        console.log('   Set SIP_TRUNK_ENABLED=true in config.env\n');
        process.exit(1);
    }
    
    // Check required configuration
    const required = [
        'SIP_TRUNK_GATEWAY',
        'SIP_TRUNK_USERNAME',
        'SIP_TRUNK_PASSWORD'
    ];
    
    const missing = required.filter(key => !process.env[key]);
    if (missing.length > 0) {
        console.error('❌ Missing required configuration:');
        missing.forEach(key => console.error(`   - ${key}`));
        console.log('\nPlease configure these in config.env\n');
        process.exit(1);
    }
    
    // Phone number is optional if dynamic numbers are enabled
    const isDynamicNumbers = process.env.SIP_TRUNK_DYNAMIC_NUMBERS === 'true';
    if (!process.env.SIP_TRUNK_PHONE_NUMBER && !isDynamicNumbers) {
        console.warn('⚠️ SIP_TRUNK_PHONE_NUMBER not set');
        console.log('   If your numbers are dynamic/changing, set SIP_TRUNK_DYNAMIC_NUMBERS=true');
        console.log('   Otherwise, set SIP_TRUNK_PHONE_NUMBER to your DID\n');
    }
    
    const vapi = new VapiIntegration();
    
    try {
        // Clean gateway format for display
        let gateway = process.env.SIP_TRUNK_GATEWAY || '';
        gateway = gateway.replace(/^https?:\/\//, '');
        gateway = gateway.replace(/^[^@]+@/, '');
        
        const isDynamicNumbers = process.env.SIP_TRUNK_DYNAMIC_NUMBERS === 'true';
        const phoneNumber = process.env.SIP_TRUNK_PHONE_NUMBER || (isDynamicNumbers ? 'Not set (PBX will set caller ID dynamically)' : 'Not set');
        
        console.log('📋 Configuration:');
        console.log(`   Gateway: ${gateway}`);
        console.log(`   Username: ${process.env.SIP_TRUNK_USERNAME}`);
        console.log(`   ⚠️  NOTE: Vapi will send auth username as "${process.env.SIP_TRUNK_USERNAME}@<vapi-domain>" in SIP messages`);
        console.log(`   ⚠️  If your PBX expects just "${process.env.SIP_TRUNK_USERNAME}", configure IP-based auth (no registration)`);
        if (isDynamicNumbers) {
            console.log(`   Phone Number: ${phoneNumber}`);
            console.log(`   ⚠️ Dynamic Numbers: Enabled (PBX sets caller ID per call)`);
            console.log(`   ℹ️  Phone number resource uses placeholder +15551234567 (PBX overrides it)`);
        } else {
            console.log(`   Phone Number: ${phoneNumber}`);
        }
        console.log(`   Inbound Enabled: ${process.env.SIP_TRUNK_INBOUND_ENABLED === 'true'}`);
        console.log(`   Outbound Leading Plus: ${process.env.SIP_TRUNK_OUTBOUND_LEADING_PLUS !== 'false'}\n`);
        
        const config = await vapi.initializeSipTrunk();
        
        if (config) {
            console.log('\n✅ SIP trunk setup complete!\n');
            console.log('📋 Add these to your config.env:\n');
            console.log(`SIP_TRUNK_CREDENTIAL_ID=${config.credentialId}`);
            if (config.phoneNumberId) {
                console.log(`SIP_TRUNK_PHONE_NUMBER_ID=${config.phoneNumberId}`);
            }
            console.log('\n⚠️ Important:');
            console.log('   1. Ensure your PBX allows Vapi IPs for IP-based authentication:');
            console.log('      - 44.229.228.186/32');
            console.log('      - 44.238.177.138/32');
            console.log('   2. Username Format Issue:');
            console.log(`      - Vapi sends: "${process.env.SIP_TRUNK_USERNAME}@<vapi-domain>"`);
            console.log(`      - If PBX expects: "${process.env.SIP_TRUNK_USERNAME}"`);
            console.log('      → Configure IP-based auth (no registration required) in your PBX');
            console.log('   3. For inbound calls, configure your PBX to forward to:');
            console.log(`      {phoneNumber}@${config.credentialId}.sip.vapi.ai`);
            if (config.isDynamicNumbers) {
                console.log('   4. Dynamic numbers enabled - caller ID will be set by your PBX per call');
                console.log('   5. Placeholder number +15551234567 will appear in Vapi dashboard (not used for calls)');
                console.log('   6. Restart your backend after updating config.env\n');
            } else {
                console.log('   4. Restart your backend after updating config.env\n');
            }
        } else {
            console.log('ℹ️ SIP trunk already configured (using existing IDs)\n');
        }
    } catch (error) {
        console.error('\n❌ Setup failed:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', JSON.stringify(error.response.data, null, 2));
        }
        console.log('\n🔧 Detailed Troubleshooting:');
        console.log('\n1. PBX IP Allowlist (MUST BE DONE FIRST):');
        console.log('   Your PBX provider must allowlist these Vapi IPs BEFORE creating the credential:');
        console.log('   - 44.229.228.186/32');
        console.log('   - 44.238.177.138/32');
        console.log('   Contact your PBX provider (VoIP247) to add these IPs to allowlist.\n');
        
        console.log('2. Gateway Format:');
        console.log(`   Current: ${process.env.SIP_TRUNK_GATEWAY}`);
        console.log('   Should be: Domain (e.g., cop.voip247.cloud) or IP address');
        console.log('   ❌ NOT: https://user@domain.com');
        console.log('   ✅ CORRECT: domain.com or 192.168.1.1\n');
        
        console.log('3. SIP Credentials:');
        console.log(`   Username: ${process.env.SIP_TRUNK_USERNAME}`);
        console.log(`   Password: ${process.env.SIP_TRUNK_PASSWORD ? '***' + process.env.SIP_TRUNK_PASSWORD.slice(-4) : 'NOT SET'}`);
        console.log('   Verify these match your PBX provider settings.');
        console.log(`   ⚠️  NOTE: Vapi will send auth username as "${process.env.SIP_TRUNK_USERNAME}@<vapi-domain>"`);
        console.log(`   ⚠️  If PBX expects just "${process.env.SIP_TRUNK_USERNAME}", configure IP-based auth (no registration)\n`);
        
        console.log('4. Network Connectivity:');
        console.log('   - Ensure gateway is accessible from internet');
        console.log('   - Check SIP port (usually 5060) is open');
        console.log('   - Verify firewall allows SIP traffic\n');
        
        console.log('5. Next Steps:');
        console.log('   a) Contact VoIP247 support to allowlist Vapi IPs');
        console.log('   b) Verify SIP trunk is active in VoIP247 dashboard');
        console.log('   c) Confirm gateway address is correct');
        console.log('   d) Try again after IPs are allowlisted\n');
        
        process.exit(1);
    }
}

// Run setup
setupSipTrunk();

