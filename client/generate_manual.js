#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  AlignmentType,
  LevelFormat,
  HeadingLevel,
  BorderStyle,
  WidthType,
  ShadingType,
  VerticalAlign,
  PageNumber,
  PageBreak,
  TableOfContents
} from 'docx';

// Define margin and page dimensions
const PAGE_WIDTH = 12240;
const PAGE_HEIGHT = 15840;
const MARGIN = 1440; // 1 inch
const CONTENT_WIDTH = PAGE_WIDTH - (2 * MARGIN);

// Create border style
const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };

// Helper to create heading 1
function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun(text)],
  });
}

// Helper to create heading 2
function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    children: [new TextRun(text)],
  });
}

// Helper to create body paragraph
function bodyPara(text) {
  return new Paragraph({
    children: [new TextRun(text)],
  });
}

// Helper to create bullet list item
function bulletItem(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level: level },
    children: [new TextRun(text)],
  });
}

// Helper to create table
function createTable(headerTexts, rows) {
  const colCount = headerTexts.length;
  const colWidth = Math.floor(CONTENT_WIDTH / colCount);
  const columnWidths = Array(colCount).fill(colWidth);

  const headerCells = headerTexts.map(text =>
    new TableCell({
      borders,
      width: { size: colWidth, type: WidthType.DXA },
      shading: { fill: "991B1B", type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      verticalAlign: VerticalAlign.CENTER,
      children: [new Paragraph({
        children: [new TextRun({ text: text, bold: true, color: "FFFFFF", size: 22 })]
      })]
    })
  );

  const tableRows = [new TableRow({ children: headerCells })];

  rows.forEach((row, idx) => {
    const cells = row.map((text, colIdx) =>
      new TableCell({
        borders,
        width: { size: colWidth, type: WidthType.DXA },
        shading: { fill: idx % 2 === 0 ? "FFFFFF" : "F9FAFB", type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun(text)] })]
      })
    );
    tableRows.push(new TableRow({ children: cells }));
  });

  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: columnWidths,
    rows: tableRows,
  });
}

// Build document content
const children = [
  // Title Page
  new Paragraph({
    children: [new TextRun("")],
    spacing: { before: 1440, after: 1440 }
  }),
  new Paragraph({
    children: [new TextRun("")],
    spacing: { before: 1440, after: 1440 }
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: "OPENFIREHOUSE",
      bold: true,
      size: 48,
      color: "991B1B"
    })],
    spacing: { after: 240 }
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: "User Manual",
      size: 36,
      color: "374151"
    })],
    spacing: { after: 720 }
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: "Volunteer Fire Department Management Platform",
      size: 24,
      italic: true
    })],
    spacing: { after: 1440 }
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: "Version 0.8.0 — March 2026",
      size: 22
    })],
    spacing: { before: 1440 }
  }),
  new Paragraph({ children: [new PageBreak()] }),

  // Table of Contents
  new Paragraph({
    heading: HeadingLevel.HEADING_1,
    children: [new TextRun("TABLE OF CONTENTS")],
  }),
  new TableOfContents("Table of Contents", { hyperlink: true, headingStyleRange: "1-3" }),
  new Paragraph({ children: [new PageBreak()] }),

  // SECTION 1: GETTING STARTED
  heading1("1. GETTING STARTED"),
  bodyPara("The OpenFirehouse platform is designed to simplify the complex operations of volunteer fire departments. This section walks you through the basics: system requirements, how to log in, initial setup, and customizing your dashboard."),

  heading2("System Requirements"),
  bodyPara("OpenFirehouse runs in any modern web browser on desktop, tablet, or mobile devices. No software installation is required. For the best experience, use Chrome, Firefox, Safari, or Edge from the last two versions. The platform is fully responsive—your dashboard automatically adapts to your screen size, whether you're in the station's day room on a large monitor or responding from the field on a smartphone."),

  heading2("Logging In"),
  bodyPara("The login screen offers two options:"),
  bulletItem("Quick Login: Enter your member ID and PIN for rapid access during emergencies."),
  bulletItem("Full Login: Use your email and password for complete account access. This grants access to additional features and administrative functions based on your role."),
  bodyPara("The platform recognizes three role levels:"),
  bulletItem("Member: View and respond to incidents, access training modules, submit volunteer hours."),
  bulletItem("Officer: All Member features plus personnel management, duty scheduling, training administration."),
  bulletItem("Chief: Full access to all functions including budget, grants, station settings, and compliance dashboards."),

  heading2("First-Time Setup / Onboarding Wizard"),
  bodyPara("Upon first login, a guided wizard walks you through essential setup steps:"),
  bulletItem("Complete your member profile (phone, email, certifications)."),
  bulletItem("Set notification preferences (email, SMS, in-app)."),
  bulletItem("Review the standard operating procedures (SOPs) library."),
  bulletItem("Confirm your available shifts."),
  bodyPara("The wizard can be restarted anytime from Settings."),

  heading2("Customizing Your View"),
  bodyPara("The dashboard is fully customizable. Click the settings icon in the top-right corner to show or hide widgets (weather, active incidents, training status, etc.). Reorder widgets by dragging them. Navigation items can also be hidden if your role doesn't require them—for example, a firefighter might hide the Budget section."),

  new Paragraph({ children: [new PageBreak()] }),

  // SECTION 2: DASHBOARD
  heading1("2. DASHBOARD"),
  bodyPara("The Dashboard is your at-a-glance view of station operations. It displays critical information—current weather, active incidents, crew status, and quick-action buttons—all in one place."),

  heading2("Overview"),
  bodyPara("The default dashboard shows:"),
  bulletItem("Weather Widget: Current conditions, temperature, wind speed, and a 3-day forecast."),
  bulletItem("Stat Cards: Responses this month, active incidents, on-duty members, training hours."),
  bulletItem("Alert Panel: Unacknowledged CAD alerts and system notifications."),
  bulletItem("Active Incident Banner: If an incident is in progress, a banner at the top displays incident type, location, unit status, and elapsed time."),

  heading2("Quick Actions"),
  bodyPara("Three prominent buttons on the dashboard provide immediate access:"),
  bulletItem("I'm Responding: Log your response to an active incident (see Live Incident Response section)."),
  bulletItem("Submit Hours: Record volunteer hours for the current session."),
  bulletItem("View Roster: See who's currently on duty."),

  heading2("Responding to Incidents from Dashboard"),
  bodyPara("When an alert fires, an incident card appears on your dashboard. Click the card to expand it, then click I'm Responding. The system will detect your certification level and guide you through role assignment and pre-incident briefing."),

  new Paragraph({ children: [new PageBreak()] }),

  // SECTION 3: PERSONNEL MANAGEMENT
  heading1("3. PERSONNEL MANAGEMENT"),
  bodyPara("The Personnel Management section is the hub for member administration, scheduling, hours tracking, and health compliance. Only Officers and Chiefs have full access; Members see a read-only view of the roster."),

  heading2("Member Roster"),
  bodyPara("The Roster page lists all active members with search and filter options. Click any member's card to view details:"),
  bulletItem("Contact information (phone, email, address)."),
  bulletItem("Certifications and expiration dates (Firefighter I/II, EMT, Hazmat, etc.)."),
  bulletItem("Role assignments (on-duty status, officer positions)."),
  bulletItem("Training progress and compliance status."),
  bulletItem("Response history this year."),
  bodyPara("Officers can add new members via the Add Member button. The form captures name, contact info, certifications, and initial role assignments. Members receive a welcome email with login instructions."),

  heading2("Duty Schedule"),
  bodyPara("The Duty Schedule displays shifts in a calendar view. Each shift shows:"),
  bulletItem("Date and time (e.g., Friday 18:00–Friday 09:00)."),
  bulletItem("Assigned members and their roles."),
  bulletItem("Minimum crew requirement (often 2 firefighters + 1 officer)."),
  bulletItem("Coverage status (green = met, yellow = under-staffed, red = critical)."),
  bodyPara("Officers can click a shift to assign members, create recurring shifts, or adjust minimum crew requirements."),

  heading2("Volunteer Hours"),
  bodyPara("Track hours across six activity categories:"),
  bulletItem("Firefighting (emergency responses)."),
  bulletItem("Training (in-house and external courses)."),
  bulletItem("Administrative (meetings, fundraising, community events)."),
  bulletItem("EMS (medical emergency responses)."),
  bulletItem("Technical Rescue (specialized operations)."),
  bulletItem("Other (mentoring, equipment maintenance, etc.)."),
  bodyPara("Members submit hours via the mobile app or web form. Hours are aggregated into Year-To-Date (YTD) totals and can be filtered by date range. Officers can approve pending submissions or submit on behalf of members."),

  heading2("Member Portal"),
  bodyPara("Members have a dedicated portal where they can view their profile, upcoming shifts, training status, hours, and certifications. This self-service interface reduces administrative burden on officers."),

  heading2("Health & Wellness"),
  bodyPara("The Health & Wellness module tracks compliance with NFPA 1582 (medical standards for firefighters) and state requirements:"),
  bulletItem("Annual medical exams and physical fitness tests."),
  bulletItem("SCBA (Self-Contained Breathing Apparatus) fit tests—required annually for each member."),
  bulletItem("Exposure tracking: log hazardous material exposures, injuries, and illnesses."),
  bulletItem("Vaccination records and communicable disease protocols."),
  bodyPara("The system alerts Officers when exams or fit tests are due and flags members with overdue certifications from duty."),

  new Paragraph({ children: [new PageBreak()] }),

  // SECTION 4: TRAINING
  heading1("4. TRAINING"),
  bodyPara("The Training module tracks certifications, manages compliance requirements (including NJ LOSAP), and provides on-demand learning through slide-based courses and scenario simulations."),

  heading2("Training Records"),
  bodyPara("Each member's training transcript is stored in the system. Entries include:"),
  bulletItem("Course name, provider, and date."),
  bulletItem("Hours earned and CE credits."),
  bulletItem("Certification type (Firefighter I/II, Hazmat, EMT, etc.)."),
  bulletItem("Expiration date (if applicable)."),
  bulletItem("Pass/fail and score."),
  bodyPara("Officers can manually log training or import records from external training providers."),

  heading2("Compliance & LOSAP"),
  bodyPara("OpenFirehouse enforces New Jersey's Volunteer Firefighter Length Of Service Award Program (LOSAP) requirements. The system tracks the NJ 50-point annual threshold:"),
  bulletItem("Points are awarded for activities: incident response (10 pts), training (1 pt/hour), duty shifts (1 pt/shift), community events, and certifications."),
  bulletItem("Real-time dashboard shows progress toward the 50-point threshold and displays members at risk of falling short."),
  bulletItem("Export reports as CSV for grant applications and audits."),
  bodyPara("Officers receive alerts 30 days before year-end for members below the threshold, allowing time to catch up via training or events."),

  heading2("On-Demand Modules"),
  bodyPara("The training library contains self-paced, slide-based courses covering firefighting fundamentals, hazmat, vehicle extrication, and more. Each module:"),
  bulletItem("Includes slides, videos, and quiz questions."),
  bulletItem("Allows members to pause and resume."),
  bulletItem("Awards CE credits upon passing the quiz (if applicable)."),
  bulletItem("Provides an AI Q&A assistant if members need clarification on concepts."),
  bulletItem("Records completion in the member's transcript."),

  heading2("Scenario-Based Learning"),
  bodyPara("Advanced members can engage with 32 interactive scenarios organized into 7 categories (structure fire, vehicle rescue, hazmat, water rescue, EMS, special operations, and leadership). Each scenario offers four difficulty tiers:"),
  bulletItem("Standard: Guided decisions with recommended actions."),
  bulletItem("Advanced: Fewer hints; players must reason through complex situations."),
  bulletItem("Expert: Minimal guidance; emphasis on critical thinking and time pressure."),
  bulletItem("Chief-Level: Realistic multi-agency coordination and resource constraints."),
  bodyPara("Scenarios use decision-tree gameplay—each choice affects the outcome. Upon completion, the AI provides a debrief explaining decision impacts, alternative strategies, and CE credits awarded. Members can replay scenarios to improve their scores."),

  new Paragraph({ children: [new PageBreak()] }),

  // SECTION 5: APPARATUS & EQUIPMENT
  heading1("5. APPARATUS & EQUIPMENT"),
  bodyPara("This section manages trucks, engines, tenders, and all equipment. It ensures apparatus availability, compliance with NFPA 1911 (apparatus specifications), and proper maintenance scheduling."),

  heading2("Apparatus Tracker"),
  bodyPara("A central inventory displays every vehicle: engines, ladder trucks, rescue units, tenders, and support vehicles. For each unit, record:"),
  bulletItem("Unit number and type (Engine, Ladder, Tender, etc.)."),
  bulletItem("Manufacturer, year, and VIN."),
  bulletItem("Assigned station and home bay."),
  bulletItem("Equipment list (pump capacity, tank volume, ladder length, tools)."),
  bulletItem("Current status (in service, maintenance, out of service)."),
  bodyPara("Click any unit to view full specifications and maintenance history."),

  heading2("Maintenance Log"),
  bodyPara("Log all maintenance activities: routine fluid checks, repairs, component replacements. Entries include date, technician, description, parts used, cost, and hours. The system flags when maintenance is overdue based on manufacturer recommendations or local SOP."),

  heading2("Inspection Checklists"),
  bodyPara("Daily driver inspections and annual safety inspections follow NFPA 1911 standards. The system provides downloadable checklists for each apparatus type. Officers can assign inspections, mark them complete, and attach photos or notes. Non-compliant items are flagged and tracked to resolution."),

  heading2("Asset & Inventory"),
  bodyPara("Track equipment inventory: hoses, nozzles, ladders, air bottles, PPE, and tools. Set minimum stock levels and receive alerts when items fall below thresholds. Export inventory reports for budget planning."),

  heading2("SCBA / Air Management"),
  bodyPara("The SCBA module tracks air bottle inventory, fill dates, hydrostatic test due dates, and member fit-test expirations. The system alerts when bottles are due for hydrostatic testing (typically every 3 years) and when fit tests are expiring."),

  new Paragraph({ children: [new PageBreak()] }),

  // SECTION 6: OPERATIONS
  heading1("6. OPERATIONS"),
  bodyPara("The Operations section handles incident reporting, real-time response coordination, pre-incident planning, and mutual aid logistics."),

  heading2("Incident Log"),
  bodyPara("Every incident is logged with date, time, type, location, units dispatched, personnel, and outcome. Search by date range, incident type, location, or member. Export incident data for annual reports and trend analysis."),

  heading2("Incident Command Center"),
  bodyPara("For active incidents, the Incident Command Center displays:"),
  bulletItem("Live board showing responding units and status (dispatched, en route, on-scene, returning)."),
  bulletItem("Incident Command System (ICS) role assignments (Incident Commander, Safety Officer, Operations Chief, etc.)."),
  bulletItem("Personnel Accountability Report (PAR): names and assignments of all members on scene."),
  bulletItem("Mutual aid unit listings and inter-agency communication log."),
  bulletItem("Timeline of incident events and unit actions."),

  heading2("Live Incident Response"),
  bodyPara("When a call comes in, members see an incident notification with immediate response options:"),
  bulletItem("Standard Response: Member taps I'm Responding, is assigned a role based on certification, and sees the incident address and type."),
  bulletItem("AI Mission Brief: The AI generates a contextual briefing—risk assessment, relevant SOPs, crew roles, expected hazards—based on incident type, location, and pre-incident plan data."),
  bodyPara("The system detects certification level (Firefighter I/II, EMT, etc.) and suggests appropriate roles. A guidance overlay displays recommended actions, safety reminders, and equipment needs. Members can access a digital checklist (e.g., don donning checklist for structure fires) and ask the AI Q&A assistant questions on scene."),

  heading2("Pre-Incident Plans"),
  bodyPara("Officers can upload pre-incident plans for high-risk properties: commercial buildings, schools, factories, hazmat facilities. Plans include building layouts, hazard locations, water supply details, access routes, and special procedures. The system displays relevant pre-incident plans during incident response."),

  heading2("Mutual Aid"),
  bodyPara("Manage mutual aid requests and responses with neighboring departments. Log which units are being requested, from where, and track return times. Inter-agency communication is logged centrally."),

  heading2("CAD Integration"),
  bodyPara("OpenFirehouse integrates with Active911 (a popular CAD system used by many NJ departments) via webhook. When a call is dispatched in the CAD, it automatically creates an incident in OpenFirehouse. Dispatch notes, incident location, and responding units are synchronized in real time."),

  new Paragraph({ children: [new PageBreak()] }),

  // SECTION 7: FIRE PREVENTION
  heading1("7. FIRE PREVENTION"),
  bodyPara("Fire prevention and community risk reduction are critical functions. This section manages inspections, permits, investigations, and standardized operating procedures."),

  heading2("Fire Inspections & Permits"),
  bodyPara("Log all fire inspections: commercial occupancy inspections, construction inspections, and fire drill certifications. For each inspection:"),
  bulletItem("Record the property address and type."),
  bulletItem("Assign the inspecting officer."),
  bulletItem("Document findings and deficiencies."),
  bulletItem("Set re-inspection dates."),
  bulletItem("Generate inspection reports (fillable PDF)."),
  bulletItem("Track permit status and expiration."),
  bodyPara("Generate reports by date range, type, or address for code enforcement follow-up."),

  heading2("Community Risk Reduction"),
  bodyPara("Record community outreach activities: station tours, school visits, smoke alarm installations, fire safety presentations. Track attendee demographics and follow-up actions. Reports help demonstrate community engagement for grant applications."),

  heading2("Fire Investigation"),
  bodyPara("Investigators can log fire cause determinations, note evidence, and record interviews. The system provides investigation report templates aligned with NFPA 921. Attach photos and supporting documents to investigations."),

  heading2("SOG Library"),
  bodyPara("Maintain a central repository of Standard Operating Guidelines (SOGs). Upload PDFs, set version control, and assign SOG review tasks to members. Track when each member has reviewed and acknowledged critical SOGs."),

  new Paragraph({ children: [new PageBreak()] }),

  // SECTION 8: ADMINISTRATION
  heading1("8. ADMINISTRATION"),
  bodyPara("Administrative functions are restricted to the Chief. This section covers station configuration, financial management, reporting, and data management."),

  heading2("Station Settings"),
  bodyPara("Configure fundamental station parameters:"),
  bulletItem("Department name, address, phone, website."),
  bulletItem("Station email for automatic notifications."),
  bulletItem("API keys for third-party integrations (Active911, weather services)."),
  bulletItem("Notification channels (email, SMS, Slack webhook)."),
  bulletItem("Data retention policies and backup schedule."),

  heading2("Budget & Finance"),
  bodyPara("Track income and expenses. Create budgets by category (equipment, training, fuel, maintenance). Compare actual spending vs. budget. Export reports for board meetings and municipal reviews."),

  heading2("Grant Management"),
  bodyPara("Log grants applied for and awarded. Track grant funding, restrictions, required reports, and deadlines. Attach grant documents and maintain audit trails for compliance."),

  heading2("Payroll & Stipends"),
  bodyPara("For departments with paid staff or volunteer stipend programs, manage payroll records, stipend eligibility (based on LOSAP points), and tax reporting."),

  heading2("Reports & Export"),
  bodyPara("Generate standard reports:"),
  bulletItem("Annual incident statistics and response trends."),
  bulletItem("Member roster and certifications (for municipal reports)."),
  bulletItem("LOSAP compliance and point distribution."),
  bulletItem("Training and hours summary."),
  bulletItem("Equipment inventory and maintenance status."),
  bodyPara("All reports export as CSV or PDF for external distribution."),

  heading2("Data Import & Conversion"),
  bodyPara("Import member data, incidents, or training records from legacy systems. The system provides templates and maps fields to prevent data loss during migration."),

  new Paragraph({ children: [new PageBreak()] }),

  // SECTION 9: COMMUNICATION
  heading1("9. COMMUNICATION"),
  bodyPara("Effective communication is critical during emergencies and for day-to-day coordination. OpenFirehouse provides multi-channel notification and calendar management."),

  heading2("Notifications"),
  bodyPara("The notification system sends alerts via:"),
  bulletItem("In-App: Alerts visible on the dashboard and in the notification bell."),
  bulletItem("Email: Immediate or batched notifications."),
  bulletItem("SMS: Critical alerts (incident dispatch, mandatory meetings)."),
  bodyPara("Members customize notification preferences per alert type. Officers can broadcast messages to all members, specific roles, or duty shifts."),

  heading2("Recall / All-Call System"),
  bodyPara("Activate an all-call to summon members to the station for emergencies (severe weather, major incident, evacuations). The system sends SMS, email, and push notifications. Members confirm receipt and arrival time via mobile app."),

  heading2("Event Calendar"),
  bodyPara("A shared calendar displays training events, duty shifts, meetings, community events, and station closures. Members receive reminders for upcoming events. Officers can update events in real time."),

  new Paragraph({ children: [new PageBreak()] }),

  // SECTION 10: SPECIAL FEATURES
  heading1("10. SPECIAL FEATURES"),
  bodyPara("OpenFirehouse includes several advanced features designed to enhance operations and community visibility."),

  heading2("AI Assistant"),
  bodyPara("A floating chat widget (accessible from any page) provides instant answers to common questions. The AI has knowledge of:"),
  bulletItem("NFIRS coding for incident reporting."),
  bulletItem("NJ LOSAP rules and point calculation."),
  bulletItem("NJ certifications and renewal requirements."),
  bulletItem("Best practices for volunteer management."),
  bulletItem("OpenFirehouse feature guidance."),
  bodyPara("Members can ask questions like 'How do I log volunteer hours?' or 'What is my current LOSAP point total?' and receive instant answers. The AI escalates complex questions to human staff via the support system."),

  heading2("TV Display Mode"),
  bodyPara("Configure the Public Dashboard for display on a day-room monitor. It shows active incidents, on-duty personnel, upcoming training events, and alerts in a large-format, easy-to-read display. Content refreshes automatically every 30 seconds."),

  heading2("Public Dashboard"),
  bodyPara("Departments can share a read-only public dashboard with the community. It displays incident statistics, community event schedule, and general information—boosting transparency and public trust. Sensitive details (member names, internal policies) are hidden."),

  new Paragraph({ children: [new PageBreak()] }),

  // Support & Contact
  heading1("Support & Contact"),
  bodyPara("For technical issues or feature requests, contact support@openfirehouse.com. Our team responds to inquiries within 24 business hours. Documentation and video tutorials are available at help.openfirehouse.com."),
  bodyPara("OpenFirehouse is actively developed. Regular updates add features, improve performance, and address feedback from the volunteer fire community. Your input shapes our roadmap."),

  new Paragraph({
    children: [new TextRun("")],
    spacing: { before: 720 }
  }),
  new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [new TextRun({
      text: "END OF USER MANUAL",
      italic: true,
      color: "999999"
    })]
  }),
];

// Create document with styles and headers/footers
const doc = new Document({
  styles: {
    default: {
      document: {
        run: { font: "Arial", size: 22 } // 11pt
      }
    },
    paragraphStyles: [
      {
        id: "Heading1",
        name: "Heading 1",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 32, bold: true, font: "Arial", color: "991B1B" },
        paragraph: { spacing: { before: 240, after: 120 }, outlineLevel: 0 }
      },
      {
        id: "Heading2",
        name: "Heading 2",
        basedOn: "Normal",
        next: "Normal",
        quickFormat: true,
        run: { size: 26, bold: true, font: "Arial", color: "374151" },
        paragraph: { spacing: { before: 180, after: 100 }, outlineLevel: 1 }
      }
    ]
  },
  numbering: {
    config: [
      {
        reference: "bullets",
        levels: [
          {
            level: 0,
            format: LevelFormat.BULLET,
            text: "•",
            alignment: AlignmentType.LEFT,
            style: {
              paragraph: { indent: { left: 720, hanging: 360 } }
            }
          }
        ]
      }
    ]
  },
  sections: [
    {
      properties: {
        page: {
          size: {
            width: PAGE_WIDTH,
            height: PAGE_HEIGHT
          },
          margin: {
            top: MARGIN,
            right: MARGIN,
            bottom: MARGIN,
            left: MARGIN
          }
        }
      },
      headers: {
        default: new Header({
          children: [
            new Paragraph({
              children: [
                new TextRun({
                  text: "OPENFIREHOUSE User Manual",
                  size: 20
                }),
                new TextRun({
                  children: [""],
                  tabs: [{ type: "right", position: CONTENT_WIDTH }]
                }),
                new TextRun({
                  children: [PageNumber.CURRENT],
                  size: 20
                })
              ],
              tabStops: [{ type: "right", position: CONTENT_WIDTH }]
            }),
            new Paragraph({
              border: {
                bottom: {
                  color: "CCCCCC",
                  space: 1,
                  style: BorderStyle.SINGLE,
                  size: 6
                }
              },
              children: [new TextRun("")]
            })
          ]
        })
      },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              border: {
                top: {
                  color: "CCCCCC",
                  space: 1,
                  style: BorderStyle.SINGLE,
                  size: 6
                }
              },
              children: [
                new TextRun({
                  text: "Confidential — For Department Use Only",
                  size: 20,
                  italic: true,
                  color: "666666"
                })
              ]
            })
          ]
        })
      },
      children: children
    }
  ]
});

// Write document
Packer.toBuffer(doc).then(buffer => {
  const outputPath = '/sessions/quirky-sweet-euler/OpenFirehouse/docs/OpenFirehouse_User_Manual.docx';
  fs.writeFileSync(outputPath, buffer);
  console.log(`Document created: ${outputPath}`);
});
