/**
 * Script to configure Vapi webhook URL programmatically
 * 
 * Usage:
 *   node BE/scripts/configureVapiWebhook.js
 * 
 * Or set environment variables:
 *   VAPI_API_KEY=your_key
 *   VAPI_ASSISTANT_ID=your_assistant_id
 *   VAPI_WEBHOOK_URL=https://api.betabase.pro/api/v1/webhooks/vapi
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../config/config.env') });
const VapiIntegration = require('../voip/vapiIntegration');

async function configureWebhook() {
    try {
        console.log('\n' + '='.repeat(60));
        console.log('🔗 VAPI WEBHOOK CONFIGURATION');
        console.log('='.repeat(60) + '\n');
        
        // Get webhook URL from env or prompt
        const webhookUrl = process.env.VAPI_WEBHOOK_URL || process.argv[2];
        
        if (!webhookUrl) {
            console.error('❌ Error: Webhook URL is required');
            console.log('\nUsage:');
            console.log('  node BE/scripts/configureVapiWebhook.js <webhook_url>');
            console.log('\nOr set VAPI_WEBHOOK_URL in config.env:');
            console.log('  VAPI_WEBHOOK_URL=https://api.betabase.pro/api/v1/webhooks/vapi');
            process.exit(1);
        }
        
        console.log(`📡 Webhook URL: ${webhookUrl}\n`);
        
        // Initialize Vapi integration
        const vapi = new VapiIntegration();
        
        if (!vapi.apiKey) {
            console.error('❌ Error: VAPI_API_KEY not set in config.env');
            process.exit(1);
        }
        
        // Get or create assistant
        console.log('📋 Getting assistant...');
        const assistantId = await vapi.createOrGetAssistant();
        console.log(`✅ Assistant ID: ${assistantId}\n`);
        
        // Configure webhook
        console.log('🔗 Configuring webhook...');
        await vapi.configureWebhook(assistantId, webhookUrl);
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ WEBHOOK CONFIGURED SUCCESSFULLY');
        console.log('='.repeat(60));
        console.log(`\nAssistant ID: ${assistantId}`);
        console.log(`Webhook URL: ${webhookUrl}`);
        console.log('\nVapi will now send webhook events to this URL:');
        console.log('  - call.started');
        console.log('  - call.connected');
        console.log('  - call.ended (contains endedReason, duration, transcript)');
        console.log('  - call.failed');
        console.log('  - conversation.updated');
        console.log('\n✅ Done!\n');
        
    } catch (error) {
        console.error('\n❌ Error configuring webhook:', error.message);
        if (error.response) {
            console.error('   Status:', error.response.status);
            console.error('   Data:', JSON.stringify(error.response.data, null, 2));
        }
        process.exit(1);
    }
}

// Run if called directly
if (require.main === module) {
    configureWebhook();
}

module.exports = configureWebhook;
