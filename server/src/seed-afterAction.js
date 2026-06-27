'use strict';
/**
 * seed-afterAction.js — Populate after_action_reports table.
 * Skips if already seeded.
 */

const { pool } = require('./db');

module.exports = async function seedAfterAction() {
  const result = await pool.query('SELECT COUNT(*) FROM after_action_reports WHERE station_id = $1', [1]);
  if (result.rows[0].count > 0) {
    console.log('After-action reports seed: already seeded, skipping.');
    return;
  }

  const records = [
    {
      station_id: 1,
      incident_id: 1,
      incident_date: '2026-01-04',
      incident_type: 'Structure Fire',
      location: '412 Elmwood Drive, Maplewood',
      title: 'Kitchen Fire - 412 Elmwood Drive',
      summary: 'Residential structure fire with wall cavity extension. Kitchen origin from unattended cooking. Mutual aid from Station 12. Fire controlled and extinguished.',
      strengths: JSON.stringify(['Rapid mutual aid response', 'Effective fire attack', 'Strong communication']),
      improvements: JSON.stringify(['Pre-incident planning needed for residential corridor', 'Ventilation timing optimization']),
      action_items: JSON.stringify(['Update pre-plans for Elmwood area', 'Schedule ventilation drill']),
      lessons_learned: 'Mutual aid response time critical. Need enhanced pre-incident planning for local structures.',
      attendees: JSON.stringify(['Sarah Chen', 'Maria Delgado', 'Nathan McGee']),
      conducted_by: 'Chief Sarah Chen',
      conducted_date: '2026-01-05',
      status: 'completed',
    },
    {
      station_id: 1,
      incident_id: 2,
      incident_date: '2026-01-09',
      incident_type: 'Vehicle Accident',
      location: 'Rt. 22 & Birch Hill Rd, Maplewood',
      title: 'MVA with Entrapment - Route 22',
      summary: 'Two-vehicle MVA with moderate injuries. One patient transported by county ALS. Scene cleared in 43 minutes.',
      strengths: JSON.stringify(['Rapid scene safety', 'Proper extrication', 'EMS coordination']),
      improvements: JSON.stringify(['Hybrid vehicle extrication knowledge gap identified', 'Traffic control timing']),
      action_items: JSON.stringify(['Schedule hybrid vehicle training', 'Develop traffic control SOP']),
      lessons_learned: 'Modern vehicle construction requires specialized extrication training. Traffic control coordination with PD essential.',
      attendees: JSON.stringify(['Nathan McGee', 'Sandra Kim', 'Lisa Fontaine']),
      conducted_by: 'Lt. Nathan McGee',
      conducted_date: '2026-01-12',
      status: 'completed',
    },
    {
      station_id: 1,
      incident_id: 3,
      incident_date: '2026-01-15',
      incident_type: 'Medical / EMS',
      location: '88 Ridgeline Court, Maplewood',
      title: 'Chest Pain Response - Ridgeline Court',
      summary: 'Elderly male, 67 years old, chest pain complaint. ALS assessment performed. Patient transported to cardiac unit at Maplewood General.',
      strengths: JSON.stringify(['Rapid response time', 'Thorough patient assessment', 'Smooth hospital handoff']),
      improvements: JSON.stringify(['Family communication could be clearer']),
      action_items: JSON.stringify(['Review ALS protocol compliance']),
      lessons_learned: 'Early ALS response and rapid transport critical for cardiac patients. Coordinate with family for follow-up.',
      attendees: JSON.stringify(['Nathan McGee', 'Lisa Fontaine']),
      conducted_by: 'Lt. Maria Santos',
      conducted_date: '2026-01-18',
      status: 'completed',
    },
    {
      station_id: 1,
      incident_id: 4,
      incident_date: '2026-02-08',
      incident_type: 'Utility Emergency',
      location: '321 Maple Street, Maplewood',
      title: 'Gas Leak Response - Maple Street',
      summary: 'Natural gas odor reported by homeowner. Fire department responded and confirmed leak at service entry point. Area evacuated, utility company called. Leak repaired and residence cleared.',
      strengths: JSON.stringify(['Rapid response and scene control', 'Proper evacuation procedures followed', 'Effective utility company coordination']),
      improvements: JSON.stringify(['Gas detector positioning could have been documented on scene', 'Neighbor notification process needs refinement']),
      action_items: JSON.stringify(['Create gas leak documentation checklist', 'Schedule mock gas emergency drill']),
      lessons_learned: 'Public perception critical in utility emergencies. Professional hazmat response prevents property damage and builds community confidence.',
      attendees: JSON.stringify(['Sandra Kim', 'Christophe F. Martinez', 'Sarah Chen']),
      conducted_by: 'Nathan McGee',
      conducted_date: '2026-02-10',
      status: 'completed',
    },
    {
      station_id: 1,
      incident_id: 5,
      incident_date: '2026-02-22',
      incident_type: 'Drill - Multi-Casualty',
      location: 'Station 14 Training Ground',
      title: 'Multi-Casualty Incident Drill — Mass Casualty Event Simulation',
      summary: 'Tabletop and live training exercise simulating mass casualty event (8 victims). Practiced triage, patient tracking, communication protocols, and mutual aid activation. Exercise included EMS coordination and hospital notification.',
      strengths: JSON.stringify(['Excellent triage decision making', 'Clear command structure', 'Effective inter-agency communication', 'Good documentation and tracking']),
      improvements: JSON.stringify(['Radio traffic management during peak activity', 'Ambulance staging coordination needs refinement']),
      action_items: JSON.stringify(['Develop refined incident command SOG for MCI', 'Schedule quarterly MCI drills', 'Create hospital coordination checklist']),
      lessons_learned: 'Interdepartmental coordination essential for MCI response. Regular drills improve response capability and confidence. Clear triage protocols save lives.',
      attendees: JSON.stringify(['Chief Sarah Chen', 'Nathan McGee', 'Maria Delgado', 'Lisa Fontaine', 'Sandra Kim', 'All station members']),
      conducted_by: 'Chief Sarah Chen',
      conducted_date: '2026-02-23',
      status: 'completed',
    },
    {
      station_id: 1,
      incident_id: 6,
      incident_date: '2026-03-01',
      incident_type: 'Community Event',
      location: 'Maplewood Park Summer Festival Grounds',
      title: 'Community Event Safety Incident — Heat Exhaustion at Festival',
      summary: 'Festival attendee experienced heat exhaustion during outdoor event. Fire department provided on-site medical assessment and treatment. Patient transported to urgent care for evaluation. Reviewed venue shade/hydration provisions.',
      strengths: JSON.stringify(['Quick recognition of patient distress', 'Appropriate field treatment', 'Good coordination with EMS', 'Professional patient care']),
      improvements: JSON.stringify(['Hydration station locations could be better signposted', 'Heat illness prevention messaging could be enhanced']),
      action_items: JSON.stringify(['Provide heat illness prevention recommendations to parks department', 'Create community education pamphlet on heat safety']),
      lessons_learned: 'Proactive prevention and community education reduce event-related injuries. Clear protocols for on-site medical response improve outcomes.',
      attendees: JSON.stringify(['Sandra Kim', 'Maria Delgado', 'Christophe F. Martinez']),
      conducted_by: 'Sandra Kim',
      conducted_date: '2026-03-02',
      status: 'completed',
    },
    {
      station_id: 1,
      incident_id: 7,
      incident_date: '2026-02-10',
      incident_type: 'Vehicle Fire',
      location: 'Interstate 287 at milepost 58 (Northbound)',
      title: 'Tractor-Trailer Fuel Fire — I-287 Northbound',
      summary: 'Large commercial vehicle fire with heavy fuel load and smoke production. Coordinated with mutual aid from three surrounding departments. Suppression completed in 90 minutes. Route remained closed for 2 hours for scene cleanup and investigation.',
      strengths: JSON.stringify(['Excellent mutual aid coordination', 'Rapid scene establishment and perimeter control', 'Effective water supply management', 'Safety protocols prevented injuries']),
      improvements: JSON.stringify(['Traffic control signage could have been placed further upstream', 'Coordination with state police traffic management needed earlier']),
      action_items: JSON.stringify(['Develop I-287 pre-incident plan for highway fires', 'Schedule joint drill with state police for highway incident management']),
      lessons_learned: 'Highway incident management requires early law enforcement notification and traffic control coordination. Mutual aid resource management critical for large vehicle fires.',
      attendees: JSON.stringify(['Sarah Chen', 'Nathan McGee', 'Sandra Kim', 'Mike Harrington']),
      conducted_by: 'Chief Sarah Chen',
      conducted_date: '2026-02-12',
      status: 'completed',
    },
    {
      station_id: 1,
      incident_id: 8,
      incident_date: '2026-03-15',
      incident_type: 'Medical/EMS',
      location: '45 Oakridge Terrace',
      title: 'Medical Call — Fall with Refusal of Transport',
      summary: 'Elderly patient (85 years old) fell in home. Initial assessment revealed minor lacerations and possible knee sprain. Patient adamantly refused transport to hospital. Documentation completed. Family notified of refusal.',
      strengths: JSON.stringify(['Thorough patient assessment despite refusal', 'Empathetic communication with patient', 'Clear documentation of refusal', 'Family contact established']),
      improvements: JSON.stringify(['Could have recommended follow-up with primary care physician', 'Written refusal document should have been provided to patient']),
      action_items: JSON.stringify(['Develop refusal-of-care best practice document', 'Training on managing refusals with dignity']),
      lessons_learned: 'Respecting patient autonomy while ensuring safety requires clear communication and thorough documentation. Follow-up recommendations increase likelihood of proper care.',
      attendees: JSON.stringify(['Nathan McGee', 'Lisa Fontaine']),
      conducted_by: 'Lt. Nathan McGee',
      conducted_date: '2026-03-17',
      status: 'completed',
    },
    {
      station_id: 1,
      incident_id: 9,
      incident_date: '2026-02-18',
      incident_type: 'Structure Fire',
      location: '88 Ridgeline Court',
      title: 'Bedroom Fire with Injury — Ridgeline Court',
      summary: 'Residential structure fire originating in master bedroom. Occupant sustained first-degree burns to face and arms attempting self-rescue. Fire suppressed rapidly. Patient transported to regional burn center. Cause under investigation.',
      strengths: JSON.stringify(['Rapid response time', 'Quick fire suppression', 'Appropriate emergency transport decision', 'Compassionate patient care']),
      improvements: JSON.stringify(['Initial size-up could have noted fire involving occupant more clearly', 'Entry line deployment timing needs review']),
      action_items: JSON.stringify(['Develop burn injury recognition and transport protocols', 'Schedule burn center education session']),
      lessons_learned: 'Rapid recognition of burn injuries and immediate transport to specialized facilities improves patient outcomes. Scene safety balance with life safety critical.',
      attendees: JSON.stringify(['Sarah Chen', 'Maria Delgado', 'Nathan McGee', 'Lisa Fontaine', 'Amy Winters']),
      conducted_by: 'Chief Sarah Chen',
      conducted_date: '2026-02-20',
      status: 'completed',
    },
    {
      station_id: 1,
      incident_id: 10,
      incident_date: '2026-03-20',
      incident_type: 'Brush Fire',
      location: 'County Park, Brush Area near Cedar Ridge Trail',
      title: 'Wildfire Suppression Exercise — 3-Acre Brush Fire',
      summary: 'Three-acre brush fire in county park required coordination with forest service and state environmental protection. Implemented defensible space tactics. Community members evacuated from hiking trails. Fire controlled and contained in 4 hours.',
      strengths: JSON.stringify(['Strong multi-agency coordination', 'Effective resource staging', 'Community evacuation well-executed', 'Firebreak construction prevented spread']),
      improvements: JSON.stringify(['Aerial recon would have helped assess fire progression', 'Community notification timing could have been earlier']),
      action_items: JSON.stringify(['Establish mutual aid agreement with forest service', 'Develop county park wildfire response SOP']),
      lessons_learned: 'Wildfire response requires inter-agency coordination and early public notification. Defensible space principles applied effectively in brush suppression.',
      attendees: JSON.stringify(['Sandra Kim', 'James Ortega', 'Tracy Benson', 'Kevin Marsh', 'Diane Tolliver']),
      conducted_by: 'Lt. Nathan McGee',
      conducted_date: '2026-03-21',
      status: 'completed',
    },
  ];

  let inserted = 0;
  for (const rec of records) {
    await pool.query(
      `INSERT INTO after_action_reports (station_id, incident_id, incident_date, incident_type, location, title, summary, strengths, improvements, action_items, lessons_learned, attendees, conducted_by, conducted_date, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())
       ON CONFLICT DO NOTHING`,
      [
        rec.station_id, rec.incident_id, rec.incident_date, rec.incident_type, rec.location,
        rec.title, rec.summary, rec.strengths, rec.improvements, rec.action_items,
        rec.lessons_learned, rec.attendees, rec.conducted_by, rec.conducted_date, rec.status,
      ]
    );
    inserted++;
  }

  console.log(`After-action reports seed complete: ${inserted} inserted.`);
};
