/**
 * Script to check Vapi webhook payload and structured outputs for a specific call
 * 
 * Usage:
 *   node scripts/checkVapiWebhook.js <vapiCallId>
 * 
 * Example:
 *   node scripts/checkVapiWebhook.js 019bb8ff-96ca-7331-b068-6d2c356645e1
 */

require('dotenv').config({ path: './config/config.env' });
const mongoose = require('mongoose');
const getCallModel = require('../crmDB/models/callModel');
const connectCRMDatabase = require('../config/crmDatabase');
const VapiIntegration = require('../voip/vapiIntegration');

const VAPI_CALL_ID = process.argv[2] || '019bb8ff-96ca-7331-b068-6d2c356645e1';

async function checkFromDatabase() {
  try {
    await connectCRMDatabase();
    const Call = await getCallModel();
    
    console.log(`\n🔍 Searching for call: ${VAPI_CALL_ID}\n`);
    
    const call = await Call.findOne({
      $or: [
        { sessionId: VAPI_CALL_ID },
        { 'metadata.vapiCallId': VAPI_CALL_ID }
      ]
    }).lean();
    
    if (!call) {
      console.log('❌ Call not found in database');
      return null;
    }
    
    console.log('✅ Call found in database');
    console.log(`   MongoDB ID: ${call._id}`);
    console.log(`   Status: ${call.status}`);
    console.log(`   Phone: ${call.phoneNumber}`);
    console.log(`   Session ID: ${call.sessionId}`);
    
    // Check webhook payload
    const webhook = call.metadata?.vapiWebhookPayload;
    if (!webhook) {
      console.log('\n⚠️ No webhook payload stored in metadata');
      return call;
    }
    
    console.log('\n=== WEBHOOK PAYLOAD STRUCTURE ===');
    console.log('Webhook keys:', Object.keys(webhook));
    
    // Extract artifact
    const artifact = webhook.message?.artifact || 
                     webhook.artifact || 
                     webhook.message?.call?.artifact ||
                     null;
    
    if (artifact) {
      console.log('\n=== ARTIFACT FOUND ===');
      console.log('Artifact keys:', Object.keys(artifact));
      
      // Check for structured outputs
      const structuredOutputs = artifact.structuredOutputs || 
                                artifact.structured_outputs ||
                                artifact.structuredOutput ||
                                null;
      
      if (structuredOutputs) {
        console.log('\n✅ STRUCTURED OUTPUTS FOUND ===');
        console.log(JSON.stringify(structuredOutputs, null, 2));
        
        // Check for nested properties
        if (typeof structuredOutputs === 'object') {
          console.log('\n=== STRUCTURED OUTPUTS DETAILS ===');
          for (const [key, value] of Object.entries(structuredOutputs)) {
            console.log(`\nKey: ${key}`);
            if (value && typeof value === 'object') {
              console.log('  Properties:', Object.keys(value));
              if (value.compliancePlan) {
                console.log('  ✅ compliancePlan found:', JSON.stringify(value.compliancePlan, null, 2));
              }
            }
          }
        }
      } else {
        console.log('\n⚠️ No structuredOutputs found in artifact');
        console.log('Checking other possible locations...');
        
        // Check message level
        if (webhook.message?.structuredOutputs) {
          console.log('✅ Found at webhook.message.structuredOutputs');
          console.log(JSON.stringify(webhook.message.structuredOutputs, null, 2));
        }
        
        // Check call level
        if (webhook.message?.call?.structuredOutputs) {
          console.log('✅ Found at webhook.message.call.structuredOutputs');
          console.log(JSON.stringify(webhook.message.call.structuredOutputs, null, 2));
        }
      }
      
      // Show full artifact for debugging
      console.log('\n=== FULL ARTIFACT (for debugging) ===');
      console.log(JSON.stringify(artifact, null, 2));
    } else {
      console.log('\n⚠️ No artifact found in webhook');
      console.log('Full webhook structure:');
      console.log(JSON.stringify(webhook, null, 2));
    }
    
    return call;
  } catch (error) {
    console.error('❌ Database error:', error.message);
    return null;
  }
}

async function checkFromVapiAPI() {
  try {
    console.log('\n=== CHECKING FROM VAPI API ===\n');
    
    const vapi = new VapiIntegration();
    const callDetails = await vapi.getCallStatus(VAPI_CALL_ID);
    
    console.log('✅ Call details retrieved from Vapi API');
    console.log(`   Status: ${callDetails.status || callDetails.state}`);
    console.log(`   Ended Reason: ${callDetails.endedReason || 'N/A'}`);
    
    // Check for structured outputs in API response
    if (callDetails.artifact) {
      console.log('\n=== ARTIFACT FROM API ===');
      console.log('Artifact keys:', Object.keys(callDetails.artifact));
      
      const structuredOutputs = callDetails.artifact.structuredOutputs || 
                                callDetails.artifact.structured_outputs;
      
      if (structuredOutputs) {
        console.log('\n✅ STRUCTURED OUTPUTS FROM API ===');
        console.log(JSON.stringify(structuredOutputs, null, 2));
      } else {
        console.log('\n⚠️ No structuredOutputs in API response artifact');
        console.log('Full artifact:', JSON.stringify(callDetails.artifact, null, 2));
      }
    } else {
      console.log('\n⚠️ No artifact in API response');
      console.log('Available keys:', Object.keys(callDetails));
    }
    
    return callDetails;
  } catch (error) {
    console.error('❌ Vapi API error:', error.message);
    if (error.response) {
      console.error('   Status:', error.response.status);
      console.error('   Data:', JSON.stringify(error.response.data, null, 2));
    }
    return null;
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('VAPI WEBHOOK CHECKER');
  console.log('='.repeat(60));
  
  // Check from database first
  const dbCall = await checkFromDatabase();
  
  // Then check from Vapi API
  const apiCall = await checkFromVapiAPI();
  
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  
  if (dbCall) {
    console.log('✅ Call found in database');
  } else {
    console.log('❌ Call NOT found in database');
  }
  
  if (apiCall) {
    console.log('✅ Call found in Vapi API');
  } else {
    console.log('❌ Call NOT found in Vapi API (or API error)');
  }
  
  console.log('\n💡 TIP: Structured outputs are typically in:');
  console.log('   - message.artifact.structuredOutputs (webhook)');
  console.log('   - artifact.structuredOutputs (Vapi API)');
  
  process.exit(0);
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
