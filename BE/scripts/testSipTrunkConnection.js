require('dotenv').config({ path: require('path').join(__dirname, '../config/config.env') });
const dns = require('dns').promises;
const net = require('net');

/**
 * Test SIP Trunk Connection
 * 
 * This script helps diagnose SIP trunk connection issues by:
 * 1. Resolving gateway domain to IP
 * 2. Testing port connectivity
 * 3. Verifying DNS resolution
 */
async function testSipTrunkConnection() {
    console.log('🔍 Testing SIP Trunk Connection...\n');
    
    const gateway = process.env.SIP_TRUNK_GATEWAY;
    const username = process.env.SIP_TRUNK_USERNAME;
    const port = 5060; // Standard SIP port
    
    if (!gateway) {
        console.error('❌ SIP_TRUNK_GATEWAY not configured');
        process.exit(1);
    }
    
    console.log('📋 Configuration:');
    console.log(`   Gateway: ${gateway}`);
    console.log(`   Username: ${username || 'Not set'}`);
    console.log(`   SIP Port: ${port}\n`);
    
    // Test 1: DNS Resolution
    console.log('1️⃣ Testing DNS Resolution...');
    try {
        const addresses = await dns.resolve4(gateway);
        console.log(`   ✅ DNS resolved successfully`);
        console.log(`   IP Address(es): ${addresses.join(', ')}`);
        
        // Test connectivity to first IP
        if (addresses.length > 0) {
            const ip = addresses[0];
            console.log(`\n2️⃣ Testing Port Connectivity to ${ip}:${port}...`);
            
            await new Promise((resolve, reject) => {
                const socket = new net.Socket();
                const timeout = 5000;
                
                socket.setTimeout(timeout);
                
                socket.on('connect', () => {
                    console.log(`   ✅ Port ${port} is OPEN and accessible`);
                    socket.destroy();
                    resolve();
                });
                
                socket.on('timeout', () => {
                    console.log(`   ⚠️ Connection timeout (port may be filtered or closed)`);
                    socket.destroy();
                    reject(new Error('Connection timeout'));
                });
                
                socket.on('error', (err) => {
                    if (err.code === 'ECONNREFUSED') {
                        console.log(`   ⚠️ Connection refused (port is closed or service not running)`);
                    } else if (err.code === 'EHOSTUNREACH') {
                        console.log(`   ⚠️ Host unreachable (network issue)`);
                    } else {
                        console.log(`   ⚠️ Connection error: ${err.message}`);
                    }
                    reject(err);
                });
                
                socket.connect(port, ip);
            }).catch(() => {
                // Error already logged
            });
        }
    } catch (error) {
        console.log(`   ❌ DNS resolution failed: ${error.message}`);
        console.log(`   This could mean:`);
        console.log(`   - Domain name is incorrect`);
        console.log(`   - DNS server issues`);
        console.log(`   - Domain doesn't exist\n`);
    }
    
    // Test 2: Vapi IPs
    console.log(`\n3️⃣ Vapi IP Requirements:`);
    console.log(`   Required IPs to be whitelisted in VoIP247:`);
    console.log(`   - 44.229.228.186/32`);
    console.log(`   - 44.238.177.138/32`);
    console.log(`   ⚠️ These must be whitelisted BEFORE Vapi can validate the trunk\n`);
    
    // Test 3: Credentials
    console.log(`4️⃣ Credentials Check:`);
    if (username && process.env.SIP_TRUNK_PASSWORD) {
        console.log(`   ✅ Username: ${username}`);
        console.log(`   ✅ Password: Set (${process.env.SIP_TRUNK_PASSWORD.length} characters)`);
    } else {
        console.log(`   ❌ Missing username or password`);
    }
    
    console.log(`\n📝 Next Steps:`);
    console.log(`   1. Verify VoIP247 has whitelisted Vapi IPs`);
    console.log(`   2. Confirm trunk is active in VoIP247 dashboard`);
    console.log(`   3. Try using IP address instead of domain (if DNS resolved)`);
    console.log(`   4. Contact VoIP247 support if issues persist\n`);
}

testSipTrunkConnection().catch(console.error);






