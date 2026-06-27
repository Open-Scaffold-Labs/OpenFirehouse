'use strict';
/**
 * seed-attachments.js — Sample attachments for the document attachment system
 *
 * Demonstrates how the attachment system works across different modules
 */

const { pool } = require('./db');

module.exports = async function seedAttachments() {
  try {
    // Check if attachments already exist
    const { rows: existing } = await pool.query(
      'SELECT COUNT(*) as count FROM attachments'
    );

    if (parseInt(existing[0].count) > 0) {
      console.log(`Attachments seed: already seeded (${existing[0].count} records), skipping.`);
      return;
    }

    const attachments = [
      {
        station_id: 1,
        module: 'mutual_aid_agreements',
        record_id: 1,
        file_name: 'Agreement with Station 22 - Signed.pdf',
        file_url: 'https://documents.example.com/agreements/station22_2024.pdf',
        file_type: 'application/pdf',
        file_size: 256000,
        extracted_text: 'Mutual Aid Agreement between Maplewood FD and Station 22. Terms: Automatic response for structure fires, wildland fires, and mass casualty incidents within 5-mile radius. Cost sharing per county guidelines.',
        ai_extracted: {
          entities: ['mutual aid', 'structure fires', 'wildland fires', 'Station 22'],
          keywords: ['agreement', 'automatic response', 'cost sharing'],
        },
        description: 'Signed mutual aid agreement with Station 22 effective 2024',
        uploaded_by: 'Sarah Chen',
        category: 'legal',
        is_source: true,
        access_level: 'all',
      },
      {
        station_id: 1,
        module: 'training',
        record_id: 1,
        file_name: 'CPR_Certification_Chen_2024.pdf',
        file_url: 'https://documents.example.com/certifications/raaen_cpr_2024.pdf',
        file_type: 'application/pdf',
        file_size: 148000,
        extracted_text: 'CPR/AED Certification Card. Issued to: Sarah Chen. Certification Number: CPR-2024-156789. Valid from: 01/15/2024 to 01/15/2026. American Red Cross.',
        ai_extracted: {
          entities: ['Sarah Chen', 'CPR/AED', 'American Red Cross'],
          keywords: ['certification', 'valid until 2026', 'number CPR-2024-156789'],
        },
        description: 'Current CPR/AED certification for Sarah Chen',
        uploaded_by: 'Nathan McGee',
        category: 'certification',
        is_source: true,
        access_level: 'all',
      },
      {
        station_id: 1,
        module: 'grievances',
        record_id: 1,
        file_name: 'Formal_Grievance_Letter_2024.pdf',
        file_url: 'https://documents.example.com/grievances/grievance_001_2024.pdf',
        file_type: 'application/pdf',
        file_size: 89000,
        extracted_text: 'Formal grievance filed on 02/15/2024. Subject: Scheduling conflict regarding shift assignment. Grievant requests review of scheduling procedures and fair assignment process. Submitted to Chief Sarah Chen for review and resolution.',
        ai_extracted: {
          entities: ['02/15/2024', 'scheduling conflict', 'shift assignment', 'Chief Sarah Chen'],
          keywords: ['grievance', 'scheduling procedures', 'resolution'],
        },
        description: 'Formal grievance regarding shift assignment procedures',
        uploaded_by: 'Chief Sarah Chen',
        category: 'personnel',
        is_source: true,
        access_level: 'chief',
      },
      {
        station_id: 1,
        module: 'budget',
        record_id: 1,
        file_name: 'FY2026_Q1_Invoice_Office_Supplies.pdf',
        file_url: 'https://documents.example.com/budget/invoice_001_q1_2026.pdf',
        file_type: 'application/pdf',
        file_size: 102000,
        extracted_text: 'Invoice from Staples Business Supplies. Order Date: 01/20/2026. Items: Printer paper (10 reams), ballpoint pens (box of 50), file folders, envelopes. Amount Due: $487.92. Invoice #: INV-2026-00451.',
        ai_extracted: {
          entities: ['Staples Business Supplies', 'Q1 2026', '$487.92'],
          keywords: ['office supplies', 'invoice', 'equipment'],
        },
        description: 'Q1 2026 office supplies invoice from Staples',
        uploaded_by: 'Sarah Chen',
        category: 'financial',
        is_source: true,
        access_level: 'chief',
      },
      {
        station_id: 1,
        module: 'fire_inspections',
        record_id: 2,
        file_name: 'Annual_Inspection_Report_2026_Residential.pdf',
        file_url: 'https://documents.example.com/inspections/residential_annual_2026.pdf',
        file_type: 'application/pdf',
        file_size: 521000,
        extracted_text: 'Annual fire safety inspection of residential structures in Maplewood jurisdiction. Report Date: 02/15/2026. Inspector: Sandra Kim. Structures inspected: 127. Violations found: 14. Primary violations: blocked egress, inoperable smoke detectors, improper storage of combustibles.',
        ai_extracted: {
          entities: ['127 structures', '14 violations', 'Sandra Kim'],
          keywords: ['annual inspection', 'fire safety', 'egress', 'smoke detectors'],
        },
        description: 'Annual residential fire safety inspection report 2026',
        uploaded_by: 'Sandra Kim',
        category: 'compliance',
        is_source: true,
        access_level: 'all',
      },
      {
        station_id: 1,
        module: 'scba_maintenance',
        record_id: 3,
        file_name: 'SCBA_Flow_Test_Report_Feb2026.pdf',
        file_url: 'https://documents.example.com/scba/flow_test_feb2026.pdf',
        file_type: 'application/pdf',
        file_size: 178000,
        extracted_text: 'Self-Contained Breathing Apparatus (SCBA) Flow Test Report. Test Date: 02/28/2026. Units tested: 12 SCBA units. Test Method: Flow calibration per NFPA 1981. All units passed minimum flow rates (53.5 LPM). Next scheduled test: 08/28/2026.',
        ai_extracted: {
          entities: ['12 SCBA units', '53.5 LPM', 'NFPA 1981'],
          keywords: ['SCBA', 'flow test', 'breathing apparatus', 'passed'],
        },
        description: 'SCBA flow test report February 2026 — all units passed',
        uploaded_by: 'Nathan McGee',
        category: 'equipment',
        is_source: true,
        access_level: 'all',
      },
      {
        station_id: 1,
        module: 'sog_library',
        record_id: 1,
        file_name: 'SOG_14_Vehicle_Extrication_2026.pdf',
        file_url: 'https://documents.example.com/sog/sog_14_vehicle_extrication.pdf',
        file_type: 'application/pdf',
        file_size: 412000,
        extracted_text: 'Standard Operating Guideline 14: Vehicle Extrication Procedures. Effective: 01/01/2026. Revision: 3. Covers: Scene safety, hazard mitigation, tool use, patient care, hybrid vehicle considerations. Approval signatures: Chief Sarah Chen, Deputy Chief Nathan McGee.',
        ai_extracted: {
          entities: ['SOG 14', 'Vehicle Extrication', 'Revision 3', '01/01/2026'],
          keywords: ['standard operating guideline', 'extrication', 'hybrid vehicles'],
        },
        description: 'SOG 14 — Vehicle Extrication Procedures (Revision 3, 2026)',
        uploaded_by: 'Chief Sarah Chen',
        category: 'procedural',
        is_source: true,
        access_level: 'all',
      },
      {
        station_id: 1,
        module: 'meetings',
        record_id: 1,
        file_name: 'Monthly_Meeting_Handout_March2026.pdf',
        file_url: 'https://documents.example.com/meetings/handout_march_2026.pdf',
        file_type: 'application/pdf',
        file_size: 234000,
        extracted_text: 'Monthly all-hands meeting handout for March 2026. Topics: New equipment deployment, upcoming training schedule, performance metrics (response time avg 5.2 min), administrative updates, Q&A notes.',
        ai_extracted: {
          entities: ['March 2026', 'All-hands meeting', '5.2 min response time'],
          keywords: ['monthly meeting', 'training', 'performance metrics'],
        },
        description: 'March 2026 monthly meeting handout and discussion notes',
        uploaded_by: 'Sandra Kim',
        category: 'administrative',
        is_source: false,
        access_level: 'all',
      },
      {
        station_id: 1,
        module: 'maintenance',
        record_id: 4,
        file_name: 'Repair_Invoice_Engine14_Transmission_March2026.pdf',
        file_url: 'https://documents.example.com/maintenance/repair_engine14_transmission.pdf',
        file_type: 'application/pdf',
        file_size: 167000,
        extracted_text: 'Repair invoice from Maplewood Heavy Vehicle Service Center. Apparatus: Engine 14. Date: 03/10/2026. Work: Transmission fluid flush and filter replacement. Hours: 3.5. Labor: $892.50. Parts: $156.80. Total: $1,049.30. Work order #: WO-2026-1847.',
        ai_extracted: {
          entities: ['Engine 14', 'Transmission', '$1,049.30'],
          keywords: ['repair', 'maintenance', 'transmission fluid'],
        },
        description: 'Engine 14 transmission maintenance repair invoice March 2026',
        uploaded_by: 'Nathan McGee',
        category: 'maintenance',
        is_source: true,
        access_level: 'chief',
      },
      {
        station_id: 1,
        module: 'apparatus_records',
        record_id: 1,
        file_name: 'Vehicle_Registration_Engine14_2026.pdf',
        file_url: 'https://documents.example.com/apparatus/registration_engine14_2026.pdf',
        file_type: 'application/pdf',
        file_size: 98000,
        extracted_text: 'State Vehicle Registration for Fire Department Apparatus. Vehicle: Engine 14 (2018 Pierce Arrow XT). Registration #: FD-001-2026. License Plate: FIRE14. Valid: 03/15/2026 to 03/14/2027. VIN: 1P9FE1Z26JL101456. Owner: Maplewood VFD.',
        ai_extracted: {
          entities: ['Engine 14', '2018 Pierce Arrow XT', 'FIRE14'],
          keywords: ['registration', 'apparatus', 'license plate'],
        },
        description: 'Engine 14 vehicle registration certificate 2026-2027',
        uploaded_by: 'Sarah Chen',
        category: 'compliance',
        is_source: true,
        access_level: 'chief',
      },
      {
        station_id: 1,
        module: 'fire_investigations',
        record_id: 1,
        file_name: 'Lab_Report_Structure_Fire_412_Elmwood.pdf',
        file_url: 'https://documents.example.com/investigations/lab_report_elmwood_fire.pdf',
        file_type: 'application/pdf',
        file_size: 289000,
        extracted_text: 'Fire Investigation Laboratory Report. Case: Structure Fire — 412 Elmwood Drive. Date: 01/04/2026. Lab Date: 01/08/2026. Samples analyzed: 8 (wall cavity, flooring, appliance components). Findings: Cooking appliance failure with compromised thermal cut-off. No evidence of arson. Origin: Kitchen.',
        ai_extracted: {
          entities: ['412 Elmwood Drive', '01/04/2026', 'Lab findings'],
          keywords: ['fire investigation', 'lab analysis', 'cooking appliance'],
        },
        description: 'Lab analysis of cooking appliance fire — 412 Elmwood Drive',
        uploaded_by: 'Chief Sarah Chen',
        category: 'investigation',
        is_source: true,
        access_level: 'chief',
      },
      {
        station_id: 1,
        module: 'wellness_program',
        record_id: 5,
        file_name: 'Medical_Clearance_Form_Chen_2026.pdf',
        file_url: 'https://documents.example.com/wellness/medical_clearance_raaen.pdf',
        file_type: 'application/pdf',
        file_size: 134000,
        extracted_text: 'Annual Occupational Health Medical Clearance. Member: Sarah Chen. Examination Date: 02/20/2026. Physician: Dr. Sarah Chen, MD (Occupational Health Specialist). Clearance Status: APPROVED for full duty. No restrictions. Valid: 02/20/2026 to 02/19/2027.',
        ai_extracted: {
          entities: ['Sarah Chen', 'Dr. Sarah Chen', '02/20/2026'],
          keywords: ['medical clearance', 'occupational health', 'full duty'],
        },
        description: 'Annual occupational health medical clearance — Sarah Chen',
        uploaded_by: 'Sandra Kim',
        category: 'wellness',
        is_source: true,
        access_level: 'chief',
      },
      {
        station_id: 1,
        module: 'grants',
        record_id: 1,
        file_name: 'State_Grant_Award_Letter_2026_Equipment.pdf',
        file_url: 'https://documents.example.com/grants/award_letter_2026_equipment.pdf',
        file_type: 'application/pdf',
        file_size: 156000,
        extracted_text: 'State Fire Department Equipment Grant Award Letter. Applicant: Maplewood VFD. Award Date: 02/01/2026. Grant ID: SFEG-2026-847. Project: Thermal imaging camera and extrication equipment upgrade. Award Amount: $35,000. Restrictions: Funds must be expended by 12/31/2026. Equipment must be registered with State.',
        ai_extracted: {
          entities: ['$35,000', 'SFEG-2026-847', 'Thermal imaging equipment'],
          keywords: ['grant', 'equipment', 'state award'],
        },
        description: 'State equipment grant award letter $35,000 thermal imaging and extrication',
        uploaded_by: 'Sarah Chen',
        category: 'financial',
        is_source: true,
        access_level: 'chief',
      },
      {
        station_id: 1,
        module: 'personnel_actions',
        record_id: 6,
        file_name: 'Promotion_Letter_McGee_Lieutenant_2026.pdf',
        file_url: 'https://documents.example.com/personnel/promotion_mcgee_lt_2026.pdf',
        file_type: 'application/pdf',
        file_size: 87000,
        extracted_text: 'Official Promotion Letter. Member: Nathan McGee. Position: Firefighter → Lieutenant. Effective Date: 01/15/2026. Reason: Promotion examination score 89%, 12 years service, demonstrated leadership. Salary adjustment: New base $62,400/year. Benefits unchanged. Congratulations.',
        ai_extracted: {
          entities: ['Nathan McGee', 'Lieutenant', '01/15/2026', '$62,400'],
          keywords: ['promotion', 'lieutenant', 'salary adjustment'],
        },
        description: 'Official promotion letter — Nathan McGee to Lieutenant',
        uploaded_by: 'Chief Sarah Chen',
        category: 'personnel',
        is_source: true,
        access_level: 'chief',
      },
      {
        station_id: 1,
        module: 'equipment_checkout',
        record_id: 2,
        file_name: 'Equipment_Asset_Photo_Thermal_Imaging_Camera.jpg',
        file_url: 'https://documents.example.com/equipment/thermal_camera_photo.jpg',
        file_type: 'image/jpeg',
        file_size: 2400000,
        extracted_text: 'Asset photograph of thermal imaging camera (model FLIR TG267). Serial: HQ233847. High-resolution photo for equipment registry. Camera mounted on dock in station for reference.',
        ai_extracted: {
          entities: ['FLIR TG267', 'HQ233847', 'Thermal imaging camera'],
          keywords: ['asset', 'photo', 'equipment', 'thermal camera'],
        },
        description: 'Asset photo of thermal imaging camera for equipment tracking',
        uploaded_by: 'Nathan McGee',
        category: 'equipment',
        is_source: false,
        access_level: 'all',
      },
    ];

    // Insert attachments
    for (const att of attachments) {
      await pool.query(
        `INSERT INTO attachments
         (station_id, module, record_id, file_name, file_url, file_type, file_size,
          extracted_text, ai_extracted, description, uploaded_by, category, is_source, access_level)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          att.station_id,
          att.module,
          att.record_id,
          att.file_name,
          att.file_url,
          att.file_type,
          att.file_size,
          att.extracted_text,
          JSON.stringify(att.ai_extracted),
          att.description,
          att.uploaded_by,
          att.category,
          att.is_source,
          att.access_level,
        ]
      );
    }

    console.log(`Attachments seed complete: ${attachments.length} inserted.`);
  } catch (err) {
    console.warn('[seed-attachments] failed:', err.message);
  }
};
