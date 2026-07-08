// Utility to convert SIP-level information into a single stable CRM status.
// Used by CallDashboard, leads.js and LeadStream so they all agree.

/**
 * @param {string} originalStatus – DB status already saved (may already be terminal)
 * @param {Array=} sipEvents       – metadata.sipEvents array (mixed objects / strings)
 * @param {Object=} sipStatus      – metadata.sipStatus object {code,message}
 * @returns {('initiating'|'ringing'|'in-progress'|'completed'|'failed'|'cancelled')}
 */
export function mapSipEventsToStatus(originalStatus, sipEvents = [], sipStatus = {}) {
  console.log('🔍 [mapSipEventsToStatus] Input:', {
    originalStatus,
    sipEventsCount: sipEvents.length,
    sipEvents: sipEvents,
    sipStatus: sipStatus
  });
  
  // 1. Terminal DB status always wins.
  if (['completed', 'failed', 'cancelled', 'no-answer'].includes(originalStatus)) return originalStatus;

  // Normalise codes to strings for easier look-ups.
  const codes = (sipEvents || []).map(e => String((typeof e === 'object' ? e.code : e) ?? ''));
console.log("codestocheck1",codes)
console.log("codestocheck2",originalStatus)
console.log("codestocheck3",sipStatus)
  // BYE anywhere ⇒ completed.
  if (codes.includes('BYE')) return 'completed';

  // 200 OK anywhere (and not followed by BYE yet) ⇒ in-progress.
  if (codes.includes('200')) return 'in-progress';

  // 180 / 183 ⇒ ringing.  We treat 183 without SDP the same as 180 – still ringing.
  if (codes.includes('183') || codes.includes('180')) return 'ringing';

  // 100 Trying / 100 Connecting ⇒ initiating (unless upgraded above already).
  if (codes.includes('100')) return 'initiating';

  // Fallback to sipStatus.code when sipEvents not yet populated.
  const sipCodeStr = String(sipStatus.code ?? '');
  if (sipCodeStr === 'BYE') return 'completed';
  if (sipCodeStr === '200') return 'in-progress';
  if (sipCodeStr === '183' || sipCodeStr === '180') return 'ringing';
  if (sipCodeStr === '100') return 'initiating';
  if (/^4\d{2}$/.test(sipCodeStr) || /^5\d{2}$/.test(sipCodeStr) || sipCodeStr === '408') return 'failed';

  // Otherwise keep whatever we had.
  return originalStatus;
}
