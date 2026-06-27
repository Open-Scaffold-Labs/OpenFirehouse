/**
 * scenarioData.js — Scenario-Based Learning content library (Phase 5)
 *
 * Each scenario walks a member through realistic incident command decisions.
 * Every scene has 4 choices; choices carry a point value (0–2) and an
 * outcome narrative explaining why that decision was right or wrong.
 *
 * Scoring:  Excellent ≥ 80% · Competent ≥ 60% · Needs Review < 60%
 * CE credit: 1.0 hour per scenario completed (any score)
 */

export const SCENARIO_CATEGORIES = [
  'All',
  'Structural Firefighting',
  'Vehicle / Brush Fire',
  'HazMat',
  'HazMat / Utilities',
  'Firefighter Safety',
  'EMS / Rescue',
  'MVA / Technical Rescue',
];

// ─── difficulty colors ────────────────────────────────────────────────────────
export const DIFFICULTY_STYLE = {
  Foundational: 'bg-emerald-100 text-emerald-700',
  Intermediate: 'bg-blue-100 text-blue-700',
  Advanced:     'bg-red-100 text-red-700',
  Expert:       'bg-gray-900 text-yellow-400',
};

export const SCENARIOS = [

  // ══════════════════════════════════════════════════════════════════════
  // 1. RESIDENTIAL STRUCTURE FIRE
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'structure-fire-residential',
    title: 'Residential Structure Fire',
    description: 'A two-story Colonial with smoke showing. Navigate initial command decisions, attack line placement, search priorities, and escalation.',
    category: 'Structural Firefighting',
    difficulty: 'Intermediate',
    estimatedMinutes: 20,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🔥',
    badgeColor: 'bg-orange-100 text-orange-700',

    setup: {
      dispatch: 'DISPATCH: Engine 14, Ladder 7 — respond to 412 Elm Street for a reported structure fire, two-story Colonial. Caller reports smoke from a second-floor window. No information on occupants.',
      narrative: 'You are the Officer on Engine 14, first unit arriving. It is 14:32 on a Tuesday afternoon. As you turn onto Elm Street you see a two-story wood-frame Colonial, approximately 40 years old. Heavy grey smoke is issuing from a second-floor bedroom window on Side B (the left side as you face the structure). A neighbor is on the front lawn waving at you. No visible flames from your approach. Your Ladder unit is 3 minutes behind you.',
      details: [
        'Structure: 2-story wood-frame Colonial, ~1,800 sq ft, approximately 1970s construction',
        'Weather: 52°F, wind 8 mph from the west (Side A toward Side C)',
        'Hydrant: Yellow hydrant approximately 150 feet from the structure on Side A',
        'Occupancy: Single-family residential, neighbor says "a woman lives there alone"',
        'Time of day: 14:32 — likely occupied, school-age children could be inside',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 5 — Initial Size-Up & Command',
        situation: 'You have arrived first due. Heavy smoke is visible from the second-floor window on Side B. A neighbor is running toward you saying "I think she\'s still inside — I saw her car in the driveway!" Your driver is stopping the engine. Ladder 7 is 3 minutes out. What is your first action?',
        choices: [
          {
            id: 'a',
            text: 'Establish command, announce arrival and conditions on radio, begin a 360° size-up while your driver masks up',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Establishing command and transmitting a size-up report is the foundation of ICS. It activates the command structure, informs incoming units of conditions, and buys time for a complete 360° before committing resources. You report: "Command established at 412 Elm Street. Two-story wood-frame Colonial, heavy smoke from Side B second floor. Will investigate for occupants. Engine 14 establishing water supply." Your driver begins masking up while you complete the 360°.',
            },
          },
          {
            id: 'b',
            text: 'Immediately pull a 1¾" line and make entry with your crew to find the occupant — she may be unconscious',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is a common instinct — but rushing a search without a size-up and without establishing command is a leading cause of firefighter fatalities. You have not confirmed fire location, checked for secondary means of egress, or communicated conditions to dispatch. If this fire involves lightweight truss construction or has a hidden extension, entering without intelligence is a significant risk. The neighbor\'s report is valuable but unconfirmed.',
            },
          },
          {
            id: 'c',
            text: 'Wait at the front of the structure for Ladder 7 to arrive before taking any action',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Waiting 3 minutes without establishing command, gathering intelligence, or preparing your crew wastes critical time. NFPA and IFSTA guidance is clear: the first arriving officer establishes command immediately and begins size-up. Survivable time windows for trapped occupants close quickly in a structure fire.',
            },
          },
          {
            id: 'd',
            text: 'Ask the neighbor for more information about the occupant before doing anything else',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Gathering life safety information has value — but it should happen simultaneously with establishing command and beginning size-up, not instead of them. Radio your arrival first, then brief the neighbor while completing your 360°. Do both, but in priority order: command → size-up → gather occupant intel.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 5 — Fire Attack & Search Priority',
        situation: 'Your 360° reveals: Side C (rear) has a ground-floor door and a deck. The second-floor fire is in the bedroom on Side B/C corner — you can now see flames licking the window. The door on Side A (front) is closed. No signs of occupants at windows. Your crew of 3 (you + 2 firefighters) is ready with a 1¾" line. Your driver is at the hydrant. Ladder 7 is 2 minutes out. What is your attack plan?',
        choices: [
          {
            id: 'a',
            text: 'Enter Side A with the 1¾" line, take the stairs to the second floor, and make direct attack on the fire while your driver charges the line',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Entering from the unburned side (Side A) with a charged line and advancing to the fire floor is standard residential fire attack. You are not venting the fire — you are pushing it away from any potential victims on the escape path. Your driver charges the line as you advance. The key: stay on the staircase side of the hallway as you advance, limiting your exposure. Ladder 7 will handle search when they arrive.',
            },
          },
          {
            id: 'b',
            text: 'Split your crew — send one firefighter to search while you and one firefighter attack the fire',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Splitting a crew of 3 creates two under-strength teams and violates the 2-in/2-out rule. OSHA 29 CFR 1910.134 (the Two-In/Two-Out rule) requires at least two firefighters inside and two standing by outside when operating in an IDLH environment. With 3 crew members, you cannot safely split for simultaneous attack and search. Wait for Ladder 7 for a dedicated search team.',
            },
          },
          {
            id: 'c',
            text: 'Open Side C door to ventilate the structure before making entry with the attack line',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Opening a door on the opposite side of the structure without a charged line in place is horizontal ventilation without attack — this creates a flow path that can dramatically accelerate fire spread and push fire toward any victims or toward your crew\'s entry point. Ventilation must be coordinated with attack. Never vent before your line is charged and your crew is in position.',
            },
          },
          {
            id: 'd',
            text: 'Request a second alarm immediately and hold exterior until more resources arrive',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Requesting additional resources early is good incident management — but going defensive immediately on a residential fire with a possible victim inside is not standard practice when you have conditions that allow interior operations. The fire is on the second floor, you have an unburned entry path on Side A, and your crew is SCBA-equipped. A second alarm request is reasonable, but holding exterior without attempting rescue or attack is not the correct first action here.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 5 — Mayday Awareness',
        situation: 'Your crew has advanced the line to the top of the stairs. Fire is in the bedroom at the end of the hallway — visible orange glow under the door. You hear a smoke detector activating in a room to your left (Side A side of the second floor). Ladder 7 has just arrived. Suddenly, your Firefighter 2 calls out: "My low-air alarm is going off." FF2 has been on air for 9 minutes. What do you do?',
        choices: [
          {
            id: 'a',
            text: 'Order FF2 to exit immediately with FF1 as escort. Announce on radio that your crew is exiting and that Ladder 7 should advance the line. Maintain command from the front.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. A low-air alarm is a Mayday precursor — it signals approximately 25% of cylinder capacity remaining. You never send a firefighter out alone when they are low on air. Ordering FF2 to exit with an escort and immediately transitioning the attack line to Ladder 7 maintains fire attack continuity while protecting your crew. Announcing on radio keeps command informed. This is textbook crew resource management.',
            },
          },
          {
            id: 'b',
            text: 'Tell FF2 to hold position — you\'re almost to the fire door and you\'ll be done soon',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is one of the most dangerous decisions a company officer can make. "Almost there" has killed firefighters. A low-air alarm with 9 minutes on air means FF2 is running short — they have 3-5 minutes of air remaining at working exertion levels. The fire, the search, and the victim do not justify trapping a crew member. Air management violations account for a significant percentage of firefighter LODD incidents. Exit now.',
            },
          },
          {
            id: 'c',
            text: 'Have FF2 exit alone while you and FF1 continue advancing the line',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Sending a firefighter out of an IDLH environment alone violates two-in/two-out and is a Mayday waiting to happen. FF2 is low on air, potentially disoriented, and on the second floor of a burning structure. They need an escort. Splitting the crew in this situation to maintain the attack is the wrong trade-off.',
            },
          },
          {
            id: 'd',
            text: 'Declare a Mayday for FF2 on radio, withdraw all crew members, and go defensive',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'A low-air alarm is not a Mayday — yet. A Mayday is declared when a firefighter is lost, trapped, or in immediate danger of death. FF2 is low on air but functional and knows their location. The correct action is a controlled exit with escort, not a Mayday declaration. Declaring a Mayday when it\'s not warranted disrupts command and wastes RIT resources. However, withdrawing the crew is not entirely wrong — the instinct to protect your people is right, even if the execution isn\'t precise.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 5 — Victim Found',
        situation: 'Ladder 7 has advanced your line and knocked down the fire in the bedroom. Ladder\'s officer reports: "Fire\'s knocked down, searching now." A Ladder firefighter radios: "Victim located — master bedroom, Side A second floor. Female, unconscious, breathing. Removing now." EMS is on scene. Simultaneously, your driver reports the hydrant is flowing but pressure has dropped — you\'re on a dead-end main. What is your most critical immediate action as Incident Commander?',
        choices: [
          {
            id: 'a',
            text: 'Confirm EMS is ready to receive the victim and announce the victim removal on radio so all units are aware and the stairway is clear',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Coordinating victim removal is a command priority the moment a victim is found. You need to: (1) ensure the egress path (stairs, front door) is clear for removal, (2) confirm EMS is staged and ready, (3) announce on radio so all crews know movement is happening in the stairs. The low-pressure issue is real but secondary in this moment — EMS has the victim alive. Command the removal first, then address the water supply.',
            },
          },
          {
            id: 'b',
            text: 'Immediately request a tanker or relay to address the pressure drop before it gets worse',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Water supply management is important — but at this exact moment a live victim is being removed from the structure and needs a clear path to EMS. The fire is knocked down. Addressing water supply first while victim removal is in progress is a prioritization error. Handle the most time-critical life safety issue first, then the operational logistics.',
            },
          },
          {
            id: 'c',
            text: 'Order all units to exit the structure immediately due to the pressure drop',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Ordering a full exit while a victim is mid-removal and the fire is already knocked down is a significant overreaction to the water pressure issue. The fire has been suppressed. The victim is being moved now. A sudden order to evacuate during victim removal could cause chaos on the stairs. Assess, coordinate, communicate — don\'t react with a blanket order that disrupts an active life safety operation.',
            },
          },
          {
            id: 'd',
            text: 'Personally run upstairs to assist with the victim removal',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The Incident Commander\'s place is not interior operating when there is an active removal underway with adequate resources. Ladder 7 has the victim. EMS is on scene. You leaving the command post to assist physically abandons your command function — nobody is coordinating resources, monitoring conditions, or managing the water supply issue. The hardest lesson in command: your job is to manage the incident, not the victim.',
            },
          },
        ],
      },

      {
        id: 's5',
        title: 'Scene 5 of 5 — Overhaul & Documentation',
        situation: 'The victim is en route to hospital in stable condition. Fire is out. Ladder 7\'s officer requests permission to begin overhaul. Your Fire Prevention Officer has also arrived on scene and wants to begin the fire investigation. The homeowner\'s neighbor asks if they can go inside to retrieve medication for the owner. What is your decision on overhaul and scene access?',
        choices: [
          {
            id: 'a',
            text: 'Approve overhaul with thermal camera verification first. Tell the fire investigator the scene is theirs after overhaul is complete. Deny scene entry to the neighbor — this is now a fire investigation scene.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the complete correct answer. Thermal camera verification before overhaul prevents missing hidden hotspots and — critically — avoids disturbing a fire investigation scene more than necessary. The fire investigator should work the scene after overhaul in a controlled manner. Denying civilian entry is mandatory: the scene is potentially a crime scene (cause is unknown), and unauthorized entry contaminates evidence and creates liability. Offer to relay the medication request to hospital staff instead.',
            },
          },
          {
            id: 'b',
            text: 'Begin overhaul immediately to clear the scene as fast as possible. The investigation can happen afterward.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Rushing overhaul without thermal camera verification misses hidden fire and can cause rekindle. More importantly, aggressive overhaul before the fire investigator completes even a preliminary walkthrough destroys evidence of fire origin and cause. NFPA 921 guidance is clear: overhaul and investigation must be coordinated. A recoverable investigation scene can become unrecoverable in minutes once firefighters start opening walls and moving debris.',
            },
          },
          {
            id: 'c',
            text: 'Allow the neighbor in briefly to retrieve the medication — it\'s a medical necessity and won\'t take long',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Any civilian entry to the fire scene before cause and origin is determined is a problem. The scene could be an arson. The neighbor, however well-intentioned, has no legal right to enter a fire scene that is still under your control. Entry contaminates the investigation, creates injury liability (floor integrity, smoke exposure), and weakens any future legal case. Contact the hospital via EMS to relay the medication request — that\'s the right solution.',
            },
          },
          {
            id: 'd',
            text: 'Hand the scene to the fire investigator immediately without overhaul — let them determine what to do',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Handing over a scene with potential hotspots to a fire investigator before basic thermal verification is irresponsible — a rekindle in an unoccupied structure could trap the investigator or destroy additional evidence. You retain responsibility for scene safety until you transfer command. Thermal verification and a coordinated handoff is the right approach, not an abrupt transfer of responsibility.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Establish command and transmit a size-up report before any other action — it activates ICS and informs all incoming units.',
        'Two-in/two-out is not negotiable. Never split a crew below 2 for interior operations.',
        'Coordinate ventilation with attack — never open flow paths without a charged line in position.',
        'A low-air alarm is a controlled exit order, not a Mayday. Know the difference.',
        'The IC\'s job is command, not operation. Your value is managing the incident from the front.',
        'Fire scenes are investigation scenes until cause is determined. Control access accordingly.',
      ],
      references: ['NFPA 1710', 'NFPA 921', 'OSHA 29 CFR 1910.134', 'IFSTA Essentials Ch. 9', 'ICS-200'],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 2. HAZMAT — TANKER ROLLOVER ON I-78
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'hazmat-tanker-rollover',
    title: 'HazMat — Tanker Rollover on I-78',
    description: 'A tractor-trailer tanker has rolled on I-78 westbound. Visible placard, possible product release, multiple civilian exposures. Navigate recognition, isolation, and notification.',
    category: 'HazMat',
    difficulty: 'Advanced',
    estimatedMinutes: 20,
    creditHours: 1.0,
    passingScore: 60,
    icon: '☣️',
    badgeColor: 'bg-yellow-100 text-yellow-800',

    setup: {
      dispatch: 'DISPATCH: Engine 14, Rescue 14 — respond to I-78 westbound at Mile Marker 37.4 for a reported tractor-trailer accident with rollover. Caller reports vehicle is on its side and there is a strong odor in the area.',
      narrative: 'You are approaching the scene on I-78 westbound. Traffic has stopped approximately a quarter mile back. You can see a white MC-331 pressurized tanker on its side in the right lane and median. As you get closer, you observe a white vapor cloud forming around the tank. You can see a diamond-shaped placard on the end of the tank — it appears to be orange with a number. Several passenger cars are stopped within 100 feet of the tanker. You observe two people outside their vehicles who appear to be stumbling and disoriented.',
      details: [
        'Vehicle: MC-331 pressurized cargo tank (designed for flammable compressed gases)',
        'Placard: Orange diamond visible — 4-digit UN number obscured by road debris',
        'Hazard indicators: Vapor cloud forming, two civilians showing signs of exposure symptoms',
        'Wind: Moderate from the east (pushing vapors westbound toward stopped traffic)',
        'Nearest HazMat team: Union County HazMat, ETA 20 minutes',
        'Your certification level: Awareness/Operations Level',
      ],
    },

    scenes: [
      {
        id: 'h1',
        title: 'Scene 1 of 4 — Approach and Initial Positioning',
        situation: 'You are 200 yards from the tanker. The vapor cloud is visible. Two civilians appear symptomatic. Where do you position your apparatus and what is your first action on arrival?',
        choices: [
          {
            id: 'a',
            text: 'Position upwind and uphill of the tanker at least 330 feet away. Do not approach. Establish command and request HazMat team and additional EMS immediately.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. This is the Awareness Level response by the book. The ERG\'s initial isolation distance for unknown materials with vapor clouds is 330 feet (100 meters) in all directions. You are upwind, which means the vapor cloud is moving away from you. You have requested the right resources — HazMat team for identification and mitigation, EMS for the symptomatic civilians. You are not approaching a product you cannot identify without proper PPE.',
            },
          },
          {
            id: 'b',
            text: 'Drive closer to read the placard number, then pull back and call for HazMat',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Driving into a vapor cloud to read a placard puts your crew directly in the hazard zone. The two symptomatic civilians demonstrate the product is already having physiological effects. You can use binoculars from a safe distance, wait for better vantage, or rely on shipping papers retrieved from a safe distance. Never drive into a visible vapor cloud for identification purposes.',
            },
          },
          {
            id: 'c',
            text: 'Position at the tanker and pull the symptomatic civilians away from the vehicle before establishing command',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is the most common and most deadly error at hazmat scenes. Attempting rescue without identification and without proper PPE turns responders into victims. HazMat rescue incidents consistently produce multiple responder casualties when unprotected personnel attempt rescues in the hot zone. The symptomatic civilians are in the hazard zone. You are not equipped to enter it. Call for HazMat. Protect yourself.',
            },
          },
          {
            id: 'd',
            text: 'Position at 330 feet and attempt to talk the symptomatic civilians toward you to get them out of the hot zone',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Talking victims toward you from a safe position is better than entering the hazard zone, but it\'s still problematic: the civilians may be too disoriented to comply, and verbal contact may be insufficient given their symptoms. The more important immediate actions are establishing command, calling for resources, and isolating the area to prevent additional civilians from walking into the hazard zone. Decon and rescue are HazMat team functions.',
            },
          },
        ],
      },

      {
        id: 'h2',
        title: 'Scene 2 of 4 — Identification',
        situation: 'You have positioned upwind at 330 feet. You can now read the placard with binoculars: it is orange with the number "1075" in white. Using your ERG, you look up 1075 in the orange section. The ERG identifies it as "Petroleum gases, liquefied" or "Liquefied petroleum gas" (LPG — propane/butane). Guide page 115. What does this tell you and how does it change your response?',
        choices: [
          {
            id: 'a',
            text: 'Class 2 flammable gas. Immediately expand the isolation perimeter to 1,600 feet in all directions (fire involving tank guidance). Notify dispatch of the product. Ensure no ignition sources enter the area.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct and complete. LPG is a Class 2 flammable compressed gas. An MC-331 tanker on its side with visible vapor release is a potential BLEVE (Boiling Liquid Expanding Vapor Explosion) scenario. ERG Guide 115 and the green pages for TIH distances both indicate that a fire involving a tank requires 1,600 feet isolation in all directions. Your priority now is: expand the perimeter, eliminate ignition sources, notify dispatch of the product identity, and hold position until HazMat arrives. A BLEVE from an LPG tanker can project tank fragments miles.',
            },
          },
          {
            id: 'b',
            text: 'LPG is common — it\'s propane. Have your crew mask up with SCBA and approach to stop the leak if you can identify the source.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'LPG being "common" does not make it safe. An MC-331 tanker contains thousands of gallons of liquefied propane under pressure. Approaching a leaking pressurized LPG tanker in SCBA with no specialized HazMat PPE is not an Operations Level action — it\'s a Technician Level action requiring specialized training, suit protection, and metering equipment. SCBA protects your lungs but not your skin from cryogenic LPG. Do not approach.',
            },
          },
          {
            id: 'c',
            text: 'Maintain the 330-foot perimeter — that\'s sufficient per ERG for LPG.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The 330-foot initial isolation distance is for unknown materials. Once you have identified this as an LPG tanker on fire or releasing product from a damaged tank, the ERG Guide 115 is clear: the large spill isolation distance and the potential BLEVE radius both significantly exceed 330 feet. The ERG green pages also specify evacuation distances for these materials. Upgrade the perimeter.',
            },
          },
          {
            id: 'd',
            text: 'Note the product identification and wait for HazMat to arrive before any action.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Waiting for HazMat is the right call for intervention — but you should not wait passively. Expanding the isolation perimeter, notifying dispatch of the product identity, redirecting traffic, and eliminating ignition sources (including stopping nearby motorists from starting their cars) are all Awareness Level actions you can and should take immediately. Identification gives you the information to act on — use it.',
            },
          },
        ],
      },

      {
        id: 'h3',
        title: 'Scene 3 of 4 — Exposure Management',
        situation: 'You have expanded the perimeter to 1,600 feet and notified dispatch of LPG. The two originally symptomatic civilians have walked toward your position. One appears confused and has reddened skin on their arms. Another civilian from a stopped vehicle 400 feet back is running toward you saying their chest hurts. State Police have arrived and are assisting with traffic. HazMat ETA: 12 minutes. How do you handle the exposures?',
        choices: [
          {
            id: 'a',
            text: 'Establish a decontamination corridor upwind of the hot zone. Have EMS evaluate both civilians at the decon point. Do not allow them into the command post area until they have been assessed for secondary contamination.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Any person exiting a LPG vapor hazard zone needs to be treated as potentially contaminated. LPG itself does not leave a hazardous residue on skin in the same way a corrosive or toxic liquid would, but the confused civilian with reddened skin may have been exposed to other released materials or suffered a thermal injury. The decon corridor protects EMS personnel and prevents secondary contamination. Evaluate at decon, then treat.',
            },
          },
          {
            id: 'b',
            text: 'Have EMS immediately treat both civilians at your command post position — they\'ve already walked away from the hazard.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Treating them immediately without decon is understandable given their symptoms, but it risks contaminating your EMS crew and command post with whatever product they were exposed to. The standard protocol is gross decon first (remove clothing, rinse with water if appropriate), then EMS assessment. The additional 60-90 seconds for gross decon is worth the protection of your EMS crew.',
            },
          },
          {
            id: 'c',
            text: 'Refuse to treat the civilians until HazMat arrives and identifies the specific exposure.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Withholding emergency medical care from symptomatic victims until HazMat arrives is not an acceptable response. You have identified the primary hazard (LPG). EMS can safely assess and treat victims at a properly set up decon corridor with appropriate PPE. Waiting 12 minutes for HazMat while a victim with chest pain and another with reddened skin go untreated is a care failure.',
            },
          },
          {
            id: 'd',
            text: 'Ask the confused civilian to walk back to their vehicle and wait since they seem mobile.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Sending a symptomatic, potentially exposed civilian back toward the hazard zone — or simply away from medical care — is not an acceptable option. The confused civilian with reddened skin may have suffered a cold burn from LPG contact or is exhibiting signs of asphyxiation from oxygen displacement. They need medical evaluation, not redirection.',
            },
          },
        ],
      },

      {
        id: 'h4',
        title: 'Scene 4 of 4 — HazMat Arrival & Transfer of Command',
        situation: 'HazMat team arrives. Their captain approaches you for a briefing. You have been managing this incident for 18 minutes. What information must you provide in your transfer-of-command briefing?',
        choices: [
          {
            id: 'a',
            text: 'Product identity (LPG, UN 1075, MC-331 tanker), current perimeter size, wind direction and speed, number and condition of known exposures, resources on scene, and any actions already taken.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the complete ICS transfer-of-command briefing. The HazMat captain needs to know: what they\'re dealing with (UN 1075, LPG, MC-331 tanker), what your perimeter is, where the wind is pushing vapors, who has been exposed and their condition, what resources are staged, and what has already been done. This is exactly the information required under NFPA 472 and ICS-200 transfer-of-command protocols. Thorough, organized, no critical gaps.',
            },
          },
          {
            id: 'b',
            text: 'Give them a brief overview and tell them to figure out the rest — they\'re the experts.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A complete transfer of command briefing is a formal ICS requirement, not optional. The HazMat captain was not on scene for the first 18 minutes. They do not know the wind shift that occurred, the civilian exposures, the expanded perimeter you established, or what resources are positioned where. "They\'re the experts" does not excuse an incomplete command briefing. This gap in communication causes incidents within incidents.',
            },
          },
          {
            id: 'c',
            text: 'Hand command to the HazMat captain and go help your crew repack hose.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Abandoning command without a formal briefing is not a transfer — it\'s an abdication. The HazMat captain inherits a scene they know almost nothing about. This is how resources end up out of position, exposure victims get missed, or the perimeter collapses because the new IC doesn\'t know it was already expanded.',
            },
          },
          {
            id: 'd',
            text: 'Tell the HazMat captain the product ID and let them establish their own command post — you\'ll maintain a separate command.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Dual command — two incident commanders operating simultaneously — is a fundamental ICS violation. There is one IC at any incident. When HazMat assumes command, you transfer command completely (with a full briefing) and return to your role as an Operations resource under their command. Running parallel command structures creates conflicting orders, resource conflicts, and communication chaos.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Never enter a vapor cloud or hazard zone without product identification and appropriate PPE — ever.',
        'The 330-foot initial isolation is for unknowns. Once identified, use ERG guidance for that specific material.',
        'A leaking LPG tanker on its side is a potential BLEVE — 1,600-foot isolation is not excessive, it\'s correct.',
        'Decon before treatment. Even a few minutes of gross decon protects your EMS crew.',
        'Transfer of command requires a complete formal briefing — it is not optional and not informal.',
        'Your job at a hazmat incident as an Awareness/Operations responder is: recognize, isolate, notify, protect. Not intervene.',
      ],
      references: ['ERG 2024 (UN 1075, Guide 115)', 'NFPA 472', 'OSHA 29 CFR 1910.120', 'ICS-200', 'NFPA 1'],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 3. MAYDAY — FIREFIGHTER DOWN IN BASEMENT
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'mayday-firefighter-down',
    title: 'Mayday — Firefighter Down',
    description: 'A firefighter has transmitted a Mayday from a basement during an active structural fire. Navigate RIT deployment, command reorganization, and accountability under pressure.',
    category: 'Firefighter Safety',
    difficulty: 'Advanced',
    estimatedMinutes: 18,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🆘',
    badgeColor: 'bg-red-100 text-red-700',

    setup: {
      dispatch: 'You are Incident Commander at a working structure fire — 1-story commercial occupancy with a basement. Two attack crews are operating. You have been on scene 11 minutes.',
      narrative: 'Operations are progressing. Engine 12\'s crew (2 firefighters) is on the main floor attacking a fire that originated in the basement utility room. Engine 9\'s crew is searching the main floor. Ladder 7 is venting the roof. Your RIT (Rapid Intervention Team) is Engine 6, staged outside. Fire has been knocked down to a heavy smoke condition. Suddenly, your radio crackles: "MAYDAY, MAYDAY, MAYDAY — Engine 12, Firefighter Harris. I\'m in the basement, I fell through the floor, I\'m trapped under debris. I have air." Your PAR board shows Harris is the only crew member unaccounted for — Engine 12\'s other firefighter exited with a line malfunction 4 minutes ago.',
      details: [
        'Firefighter Harris: alone in basement, fell through floor, trapped under debris, has air (unknown quantity)',
        'Current crews inside: Engine 9 (2 FF) on main floor searching, Ladder 7 (2 FF) on roof',
        'RIT staged: Engine 6 (3 FF) ready outside',
        'Other resources: Engine 8 arriving (2 minutes out), Battalion Chief on scene',
        'Structure: 1-story commercial, basement accessible via interior stairwell and exterior Bilco doors on Side C',
        'Fire status: Knocked down to heavy smoke, origin basement utility room',
      ],
    },

    scenes: [
      {
        id: 'm1',
        title: 'Scene 1 of 4 — Mayday Declaration Response',
        situation: 'You have just received Harris\'s Mayday transmission. The radio channel is now critical. What are your first three actions as Incident Commander?',
        choices: [
          {
            id: 'a',
            text: 'Acknowledge the Mayday on radio. Switch all non-Mayday traffic to a secondary channel. Immediately deploy RIT (Engine 6) to the last known location.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct sequence. Acknowledging the Mayday on radio confirms Harris was heard and activates the RIT deployment. Moving general operations to a secondary channel keeps the primary channel clear for Mayday communications — radio traffic congestion during a Mayday is a documented factor in fatalities. Deploying RIT immediately is the correct action — their entire function is this moment. You are executing the Mayday protocol.',
            },
          },
          {
            id: 'b',
            text: 'Immediately call for a second alarm before doing anything else — you need more resources.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Calling for resources is necessary — but it\'s not the first action. Harris is in the basement right now. Every second counts. Acknowledge the Mayday, clear the radio channel, and deploy your RIT first. You can request additional resources simultaneously or within seconds, but the first radio transmission after a Mayday must be command acknowledging the distress call. Harris needs to know they were heard.',
            },
          },
          {
            id: 'c',
            text: 'Order all crews to immediately exit the structure and go defensive.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Ordering a defensive withdrawal with a firefighter trapped inside abandons Harris. NFPA 1 and NFPA 1500 are explicit: when a Mayday is declared, the priority is firefighter rescue. You have a RIT staged specifically for this scenario. Going defensive is only appropriate when the structure is imminently close to collapse and entry is not survivable — not as a reflexive first response to a Mayday.',
            },
          },
          {
            id: 'd',
            text: 'Personally go to the basement entry to assess conditions and find Harris yourself.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The IC leaving the command post during a Mayday is one of the worst things that can happen. You are the brain of the incident. If you go interior, command collapses — nobody is coordinating RIT entry, managing radio traffic, calling for resources, or tracking accountability. You have a RIT for this. Your RIT is Engine 6. Send them.',
            },
          },
        ],
      },

      {
        id: 'm2',
        title: 'Scene 2 of 4 — RIT Entry & Radio Contact',
        situation: 'RIT (Engine 6) is entering the structure to locate Harris. You establish radio contact with Harris: "Harris, this is Command. RIT is entering now. Can you activate your PASS device and tell me your air level?" Harris responds: "PASS is on. I\'m pinned — something heavy on my legs. Can\'t move them. Air reads about 1,000 psi." Meanwhile, Ladder 7\'s officer reports roof conditions are deteriorating. What do you do?',
        choices: [
          {
            id: 'a',
            text: 'Keep Harris talking and focused. Order Ladder 7 off the roof immediately — deteriorating roof with a trapped firefighter in the basement below is critical risk. Request second alarm.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Both decisions are correct. 1,000 psi gives Harris approximately 8-10 minutes at working exertion — you have a narrow window. Keeping verbal contact maintains Harris\'s psychological state and gives RIT directional guidance from PASS sound. Getting Ladder 7 off a deteriorating roof is non-negotiable — a roof collapse while you already have a trapped firefighter compounds the incident exponentially. Requesting a second alarm gives you the resources for a sustained rescue operation.',
            },
          },
          {
            id: 'b',
            text: 'Tell Ladder 7 to continue venting — the hole they\'re cutting is helping visibility for the rescue. Keep Harris talking.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Keeping a crew on a deteriorating roof to maintain ventilation during a Mayday rescue is not an acceptable trade-off. The risk to Ladder 7 (two firefighters) from a roof collapse while conditions are reported as deteriorating outweighs the ventilation benefit. Get them off the roof. RIT can manage with existing conditions.',
            },
          },
          {
            id: 'c',
            text: 'Tell Harris to conserve air and stop talking — every breath counts.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Telling Harris to go quiet is the opposite of what helps a rescue. Verbal communication is how RIT locates a victim when PASS activation alone isn\'t enough in a debris field. Harris\'s voice guides the RIT team. Beyond navigation, maintaining two-way communication is critical for Harris\'s psychological state — silence in a Mayday situation accelerates panic and compromises decision-making.',
            },
          },
          {
            id: 'd',
            text: 'Order Engine 9 to stop their search and go to the basement to assist RIT.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Sending additional resources to the rescue location is understandable — but sending a search crew into a debris-filled basement during a RIT rescue can create congestion and confusion in a smoke-filled confined space. The basement is already crowded with debris and now RIT. Engine 9\'s search may also be protecting occupants on the main floor. Coordinate through RIT\'s officer rather than sending additional crews directly.',
            },
          },
        ],
      },

      {
        id: 'm3',
        title: 'Scene 3 of 4 — Rescue in Progress',
        situation: 'RIT locates Harris — a floor joist has collapsed across both legs. RIT is working to free Harris using hand tools. Harris reports air pressure at 700 psi and is getting anxious. RIT officer requests a rotary saw and a second RIT team entry to assist with debris removal. Engine 8 has arrived. What do you do?',
        choices: [
          {
            id: 'a',
            text: 'Send the rotary saw via a runner. Assign Engine 8 as secondary RIT entry team. Continue managing all radio traffic from command post and request a third alarm.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct on all counts. Getting the saw to RIT quickly is mission-critical — every minute Harris is pinned consumes air. Engine 8 as secondary entry gives RIT the hands they need for debris removal. Continuing to manage from the command post maintains incident control. At 700 psi with a complex extrication underway, a third alarm is prudent — you will need rehabilitation, possible additional medical support, and relief crews.',
            },
          },
          {
            id: 'b',
            text: 'Go to the basement entry yourself to hand off the saw and assess the rescue firsthand.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Again — the IC leaving command during an active Mayday rescue is a critical error. The saw can be delivered by any available person. You staying at command is not optional. The moment you go to the basement entry, nobody is tracking the roof condition, managing radio channels, coordinating incoming Engine 8, or monitoring air supply. Your span of control collapses.',
            },
          },
          {
            id: 'c',
            text: 'Tell RIT to use what they have — sending more people into the basement creates confusion.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'RIT is requesting specific resources (saw, additional personnel) because the rescue requires them. Denying those resources because of a generic concern about confusion overrides the on-scene team\'s assessment. Your RIT officer is in the basement with Harris. Trust their resource request. Get them what they asked for.',
            },
          },
          {
            id: 'd',
            text: 'Order all interior crews out immediately — 700 psi is critically low.',
            outcome: {
              points: 0,
              correct: false,
              narrative: '700 psi is low but not emergency-critical yet (approximately 7-8 minutes remaining). Pulling all crews at this stage abandons Harris when the rescue is in progress. The correct response to low air is urgency, not withdrawal. RIT is trained to work with air management awareness. They know Harris\'s air level — it\'s why they\'re working faster. Support their effort, don\'t end it.',
            },
          },
        ],
      },

      {
        id: 'm4',
        title: 'Scene 4 of 4 — Extrication & Rehabilitation',
        situation: 'Harris is free. RIT is carrying Harris out through the Side C Bilco doors. Harris is conscious and breathing but reports severe leg pain and cannot walk. ALS unit is on scene. As you are managing post-rescue operations, your Battalion Chief notes that the two RIT firefighters who were in the basement longest are refusing rehabilitation — they want to go back on the attack line. What do you do?',
        choices: [
          {
            id: 'a',
            text: 'Order both RIT firefighters to mandatory rehabilitation. They are not available for reassignment until medical evaluation clears them. No exceptions.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. NFPA 1584 (Rehabilitation Standard) is clear: crews who have performed a high-stress Mayday rescue are mandatory rehab candidates regardless of their own assessment of their fitness. Post-Mayday operations involve physical exhaustion, potential CO exposure, psychological stress, and dehydration. A firefighter who goes back to work in that state is a second Mayday waiting to happen. Your job as IC is to make that call even when the firefighters resist it.',
            },
          },
          {
            id: 'b',
            text: 'Let them go back to work — they performed excellently and seem fine. They\'re motivated.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Motivation and performance do not override physiological reality. A firefighter who just performed a strenuous rescue in a basement has elevated CO levels, elevated heart rate, depleted hydration, and significant psychological activation. These are measurable physiological states, not opinions. "They seem fine" is not a medical clearance. NFPA 1584 rehab requirements exist precisely because firefighters almost universally underestimate their own impairment post-task.',
            },
          },
          {
            id: 'c',
            text: 'Ask them to decide — it\'s their call whether they feel ready.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Rehabilitation decisions are an Incident Commander function, not a voluntary choice for individual firefighters. This is a documented issue in firefighter fatality reports — the firefighter\'s willingness to return is not a reliable indicator of their medical readiness. The IC makes the call. This is a non-delegable command decision.',
            },
          },
          {
            id: 'd',
            text: 'Have them evaluated by EMS and return them to work if EMS clears them.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'An EMS evaluation is better than nothing, but a rapid field evaluation does not substitute for the full rehabilitation protocol under NFPA 1584 — which includes hydration, rest period, vital sign monitoring over time, and CO monitoring. "Cleared by EMS" in 2 minutes at the tailboard is not the same as rehabilitation. The right answer is formal rehab, not a rapid spot-check.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Acknowledge the Mayday immediately on radio — Harris needs to know they were heard before anything else.',
        'Clear the primary channel for Mayday traffic. Operations move to secondary channel.',
        'The IC never leaves the command post during a Mayday. That is what your RIT is for.',
        'Keep the firefighter talking — voice guides RIT and maintains psychological function under stress.',
        'Roof integrity during a rescue is as important as the rescue itself. Get exposed crews to safety.',
        'Rehabilitation after a Mayday rescue is mandatory, not voluntary. NFPA 1584 is not optional.',
      ],
      references: ['NFPA 1500', 'NFPA 1584', 'NFPA 1710', 'ICS-200', 'IFSTA RIT Operations'],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 4. MCI — MULTI-VEHICLE ACCIDENT
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'mci-multi-vehicle',
    title: 'MCI — Multi-Vehicle Accident',
    description: 'A chain-reaction crash on Route 9 has produced 11 patients. Declare the MCI, implement START triage, activate ICS sections, and manage hospital notifications.',
    category: 'EMS / Rescue',
    difficulty: 'Intermediate',
    estimatedMinutes: 18,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🚨',
    badgeColor: 'bg-blue-100 text-blue-700',

    setup: {
      dispatch: 'DISPATCH: Engine 14, Rescue 14, Medic 6 — respond to Route 9 northbound at County Line Road for a reported multi-vehicle accident. Caller reports multiple vehicles and multiple patients. Unknown number of injuries.',
      narrative: 'You arrive first due to a chain-reaction crash involving 4 vehicles — a tractor-trailer, two passenger cars, and a school activity bus. The school bus is on its side. You can see multiple patients inside the bus through the windows. There are at least 4 adults outside the vehicles in various states of consciousness. Your initial count: approximately 11 patients visible. Two appear unconscious. You have one engine (3 crew), Rescue 14 (2 crew), and Medic 6 (2 medics) on scene.',
      details: [
        'Vehicles: Tractor-trailer (driver standing), 2 passenger cars (4 total occupants), school activity bus on side (7 occupants visible)',
        'Immediate hazards: Diesel fuel leaking from tractor-trailer, downed utility wires on Side D, Route 9 still has northbound lane open',
        'On-scene resources: Engine 14 (3 crew), Rescue 14 (2 crew), Medic 6 (2 paramedics)',
        'En route: Second medic unit (4 min), Engine 8 (6 min), 2 additional medic units (10 min)',
        'Nearest trauma centers: University Hospital Newark (Level I, 18 min), Morristown Medical (Level II, 12 min)',
        'MCI threshold in your jurisdiction: 6+ patients requires MCI declaration',
      ],
    },

    scenes: [
      {
        id: 'c1',
        title: 'Scene 1 of 4 — MCI Declaration & Initial Organization',
        situation: 'You have 11 visible patients, two of whom appear unconscious. You have 7 crew members on scene plus 2 paramedics. You have downed wires, fuel leakage, and an active lane of traffic. What are your first actions?',
        choices: [
          {
            id: 'a',
            text: 'Declare MCI on radio. Request additional ALS units and a medical supervisor. Order crew to begin START triage only — no treatment until all patients are tagged. Notify dispatch to alert receiving hospitals. Assign one person to manage traffic.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the correct MCI initial response sequence. Declaring MCI triggers the regional mass casualty plan and starts the hospital notification chain. The critical rule in MCI: triage before treatment. Resources spent treating the first patient found may leave a critically injured but survivable patient unaddressed. START triage in 60 seconds per patient gets all 11 assessed in under 15 minutes. Traffic management is a simultaneous safety priority — Route 9 northbound being open is an active threat to responders and patients.',
            },
          },
          {
            id: 'b',
            text: 'Direct all crew to immediately treat the two unconscious patients — they are the most critical.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is the single most common error at MCIs — treating immediately obvious critical patients and never reaching others who are dying quietly. In MCI protocol, your most critical patients do not automatically receive care first. START triage identifies who is salvageable. An unconscious patient who is not breathing with a non-correctable airway is tagged Black (expectant) — and your resources go to patients who can survive with your interventions. Treat-first without triage uses your limited resources inefficiently.',
            },
          },
          {
            id: 'c',
            text: 'Wait for more resources before beginning triage — you don\'t have enough crew to manage 11 patients.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Waiting 4-10 minutes for additional units before beginning triage allows deteriorating patients to cross from survivable to non-survivable. START triage is specifically designed for exactly this resource-to-patient ratio imbalance. You have enough people to begin now. MCI protocols exist precisely because the resources never feel adequate — that\'s the nature of mass casualty events.',
            },
          },
          {
            id: 'd',
            text: 'Declare MCI and personally begin treating the nearest patient while your crew sets up the scene.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The IC treating patients abandons the command function. You have 11 patients, active hazards, incoming resources, hospital notifications to initiate, and a traffic control problem. None of those things will manage themselves. Get into command mode immediately — your paramedics and crew are your hands, and they need direction from you, not competition for a patient.',
            },
          },
        ],
      },

      {
        id: 'c2',
        title: 'Scene 2 of 4 — START Triage Results',
        situation: 'Your crew completes initial START triage. Results: 2 Black (deceased/unsalvageable), 3 Red (immediate — life threat, needs intervention now), 4 Yellow (delayed — serious but stable), 2 Green (walking wounded). You have Medic 6 (2 paramedics) and your 5 crew members available for treatment. Second medic unit is 2 minutes out. How do you allocate your resources?',
        choices: [
          {
            id: 'a',
            text: 'Medic 6 to the 3 Red patients immediately. Crew members stabilize Yellow patients and keep Green patients together. Black patients are not a treatment priority — do not assign crew. Prepare treatment sector for incoming ALS units.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct MCI resource allocation. Red patients get ALS immediately — they will die without rapid intervention. Yellow patients need monitoring and basic stabilization from your crew — they are serious but their condition gives you time. Green patients are walking wounded; keep them corralled together for assessment by incoming resources. Black patients receive no active treatment under MCI protocol (this is legally and ethically supported under mass casualty doctrine). Setting up a treatment sector positions you for the incoming resources.',
            },
          },
          {
            id: 'b',
            text: 'Send crew to provide comfort care to the Black-tagged patients — they\'re still human beings.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is emotionally the hardest part of MCI protocol — and it is absolutely correct to feel that tension. However, assigning crew to Black-tagged patients in a resource-constrained MCI diverts care from patients who can be saved to patients who cannot. MCI doctrine, SALT triage, START protocol, and FEMA MCI guidelines are consistent on this point: resources flow to salvageable patients. After all salvageable patients have received care and additional resources arrive, then Black patients receive attention.',
            },
          },
          {
            id: 'c',
            text: 'Have all crew members address the Reds first together — the 3 most critical need the most help.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Concentrating all resources on Red patients ignores the Yellow patients, who can deteriorate to Red without monitoring. Additionally, 7 people working on 3 patients is inefficient — crew members get in each other\'s way. MCI resource allocation is about matching the minimum adequate resource to each priority tier, not overwhelming one tier while neglecting others.',
            },
          },
          {
            id: 'd',
            text: 'Wait for the second medic unit to arrive in 2 minutes before making any treatment assignments.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Your two paramedics are on scene right now. Waiting 2 minutes for additional ALS before beginning treatment on 3 Red patients is not an acceptable delay. Two minutes in a patient with a compromised airway or hemorrhagic shock is clinically significant. Begin treatment now with available resources; integrate the incoming unit when they arrive.',
            },
          },
        ],
      },

      {
        id: 'c3',
        title: 'Scene 3 of 4 — Hospital Notification & Transport',
        situation: 'Treatment is underway. Your 3 Red patients include: a child with head trauma (GCS 7), an adult with a femur fracture and suspected internal bleeding, and an adult with an open chest wound. You have two medic units. Two additional medic units are 8 minutes out. You need to notify hospitals. What is your transport plan?',
        choices: [
          {
            id: 'a',
            text: 'Notify both University Hospital Newark (Level I, 18 min) and Morristown Medical (Level II, 12 min) of the MCI via medical command radio. Child with head trauma to University Hospital — Level I trauma center is required for pediatric head injury. Femur/internal bleeding to Morristown. Chest wound to University. Stagger transport to avoid overwhelming one center.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Level I trauma center is indicated for the pediatric head injury (GCS 7 in a child requires neurosurgical capability). Distributing patients between two centers prevents overwhelming one facility while the other sits underutilized — a real problem in MCIs. Notifying both hospitals simultaneously allows them to activate their mass casualty protocols. Medical command radio coordination ensures the receiving ED is ready when the unit arrives.',
            },
          },
          {
            id: 'b',
            text: 'Send all three Red patients to Morristown Medical since it\'s closer — 12 minutes vs. 18 minutes matters.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Time matters — but level of care matters more for specific injuries. A Level II center does not have the same neurosurgical capability as a Level I for a pediatric head injury with GCS 7. The 6-minute difference may not outweigh the difference in available surgical and neurosurgical resources. Additionally, sending all three critical patients to one Level II center may exceed their immediate surge capacity.',
            },
          },
          {
            id: 'c',
            text: 'Wait for medical command to direct all transport decisions — you shouldn\'t make these calls independently.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'At an active MCI with critical patients, waiting passively for medical command to make all transport decisions creates dangerous delays. Your paramedics are ACLS-certified and you have medical direction authority for emergent transport decisions. You notify medical command and initiate transport — you don\'t wait for permission to move a critical patient.',
            },
          },
          {
            id: 'd',
            text: 'Hold all transport until all 4 medic units are on scene so you can coordinate simultaneous transport.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Holding critical patients for 8 minutes to achieve simultaneous transport coordination is not the correct call. Your two medic units on scene are capable of transport right now. Waiting 8 more minutes for administrative coordination is not a medical rationale for delay. Begin transport of the highest priority patients with available units; incoming units transport the next tier.',
            },
          },
        ],
      },

      {
        id: 'c4',
        title: 'Scene 4 of 4 — Scene Termination',
        situation: 'All critical patients have been transported. Remaining on scene: 4 Yellow (treated, stable, awaiting transport) and 2 Green (walking wounded, evaluated). You still have the downed wires, the fuel leak, and the school bus on its side. A reporter is at the perimeter asking for a statement. The school bus driver wants to call parents. What do you do?',
        choices: [
          {
            id: 'a',
            text: 'Keep the media back until public information is cleared through the police PIO. Have the school bus driver contact their dispatcher — the school district notifies parents through official channels. Request utility company for wires. Secure the fuel spill with Engine 14 and foam if available.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the complete correct approach. Media relations at an MCI go through the designated Public Information Officer — typically the police department at a highway incident. The IC does not give statements directly. Parents of students on a school bus need to be notified through the school district\'s official system, not informally by a driver — this controls information accuracy and routes next-of-kin to a proper reception point. The utility company handles downed wires, not fire department. Fuel spill is a fire department responsibility.',
            },
          },
          {
            id: 'b',
            text: 'Give the reporter a brief statement — it\'s better to get ahead of the story.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Giving media statements without coordination with the PIO and law enforcement is not the IC\'s role at a multi-agency incident. You may inadvertently release patient information (HIPAA), give inaccurate casualty counts, or create information that conflicts with official releases. Even a well-intentioned brief statement can cause significant problems. Refer all media to the designated PIO.',
            },
          },
          {
            id: 'c',
            text: 'Allow the bus driver to call parents — the kids are all accounted for so it\'s fine.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Informal parent notification from a shaken driver following a bus rollover MCI creates chaos: inconsistent information, parents racing to a highway accident scene, conflicting reports of injury status. School district emergency protocols exist for exactly this scenario. The bus driver should contact their dispatcher and let the district handle parent notification through established channels.',
            },
          },
          {
            id: 'd',
            text: 'Have a crew member pull the downed wires away from the vehicles so they\'re no longer a hazard.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Firefighters do not move downed utility wires. This is one of the clearest operational boundaries in the fire service. Even lines that appear de-energized can re-energize. The utility company (JCP&L, PSE&G, etc.) has the authority and equipment to handle downed wires. Your job is to isolate the area and request utility response. Moving a downed wire is how responders die.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Declare MCI and begin START triage immediately — do not treat the first patient you reach without triaging all patients first.',
        'In MCI, Black-tagged patients are not a treatment priority while salvageable patients need care. This is doctrine, not callousness.',
        'Level of care takes precedence over proximity for specific critical injuries — pediatric head trauma needs a Level I center.',
        'Distribute patients across receiving facilities to prevent overwhelming one center.',
        'Media and parent notifications go through official channels — PIO and school district, not the IC directly.',
        'Downed wires are a utility company responsibility. Isolate and request, never move.',
      ],
      references: ['FEMA MCI Field Operations Guide', 'START Triage Protocol', 'NIMS ICS-200', 'NJ EMS Protocols', 'NFPA 1'],
    },
  },


// ══════════════════════════════════════════════════════════════════════
  // 1. COMMERCIAL STRUCTURE FIRE
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'structure-fire-commercial',
    title: 'Commercial Structure Fire',
    description: 'Large single-story warehouse in NJ industrial area with lightweight truss roof. Heavy fire involvement, possible occupants inside. Navigate offensive/defensive decisions, water supply challenges, roof safety, and defensive transition.',
    category: 'Structural Firefighting',
    difficulty: 'Advanced',
    estimatedMinutes: 25,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🏢',
    badgeColor: 'bg-orange-100 text-orange-700',

    setup: {
      dispatch: 'DISPATCH: Engine 14, Ladder 7, Rescue 14 — respond to 1580 Industrial Boulevard for a reported warehouse structure fire. Caller reports heavy smoke and flames visible from exterior.',
      narrative: 'You are the first arriving officer on Engine 14. It is 10:15 on a weekday morning. You approach a large single-story metal-frame warehouse, approximately 200 feet long by 120 feet wide. Heavy black smoke with orange flame visible at the roof level, Side B (east side). Windows are intact but showing internal fire glow. Employees from adjacent buildings are evacuating to the parking lot. The structure appears to be a distribution warehouse — high ceiling, lightweight steel truss roof, no signs of roof collapse yet. Your dispatcher advises mutual aid has been requested.',
      details: [
        'Structure: Single-story warehouse, ~24,000 sq ft, lightweight steel truss roof (typical post-1990s construction)',
        'Fire position: Heavy fire at roof level, appears to be upper storage area or attic space',
        'Occupancy: Small office presence (2-3 people reported accounted for); main warehouse unknown',
        'Water supply: Public hydrant system, closest yellow hydrant 300 feet away',
        'Weather: 58°F, wind 12 mph from the south (Side A toward Side C)',
        'Roof construction: Lightweight trusses with metal decking — high collapse risk at temperature',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 5 — Initial Size-Up & Offensive vs. Defensive Decision',
        situation: 'Heavy fire at roof level on a building with lightweight trusses. Your crew of 5 firefighters is ready. Ladder 7 is 4 minutes out. You have not yet confirmed if anyone is inside. What is your initial strategy?',
        choices: [
          {
            id: 'a',
            text: 'Wait at the command post for complete size-up and mutual aid arrival before committing to an interior attack',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Waiting 4-5 minutes at a commercial structure with visible fire at the roof level is passive. The fire is already showing at height. Every minute increases the likelihood of roof failure, venting upward, and spread. If the building is unoccupied (which initial reports suggest), an aggressive offensive approach with your first-due resources is appropriate. Waiting for mutual aid when fire is already visible is a missed opportunity for early attack.',
            },
          },
          {
            id: 'b',
            text: 'Establish command. Determine occupancy status through dispatch and adjacent building staff. Position apparatus for defensive operations — long lay to hydrant. Prepare to attack via exterior elevated streams if interior is too hazardous.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. A lightweight truss commercial structure with roof-level fire is a defensive priority. You must establish command immediately, confirm occupancy, and position for a defensive posture unless confirmed occupants exist AND rescue is possible. A long lay from the hydrant puts your apparatus in a safe supply position. Elevated streams can hit roof fire from outside without committing crews to a structurally suspect building. Roof fires in lightweight trusses are prone to sudden collapse.',
            },
          },
          {
            id: 'c',
            text: 'Pull two attack lines and make immediate interior entry on Side A to locate the fire source',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Interior entry into a commercial structure with active roof fire and lightweight trusses is an extreme hazard. The fire is already above you. Entering below an active fire in a truss-roof building with heavy smoke can lead to disorientation and entrapment if the roof fails during your entry. You need size-up, occupancy confirmation, and a clear picture of fire involvement before any interior commitment.',
            },
          },
          {
            id: 'd',
            text: 'Position for exterior defensive operations and request a second alarm immediately for additional ladder trucks',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Going defensive immediately is reasonable given the roof fire and lightweight construction — but requesting a second alarm before sizing up the occupancy and fire extent is premature. A single-story warehouse with no confirmed occupants may not justify a second alarm. Size up first, confirm occupancy and fire spread, then request additional resources based on actual conditions.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 5 — Water Supply Challenge (Long Lay)',
        situation: 'Dispatch confirms: no workers currently in the building according to office staff (morning inventory day, but they were told to evacuate). Fire is spreading across the roof. You are 300 feet from the nearest hydrant on a dead-end main. Your engine carries 500 gallons. What is your water supply strategy?',
        choices: [
          {
            id: 'a',
            text: 'Use your 500 gallons for initial attack while Engine 15 lays supply line from the hydrant 300 feet away',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Using your tank for initial attack while supply is being laid is a standard tactic, BUT: a 300-foot dead-end main is a significant pressure concern. You will have limited pressure by the time water reaches you. Starting with your 500-gallon tank is acceptable, but you should have an additional engine staged at the hydrant for relay operation from the start, not layered afterwards. Pressure loss on dead-end mains is substantial.',
            },
          },
          {
            id: 'b',
            text: 'Request tanker (water truck) support immediately to avoid the long hydrant lay',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Tanker support is useful for truly remote locations, but a 300-foot hydrant distance is not remote — it\'s a standard long lay situation. Requesting a tanker as a first option is inefficient when you have viable hydrant supply. Master the long lay before defaulting to tankers.',
            },
          },
          {
            id: 'c',
            text: 'Position Engine 14 at the hydrant. Have Engine 15 relay from the main. Establish a supply line with a portable water tank at the operation for backup flow.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Excellent. On a dead-end main with a 300-foot distance, you need: (1) an engine at the hydrant supplying pressure, (2) a relay engine boosting signal, and (3) a portable tank for surge capacity if pressure fluctuates. This is textbook water supply management for distant/difficult hydrants. The portable tank prevents flow starvation if pressure dips during periods of high nozzle demand.',
            },
          },
          {
            id: 'd',
            text: 'Pull a single long supply line 300 feet to your operation position and supply directly from the hydrant',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A 300-foot single lay on a dead-end main will experience significant friction loss. Pressure at the pump will be high, but pressure at the nozzle end (where your lines are) will drop substantially — especially if you\'re running multiple lines. You cannot guarantee adequate flow without relay and boosting.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 5 — Ventilation & Roof Safety',
        situation: 'Fire is now spreading across approximately 40% of the roof. Ladder 7 has arrived and wants to cut a ventilation hole at the roof peak. The roof is sagging visibly in one corner (Side C). What do you advise?',
        choices: [
          {
            id: 'a',
            text: 'Deny roof operations entirely. Switch to aerial ladder platform ventilation from outside the structure at safe reach',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct and critical. A visibly sagging roof means structural failure is underway. No firefighters should be on that roof. Aerial ladder platform ventilation (or aerial ladder with nozzle) can cut ventilation holes or direct stream from outside the collapse zone. This is a textbook defensive transition: abandon roof operations immediately when structural compromise appears.',
            },
          },
          {
            id: 'b',
            text: 'Approve the vertical ventilation cut at the roof peak away from the visible sag to relieve heat and smoke',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Even a "safe" area of a sagging roof is not safe. Visible sagging indicates structural failure is already occurring. Adding firefighters and equipment to the roof — especially cutting holes that remove structural support from metal decking — is an unacceptable risk. If the roof is showing sag, ventilation must be aerial ladder ventilation from the ground, not from the roof itself.',
            },
          },
          {
            id: 'c',
            text: 'Allow Ladder 7 to scout the roof. If they see additional sag, they can exit quickly',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Scouting a compromised roof is a Mayday waiting to happen. Collapse can be sudden and catastrophic. The visible sag is your signal to prohibit all roof operations. "They can exit quickly" is wishful thinking — roof collapses trap firefighters in seconds.',
            },
          },
          {
            id: 'd',
            text: 'Have Ladder 7 perform ground-level ventilation by opening all accessible doors and windows instead',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Ground-level ventilation (horizontal ventilation) by opening doors and windows does provide some relief, but it does not substitute for vertical ventilation in a commercial structure with heavy fire at height. Vertical ventilation is required for effective heat and smoke removal — but it MUST be done from aerial platform, not from the compromised roof.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 5 — Exposure Protection',
        situation: 'The warehouse is now 60% involved. An adjacent building (Side C) is occupied by a manufacturing plant. Wind is pushing heavy heat and embers toward that structure. The east wall of the adjacent building is showing scorch marks. What action do you take?',
        choices: [
          {
            id: 'a',
            text: 'Leave the adjacent building occupied — they are far enough away. Focus all fire suppression on the main warehouse',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Scorch marks on the adjacent structure indicate it is already receiving significant radiant heat. Occupants are at risk. Embers can penetrate windows and ignite interior contents. Maintaining occupants inside a building receiving active exposure from a multi-building fire is not acceptable. Exposure building evacuation is a life-safety priority.',
            },
          },
          {
            id: 'b',
            text: 'Request rapid building evacuation but do not commit water resources to the exposed building until the main warehouse is controlled',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Evacuating the adjacent building is correct. However, withholding water from the exposed building is a prioritization error. Exposure protection is a simultaneous operation with main fire suppression — not a later step. With multiple engines on scene, you can cool the exposed building while attacking the main fire. Early exposure protection prevents secondary structures from igniting.',
            },
          },
          {
            id: 'c',
            text: 'Evacuate the adjacent building immediately. Station Engine 16 to cover the exposed wall with constant water spray and monitor for ignition',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Exposure protection has two phases: (1) remove people from danger via evacuation, (2) cool the exposed structure with defensive water application. Scorch marks indicate radiant heat exposure. An engine with a master stream or elevated nozzle can maintain coverage on the exposed wall while crews evacuate the adjacent building. This is a textbook defensive operation.',
            },
          },
          {
            id: 'd',
            text: 'Post a single firefighter with a garden hose at the corner of the adjacent building to watch for fire extension',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A single firefighter with a garden hose cannot adequately protect an industrial building from radiant heat and ember exposure from a major warehouse fire. You need an engine with pump pressure, a master stream or elevated nozzle, and continuous monitoring. Also, the building occupants need to be evacuated — this is not a situation where defensive holding is sufficient.',
            },
          },
        ],
      },

      {
        id: 's5',
        title: 'Scene 5 of 5 — Defensive Transition & Roof Collapse',
        situation: 'The roof of the main warehouse is now 80% involved. You hear a loud cracking sound from Side B. The roof sag has spread across half the structure. All personnel have been clear of the roof for the past 10 minutes. You are running four attack lines (two from Engine 14, one from Engine 15, one elevated ladder nozzle). What is your incident posture now?',
        choices: [
          {
            id: 'a',
            text: 'Continue aggressive attack. Increase nozzle pressure and flow to knock down the fire before the roof collapses completely',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Increasing flow and aggression on a structure that is actively failing is reckless. Roof collapse is imminent. The warehouse is unoccupied. Continuing heavy attack does not save property if the structure fails — it only increases the risk of collapse trapping firefighters. Shift to a defensive exterior posture, maintain exposure protection, and allow the roof to collapse under controlled conditions.',
            },
          },
          {
            id: 'b',
            text: 'Withdraw all lines and go fully defensive with no water application — let the structure burn out',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Withdrawing all water while the exposed adjacent building is still at risk is wrong. Exposure protection is still your responsibility. The exterior lines are preventing fire from spreading to the manufacturing plant. Continue water application on the exposed building and surrounding areas while allowing the main structure to burn defensively.',
            },
          },
          {
            id: 'c',
            text: 'Request that the roof be internally shored with temporary supports to prevent collapse',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Temporary shoring of a failing commercial roof during active fire operations is not a realistic or safe option. Shoring takes time, requires close proximity to the structure, and does not address the underlying structural failure. When a roof is showing active sag and cracking, the only safe action is to accept the collapse as inevitable and protect personnel and exposures from it.',
            },
          },
          {
            id: 'd',
            text: 'Maintain current defensive exterior attack (four lines operating). Do not commit any personnel inside or above. Prepare for roof collapse by moving all personnel outside the collapse zone (150 feet minimum from the structure)',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Perfect. You are in full defensive posture: exterior lines only, no interior crews, personnel staged outside collapse zone. The roof is going to fail — it is a question of when, not if. Maintaining exterior streams keeps heat and flames from spreading to adjacent structures and allows the fire to burn down in a controlled manner. A 200-foot structure with a collapsing roof requires a 150+ foot perimeter minimum. This is a defensive victory.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Lightweight truss commercial structures are inherently high-collapse-risk buildings. Visible sagging is a signal to abandon offensive operations immediately.',
        'Establish command early and confirm occupancy status — it dictates whether you attack aggressively or defend defensively.',
        'Water supply on dead-end mains requires relay engines and boosting — never attempt a long lay on a single engine pressure.',
        'Vertical ventilation on a compromised roof is forbidden. Use aerial ladder platform ventilation from the ground.',
        'Exposure protection (evacuation + defensive water application) must happen simultaneously with main fire operations, not sequentially.',
        'Defensive exterior operations prevent property spread and protect firefighters. Know when to transition from offensive to defensive posture.',
      ],
      references: [
        'NFPA 1410 — Fireground Operations',
        'OSHA 1910.134 — SCBA and Respiratory Protection',
        'ICS-200 — Incident Command System',
        'IFSTA Essentials Ch. 11 — Building Construction & Collapse',
        'ICONE Guidelines — Commercial Building Firefighting',
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 2. GARDEN APARTMENT FIRE
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'structure-fire-garden-apt',
    title: 'Garden Apartment Fire',
    description: 'Multi-unit garden apartment complex with fire on 2nd floor spreading via common cockloft. Navigate multi-unit evacuation, attack line selection, cockloft containment, victim search, and utility coordination.',
    category: 'Structural Firefighting',
    difficulty: 'Intermediate',
    estimatedMinutes: 20,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🏘️',
    badgeColor: 'bg-orange-100 text-orange-700',

    setup: {
      dispatch: 'DISPATCH: Engine 14, Ladder 7 — respond to Lincoln Gardens Apartments, Building 4, for a reported structure fire. Caller reports smoke from a second-floor window.',
      narrative: 'You arrive at a 3-story garden apartment complex. Building 4 is a long narrow structure with 12 units (4 per floor). Smoke is visible from a second-floor window at the center of the building. Residents are exiting from ground-floor units and gathering in the parking lot. No visible fire yet, but heavy smoke is coming from the stairwell entrance.',
      details: [
        'Structure: Garden apartment, 3 stories, approximately 1960s construction',
        'Layout: Linear building with central hallway and stairwell, common cockloft above entire building',
        'Fire unit: Appears to be Unit 4-B (second floor, center)',
        'Occupancy: Estimated 30-40 residents total; evacuation ongoing',
        'Utilities: Electric meter bank on east side; PSE&G main located 200 feet away',
        'Hydrants: Two yellow hydrants in parking lot, good supply',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 5 — Multi-Unit Evacuation Priority',
        situation: 'Heavy smoke is rolling from the stairwell. Residents are evacuating, but some are moving slowly (elderly, children). You have 8 firefighters on scene (two engines, one ladder). Ladder 7 officer approaches you asking: "How do we prioritize evacuation?" What is your direction?',
        choices: [
          {
            id: 'a',
            text: 'Direct: Ladder goes to roof and checks for cockloft spread. Engine crews begin interior search and evacuation of the fire floor and floors above (Units 4-A through 4-L).',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Splitting resources between roof and interior multi-floor evacuation is premature. You have not confirmed fire location or cockloft involvement yet. Fire is on the second floor — evacuating upper-floor units is important, but the immediate priority is getting people out of the fire unit (4-B) and adjacent units on that floor first. Cockloft checks happen after initial size-up.',
            },
          },
          {
            id: 'b',
            text: 'Order evacuation of the entire building immediately due to the heavy smoke — evacuate all 12 units now',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Full-building evacuation is not wrong, but it is inefficient and disruptive. Ground-floor units are at minimal immediate risk. Prioritizing and staging evacuation (fire floor first, then adjacent, then upper floors) is more orderly and allows resources to focus on the most critical areas. A blanket "evacuate now" command creates panic and chaotic egress.',
            },
          },
          {
            id: 'c',
            text: 'Direct all crews to assist with immediate evacuation of the fire floor (Units 4-A, 4-B, 4-C, 4-D). Confirm the fire location. Once fire floor is clear, then address upper floors and cockloft search.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct priority. In a multi-unit building, the fire floor residents are at greatest immediate risk. Heavy smoke indicates the fire has room of origin involved. Evacuate the fire floor units first (units immediately adjacent to the fire room), then upper-floor units. The cockloft is checked after life safety is addressed. This is sequential prioritization based on hazard proximity.',
            },
          },
          {
            id: 'd',
            text: 'Establish command and send one ladder firefighter to the roof immediately while engines assess the fire floor',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Sending a single roof-mounted firefighter before full size-up and before evacuation is prioritization error. The roof check is important for cockloft spread, but it comes after confirming occupants are evacuating safely from the fire area. With only 8 firefighters total, you cannot afford to commit one to the roof before fire floor evacuation is underway.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 5 — Attack Line Selection & Cockloft Spread',
        situation: 'Fire floor (Unit 4-B) is confirmed occupied by an elderly couple. Ladder reports smoke heavy in the hallway and the fire room is at the rear of the building (Unit 4-C side). You have one 1¾" attack line and one 2½" line ready. The cockloft above the fire is accessible via the stairwell. What is your attack plan?',
        choices: [
          {
            id: 'a',
            text: 'Use the 2½" line to knock down the fire in Unit 4-B from the hallway entry. Once fire is knocked down, send the 1¾" for mop-up and search. Then check the cockloft with ladder above',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Excellent. The 2½" line delivers more water and knocks down fire faster — critical in a multi-unit building where cockloft fire can extend rapidly. Once the primary fire is suppressed, the smaller 1¾" handles mop-up and allows for controlled ceiling examination and search. Cockloft check comes after initial fire suppression. This sequence prevents cockloft spread.',
            },
          },
          {
            id: 'b',
            text: 'Send the 1¾" line into Unit 4-B for direct attack while a second crew pulls ceiling to check for cockloft extension above Unit 4-B',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Using the 1¾" line for interior attack is standard, but pulling ceiling in the hallway above the fire room risks venting heat and smoke further into the cockloft and increasing spread. The cockloft check should happen AFTER the fire is suppressed, not simultaneously. Ceiling operations in a multi-unit building with cockloft involvement should be coordinated and controlled.',
            },
          },
          {
            id: 'c',
            text: 'Go straight to the cockloft via the stairwell opening to check for fire before any interior attack',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Checking the cockloft before suppressing the fire room is backwards. If the cockloft is already involved, you are sending crews into heavy fire above a still-burning room below. You are trapping crews. Suppress the fire below first, then safely examine the cockloft.',
            },
          },
          {
            id: 'd',
            text: 'Delay attack until PSE&G arrives to disable utilities and clear the area for full operations',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Utility coordination is important (see Scene 5), but it does not stop initial fire attack. Electric meters on garden apartments are on the building exterior. PSE&G can be called for shutdown in parallel with fire suppression. Delaying attack while fire spreads into the cockloft is unacceptable.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 5 — Victim Search in Multi-Unit Building',
        situation: 'Unit 4-B fire is knocked down. The elderly couple has been evacuated (helped by neighbors). However, no one has confirmed evacuation from Units 4-A (next door) and 4-D (across the hall). Both doors are closed. Heavy smoke still in the hallway. Your Ladder 7 officer asks: "Do we search both units?" You have 6 firefighters still available.',
        choices: [
          {
            id: 'a',
            text: 'Search only Unit 4-B thoroughly since that is where the fire was. Units 4-A and 4-D likely self-evacuated given the heavy smoke',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You cannot assume evacuation based on smoke alone. Occupants may be asleep, elderly, disabled, or unfamiliar with the building layout. The closed doors on 4-A and 4-D suggest they were not evacuated. In a multi-unit structure, every unit on the fire floor must be searched or confirmed evacuated by direct contact. Assumption is a risk.',
            },
          },
          {
            id: 'b',
            text: 'Split crews: one team searches Unit 4-A while another searches Unit 4-D. Run both searches simultaneously to save time.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Splitting your crew to search two separate units simultaneously in heavy smoke violates two-in/two-out principles and stretches your resources thin. You have 6 available firefighters — two crews of three cannot adequately cover both units and maintain safety protocols. Sequential searching is slower but safer.',
            },
          },
          {
            id: 'c',
            text: 'Request additional resources before conducting searches in Units 4-A and 4-D to increase crew strength',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Requesting additional resources is reasonable for larger operations, but waiting for them to arrive before conducting life-safety searches in adjacent units is a significant delay. You have 6 firefighters on scene — enough for a proper sequential search of two apartments. Use the resources you have.',
            },
          },
          {
            id: 'd',
            text: 'Assign one full team (3 firefighters) to search Unit 4-A thoroughly, then 4-D. The search team must confirm occupancy or declare units clear. Two firefighters maintain stairwell safety and water supply.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. A single search team with three firefighters (maintaining two-in/two-out) can execute sequential searches of 4-A and 4-D. They confirm occupancy, locate any victims, and mark searched units. The other two firefighters maintain stairwell position and crew safety. This is a systematic, safe approach to multi-unit search.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 5 — Cockloft Search & Containment',
        situation: 'Ladder has accessed the cockloft above the fire area via the stairwell opening. They report: "Heavy smoke in the cockloft, some heat — possible fire extension into the attic space above Units 4-B and 4-C. I can see glow." What is your response?',
        choices: [
          {
            id: 'a',
            text: 'Pull ceiling in the fire room and adjacent units to open the cockloft above. Attack cockloft fire from below with streams directed upward into the opening',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct approach. Pulling ceiling from below is the standard technique for cockloft fire in multi-unit buildings. It allows firefighters to work in known space (the apartments) while directing streams upward into the cockloft above. This is much safer than trying to crawl through heavy smoke in a confined attic space. Opens the ceiling, hit the fire from below, check adjacent cockloft sections.',
            },
          },
          {
            id: 'b',
            text: 'Send the 1¾" line into the cockloft immediately to attack the attic fire',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Committing a full attack line to a confined cockloft space in heavy smoke and heat is a safety hazard — crews can become disoriented quickly. Cockloft fires are better attacked by opening the ceiling from below and allowing water to fall into the space, rather than entering the cockloft itself.',
            },
          },
          {
            id: 'c',
            text: 'Close the stairwell opening to prevent cockloft fire from venting into the building and evacuate all personnel to outside',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Closing off the cockloft vent and evacuating is overly defensive. You have fire crews on scene, water supply, and the fire is in the early stages. Cockloft fire contained and suppressed is a solvable problem with interior operations. Abandoning the interior is premature.',
            },
          },
          {
            id: 'd',
            text: 'Request a second alarm and wait for additional resources before addressing the cockloft fire',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Requesting a second alarm for a contained cockloft fire in a 3-story garden apartment is not the initial decision. You have fire crews on scene, confirmed fire location, and suppression capability. Attempt suppression with available resources. A second alarm request may come later if the fire extends beyond the cockloft, but early suppression is the priority.',
            },
          },
        ],
      },

      {
        id: 's5',
        title: 'Scene 5 of 5 — Utility Coordination with PSE&G',
        situation: 'Cockloft fire is knocked down. You are in overhaul phase, checking for hidden fire. An electrical outlet on the fire floor wall is actively sparking — live electrical hazard detected. Water damage to the building is significant. PSE&G has not yet arrived despite being called at the beginning of the incident (18 minutes ago). A building manager is asking when residents can return home. What are your instructions?',
        choices: [
          {
            id: 'a',
            text: 'Escalate the PSE&G response request (call dispatch again with high priority). Establish an "unsafe for occupancy" perimeter. Tell the manager residents cannot return until PSE&G clears the electrical system and you conduct a final building inspection.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. PSE&G response time on a multi-unit building incident should be < 20 minutes. At 18 minutes with no arrival, escalation is warranted. Mark the building unsafe (posting if required by local code), block re-entry, and require PSE&G utility clearance before any occupancy. Water damage to electrical systems creates secondary hazards. This is a resident safety and liability issue.',
            },
          },
          {
            id: 'b',
            text: 'Advise residents they can return home once fire suppression is complete — the fire is out',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Allowing residents back into a building with live electrical hazards due to water damage is dangerous. Electrocution, hidden fire, and structural concerns are still possible. PSE&G must verify utility safety before occupancy can be restored. The fire is suppressed, but the utilities and building integrity are not yet confirmed safe.',
            },
          },
          {
            id: 'c',
            text: 'Tell residents to avoid the sparking outlet but otherwise the building is ready for occupancy',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A live sparking electrical outlet is a fire risk and electrocution hazard. You cannot mitigate this by telling residents to "avoid it." The electrical system may be compromised throughout the building. PSE&G must inspect and clear the system before occupancy.',
            },
          },
          {
            id: 'd',
            text: 'Shut off the main breaker in the meter bank yourself to eliminate the electrical hazard, then clear the building for occupancy',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Shutting off the main breaker is not your responsibility and may create additional hazards (alarm systems, medical devices, common area lighting). PSE&G must perform utility shutdown and clearance. Your role is to prevent occupancy until PSE&G clears it.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Multi-unit buildings require prioritized evacuation — fire floor first, adjacent units second, upper floors third. Never evacuate the entire building indiscriminately.',
        'Cockloft fire in apartments spreads rapidly. Use larger lines (2½") for fast suppression and pull ceilings from below to attack attic space safely.',
        'Every unit on the fire floor must be searched or confirmed evacuated — assumption of evacuation due to smoke is dangerous.',
        'Cockloft fires are suppressed from below (ceiling-pull and upward stream) rather than interior cockloft entry. Interior cockloft access is a last resort.',
        'Buildings with fire-related water damage are unsafe for occupancy until utilities are cleared by qualified personnel (PSE&G for electric).',
        'Escalate utility response calls if arrival time exceeds expected time. Electrical system clearance is a prerequisite for building re-occupancy.',
      ],
      references: [
        'NFPA 1410 — Fireground Operations',
        'IFSTA Essentials Ch. 10 — Multi-Family Residential',
        'NFPA 921 — Fire Investigation',
        'ICS-200 — Incident Command System',
        'Local Code — Building Re-Occupancy Standards',
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 3. VEHICLE FIRE ON HIGHWAY
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'vehicle-fire-highway',
    title: 'Vehicle Fire on Highway',
    description: 'Passenger vehicle (EV/hybrid possible) fully involved on Route 22 NJ. Navigate highway approach, vehicle fire attack, thermal runaway risk, and scene safety.',
    category: 'Vehicle / Brush Fire',
    difficulty: 'Foundational',
    estimatedMinutes: 15,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🚗',
    badgeColor: 'bg-red-100 text-red-700',

    setup: {
      dispatch: 'DISPATCH: Engine 14 — respond to Route 22 eastbound at Mile Marker 18.5 for a vehicle fire. Caller reports a car fully involved in flames in the right lane.',
      narrative: 'You are responding to Route 22 eastbound, a major commercial highway with four lanes. As you approach Mile Marker 18.5, you see a silver sedan fully engulfed in flames in the right lane. Traffic has stopped behind the vehicle. The driver has exited and is standing 50 feet back. No other vehicles appear to be involved. Weather is clear, 48°F.',
      details: [
        'Vehicle: Silver sedan (appears to be a hybrid or EV based on styling — manufacturer badge obscured by flames)',
        'Fire status: Fully involved, flames extending 6-8 feet above the vehicle',
        'Occupants: One reported — driver has self-evacuated and is at a safe distance',
        'Traffic: Heavy backing up to 0.5 mile. No shoulder on this section of Route 22.',
        'Response: State Police en route, ETA 6 minutes. You are first due.',
        'Hydrants: No hydrants on highway; water supply will be relay from nearest municipal district (3 miles away)',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 4 — Highway Approach & Apparatus Positioning',
        situation: 'You are 200 yards from the burning vehicle. Traffic is still moving slowly into the incident area. Where do you position your apparatus and what is your first action?',
        choices: [
          {
            id: 'a',
            text: 'Position engine in the right lane upstream of the fire to protect the scene. Have your driver control traffic while you don\'t approach the vehicle',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Parking your engine in an active traffic lane on a four-lane highway is extremely dangerous — your apparatus and crew become a target for inattentive drivers. The right lane is where the fire is. You need to be positioned safely away from traffic.',
            },
          },
          {
            id: 'b',
            text: 'Position engine in the right lane 100 feet upstream (west) of the vehicle. Request State Police immediately to control traffic and establish a perimeter. Do not approach the vehicle until traffic is controlled.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Highway safety requires traffic control first. Positioning upstream (upwind of traffic flow) protects your apparatus and crew. Calling State Police to establish a traffic perimeter and warning flashers is essential. You do not approach until traffic is stopped and controlled. This is a textbook highway incident approach.',
            },
          },
          {
            id: 'c',
            text: 'Drive past the burning vehicle to a safe area on the shoulder, then approach on foot with hand-held extinguishers',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Driving past a fully involved vehicle fire and then approaching on foot with hand extinguishers is extremely dangerous and ineffective. Hand extinguishers cannot suppress a fully involved vehicle fire. The scene is not yet controlled. You need apparatus, pump pressure, and traffic control.',
            },
          },
          {
            id: 'd',
            text: 'Position in the left lane (opposite direction) to use the median for crew safety while attacking from distance',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Positioning in the opposite traffic lane creates a secondary hazard — oncoming traffic. The median is not a safe crew position. Stay in your lane, upstream of the fire, and wait for traffic control.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 4 — Vehicle Fire Attack',
        situation: 'State Police have arrived and closed the rightmost two lanes. Traffic is now controlled. The vehicle is still fully involved. You are positioned 100 feet from the fire with your engine. What is your attack strategy?',
        choices: [
          {
            id: 'a',
            text: 'Approach the vehicle with a 1¾" line and apply direct stream attack to the engine compartment',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A direct attack on the engine compartment of a fully involved vehicle exposes your crew to extreme heat, potential explosion hazards (fuel tank, battery systems), and radiant heat. A 100-foot distance spray is more appropriate for vehicle fires. You do not need to be directly adjacent to the vehicle.',
            },
          },
          {
            id: 'b',
            text: 'Let the fire burn down while you maintain traffic control and wait for additional resources',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Allowing a fully involved vehicle to burn freely on a highway adjacent to other traffic is dangerous — heat, burning debris, and potential explosions create secondary hazards. Aggressive suppression is warranted even from distance.',
            },
          },
          {
            id: 'c',
            text: 'From the 100-foot position, direct a master stream (if available) or heavy spray pattern from the engine nozzle at the fire. Attack the engine/fuel area from distance. Cool the vehicle and suppress flames.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Excellent. Attacking vehicle fires from a distance using elevated streams or heavy spray patterns is standard highway practice. It keeps your crew at a safe standoff distance while delivering adequate water volume. The elevated stream can cover the engine compartment and fuel tank area. Cooling and flame suppression from distance is the safe approach.',
            },
          },
          {
            id: 'd',
            text: 'Request a tanker/water truck before attempting attack due to the distance from hydrants',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'A tanker is helpful for sustained operations on a highway, but engine on-board water (500-1000 gallons) is usually sufficient for initial vehicle fire suppression. A vehicle fire is typically knock-down-able in 5-10 minutes with an engine\'s water supply. Tanker request is reasonable as a follow-up, but do not delay initial attack.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 4 — Thermal Runaway Concern (EV/Hybrid Battery)',
        situation: 'As your stream hits the vehicle, you observe white sparks and small explosions coming from the driver-side door area — characteristic of an EV or hybrid battery pack thermal runaway. The vehicle is smoking heavily but flames are diminishing. Your crew wants to approach closer to suppress the battery area directly. What do you advise?',
        choices: [
          {
            id: 'a',
            text: 'Advise crew NOT to approach. Maintain distance. Thermal runaway batteries can re-ignite repeatedly. Continue cooling from distance with heavy water application. Do not enter the vehicle.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. EV and hybrid batteries in thermal runaway produce repeated small explosions and burning debris. Approaching closer increases injury risk. The standard approach is sustained water application from a distance to cool the battery pack. Some sources recommend allowing the battery to burn out if the fire is contained and no exposures are at risk. Distance is your safety margin.',
            },
          },
          {
            id: 'b',
            text: 'Approach with SCBA and attempt to access the battery compartment to cool it directly from inside the vehicle',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Entering a vehicle with an active thermal runaway battery is an unacceptable hazard. The interior is superheated, battery chemicals are toxic, and subsequent explosions can trap or injure crews inside. SCBA does not protect against the thermal and explosive hazards of EV batteries.',
            },
          },
          {
            id: 'c',
            text: 'Use hand-held extinguishers to suppress individual battery sparks while the main stream cools the vehicle body',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Hand-held extinguishers are ineffective on battery thermal runaway fires. You cannot target individual sparks or suppress the battery pack with hand equipment. Stay with engine-delivered water streams only.',
            },
          },
          {
            id: 'd',
            text: 'Request additional apparatus (second engine) to provide dual streams and accelerate suppression time',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Requesting a second engine is not wrong — additional water supply is helpful — but it is not mandatory for a single vehicle fire. Continue suppression with your current water supply while thermal runaway subsides. Request a second engine if the fire escalates or spreads to an adjacent vehicle.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 4 — Scene Safety & Traffic Management',
        situation: 'Fire is now suppressed. Vehicle is smoking but flames are out. Embers and hot debris are scattered on the roadway. Traffic is backed up 1 mile. State Police want to know when they can reopen lanes. What is your instruction?',
        choices: [
          {
            id: 'a',
            text: 'Overhual the vehicle (check for hidden fire), clear all debris from lanes, cool the roadway. Once thermal imaging confirms no hot spots remain, advise State Police lanes are clear.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Perfect scene closure. Overhaul ensures no hidden fire in the vehicle. Debris clearance prevents damage to other vehicles. Cooling and thermal imaging confirm the area is genuinely safe. This is a complete incident shutdown. Once confirmed, State Police can manage lane reopening.',
            },
          },
          {
            id: 'b',
            text: 'Advise State Police that lanes can reopen immediately — fire is out',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Reopening traffic while hot debris is scattered on the roadway and the vehicle is still smoking is dangerous. Hot embers can ignite under vehicles or damage tires. Thermal damage to the roadway may exist. Allow time for cooling and debris clearance.',
            },
          },
          {
            id: 'c',
            text: 'Push the burned vehicle off the roadway to clear lanes immediately, then conduct overhaul and debris cleanup',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Moving the vehicle before overhaul is acceptable if the vehicle is too dangerous to work on in-place (e.g., high thermal risk). However, overhaul should happen first to confirm the fire is completely extinguished. Moving a hot vehicle can redistribute hidden fire or cause reignition during transport.',
            },
          },
          {
            id: 'd',
            text: 'Have State Police manage traffic flow around the scene. Continue spraying the vehicle with water indefinitely to ensure it never reignites',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Indefinite water application is impractical and wasteful. You need to complete overhaul, confirm no hidden fire, and then establish that the vehicle is cool. After confirmation, you can safely cease operations.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Highway vehicle fires require State Police traffic control first — never approach a fully involved vehicle on an active roadway without traffic protection.',
        'Position apparatus upstream and at a safe distance from the fire. Use elevated streams or heavy spray patterns to attack from distance.',
        'EV and hybrid vehicle fires can involve thermal runaway battery packs, which produce repeated explosions. Maintain distance and sustained cooling — never enter the vehicle.',
        'Overhaul vehicle fires carefully — check for hidden fire in engine compartment, undercarriage, and interior. Thermal imaging is helpful.',
        'Clear all hot debris from the roadway before allowing traffic to resume. Hot embers under vehicles or on roadway can cause secondary fires.',
        'Highway incident scenes require coordination with State Police for traffic management and scene clearance authorization.',
      ],
      references: [
        'NFPA 1410 — Fireground Operations',
        'IFSTA Essentials Ch. 18 — Vehicle Extrication & Fires',
        'NHTSA — Electric Vehicle Fire Safety',
        'EVFSG — EV Fire Safety Guidance',
        'ICS-200 — Incident Command System',
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 4. BRUSH / WILDLAND FIRE
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'brush-wildland-fire',
    title: 'Brush / Wildland Fire',
    description: 'Pine Barrens-style brush fire approaching residential subdivision. Navigate size-up, fire behavior reading, structure protection vs. direct attack, and evacuation decisions.',
    category: 'Vehicle / Brush Fire',
    difficulty: 'Intermediate',
    estimatedMinutes: 20,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🌲',
    badgeColor: 'bg-amber-100 text-amber-700',

    setup: {
      dispatch: 'DISPATCH: Engine 14, Brush Unit — respond to Oak Ridge Road for a brush fire near the residential area. Caller reports flames in the woods approximately 500 feet from homes.',
      narrative: 'You are responding to the Pine Barrens region of NJ. A fire has been reported in brush approximately 500 feet from a small residential subdivision. As you arrive, you observe an active brush fire burning through dried pine needles and oak scrub. The fire is moving slowly toward the subdivision. Wind is moderate from the northwest. Approximately 12 homes are visible on the hillside downwind from the fire.',
      details: [
        'Fuel: Pine needles, oak brush, palmetto, sandy soil (typical Pine Barrens vegetation)',
        'Fire size: Approximately 2-3 acres currently, moving northeast toward subdivision',
        'Wind: 10-12 mph from northwest (pushing fire toward homes)',
        'Terrain: Gently sloping, mixed forest and clearing',
        'Water supply: Limited — nearest hydrant 2 miles away',
        'Evacuation: No official evacuation issued yet; residents are watching from porches',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 4 — Size-Up & Resource Request',
        situation: 'Fire is 500 feet from the nearest home and moving slowly. Wind speed is 10-12 mph, gusting. Your first action is to size up the fire and determine resource needs. What is your initial size-up communication to dispatch?',
        choices: [
          {
            id: 'a',
            text: 'Report: "Structure protection scenario. Two-to-three acres brush fire, moderate spread, wind 10-12 mph pushing toward residential area. Request immediate second alarm — brush units, additional engines, and fire police."',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. A brush fire threatening occupied structures requires immediate escalation. Identifying it as a "structure protection scenario" tells dispatch this is not a routine brush fire — it is approaching homes. Requesting a second alarm (brush units for perimeter control, additional engines for structure protection, fire police for traffic and evacuation) is the right call. This is the information dispatch needs to initiate larger response.',
            },
          },
          {
            id: 'b',
            text: 'Report: "Brush fire, small size, will monitor from safe distance and wait for additional resources before any action"',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A brush fire 500 feet from occupied homes with moderate wind is not a "watch and wait" situation. Early intervention with available resources can slow or stop fire progression toward structures. Failing to escalate the resource request is a missed opportunity for early containment.',
            },
          },
          {
            id: 'c',
            text: 'Report: "Brush fire, request one additional brush unit for mutual aid containment"',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A single additional brush unit is insufficient for a multi-acre fire threatening structures. Structure protection requires dedicated structure-protection units (engines positioned at homes), perimeter control (brush units), and command presence (additional staffing). The request is underdetermined.',
            },
          },
          {
            id: 'd',
            text: 'Begin direct attack on the fire immediately with your brush unit while requesting mutual aid',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Beginning direct attack is not wrong, but it must follow (not precede) a complete size-up and resource request. A lone brush unit attacking a 2-3 acre moving fire without knowing fire behavior, wind shifts, or available additional resources is premature. Size up, communicate the situation, then attack.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 4 — Fire Behavior & Wind Shift',
        situation: 'You have established a defensive perimeter and positioned engines at the threatened homes. Additional brush units are en route (ETA 8 minutes). For the past 30 minutes the wind has been steady from the northwest. Suddenly, a crew chief observes: "Wind is shifting. I can feel it changing direction — might be gusty from the south now." This could push the fire away from homes or accelerate it toward a different neighborhood. What do you do?',
        choices: [
          {
            id: 'a',
            text: 'Ignore the wind observation — wind shifts are temporary and do not matter',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Wind shifts in wildland fire are critical and often indicate a change in fire behavior and spread direction. Ignoring the observation is dangerous and can result in resources being positioned for the wrong threat.',
            },
          },
          {
            id: 'b',
            text: 'Immediately pull all engines from the north-side homes and reposition to the south to respond to the wind shift',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Reacting too quickly to a possible wind shift without confirming it is a real sustained change is chaotic. You may abandon protection on one side only to find the wind shift was temporary. Observe first, then adjust — do not panic-shift resources.',
            },
          },
          {
            id: 'c',
            text: 'Request evacuation of all homes in the 2-mile radius due to the unpredictable wind',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Evacuating a 2-mile radius of homes based on a possible wind shift is overkill and creates panic. Evacuation decisions should be based on confirmed fire behavior and actual threats, not defensive speculation.',
            },
          },
          {
            id: 'd',
            text: 'Acknowledge the wind shift. Observe fire behavior for 2 minutes to confirm direction. Adjust engine positions based on new fire vector. Alert dispatch if fire is now pushing toward a different area requiring evacuation.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Perfect incident management. Wind shifts are critical intelligence in wildland fire. Observing fire behavior for confirmation is essential — a brief gust is not the same as a sustained shift. Once confirmed, repositioning resources to the new threat area and notifying dispatch of the change is command responsibility. This prevents being caught off-guard by fire direction.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 4 — Structure Protection vs. Direct Attack',
        situation: 'Fire is now 200 feet from the nearest homes. Wind is confirmed steady from the northwest. You have 4 engines positioned at threatened homes (defensive structure protection mode) and 2 brush units trying to establish a firebreak on the north flank. The incident commander (another officer) asks: "Should we stop defending the structures and go full offense on the fire perimeter to stop it completely?" What is your recommendation?',
        choices: [
          {
            id: 'a',
            text: 'Recommend continuing structure protection. Do NOT abandon the engines at the homes. Let brush units focus on perimeter control. Once fire is contained, then consider perimeter mop-up.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Excellent. A brush fire 200 feet from homes with confirmed wind pushing toward them is not the time to abandon structure defense. Structures are your priority. Brush units (more maneuverable, better equipped for wildland terrain) focus on perimeter control and slowing fire spread. Engines stay at homes providing water supply and defensive spray. This is the right task allocation.',
            },
          },
          {
            id: 'b',
            text: 'Pull all engines from the homes and commit them to a full-perimeter direct attack to suppress the fire completely',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Abandoning structure defense for an offensive perimeter attack leaves homes unprotected when fire is only 200 feet away. If fire reaches a home and no engine is present, defensive protection fails. Perimeter attack is important, but not at the cost of structure abandonment.',
            },
          },
          {
            id: 'c',
            text: 'Split the engines — two remain at homes, two join brush units on perimeter attack',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Splitting engines may seem balanced, but two engines covering four threatened homes is insufficient. If fire accelerates toward homes, two engines cannot provide adequate protection. Keep the full complement of engines at homes until fire is further away.',
            },
          },
          {
            id: 'd',
            text: 'Order evacuation of all homes immediately and relocate all engines to a fire line perimeter attack',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Evacuating homes and pulling all structure protection requires a higher authorization level (usually county or regional incident commander, not a single engine officer). At 200 feet with defensive engines in place, evacuation may not be necessary. Evacuation is a disruptive decision to be made by incident command, not a tactical decision.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 4 — Containment & Evacuation Decision',
        situation: 'After 2 hours, brush units have established a firebreak on the north and east flanks. Fire spread has slowed significantly. However, the southern flank is still active and could reach a small neighborhood (8 homes) 300 feet away if wind shifts again. Mutual aid brush units are on scene. The county incident commander (now on scene) asks your recommendation: "Do we evacuate the south-side homes as a precaution, or maintain defensive posture and watch for wind changes?" What is your recommendation as an on-scene senior firefighter?',
        choices: [
          {
            id: 'a',
            text: 'Recommend no evacuation — we have adequate defensive resources in place and can wait to see if wind shifts occur',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Waiting to see if wind shifts is reactive incident management. If wind does shift and fire accelerates toward the 8 homes, evacuation becomes a panicked emergency with higher injury risk. Early evacuation is less disruptive than emergency evacuation.',
            },
          },
          {
            id: 'b',
            text: 'Recommend evacuation. At 300 feet with a fire that could shift direction, evacuating the 8 homes now is safer than waiting for wind change and then evacuating in panic.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Sound recommendation. Evacuation ahead of immediate threat is much more orderly and safe than evacuation during active fire movement. At 300 feet with uncontained southern flank and unpredictable wind, pre-evacuation is prudent. The county IC makes the final decision, but this is good input. Evacuation before emergency conditions is always safer.',
            },
          },
          {
            id: 'c',
            text: 'Recommend partial evacuation — evacuate only the 3 homes closest to the fire, keep the other 5 on standby',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Partial evacuation creates confusion and uneven risk. If evacuation is deemed necessary, it should be systematic. Evacuating some homes but not others is harder to manage and may result in missed homes if fire behavior changes.',
            },
          },
          {
            id: 'd',
            text: 'Recommend full resource commitment to the southern firebreak — suppress the southern flank fire completely before considering evacuation',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Committing all available resources to perimeter suppression may be appropriate, but it does not mitigate the risk to 8 homes 300 feet away. Evacuation and perimeter suppression are not mutually exclusive — both can happen in parallel. If suppression fails, homes are already evacuated.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Brush fires threatening structures require immediate escalation — request second alarm with brush units, additional engines, and command staff.',
        'Wind shifts in wildland fire are critical. Observe fire behavior for confirmation, then adjust resource positions based on new fire vectors.',
        'Structure protection (engines at homes with supply) takes priority over perimeter attack when fire is close. Brush units focus on perimeter; engines on defense.',
        'Defensive structure protection is maintained until fire is at a safe distance or fully contained. Never abandon homes for uncertain perimeter gains.',
        'Evacuation decisions are made by incident commander, not individual firefighters — but senior firefighters should provide strong recommendations based on fire behavior.',
        'Pre-evacuation (evacuation before emergency conditions) is safer and more orderly than emergency evacuation during active fire spread.',
      ],
      references: [
        'NWCG Incident Command System (ICS)',
        'NIOSH Wildland Fire Safety',
        'NFPA 1144 — Fire in the Built Environment',
        'IFSTA Essentials Ch. 13 — Wildland Fire',
        'NJ State Forestry Division Guidelines',
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 5. RESIDENTIAL GAS LEAK / CO
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'gas-leak-residential',
    title: 'Residential Gas Leak / CO',
    description: 'Natural gas odor in NJ residential neighborhood, multiple homes affected, CO detectors going off. Navigate approach & metering, evacuation perimeter, utility coordination, and medical screening.',
    category: 'HazMat / Utilities',
    difficulty: 'Foundational',
    estimatedMinutes: 15,
    creditHours: 1.0,
    passingScore: 60,
    icon: '💨',
    badgeColor: 'bg-yellow-100 text-yellow-700',

    setup: {
      dispatch: 'DISPATCH: Engine 14 — respond to the 400 block of Maple Street for a reported natural gas odor affecting multiple homes. Caller reports CO detectors going off in at least two homes.',
      narrative: 'You are responding to a residential street in a suburban neighborhood. Multiple residents are exiting their homes, reporting a strong natural gas odor. Two residents report CO detectors have activated in their homes. The smell appears to be strongest near the corner of Maple Street and Park Avenue. Weather is 42°F, wind is light from the east. Approximately 15 homes are in the affected area.',
      details: [
        'Hazard: Natural gas odor (mercaptan odorant), reported in multiple homes',
        'CO detectors: Two homes reported activated — specific levels unknown',
        'Potential source: Gas main leak in street or individual service line damage',
        'Occupants: Estimated 30-40 residents in 15-home radius; most are evacuating',
        'Utilities: PSE&G (gas and electric) serves the area. Main gas line runs under Maple Street.',
        'Weather: Light wind, clear, no precipitation',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 4 — Approach & Metering',
        situation: 'You are on scene. Residents are evacuating. You can smell natural gas. Your combustible gas detector (CGD) is reading in the 20-30% LEL range at the street level near Park Avenue corner. Should you approach further or establish a perimeter first?',
        choices: [
          {
            id: 'a',
            text: 'Approach the high-reading area with SCBA to investigate the source of the leak',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Approaching a 20-30% LEL area without confirming the source and without utility coordination is dangerous. A leak source could be a damaged main line with active gas release — approaching could cause ignition if any spark occurs. Let PSE&G locate and address the source.',
            },
          },
          {
            id: 'b',
            text: 'Establish a perimeter immediately at 100 feet in all directions. Do NOT approach the high-reading area. Request PSE&G immediately. Monitor CGD from safe distance.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. A CGD reading of 20-30% LEL indicates a significant gas concentration — approaching 50% LEL is the danger zone. Establishing a perimeter prevents civilians from wandering into hazard zones. Requesting PSE&G (who has authority to shut down gas service and can test without ignition sources) is the correct action. Monitor from safe distance until PSE&G arrives and assesses the main line.',
            },
          },
          {
            id: 'c',
            text: 'Ask residents where the odor is strongest and investigate individual homes to locate the source',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Investigating individual homes in a neighborhood with multiple gas detections is inefficient and potentially dangerous. The source is likely the gas main under Maple Street, not individual service lines. Interviewing residents is secondary to establishing a perimeter and calling utilities.',
            },
          },
          {
            id: 'd',
            text: 'Check if any home has pilot lights or ignition sources active and ask residents to turn them off',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You cannot safely enter homes to check appliances when gas concentrations are at elevated levels. Asking residents to disable pilot lights is better (through evacuation communication), but the priority is utility shutdown and perimeter establishment.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 4 — Evacuation Perimeter',
        situation: 'You have established a 100-foot perimeter. Residents have evacuated and are gathering at the street entrance. CO detectors at two homes have been activated. PSE&G is en route (ETA 8 minutes). Two residents are asking if they can return to their homes to retrieve pets and medications. What is your instruction?',
        choices: [
          {
            id: 'a',
            text: 'Do NOT allow re-entry. Explain that all homes are in a potential hazard zone. PSE&G will assess conditions in 8 minutes. Pets and medications can wait. Resident safety is priority.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. A gas leak situation with elevated concentrations and unknown CO levels is not safe for resident re-entry. PSE&G will isolate the gas main, confirm safe conditions, and allow re-entry. Pets and medications can wait 15-20 minutes. Resident safety is paramount. This is a firm but justified decision.',
            },
          },
          {
            id: 'b',
            text: 'Allow residents back into homes briefly under firefighter supervision to retrieve essential items',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Allowing residents back into a neighborhood with elevated gas concentrations and unknown CO levels is dangerous. Residents could be exposed to both gas and CO. The hazard zone is not secure until PSE&G confirms gas shutdown and air quality.',
            },
          },
          {
            id: 'c',
            text: 'Allow residents to enter their own homes to retrieve items while you maintain exterior perimeter',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Residents attempting to retrieve items from homes in a gas hazard zone are at risk. Once residents evacuate, they should not re-enter until air quality is confirmed safe by authorities.',
            },
          },
          {
            id: 'd',
            text: 'Appoint firefighters to retrieve pets and medications from homes for residents',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Sending firefighters into homes with elevated gas and unknown CO levels is a safety violation. Firefighter safety is as important as resident safety. Wait for PSE&G confirmation before any interior entry.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 4 — PSE&G Utility Coordination',
        situation: 'PSE&G has arrived. Their technician confirms: "We have a gas main leak under Maple Street — likely a corroded steel main from the 1950s. Shutdown of the entire section will take 20 minutes. We are isolating the main now." Additionally, the two homes with CO detectors show CO readings of 35 ppm and 42 ppm in their living rooms. What is your medical/safety response?',
        choices: [
          {
            id: 'a',
            text: 'Screen the two residents with elevated CO readings for exposure symptoms. Any symptomatic residents should be transported to hospital for evaluation. All residents should remain evacuated until PSE&G confirms main isolation and air quality testing is complete.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. CO readings of 35-42 ppm are elevated (8-hour OSHA TWA is 50 ppm, but shorter exposures can cause symptoms). These residents need medical screening for headache, dizziness, nausea, confusion. If symptomatic, hospital transport is appropriate. All residents remain evacuated pending utility clearance. This is a complete health and safety response.',
            },
          },
          {
            id: 'b',
            text: 'Do not screen residents for CO exposure — PSE&G shutdown solves the problem. Allow residents to return once gas main is isolated.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'CO readings of 35-42 ppm indicate potential occupant exposure. Residents may have been exposed to CO before evacuation and could be experiencing symptoms. Medical screening is a requirement of your response, not optional.',
            },
          },
          {
            id: 'c',
            text: 'Transport all 40 residents to hospital for CO exposure evaluation',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Mass transport of 40 residents to the hospital is overkill. Only residents who were in homes with elevated CO readings (two homes) need evaluation. The other residents were not in CO environments. Focus screening on the exposed populations.',
            },
          },
          {
            id: 'd',
            text: 'Screen residents for symptoms but do not transport anyone unless they request it',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Screening is correct, but deferring transport to resident request is problematic. A resident with CO exposure may not recognize symptoms (CO can cause confusion and impaired judgment). If medical screening reveals symptoms of CO poisoning (headache, dizziness, nausea, confusion), transport should be recommended or offered, not dependent on resident choice.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 4 — Medical Screening & Scene Clearance',
        situation: 'PSE&G has completed main isolation (confirmed isolated, no smell, CGD now reading 0% LEL throughout the area). Air quality has been cleared by PSE&G. However, EMS has evaluated the two residents from high-CO homes: one reports mild dizziness and headache (symptomatic), the other reports no symptoms. Both are refusing hospital transport. You need to document the scene and clear it. What is your recommendation?',
        choices: [
          {
            id: 'a',
            text: 'Allow all residents to return home immediately now that air quality is cleared',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The symptomatic resident needs hospital evaluation. Allowing them to return home without assessment is a medical care failure. Air quality outside may be cleared, but home conditions need verification before occupancy.',
            },
          },
          {
            id: 'b',
            text: 'Document the scene and allow residents to return. Recommend they contact their gas company later if they have concerns',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The symptomatic resident still needs immediate medical evaluation. Deferring concern to a later call to the gas company is not adequate. And homes need utility verification before safe occupancy.',
            },
          },
          {
            id: 'c',
            text: 'Recommend transport for the symptomatic resident despite refusal. Document the refusal if they persist. The asymptomatic resident may be cleared. Recommend all residents have home evaluations by PSE&G before re-entry to check home appliances for additional hazards.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Excellent. The symptomatic resident shows signs of CO exposure and should be evaluated at hospital — recommend it even if they refuse, and document the refusal. The asymptomatic resident appears safe. Recommending home evaluation by PSE&G before re-entry checks for secondary gas leaks in home appliances (furnace, stove, water heater). This is thorough scene closure.',
            },
          },
          {
            id: 'd',
            text: 'Transport both residents to hospital even though one is asymptomatic',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Forcing transport of an asymptomatic resident is excessive. Medical transport should be based on symptoms. The asymptomatic resident may return home once utilities are verified safe.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Natural gas odor affecting multiple homes indicates a gas main leak. Establish perimeter immediately and request PSE&G — do not investigate individual homes.',
        'Combustible gas detector readings of 20-30% LEL are significant. Establish 100+ foot perimeter and maintain distance until utilities isolate the source.',
        'CO detectors activated in homes indicate occupant exposure. Screen residents from those homes for CO poisoning symptoms (headache, dizziness, nausea, confusion).',
        'Symptomatic residents with CO exposure should be transported to hospital for evaluation, even if they resist. Document refusal if they persist.',
        'Do not allow residents to re-enter homes with active gas hazards or unverified utility status. Wait for PSE&G confirmation and utility evaluation.',
        'Recommend PSE&G home appliance evaluation (furnace, water heater, stove) before residents return — secondary leaks in home systems are possible.',
      ],
      references: [
        'OSHA 1910.1200 — Hazard Communication',
        'NIOSH Pocket Guide — Gases',
        'NFPA 70 — National Electrical Code',
        'IFSTA Essentials Ch. 14 — HazMat Operations',
        'PSE&G Safety Coordination Protocol',
      ],
    },
  },

// ══════════════════════════════════════════════════════════════════════
  // 1. MVA WITH ENTRAPMENT
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'mva-entrapment',
    title: 'MVA with Entrapment — NJ Turnpike',
    description: 'Two-vehicle head-on collision on the NJ Turnpike with one trapped occupant, fuel spill, and complex extrication challenges. Navigate scene safety, triage, tool selection, and helicopter coordination.',
    category: 'MVA / Technical Rescue',
    difficulty: 'Intermediate',
    estimatedMinutes: 25,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🚑',
    badgeColor: 'bg-blue-100 text-blue-700',

    setup: {
      dispatch: 'DISPATCH: Engine 32, Rescue 2, EMS Unit 15 — respond to NJ Turnpike northbound, Mile Marker 52.3, for a two-vehicle motor vehicle accident with reported entrapment and injury.',
      narrative: 'You are the Rescue Officer responding to a head-on collision on the northbound Turnpike. Caller reports two vehicles involved — one sedan, one pickup truck — with heavy front-end damage. One driver is reported trapped in the sedan. It is 18:47 on a Friday evening. Traffic on the northbound lanes is backed up. Hazmat is monitoring for fuel spill. Your team arrives 7 minutes after dispatch.',
      details: [
        'Scene: NJ Turnpike northbound, Mile Marker 52.3 (heavily trafficked area)',
        'Vehicles: 2008 Honda Civic (sedan, struck head-on) and 2019 Ford F-150 (pickup truck)',
        'Occupants: 1 trapped occupant in Civic (driver), 1 ambulatory in pickup (minor injuries)',
        'Hazmat: Small fuel leak noted — approximately 5 gallons visible near driver-side doors',
        'Time: 18:47 Friday — traffic heavy, weather clear, temp 64°F',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 5 — Scene Safety & Triage',
        situation: 'Your Rescue team has arrived. The Civic driver (male, 50s) is conscious but complaining of leg pain. The pickup driver (female, 40s) is walking around, shaken but alert. Fuel is visible dripping from the Civic. Traffic is flying past on the northbound lanes at 55+ mph, with vehicles swerving around the accident. Emergency lighting is active. What is your first action?',
        choices: [
          {
            id: 'a',
            text: 'Immediately assess the Civic driver\'s leg injury and apply a tourniquet if needed',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Assessing the patient is important — but not until the scene is safe. You are on an active highway with fuel spill, high-speed traffic, and no traffic control yet. A vehicle traveling at 60 mph could strike your crew in seconds. Scene safety comes first, assessment second. Request police for traffic control immediately.',
            },
          },
          {
            id: 'b',
            text: 'Call for police traffic control, position apparatus for crew protection, and have EMS establish a secondary triage zone away from the fuel spill',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Scene safety hierarchy: (1) request traffic control immediately, (2) position apparatus as a barrier (Engine uphill/upstream of the scene), (3) establish patient zones away from hazards (fuel, traffic). EMS does rapid triage of the ambulatory patient in a safe zone. The Civic driver is temporarily stable; the bigger threat is being struck by passing traffic. Handle that first.',
            },
          },
          {
            id: 'c',
            text: 'Begin extrication immediately since one patient is trapped',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Rushing extrication without controlling the scene creates multiple risks: crew exposed to traffic, fuel spill hazard not isolated, secondary collision possible. "Speed" in rescue is measured in minutes, not seconds. Control traffic, manage hazmat, then execute extrication. Jumping straight to tools on an unsafe Turnpike is a way to add injuries, not reduce them.',
            },
          },
          {
            id: 'd',
            text: 'Have the ambulatory patient move her vehicle out of the travel lane to clear traffic',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Moving vehicles involved in an accident can destroy evidence and is generally discouraged by law enforcement — unless the vehicle is a hazard and blocking a critical lane. In this case, the Turnpike is already congested. Keep the scene as-is and let police direct traffic control. Your role is rescue coordination, not traffic management.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 5 — Extrication Tool Selection',
        situation: 'Police have established traffic control and set up a 200-foot upstream advance warning. EMS has triaged the pickup driver (minor injuries). Your Rescue team is now focused on the Civic. The driver reports leg pain but is alert and breathing normally. The Civic\'s front end is crushed — the driver\'s door is jammed, and the firewall has moved approximately 6 inches toward the driver\'s compartment. The steering wheel is trapping the patient\'s right thigh. What extrication approach do you recommend?',
        choices: [
          {
            id: 'a',
            text: 'Use the hydraulic spreader to force the door open immediately — every second counts',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Opening the door without addressing the steering wheel entrapment can twist the patient\'s leg further or cause crush syndrome injury. Yes, time matters — but rushing a physical extrication without a plan can turn a manageable leg fracture into a compound fracture or compartment syndrome. Take 3 minutes to remove the steering wheel, then open the door. The patient will be better off.',
            },
          },
          {
            id: 'b',
            text: 'Call a helicopter to transport the patient directly from the Turnpike — extrication is too time-consuming',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Helicopter transport for an alert patient with a leg injury when ground transport is available is over-triage and wastes critical air assets. The patient is conscious, breathing, no signs of severe hemorrhage. Ground transport to a trauma center is appropriate. Use air assets for truly critical situations — not to speed up a straightforward extrication.',
            },
          },
          {
            id: 'c',
            text: 'Cut the steering wheel to relieve pressure on the leg, then use the Jaws of Life to peel the door and allow egress',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. With the firewall compressed and steering wheel entrapping the leg, removing the steering wheel is a rapid intermediate step — it relieves direct pressure on the patient and prevents secondary injury during door removal. Cutting the steering column takes 3-4 minutes. Then open the door with the hydraulic spreader (Jaws of Life), creating an egress path without further twisting the patient\'s leg. This is efficient and minimizes patient manipulation.',
            },
          },
          {
            id: 'd',
            text: 'Request the fire investigator to document the scene before beginning extrication',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Documentation is police and insurance responsibility, not fire department. Your role is extrication and patient care. The patient is trapped and needs egress — that is the priority. Police will document the scene; do not delay rescue operations for crash scene photography.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 5 — Patient Packaging Under Time Pressure',
        situation: 'The steering wheel has been cut away and the Civic door has been opened. Your extrication team has now exposed the patient\'s leg — there is gross deformity of the right femur (likely compound fracture), and you estimate 15-20 seconds of exposure remaining before the patient is fully extricated. Fuel continues to drip (though the spill is now managed). EMS is standing by with the gurney. What is your patient packaging approach?',
        choices: [
          {
            id: 'a',
            text: 'Straighten the leg manually to reduce pain, then splint it',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Manual straightening of a severely deformed femur without proper traction is a high-risk move that can cause further vascular injury, compartment syndrome, or fat emboli. Traction splints are designed specifically to apply controlled tension — use the device, not manual force.',
            },
          },
          {
            id: 'b',
            text: 'Leave the leg in the position found, wrap it with gauze, and transport without a splint to "avoid movement"',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Immobilizing a limb without supportive splinting leaves it vulnerable to further injury during transport and increases pain and shock. The whole purpose of splinting is to reduce movement AND stabilize — a splint does both. Apply proper splinting, do not avoid it.',
            },
          },
          {
            id: 'c',
            text: 'Stabilize the femur with an inflatable splint, secure the patient to the long backboard, and load into the ambulance immediately',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'An inflatable splint is good for stabilization, but with a compound femur fracture and significant deformity, a long backboard without pelvic/femur stabilization risks further vascular compromise and tissue damage. A better choice is a vacuum splint (if available) or traction splint, which immobilizes the limb AND reduces the deformity, improving circulation and reducing pain.',
            },
          },
          {
            id: 'd',
            text: 'Use a pelvic binder and traction splint to stabilize the femur, secure to long backboard, and call for trauma center alert',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. A compound femur fracture with deformity requires traction to restore length and circulation. Pelvic binder + traction splint + long board is the evidence-based approach. Call for trauma center alert so the hospital knows you\'re coming with a priority patient. Load and transport. This is the right sequence.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 5 — Fuel Spill Management',
        situation: 'The patient has been loaded into EMS and is en route to the trauma center. Fuel is still leaking from the Civic at an estimated rate of 1 quart per minute. Hazmat on scene estimates a total of 12-15 gallons have spilled so far. The Turnpike surface is beginning to show pooling. Police want to reopen the northbound lanes. What is the correct action regarding the spill?',
        choices: [
          {
            id: 'a',
            text: 'Use water spray to wash the spill toward the shoulder and dilute it',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Water and gasoline do not mix. Spraying water at a fuel spill spreads the contamination, increases vapor generation, and creates an even larger hazard area. Do not use water on petroleum spills. Absorbent material or professional recovery is the correct approach.',
            },
          },
          {
            id: 'b',
            text: 'Let the fuel evaporate and reopen the lanes — it\'s only gasoline',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Gasoline vapors are extremely flammable. 12-15 gallons pooling on a hot Turnpike surface is a significant fire/explosion hazard. Waiting for evaporation (which takes hours) and reopening traffic with pooling fuel is unsafe and violates environmental protection regulations. Isolate and recover the spill — do not take shortcuts with volatiles.',
            },
          },
          {
            id: 'c',
            text: 'Isolate the spill area with cones and absorbent berms, request NJDEP and the fuel truck to pump down the tank, and keep the Turnpike closed until the leak is stopped',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Active fuel spills on public roadways are NJ Department of Environmental Protection (NJDEP) incidents. Isolation prevents accidental contact. A fuel recovery truck pumps down the Civic\'s tank (stopping the leak) and recovers the spilled fuel. Until the tank is secure, the fire risk is too high to reopen traffic. Police cooperation is needed. This is the safe, regulatory-compliant approach.',
            },
          },
          {
            id: 'd',
            text: 'Apply absorbent material (oil absorbent) to soak up the fuel and allow police to reopen the lanes',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Covering a fuel spill with absorbent material is a temporary fix, not a solution. Gasoline is volatile and the spill is active (still leaking from the vehicle tank). The vapors create a fire/explosion hazard. You cannot safely reopen traffic with active pooling fuel on the roadway. The spill must be isolated and the leak stopped first.',
            },
          },
        ],
      },

      {
        id: 's5',
        title: 'Scene 5 of 5 — Helicopter LZ Setup',
        situation: 'EMS calls on radio: "Rescue 2, we need you to prepare a helicopter LZ. Patient condition has deteriorated — we\'re requesting a diversion to Trauma Center North via air transport for faster arrival." The northbound Turnpike near the accident scene has a wide shoulder, but overhead power lines are visible approximately 200 feet away. Wind is light and variable. What is your LZ setup?',
        choices: [
          {
            id: 'a',
            text: 'Have the pilot land on the highway shoulder and accept the power line risk — patient life is the priority',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Accepting a known hazard (power line strike) to "save time" is not acceptable risk-benefit analysis. A helicopter struck by rotorwash-displaced power lines or landing near high-voltage wires is a catastrophic outcome — patient, crew, and pilot all at extreme risk. A 5-minute detour to a safe LZ is the correct trade-off. Patient life is the priority, which means getting them to the hospital safely, not via an unsafe shortcut.',
            },
          },
          {
            id: 'b',
            text: 'Decline the helicopter request and have EMS continue ground transport to the nearest hospital',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'If EMS has called for air transport due to patient deterioration (shock, airway compromise, etc.), you should facilitate it, not decline it. The correct action is to find a safe LZ, not to refuse the request. Work with EMS and the helicopter to identify a suitable location — do not eliminate a life-saving option because the initial location is unsuitable.',
            },
          },
          {
            id: 'c',
            text: 'Clear the shoulder area of debris, position your apparatus upwind, and mark the LZ perimeter with traffic cones even if the power lines are close',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Positioning the LZ with power lines nearby is a hazard. Helicopter rotorwash and copper-wire contact can cause electrocution and fire. While you\'re right to clear debris and position apparatus upwind, the power line proximity makes this location unsafe for a helicopter landing. Request the pilot to divert to a safer LZ (open field, parking lot) or coordinate with utility company for temporary de-energization.',
            },
          },
          {
            id: 'd',
            text: 'Identify an alternate LZ location away from power lines (parking lot or large field), coordinate with police for access, and have EMS transport the patient there for handoff to air transport',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. The Turnpike shoulder near power lines is a no-go for helicopter operations. Overhead hazards are a primary safety concern. Identify a nearby open area (rest stop parking lot, field, large open road intersection away from utilities) that meets helicopter landing criteria: 100 ft x 100 ft minimum, clear of obstacles, upwind approach. Ground transport the patient there (additional 5 minutes) to ensure a safe handoff to air. Patient safety and crew safety come first.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Scene safety is the foundation of rescue operations — control traffic, isolate hazards, and establish apparatus placement before initiating patient care.',
        'Extrication planning trumps speed — select the right tools and approach based on vehicle damage and entrapment type, not urgency.',
        'Compound fractures and crush injuries require specific stabilization techniques (traction splints, pelvic binders) to prevent secondary complications.',
        'Hazardous material management (fuel spills) requires trained personnel and regulatory coordination — do not apply shortcuts to volatile substances.',
        'Helicopter operations demand hazard-free landing zones; ground transport to a safe LZ is always preferable to accepting known obstacles.',
        'Patient deterioration during transport triggers escalation protocols — coordinate with receiving hospital and air transport early, not as a last resort.',
      ],
      references: [
        'NFPA 1051: Standard for Firefighter Professional Qualifications — Rescue Operations',
        'NHTSA Emergency Rescue and Extrication Manual — Vehicle Stabilization and Patient Packaging',
        'NJ Department of Environmental Protection Spill Response Guidelines',
        'FAA Helicopter Emergency Medical Services (HEMS) Landing Zone Standards',
        'American College of Surgeons Committee on Trauma: Patient Triage and Transport Protocol',
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 2. WATER RESCUE — SWIFT WATER
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'water-rescue-swift',
    title: 'Water Rescue — Swift Water',
    description: 'Vehicle stranded in flooded NJ roadway during nor\'easter, rising water, and advancing rescue decision-making under hazardous conditions.',
    category: 'MVA / Technical Rescue',
    difficulty: 'Advanced',
    estimatedMinutes: 20,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🌊',
    badgeColor: 'bg-cyan-100 text-cyan-700',

    setup: {
      dispatch: 'DISPATCH: Engine 41, Rescue 3, Water Team 5 — respond to Route 29 northbound near Frenchtown for a vehicle stranded in high water. Nor\'easter in progress.',
      narrative: 'A nor\'easter is moving through NJ with heavy rain, 35 mph gusts, and flooding along river routes. You receive a report: a sedan is stalled in high water on Route 29 northbound near Frenchtown. The vehicle is partially submerged; occupants (2 adults) are on the roof. Water depth is estimated at 4-5 feet and rising. You arrive 8 minutes after dispatch.',
      details: [
        'Location: Route 29 northbound near Frenchtown, low-lying road section adjacent to the Delaware River',
        'Water conditions: Swift water from heavy rain, rising level (4-5 feet and increasing), current velocity unknown but visibly strong',
        'Vehicle: Honda Civic, roof accessible, passengers visible and waving',
        'Weather: Nor\'easter, 2-3 hours of rain remaining, 35 mph wind gusts, visibility moderate',
        'Water temperature: Estimated 48°F (March nor\'easter)',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 4 — Scene Safety & Risk Assessment',
        situation: 'You arrive at Route 29. A gray sedan is in the roadway with 2-3 feet of water covering the engine compartment. Two occupants are visible on the roof, waving and shouting. The water is moving rapidly (you can see debris flowing downstream), and the road itself is being undermined on the downstream side — visible erosion is occurring. Wind gusts are strong. Your Water Team is 5 minutes behind you. What is your immediate assessment and action?',
        choices: [
          {
            id: 'a',
            text: 'Establish a safety perimeter upstream and downstream of the vehicle. Position apparatus away from the eroding roadside. Assess the vehicle stability and current direction. Do not commit personnel to the water until the Water Team arrives with proper equipment.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Scene safety in swift water includes: (1) upstream perimeter to stop debris, (2) downstream evacuation zone in case of collapse or vehicle movement, (3) apparatus positioned on stable ground away from erosion, (4) recognition that swift water rescue is a specialty operation. The occupants are on the roof (safe from drowning in the immediate term). You manage the scene; your Water Team executes the rescue.',
            },
          },
          {
            id: 'b',
            text: 'Deploy personnel with a throw rope to reach the occupants immediately from the roadside',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The occupants are on the roof and the water is swift — a throw rope from the bank will not reach them reliably, and if someone enters the water to assist, they are now in a swift-water current without training or proper rescue equipment. Swift water is a restricted-access environment in most fire departments. Wait for your Water Team.',
            },
          },
          {
            id: 'c',
            text: 'Advise the occupants to swim downstream to a shallower area if they are not comfortable on the roof',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Advising occupants to enter swift water without rescue support is a death sentence. Swift-water currents can sweep people away at rates of 3-6 feet per second. The occupants are safer on the roof than in the water. Keep them there and rescue them with proper equipment and technique.',
            },
          },
          {
            id: 'd',
            text: 'Request a heavy wrecker to pull the vehicle back onto dry road immediately',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Attempting to pull a partially submerged vehicle in swift water can destabilize it, causing it to roll or collapse further into the current. The vehicle is in flowing water with a potentially unstable roadbed. Vehicle recovery is secondary to occupant rescue. Rescue the people first (on the roof, stable), then address the vehicle once the water recedes.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 4 — Reach-Throw-Row-Go Decision',
        situation: 'Your Water Team has arrived and assessed the scene. The vehicle is approximately 30 feet from the roadside edge, in moving water. Current velocity is estimated at 2-3 feet per second. The occupants are still on the roof. The water is still rising (now 5-6 feet deep). The Water Team Officer asks you: "Do we reach, throw, or deploy a boat?" What is your recommendation?',
        choices: [
          {
            id: 'a',
            text: 'Go — commit a trained rescuer on a rope tether to swim to the vehicle and extract the occupants',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Committing a single tethered rescuer to swim in 2-3 ft/sec current to extract two untrained victims is extremely high-risk. If the rope tangles or the current pins the rescuer against the vehicle, you now have 3 people in danger. Go (swimming) is a last-resort option, not the first choice when boats are available.',
            },
          },
          {
            id: 'b',
            text: 'Throw — deploy a rescue rope bag or flotation device for the occupants to catch and hold for extraction',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Throwing a rope across 30 feet of swift water is possible, but relying on panicked occupants to catch and hold a rope under current stress is uncertain. If they miss the rope or lose grip, they are now in the water without support. Swift-water rescue protocol prioritizes sending trained rescuers (row-go) over asking untrained victims to catch and hold.',
            },
          },
          {
            id: 'c',
            text: 'Reach — extend a pole or rope from the roadside to establish contact with the occupants without entering the water',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Reaching is preferred when possible, but the occupants are 30 feet away in moving water — a reach pole will not extend that far safely. Attempting a reach at this distance risks losing the pole or extending personnel too far off the bank into an unstable zone. Move to the next level: throw or row.',
            },
          },
          {
            id: 'd',
            text: 'Row — deploy a boat (inflatable rescue craft or swift-water boat) with trained swift-water rescue personnel to establish contact and extract the occupants',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. The occupants are 30 feet away in 2-3 ft/sec current with rising water — this is a rowing (boat) rescue situation. Swift-water boats are designed for these conditions. Trained personnel approach from upstream and work the current to position the boat for occupant extraction. This is the safest option given the distance and current velocity.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 4 — Victim Contact & Stabilization',
        situation: 'Your swift-water boat (piloted by a Water Team member, with a rescue swimmer aboard) has approached the vehicle. One occupant (male, 60s) is standing on the roof looking weak. The second occupant (female, 50s) has slipped down into the water and is holding onto the antenna with one hand. The water is now 6 feet deep and the current has visibly increased. The rescuer reports: "Current is pushing us off position. We need to stabilize the patients now." What is your instruction?',
        choices: [
          {
            id: 'a',
            text: 'Have the female release the antenna and secure her to a life jacket being deployed; the male remains on the roof until the next approach',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. In swift-water rescue with limited boat positioning, stabilize the person in immediate danger first. Have the female secure a life jacket and hold the throw bag line rather than the antenna — this reduces her grip strength demands and keeps her physically supported. The male on the roof is stable for a few more minutes. Boat repositions upstream and extracts the female. Then re-approach for the male.',
            },
          },
          {
            id: 'b',
            text: 'Wait for the water level to stabilize and recede before attempting further extraction',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The female is in the water and fatiguing. Water levels in nor\'easters often peak before receding — that could be hours away. Waiting is not an option. Extract her now while she still has grip strength.',
            },
          },
          {
            id: 'c',
            text: 'Deploy both victims on life jackets and ropes, then perform a simultaneous dual extraction',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Managing two separate rope extractions in swift water with one rescue boat is a coordination nightmare and increases risk. Extract one victim completely first, land them safely on shore, then return for the second. Sequential rescue is more controlled and safer.',
            },
          },
          {
            id: 'd',
            text: 'Extract the male first since he is in a safer position on the roof',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The female is in the water holding an antenna — she is the priority. She is cold, fatigued, and at immediate risk of losing her grip. Extract the person in the greater danger first, even though the male is in a safer position. Secondary extraction of the male follows immediately.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 4 — Downstream Hazard Awareness',
        situation: 'Both occupants have been extracted and are being treated for hypothermia by EMS on the roadside. The water level has continued to rise to 7+ feet, and the current is now visibly eroding the roadside shoulder downstream of the vehicle. A large tree branch has been swept downstream and lodged against the vehicle, creating a dam effect and pooling water. Downstream approximately 500 feet, the road narrows into a culvert. What is your primary concern and action?',
        choices: [
          {
            id: 'a',
            text: 'Request a heavy equipment operator to come clear the vehicle and branch from the road',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Engaging heavy equipment to clear the blockage creates a predictable release point — all that pooled water will suddenly surge. The risk of flash flooding is increased, not decreased. Let the water naturally escape; do not initiate the surge. Evacuation is the correct action.',
            },
          },
          {
            id: 'b',
            text: 'The occupants are rescued — declare the incident complete and return to station',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The occupants are safe, but the scene hazard is now focused downstream. The vehicle-and-debris dam effect is a flash-flood risk to people and property downstream. Your incident is not complete until you have established evacuation zones and hazard communication downstream. Patient rescue is done; scene hazard management continues.',
            },
          },
          {
            id: 'c',
            text: 'The vehicle is now a debris obstruction — position personnel to clear it or break it apart so flow is restored',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Do not send personnel downstream to work on the vehicle or clear debris in a flooding situation. The vehicle is already downstream of the original incident. The real concern is upstream blockage: that branch-vehicle dam effect is creating a pressure point. If the blockage suddenly releases, a surge of water and debris will rush downstream through the culvert. Evacuate the downstream area — do not engage the blockage yourself.',
            },
          },
          {
            id: 'd',
            text: 'Establish evacuation zones downstream of the culvert entrance. Alert residents in the floodplain below to move to higher ground. Monitor the road section for sudden surges.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. When a vehicle and debris create a partial blockage in a flooding river, the pooled water behind it is under pressure. If the blockage suddenly clears (vehicle washes downstream, debris shifts), a surge of water will rush through the culvert. This is a flash-flood risk for anyone downstream. Evacuate the area, alert downstream residents, and monitor. Do not attempt to clear the blockage yourself.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Swift-water rescue is a specialized operation — personnel without swift-water training should not enter flowing water without boats and proper equipment.',
        'Scene safety in flood conditions includes upstream and downstream perimeters; the water is the hazard, not just the vehicle.',
        'Reach-Throw-Row-Go hierarchy prioritizes safer techniques, but in swift water, professional boats and trained rescuers (Row) are often the only safe option.',
        'Prioritize rescue of the victim in greatest immediate danger (in water, losing grip) before those in more stable positions (on roof).',
        'Vehicle and debris blockages in flooding rivers create pressure dams; sudden release causes flash floods downstream — evacuate rather than clear.',
        'Hypothermia is a post-rescue concern in cold water; EMS evaluation and warming are critical even for conscious, alert victims.',
      ],
      references: [
        'NFPA 1006: Standard for Rescue Technician Professional Qualifications — Swiftwater Rescue',
        'NJ State Police Water Safety and Flood Rescue Manual',
        'USCG (US Coast Guard) Swift Water Rescue Boat Operator Guidelines',
        'National Weather Service Flood Warnings and Flash Flood Criteria',
        'American Heart Association: Hypothermia and Cold Water Immersion Treatment',
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 3. TECHNICAL RESCUE — CONFINED SPACE
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'technical-rescue-confined-space',
    title: 'Technical Rescue — Confined Space',
    description: 'Worker collapsed in NJ storm sewer with atmospheric hazard suspected. Navigate entry ban, atmospheric monitoring, and rescue planning.',
    category: 'MVA / Technical Rescue',
    difficulty: 'Advanced',
    estimatedMinutes: 20,
    creditHours: 1.0,
    passingScore: 60,
    icon: '⚠️',
    badgeColor: 'bg-purple-100 text-purple-700',

    setup: {
      dispatch: 'DISPATCH: Engine 52, Rescue 4, Hazmat 6 — respond to Valley Road near Route 27 for a worker down in a storm sewer. Possible atmospheric hazard.',
      narrative: 'Public works crew was conducting storm drain maintenance when one worker collapsed inside a 6-foot-deep catch basin. A second worker raised the alarm. You arrive 6 minutes after dispatch. The collapse site is in an excavated chamber beneath a residential street. The unconscious worker is approximately 8 feet into the chamber, partially submerged in gray water.',
      details: [
        'Location: Valley Road near Route 27, residential area, storm drain system',
        'Victim: Public works employee, male, 50s, unconscious, partially submerged',
        'Hazmat indicators: Gray water in chamber, unknown chemical source, no visible vapor but methane and hydrogen sulfide common in storm drains',
        'Depth: 6-foot vertical drop, chamber dimensions 8 ft × 6 ft, tight access',
        'Atmospheric conditions: Unknown — no monitoring equipment deployed by public works',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 4 — Initial Assessment Without Entry',
        situation: 'You arrive at the excavation site. A Public Works supervisor is standing near the open manhole, visibly agitated. He says: "He\'s been down there 2-3 minutes. We have to get him out NOW." Below, you see the unconscious worker. Your Hazmat team is 7 minutes out. Your crew is asking: "Should we jump in and grab him?" What is your immediate decision?',
        choices: [
          {
            id: 'a',
            text: 'Do not enter. Establish a 10-foot perimeter around the manhole. Request your Hazmat team and a confined-space rescue unit. Attempt to assess if the victim is breathing and communicating from above.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. A collapsed worker in a confined space with unknown atmospheric conditions is a red flag for atmospheric hazard (hydrogen sulfide, methane, or oxygen deficiency). If the first responder enters without testing, they become a second victim. OSHA and NFPA 1006 explicitly require: (1) no entry without atmospheric monitoring, (2) 10-foot non-entry zone, (3) confined-space rescue unit and hazmat backup. Your impulse to rescue is right; your method is to prepare for safe entry, not to rush it.',
            },
          },
          {
            id: 'b',
            text: 'Enter immediately with SCBA on a tether to extract the victim — they are unconscious and every second matters',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Entering a confined space with unknown atmosphere, even with SCBA, without atmospheric testing and hazmat backup is how rescue becomes a mass-casualty incident. Hydrogen sulfide at concentrations of 500+ ppm is lethal in seconds; oxygen deficiency (below 19.5%) causes unconsciousness. You will collapse. You will become the second victim. The delay for Hazmat and atmospheric monitoring is not excessive — it is mandatory.',
            },
          },
          {
            id: 'c',
            text: 'Request a ladder to access the chamber more safely',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A ladder does not address the real hazard — the atmosphere. Accessing the chamber more easily still exposes you to whatever knocked out the public works employee. Do not focus on easier entry; focus on safe entry.',
            },
          },
          {
            id: 'd',
            text: 'Call for additional ambulances and prepare for multiple casualties from potential secondary collapse',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'While preparing for additional victims is not wrong, it is not the priority. The priority is preventing secondary victims by NOT entering until the atmosphere is verified safe. Focus on scene management and hazmat support, not on preemptively treating victims-to-be.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 4 — Atmospheric Monitoring',
        situation: 'Hazmat 6 has arrived with a four-gas monitor (oxygen, carbon monoxide, hydrogen sulfide, methane). The monitor probe is lowered into the chamber. Readings are: O2 = 18.2% (LOW), H2S = 12 ppm (ELEVATED), CO = 0 ppm, Methane = 400 ppm. The Hazmat Officer says: "Atmosphere is NOT safe for entry. Multiple issues." You are now 10 minutes into the incident. The Public Works supervisor is demanding entry. What is your response?',
        choices: [
          {
            id: 'a',
            text: 'The atmosphere is unsafe for standard entry — ventilate the chamber with high-powered blowers and retest until safe conditions are achieved',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Ventilation is a good step, but it takes 10-15 minutes to fully exchange the atmosphere of a 6 ft × 6 ft × 6 ft chamber, and hydrogen sulfide re-accumulation is a risk. More importantly, the victim has been down for 10-12 minutes without rescue — time is a factor. Ventilate, yes, but simultaneously prepare entry with SCBA and a backup team (not waiting for full ventilation).',
            },
          },
          {
            id: 'b',
            text: 'Request a video camera to look into the chamber and determine if the victim is breathing before committing to entry',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Video confirmation would be nice but is not the decision-maker here. The real question is: "Is the atmosphere safe for entry?" The answer is no (low O2, elevated H2S, high methane). Determining breathing status does not change the hazmat response. Prepare for entry and go — breathing assessment happens during rescue, not as a pre-entry gating item.',
            },
          },
          {
            id: 'c',
            text: 'Declare the victim likely deceased due to prolonged exposure and stand down the rescue — it is too dangerous',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The victim has been unconscious for 10-12 minutes. Unconsciousness does not equal death. Depending on the cause (hypoxia, H2S exposure, or shock), some victims can be revived. Assuming death and abandoning rescue is not acceptable in the first 15-20 minutes. Attempt rescue with proper equipment.',
            },
          },
          {
            id: 'd',
            text: 'Initiate ventilation immediately. Begin deployment of a confined-space rescue tripod with rope and harness. Brief your entry team (2-person team with SCBA, with 2-person backup and safety officer) on the hazards. Once entry team is equipped and briefed, begin entry-readiness procedures. Estimated time to entry: 8-10 minutes.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. While the atmosphere is unsafe for unequipped entry, it is potentially safe for SCBA-equipped rescue personnel. You do three things in parallel: (1) ventilation to improve conditions, (2) equipment prep (tripod, harnesses, rescue configuration), (3) team briefing on hazards (low O2, H2S, methane present). The 8-10 minute delay is acceptable; it prevents a second victim. This is methodical, safe confined-space rescue protocol.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 4 — Rescue Plan with Backup Team',
        situation: 'Your entry team is now fully briefed and equipped with SCBA. The chamber has been ventilated for 12 minutes; new atmospheric readings are: O2 = 19.8% (borderline but acceptable), H2S = 4 ppm (still elevated, requiring SCBA), CO = 0, Methane = 100 ppm. Your Safety Officer confirms entry readiness. The victim is still partially submerged. What is your rescue approach?',
        choices: [
          {
            id: 'a',
            text: 'Send one trained rescuer on a rope tether to locate the victim, assess viability, and rig for extraction',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Never send a single rescuer into a confined space. NFPA 1006 and OSHA both mandate 2-in/2-out configuration: minimum 2 rescuers inside, minimum 2 standing by outside ready for immediate deployment if inside team becomes incapacitated. Send your entry team (2 rescuers) together.',
            },
          },
          {
            id: 'b',
            text: 'Deploy a 2-person entry team (both SCBA-equipped, on independent ropes with tethers). A 2-person backup team stands outside with rescue rope and harness ready. Entry team descends, locates victim, assesses for responsiveness and pulse, rigs victim to extraction harness, and signals for hoist. Backup team executes extraction immediately upon signal.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. This is the textbook confined-space rescue configuration: (1) 2-in/2-out (2 rescuers inside, 2 on standby), (2) independent safety lines for each rescuer, (3) clear communication and hand signals, (4) entry team focused on victim assessment and rigging, (5) backup team focused on extraction. The victim is assessed for pulse and responsiveness; if cardiac arrest is evident, CPR is initiated during extraction. This is the safe, professional approach.',
            },
          },
          {
            id: 'c',
            text: 'Rig the victim with an extraction harness from above using a rope and pulley, without entering the chamber',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Attempting to rig an unconscious, partially submerged victim from above without entry is unlikely to succeed. You cannot assess the victim\'s condition, position the harness correctly, or ensure they are stable for extraction. Entry is necessary. Do it with proper backup.',
            },
          },
          {
            id: 'd',
            text: 'Wait an additional 15 minutes for atmospheric conditions to improve further before sending entry team',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The victim has already been unconscious for 18+ minutes. Every minute without rescue reduces survival probability in cases of hypoxia or cardiac arrest. The atmosphere is now marginally acceptable for SCBA-equipped entry. Do not delay further. Go.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 4 — Patient Removal & Decon',
        situation: 'Your entry team has located the victim — he is unconscious but has a faint carotid pulse (HR ~40). The team has rigged him in an extraction harness. As the victim is being hoisted out of the chamber, you notice his clothing and exposed skin are already beginning to show chemical burns (reddening, blistering). EMS is standing by. What is your immediate action upon victim emergence?',
        choices: [
          {
            id: 'a',
            text: 'Once the victim emerges, immediately remove contaminated clothing, rinse the victim with copious water (at least 15 minutes), and have EMS initiate advanced life support while decon is ongoing',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Chemical exposure with visible burns requires immediate decontamination: (1) remove contaminated clothing, (2) flush with water for extended duration (15+ minutes), (3) initiate EMS care simultaneously (don\'t wait for decon to finish). The slow pulse and unconsciousness suggest possible cardiac depression from the chemical — EMS resuscitation may be needed. Decon and medical care happen in parallel, not sequentially.',
            },
          },
          {
            id: 'b',
            text: 'Have the entry team decontaminate the victim inside the chamber before extraction to minimize spread of the chemical',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Decontamination inside the chamber while the victim is exposed is ineffective and puts rescuers at further risk. Extract first, decon outside. The gray water in the chamber is likely the source of the chemical — removing the victim from it is the priority.',
            },
          },
          {
            id: 'c',
            text: 'Place the victim in a containment tarp to prevent spread of the chemical, then transport directly to the hospital without immediate decon',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Containing the victim without deconning allows the chemical to remain on skin and clothing, causing continued burns and systemic absorption. Decontamination must happen on scene before transport. Do not transport a contaminated patient without preliminary decon.',
            },
          },
          {
            id: 'd',
            text: 'Wait for the hazmat team to identify the chemical before deconning — use the wrong decon method and you could worsen the burns',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Universal decontamination for unknown chemicals is water flush with mechanical removal (clothing, gross contamination). This is the safest immediate action while waiting for hazmat identification. Do not delay decon waiting for lab analysis. Water flush is safe for nearly all chemical exposures.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Never enter a confined space without atmospheric monitoring — hydrogen sulfide, methane, and oxygen deficiency are silent killers.',
        'OSHA and NFPA mandate 2-in/2-out configuration: minimum 2 rescuers inside on independent safety lines, minimum 2 standing by outside.',
        'Atmospheric test results (O2 < 19.5%, H2S > 10 ppm) require SCBA entry; do not assume ventilation alone will make a space safe.',
        'Rescue planning for confined spaces includes briefs on hazards, independent safety systems, and clear communication protocols.',
        'Chemical exposure with visible burns requires immediate field decontamination (clothing removal, water flush) before transport to hospital.',
        'Confined-space rescue is a specialty discipline — delay for proper resources and training is the safest option when time allows.',
      ],
      references: [
        'NFPA 1006: Standard for Rescue Technician Professional Qualifications — Confined Space Rescue',
        'OSHA 29 CFR 1910.146: Permit-Required Confined Spaces',
        'OSHA 29 CFR 1910.134: Respiratory Protection Standard (SCBA use)',
        'NJ Department of Health Hazardous Substance Fact Sheet — Hydrogen Sulfide',
        'CDC: Confined Space Rescue and First Aid for Chemical Exposure',
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 4. BUILDING COLLAPSE — CONSTRUCTION SITE
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'building-collapse-construction',
    title: 'Building Collapse — Construction Site',
    description: 'Partial collapse at NJ construction site with workers missing, unstable structure, and complex search and stabilization challenges.',
    category: 'Firefighter Safety',
    difficulty: 'Advanced',
    estimatedMinutes: 20,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🏗️',
    badgeColor: 'bg-gray-200 text-gray-700',

    setup: {
      dispatch: 'DISPATCH: Engine 61, Ladder 12, Rescue 5, Hazmat 7 — respond to Riverside Drive Construction Site for a building collapse with trapped workers.',
      narrative: 'A mid-rise commercial building under construction in NJ suffered a partial floor collapse on the 4th level. The collapse happened at approximately 14:15 on a Tuesday. Three workers are confirmed missing and presumed buried. The structure remains unstable — 5th level is now partially unsupported. Your Rescue team arrives 8 minutes after dispatch.',
      details: [
        'Location: Riverside Drive, mid-rise commercial construction (8 stories planned, currently at 4-5 levels)',
        'Collapse: 4th floor collapse, approximately 30% of floor area, 5th floor compromised',
        'Trapped workers: 3 presumed buried, location unknown, no communication established',
        'Structural: Steel frame partially erected, concrete floor pour in progress, significant debris',
        'Hazmat: Dust (concrete, silica), potential gas line rupture in building (uncertain)',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 4 — Collapse Zone Establishment',
        situation: 'You arrive at the construction site. A partial floor collapse is visible from the street — the 4th floor has dropped, and rubble is visible. Dust is still settling. The building is an active construction site with crane operations, heavy equipment, and multiple workers on-site. A Site Manager is on the ground saying: "Three guys are down there — we need to start searching NOW." What is your first action?',
        choices: [
          {
            id: 'a',
            text: 'Assume the trapped workers are fatally injured and switch to recovery mode instead of rescue mode',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Three minutes have passed since collapse. Occupants buried under construction debris have a reasonable chance of survival if extricated within the first 30 minutes. Assuming fatality and delaying rescue is premature. Treat this as a rescue mission; if conditions change, you reassess.',
            },
          },
          {
            id: 'b',
            text: 'Immediately deploy search teams into the collapse zone to locate and extract trapped workers',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Committing personnel into an unstable collapse zone without first establishing hazard zones, shoring, and structural assessment creates a secondary collapse risk. The 5th floor is partially unsupported — additional weight or vibration could bring it down on rescuers below. Establish collapse zones first; search later.',
            },
          },
          {
            id: 'c',
            text: 'Shut down all crane operations immediately and order construction workers off the site',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Shutting down cranes and evacuating the site is wise for safety, but it should be a coordination with the Site Manager and happens as part of collapse zone establishment, not in isolation. Your primary focus is establishing hazard zones and search readiness. Do both simultaneously.',
            },
          },
          {
            id: 'd',
            text: 'Establish a collapse zone perimeter (minimum 1.5 times the height of the building on all sides). Clear all non-essential personnel and equipment from the zone. Request structural engineer for building assessment. Stage search teams outside the zone until hazard assessment is complete.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Collapse zone safety is the foundation of building collapse rescue. A perimeter of 1.5× building height (in this case, approximately 60-75 feet) prevents secondary collapse from affecting rescuers or bystanders. Clearing the zone eliminates distractions. Requesting a structural engineer is critical — they assess whether the 5th floor is stable enough for rescue operations above or if you must stabilize before searching below. Search teams are staged and ready but do not enter until the zone is declared safe.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 4 — Search Methodology',
        situation: 'The structural engineer has cleared the 5th floor as marginally stable but at risk if additional weight is added. The collapse zone is established. Your search team has been assigned to the 4th floor collapse site. Debris is unstable, with large concrete slabs at angles and steel beams partially exposed. Your team leader radios: "Where do we start searching? Area is massive." What is your guidance?',
        choices: [
          {
            id: 'a',
            text: 'Hire a heavy excavator to remove large debris slabs quickly and expose more area',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Heavy equipment in a collapse zone is a secondary collapse risk. Moving large slabs can destabilize remaining structure and crush victims. Equipment is used only for heavy debris removal AFTER victim locations are known and the area is properly shored.',
            },
          },
          {
            id: 'b',
            text: 'Ask the construction supervisor which location the missing workers were in when the collapse happened',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Asking is good, but you should have already extracted this information during initial incident command. Use the location information to prioritize search, but use rescue canines and listening devices to confirm victim locations under the debris. Do not rely solely on supervisor reporting.',
            },
          },
          {
            id: 'c',
            text: 'Use rescue canines and acoustic listening devices to pinpoint victim locations. Once located, mark the site and prepare targeted extrication (shoring, probing, debris removal) rather than random searching.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. In a large collapse with minimal viable search time, acoustic listening (sensitive equipment detects human sounds from under debris) and canine search focus effort on high-probability victim locations. Once victims are pinpointed, you prepare extrication at that specific spot — shoring the debris, probing to assess victim condition, removing debris in a controlled sequence. This is far more efficient than searching the entire collapse zone.',
            },
          },
          {
            id: 'd',
            text: 'Search in a grid pattern from the perimeter toward the center, marking cleared areas as you go',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'A grid pattern is logical, but in a building collapse with massive unstable debris, starting at the perimeter and moving inward risks becoming trapped if secondary collapse isolates the search team from exit. Better approach: identify likely victim locations first (where they were working), then use shoring/probing.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 4 — Shoring & Stabilization',
        situation: 'Acoustic listening has pinpointed a victim signal approximately 12 feet under the collapse, near the southeastern area of the 4th floor. However, reaching that location requires removing large concrete slabs and exposing the 5th floor above (which is already compromised). Your Structural Engineer says: "If you remove that slab, the 5th floor may drop." What is your shoring strategy?',
        choices: [
          {
            id: 'a',
            text: 'Call for additional heavy equipment (crane, excavator) to stabilize the 5th floor from above',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Heavy equipment above a compromised 5th floor is exactly what you want to avoid — added weight is more likely to cause collapse, not prevent it. Shoring from below (internal support) is the correct approach.',
            },
          },
          {
            id: 'b',
            text: 'Accept the risk and remove the slab quickly — the victim below may not survive if we delay for shoring',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Accepting a known secondary collapse risk to rescue one victim is not acceptable incident management. If the 5th floor drops during extraction, you may create multiple additional victims from your own team. Shoring takes 20-30 minutes but protects both the victim and rescuers. Do it.',
            },
          },
          {
            id: 'c',
            text: 'Remove the slab slowly and carefully with hand tools — that way you can feel instability and stop if needed',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Hand tools on a large concrete slab are unlikely to succeed and add time. More importantly, "feeling" instability is not a reliable indicator — structural failure can be sudden. Proper shoring is the solution, not faster hand removal.',
            },
          },
          {
            id: 'd',
            text: 'Install temporary shore posts and bracing on the 5th floor from below, supporting the compromised section. Once 5th floor is stabilized, you can safely remove the 4th floor slab and access the victim',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Shoring the 5th floor from below (using hydraulic shore posts, steel beams, and bracing) stabilizes that level before you remove the 4th floor slab. This takes time (20-30 minutes), but it prevents secondary collapse and allows your team to work safely under a stable structure. The victim has survived this long under debris; they can survive 30 more minutes while you properly support the structure.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 4 — Secondary Collapse Awareness',
        situation: 'The 5th floor has been successfully shored. The 4th floor slab has been partially removed, and the victim (male, 40s, pinned by a steel beam across the abdomen) is now visible and conscious. He is alert but complaining of abdominal pain. A second acoustic signal has been detected 20 feet away — a second victim. As your team is preparing to lift the beam off the first victim, another tremor is felt (likely construction-related from an adjacent site or residual settling). Your Safety Officer says: "Secondary collapse risk is increasing as we destabilize the structure further." What is your action?',
        choices: [
          {
            id: 'a',
            text: 'Stop all rescue operations and declare the structure too dangerous — recovery mode only',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The first victim is alive and accessible. Tremors are a sign to be cautious, not to abandon rescue. Pause, assess, monitor — but do not declare fatality prematurely. Continue rescue operations with heightened awareness.',
            },
          },
          {
            id: 'b',
            text: 'Immediately begin lifting the beam to free the victim, ignoring the secondary collapse risk',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Ignoring secondary collapse risk and rushing extraction exposes both victim and rescuers to additional danger. If the 4th floor shifts further, the beam could drop or shift unexpectedly, causing crush injuries. Prepare for extraction, but do so with ongoing structural monitoring.',
            },
          },
          {
            id: 'c',
            text: 'Expedite extraction of both victims simultaneously by assigning teams to each location',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Splitting resources and rushing both extractions in a destabilizing structure increases secondary collapse risk, not decreases it. One extraction at a time, with full stabilization, is safer.',
            },
          },
          {
            id: 'd',
            text: 'Pause extraction of the first victim. Assess ongoing tremors and structural movement. If tremors continue or escalate, evacuate the collapse zone and reassess from the perimeter. Once stability is confirmed, resume extraction.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Secondary collapse does not wait for convenience — it happens when structural stress exceeds residual capacity. Detecting tremors is a warning sign. Pausing extraction, assessing tremors, and evacuating if necessary are professional responses. Yes, this delays the first victim\'s rescue — but preventing a secondary collapse that kills rescuers and the second victim is the right trade-off. Monitor, reassess, resume when conditions allow.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Collapse zone establishment (1.5× building height) is mandatory before personnel entry — prevents secondary collapse injuries to rescuers.',
        'Structural engineers are critical partners in building collapse rescue — their assessment determines search methodology and shoring requirements.',
        'Acoustic listening and canine search pinpoint victim locations, reducing search time and focusing extrication efforts on high-probability zones.',
        'Shoring unstable upper floors before removing lower-floor debris prevents secondary collapse — it adds time but saves lives.',
        'Tremors during rescue operations signal ongoing structural instability — pause, assess, monitor, and evacuate if conditions deteriorate.',
        'Rescue vs. recovery is a judgment call, but in the first 30-45 minutes with conscious, located victims, rescue mode is appropriate.',
      ],
      references: [
        'NFPA 1006: Standard for Rescue Technician Professional Qualifications — Structural Collapse Rescue',
        'Urban Search and Rescue (USAR) Markings System (FEMA)',
        'Structural Engineers Association Collapse Rescue Guidelines',
        'OSHA Construction Site Collapse Prevention Standards',
        'NJ Building and Construction Code (N.J.A.C. 5:23)',
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 5. CARDIAC ARREST AT PUBLIC EVENT
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'cardiac-arrest-public',
    title: 'Cardiac Arrest at Public Event',
    description: 'Spectator collapse at NJ high school football game with bystander CPR in progress. Navigate scene management, AED use, advanced life support transition, and family communication.',
    category: 'EMS / Rescue',
    difficulty: 'Foundational',
    estimatedMinutes: 15,
    creditHours: 1.0,
    passingScore: 60,
    icon: '❤️',
    badgeColor: 'bg-pink-100 text-pink-700',

    setup: {
      dispatch: 'DISPATCH: Engine 22, EMS Unit 8 — respond to Lincoln High School football field for a spectator collapse. Bystander CPR in progress.',
      narrative: 'A football game is underway at Lincoln High School on a Friday night. A spectator (male, approximately 60s) suddenly collapsed in the bleachers during the third quarter. A nearby nurse started CPR immediately. Someone called 911. The school staff located the AED on-site. You arrive 4 minutes after dispatch.',
      details: [
        'Location: Lincoln High School football field, bleachers (north side)',
        'Patient: Male, approximately 60s, collapsed suddenly, CPR started by bystander (nurse)',
        'Crowd: Approximately 800 spectators, game still in progress, families present',
        'Resources on-site: School staff, AED (deployed), first aid kit',
        'Time: Friday night, 20:15, weather clear',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 4 — Scene Management & Crowd Control',
        situation: 'You arrive at the bleachers. A nurse is performing CPR on the patient (on the bleacher seating). An AED is nearby. The crowd is pressing in, with concerned spectators, parents, and friends surrounding the area. The game is still in progress on the field — the athletic director is confused about whether to stop play. Your EMS crew is getting out of the ambulance. What is your first action?',
        choices: [
          {
            id: 'a',
            text: 'Tell the crowd to leave the area immediately — evacuate the bleachers',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Mass evacuation of bleachers creates crush risk and panic. Asking people nearby to step back is more appropriate than ordering evacuation. Keep the crowd calm and organized.',
            },
          },
          {
            id: 'b',
            text: 'Have the nurse continue CPR while you notify the family and take information for the hospital',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The nurse is doing critical work — CPR quality and rhythm matter. You should take over CPR yourself as soon as you have cleared the scene and deployed the AED. Notification happens later.',
            },
          },
          {
            id: 'c',
            text: 'Assess the patient\'s condition and relieve the nurse to continue CPR in a controlled manner',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Patient assessment is important, but the crowd pressing in creates a hazard. You need a safe operating area first. Before you work the patient, control the scene.',
            },
          },
          {
            id: 'd',
            text: 'Direct school staff to establish a 10-foot perimeter around the patient and move the crowd back. Request the game be paused (or moved to the other field). Position apparatus to block direct line of sight if possible. Once perimeter is clear, take over CPR and deploy the AED.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. A cardiac arrest in a packed bleacher with hundreds of spectators creates crowd management challenges. A clear 10-foot zone allows your team to work effectively and safely. Pausing the game and moving the crowd prevents panic and allows families to be accounted for without distraction. With the perimeter established, you take over CPR (relieving the nurse), deploy the AED, and initiate advanced life support. This is scene management 101.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 4 — AED & High-Quality CPR',
        situation: 'You have taken over CPR from the nurse. The patient is now on the bleacher step in a clear area. The AED has been deployed. Your EMT-B crew member is applying the AED pads. You are performing chest compressions at a rate of 120/min. The AED beeps: "ANALYZING... SHOCK ADVISED." The patient shows no signs of responsiveness. Your crew is ready. What is your action?',
        choices: [
          {
            id: 'a',
            text: 'Clear the area (including the nurse who helped), ensure no one is touching the patient, press the AED "SHOCK" button',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Before delivering a shock, you must ensure no one is in contact with the patient — an AED shock delivered with someone touching the patient can cause injury. Verbally command "CLEAR!" and visually verify. Once clear, deliver the shock. Resume CPR immediately after (per AHA guidelines, 2 minutes of CPR, then re-analyze). You are doing this right.',
            },
          },
          {
            id: 'b',
            text: 'Pause CPR, deliver the shock, and assess the patient for responsiveness',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Pausing CPR to deliver the shock is correct, but assessing responsiveness after one shock is not part of the protocol. After the shock, immediately resume CPR for 2 minutes, then re-analyze. Do not check for responsiveness until you have completed AED-directed rhythm cycles.',
            },
          },
          {
            id: 'c',
            text: 'Ask the patient if they want to be shocked before you deliver the therapy',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The patient is unconscious and in cardiac arrest. They cannot consent. AED therapy is indicated when the device detects a shockable rhythm. Deliver the shock.',
            },
          },
          {
            id: 'd',
            text: 'Continue CPR without using the AED — manual chest compressions are more reliable',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'AEDs are highly effective for sudden cardiac arrest, especially when deployed early. If the patient is in ventricular fibrillation (common in sudden collapse), defibrillation is the lifesaving therapy. Use the AED as indicated.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 4 — ALS Handoff & Advanced Airway',
        situation: 'After 2 minutes of CPR and AED rhythm analysis, the AED advises another shock. The shock is delivered. CPR resumes. Your EMS Unit (paramedic-level ALS) has just arrived on scene and is approaching with their equipment. The patient remains in cardiac arrest (unresponsive, no pulse). Your paramedic asks: "Do you want me to establish an advanced airway, or should I continue bag-valve-mask (BVM) ventilation?" What is your recommendation?',
        choices: [
          {
            id: 'a',
            text: 'Continue with BVM ventilation while CPR is ongoing. If the patient does not achieve return of spontaneous circulation (ROSC) after additional AED cycles and medications, then reassess airway strategy',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Current AHA guidelines prioritize high-quality CPR over airway management in the initial cardiac arrest phase. BVM ventilation with 100% oxygen at a rate of 10-12 breaths per minute is appropriate. If the patient regains consciousness and ROSC, then advanced airway management becomes relevant. In the arrest phase, do not delay CPR for intubation attempts.',
            },
          },
          {
            id: 'b',
            text: 'Avoid any airway intervention — focus solely on chest compressions',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Airway and oxygenation are essential. BVM ventilation with 100% oxygen should be part of any cardiac arrest resuscitation. Do not skip ventilation; just do not allow it to interrupt CPR.',
            },
          },
          {
            id: 'c',
            text: 'Establish an endotracheal tube (ET tube) immediately — airway control is the priority in arrest',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'While airway control is important, research shows that in the first 10-15 minutes of out-of-hospital cardiac arrest, high-quality CPR (chest compressions and oxygenation via BVM) is more important than intubation. Excessive focus on intubation delays CPR. BVM with adequate rate and depth is the standard initial approach.',
            },
          },
          {
            id: 'd',
            text: 'Use a supraglottic airway (King LT or Combitube) as a compromise between BVM and intubation',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Supraglottic airways are acceptable alternatives, but they are not automatically superior to BVM in cardiac arrest. The principle is the same: high-quality CPR with adequate oxygenation. If BVM is working well, do not change it. If there are barriers to effective BVM, then supraglottic airway is a reasonable option.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 4 — Family Liaison & Documentation',
        situation: 'After 20 minutes of CPR, multiple AED shocks, and ALS medications (epinephrine), the paramedic calls: "No ROSC. Pupil response is absent. We\'re at 20 minutes. Recommend calling it." You concur. The paramedic initiates cessation of resuscitation protocols per state guidelines. Family members (wife and adult son) have arrived and are watching from a distance, distraught. A school social worker is present. What is your responsibility regarding family communication and documentation?',
        choices: [
          {
            id: 'a',
            text: 'Have the social worker speak with the family first. Ensure the paramedic and you are available for questions. Document the arrest timeline, interventions, and cessation time. Ensure the body is treated respectfully and the coroner is notified.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. The social worker provides immediate emotional support, but the clinical team (paramedic and you) should be available to answer medical questions and provide context. Documentation must include: arrival time, initial rhythm, all interventions (shocks, medications, CPR duration), time of cessation, and final exam findings. The coroner is notified per protocol. Respect for the deceased and transparency with the family are essential.',
            },
          },
          {
            id: 'b',
            text: 'Let the paramedics handle the family notification — your role is documentation only',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'While paramedics often lead the conversation, the incident commander (you, the Engine officer) shares responsibility for compassionate communication. A brief, clear statement from you acknowledging the family\'s loss and confirming that everything possible was done is appropriate. Do not hide behind the paramedics.',
            },
          },
          {
            id: 'c',
            text: 'Tell the family: "We did everything we could. He is gone. The hospital will take it from here."',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The phrasing is too dismissive and inaccurate (the hospital is not involved in out-of-hospital deaths). A more compassionate approach: "Despite our best efforts and advanced life support, we were unable to restore a pulse. I am deeply sorry for your loss. The coroner will be contacted, and they will speak with you." This acknowledges the death clearly but with humanity.',
            },
          },
          {
            id: 'd',
            text: 'Do not speak directly with the family — documentation is your priority',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Documentation is essential, but so is family communication. Taking 2-3 minutes to express condolences and answer immediate questions is not excessive. Documentation can be completed after.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Scene management and crowd control are critical in public cardiac arrests — establish a perimeter before initiating treatment.',
        'High-quality CPR (120-130 compressions per minute, at least 2 inches depth) and early AED deployment are the foundation of cardiac arrest response.',
        'AED shocks should be cleared (no bystanders touching patient) and administered per device guidance; CPR resumes immediately after each shock.',
        'ALS transition includes appropriate medication (epinephrine per protocol) and airway management; BVM ventilation often remains the standard unless ROSC is achieved.',
        'Cessation of resuscitation is a clinical decision made per state protocols — typically after 20-30 minutes without ROSC in unwitnessed arrest.',
        'Family communication at the scene combines compassion, clarity, and availability — acknowledge the loss, explain what was done, and facilitate transition to coroner/funeral arrangements.',
      ],
      references: [
        'American Heart Association: BLS Provider Manual (2020 Guidelines)',
        'NHTSA: EMS Education Standards and Cardiac Arrest Protocols',
        'NJ State Health Commissioner: Cessation of Resuscitation Guidelines',
        'American Red Cross: CPR and AED Training Certification',
        'CDC: Out-of-Hospital Cardiac Arrest Epidemiology and Outcomes',
      ],
    },
  },

// ══════════════════════════════════════════════════════════════════════
  // 1. HAZMAT — CHEMICAL PLANT INCIDENT
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'hazmat-chemical-plant',
    title: 'HazMat — Chemical Plant Incident',
    description: 'An industrial chemical release at a major NJ plant along the I-95 corridor. Navigate upwind positioning, ERG identification, zone establishment, decontamination setup, and coordination with county HazMat and plant safety officers.',
    category: 'HazMat',
    difficulty: 'Advanced',
    estimatedMinutes: 25,
    creditHours: 1.0,
    passingScore: 60,
    icon: '☢️',
    badgeColor: 'bg-yellow-100 text-yellow-800',

    setup: {
      dispatch: 'DISPATCH: Engine 22, Hazmat Unit 3 — chemical release reported at Meridian Chemical Works, 1850 Route 1 Southbound, off exit 9. Caller reports strong chemical odor, possible vapor cloud near loading dock, employees evacuating. County HazMat Unit en route.',
      narrative: 'You are the Hazmat Officer on Unit 3. You arrive at Meridian Chemical Works at 10:47 AM on a Thursday. The facility is a mid-sized chemical manufacturing plant situated 300 feet west of Route 1. Wind is blowing northeast at 12 mph. You observe a pale yellow vapor cloud drifting from the loading dock area on the west side of the plant. Approximately 30 employees are gathered on the parking lot east of the main building — upwind position. No visible emergency responders yet. A plant safety officer is waving frantically from the facility entrance.',
      details: [
        'Facility: Meridian Chemical Works — licensed industrial chemical plant (phosphate compounds, acids, solvents)',
        'Location: 1850 Route 1 Southbound, exits 9–10 area; adjacent to residential neighborhoods 0.4 miles south',
        'Wind: 12 mph from southwest, pushing vapor cloud northeast toward Route 1 commercial corridor',
        'Visible signs: Yellow vapor cloud, approximately 60 feet diameter, source from loading dock on west side',
        'Occupancy: ~40 employees on-site; 30 accounted for in evacuation; 10 status unknown',
        'Resources: PSE&G (utility infrastructure nearby), NJ DEP Hazmat on 15-min ETA, local PD, EMS',
      ],
    },

    scenes: [
      {
        id: 'cp1',
        title: 'Scene 1 of 5 — Approach & Wind Assessment',
        situation: 'Your Hazmat Unit is 200 feet from the facility main entrance. The yellow vapor cloud is visible downwind to the northeast. Plant safety officer is in the parking lot waving for you to come closer. Your driver is asking for approach direction. What is your first action?',
        choices: [
          {
            id: 'a',
            text: 'Approach from the northeast (upwind) side of the facility, positioning your unit so the wind is at your back and away from the plume',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Approaching from upwind ensures your crew, unit, and command post are protected from vapors and any additional release. Never position yourself where the wind can carry contaminant toward your location. Document wind direction on arrival, establish your control zone accordingly, and position decon downwind of operations. This is the foundation of safe hazmat positioning.',
            },
          },
          {
            id: 'b',
            text: 'Proceed directly to the plant safety officer at the main entrance to gather immediate information about the chemical involved',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Racing to the safety officer before assessing wind and vapor behavior is a high-risk move. You have no air supply, no hazmat suit, and no idea what chemical or concentration you are approaching. The yellow vapor tells you significant product is airborne. Establish a safe upwind position first, then communicate with the plant officer by radio if possible. Information gathering is important, but not at the expense of crew safety.',
            },
          },
          {
            id: 'c',
            text: 'Circle downwind of the vapor cloud to stay out of the plume while you assess the situation',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Positioning downwind of an active vapor release is exactly what you must avoid. Even if you are circling, downwind positioning means any change in wind direction, speed, or further release puts you directly in exposure. The safest position is upwind and perpendicular to the plume direction. Wind shifts happen. Do not gamble on stability.',
            },
          },
          {
            id: 'd',
            text: 'Park on Route 1 directly across from the facility to maintain a line-of-sight observation point',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Route 1 positioning gives you observation, but it does not account for wind direction or the public safety implications of a vapor release drifting across a busy state highway. Your positioning should protect your crew and resources first, while also limiting vapor drift toward the commercial corridor. Upwind and set back from Route 1 is safer. You can observe from a protected location.',
            },
          },
        ],
      },

      {
        id: 'cp2',
        title: 'Scene 2 of 5 — ERG Identification & Initial Placard',
        situation: 'You are now positioned upwind, 100 feet from the facility fence line. Your crew reports the vapor cloud is still visible but steady (not increasing). Plant safety officer radios: "Release is from a phosphate acid storage tank. Approximately 100 gallons have spilled into the collection tray, but tray capacity is being exceeded." You do not see a visible placard on the tank from your distance. What is your next action?',
        choices: [
          {
            id: 'a',
            text: 'Request the plant safety officer to verbally confirm the chemical name, obtain the SDS (Safety Data Sheet) via email or phone, and reference the ERG',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Getting the SDS is valuable for response planning — but waiting on email when you have a visible release and an on-site expert is inefficient. The plant safety officer is your fastest ERG reference. Get a verbal chemical ID from them, use your emergency responder ERG reference (which you must carry), and confirm hazard class and evacuation distances right now. SDS is secondary intelligence.',
            },
          },
          {
            id: 'b',
            text: 'Send a hazmat tech in full Level A protection to the tank to visually confirm the placard and tank label from 10 feet away',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Committing a technician in Level A to an unknown chemical environment before confirming the product is premature and unnecessary. You have a live source (the plant), wind conditions to manage, and an ERG reference. Use the plant as your source. Level A entry for placard reading wastes time, consumes air, and escalates hazard exposure when the information is available without entry.',
            },
          },
          {
            id: 'c',
            text: 'Have the plant safety officer meet you at the facility fence line with the SDS and any tank documentation. Confirm the chemical using the ERG, then establish hot/warm/cold zones',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the correct balance. You bring the expert to your upwind position, obtain physical documentation (SDS and labels) without entering the unknown environment, verify the chemical using ERG, and immediately establish your three-zone response. You respect wind safety, use the plant as your partner, and move into zone definition based on confirmed hazard data. This is textbook hazmat command.',
            },
          },
          {
            id: 'd',
            text: 'Broadcast an all-units alert with "phosphate acid" and request immediate evacuation of Route 1 traffic until county HazMat arrives',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Phosphate acid is a corrosive, but without the concentration, tank volume, and confirmed escape distance from ERG, ordering a Route 1 evacuation is premature and could cause public panic and traffic chaos. First confirm the exact chemical, check ERG distance tables, assess actual risk to the highway based on wind and concentration, then make the evacuation decision. Do not escalate without data.',
            },
          },
        ],
      },

      {
        id: 'cp3',
        title: 'Scene 3 of 5 — Hot/Warm/Cold Zone Establishment',
        situation: 'Plant safety officer confirms the chemical is orthophosphoric acid (CAS 7664-38-2), approximately 100 gallons released. Your ERG reference (Class 8, Corrosive) indicates an initial isolation distance of 100 feet and an evacuation distance of 300 feet for vapors. Wind is still 12 mph northeast. Plant perimeter is marked with a fence. Route 1 is 300 feet to the east. You have Engine 22 and a tanker unit arriving. Where do you establish the warm zone boundary?',
        choices: [
          {
            id: 'a',
            text: 'Place the warm zone from the facility fence (west side) to 100 feet east of the fence, with decontamination at 150 feet',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The ERG 100-foot initial isolation distance is a minimum for command establishment, not a warm zone boundary. Warm zone should extend from the hot zone outward, but not compress response distance. Your decon setup at 150 feet is reasonable, but the warm zone should offer adequate buffer for technician operations (typically 50–100 feet buffer beyond the isolation distance). You have wind pushing vapor northeast, so your zone boundaries should respect that drift.',
            },
          },
          {
            id: 'b',
            text: 'Hot zone: facility fence to 50 feet east (release source). Warm zone: 50 feet to 200 feet east (tech entry corridor). Cold zone: 200 feet east to Route 1 perimeter',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is correct zoning. Your hot zone is tightly defined around the source (within the facility and immediate upwind approach). Warm zone is where suited technicians can operate, with adequate distance from the active release. Cold zone is your command, decon, and public safety area. With northeast wind, this layout keeps Route 1 in cold zone and protects against vapor drift. Standard three-zone model applied correctly.',
            },
          },
          {
            id: 'c',
            text: 'Establish a single "unified zone" from the facility to Route 1 — all personnel in full hazmat suits until the acid is contained',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A unified zone eliminates the ability to differentiate safe vs. hazardous areas and wastes hazmat resources by requiring full protection for personnel who are not in danger (command, logistics, EMS). Three-zone delineation is not just protocol — it is an operational efficiency and crew health practice. Command functions, decontamination, and medical aid belong in a controlled cold zone.',
            },
          },
          {
            id: 'd',
            text: 'Exclude the Route 1 corridor from all zones — evacuate everyone within 400 feet of the facility and wait for county HazMat to redraw boundaries',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Conservative thinking can be necessary, but the ERG provides evacuation guidance: 300 feet for phosphoric acid vapors. Expanding to 400 feet and halting all operations until county HazMat arrives wastes the first hour of response and creates unnecessary public disruption. You have adequate training and equipment to manage this incident with county support as a resource, not a prerequisite. Make confident decisions based on ERG data.',
            },
          },
        ],
      },

      {
        id: 'cp4',
        title: 'Scene 4 of 5 — Decontamination Setup & Personnel Entry',
        situation: 'Your zones are established. County HazMat is 8 minutes out. The plant reports the acid spill is still flowing but rate is slowing — collection tray is overflowing at approximately 2 gallons per minute. A plant technician who was on the loading dock has reported to your cold zone entry point with acid splash on their gloved hand and sleeve. They are not in respiratory distress. EMS is standing by. What is your immediate action?',
        choices: [
          {
            id: 'a',
            text: 'Direct the plant technician through decon immediately. Establish a rinse-down corridor with multiple water sources, capture runoff, and have EMS stage for possible inhalation assessment',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Immediate decon is correct. Any personnel with chemical contact must be processed through a decon line before medical evaluation. You need water (sufficient volume and flow), runoff containment to prevent secondary environmental release, and EMS staged for post-decon assessment. Orthophosphoric acid on skin requires copious flushing. This person should be deconned, then EMS evaluates. No delay.',
            },
          },
          {
            id: 'b',
            text: 'Have EMS immediately transport the technician to a hospital for evaluation before attempting decon in the field',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Transporting a contaminated person off scene without field decon spreads hazard to the ambulance, hospital staff, and hospital surfaces. Field decon must happen first, on-scene, before any transport. Once decontaminated, EMS can evaluate and determine hospital need. Decon first, transport second — always.',
            },
          },
          {
            id: 'c',
            text: 'Ask the plant technician to remove their gloves and contaminated sleeve, rinse their hands at the facility outdoor spigot, and then report to EMS for assessment',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Using a facility spigot is not controlled decon. You have no runoff capture, no water flow volume control, and no chain-of-custody for the decon process. A formal decon line — even simple with tanker, wand, and tarp for runoff — ensures adequate flushing, prevents recontamination, and maintains documentation. Set up proper decon.',
            },
          },
          {
            id: 'd',
            text: 'Keep the technician in the warm zone until county HazMat arrives and can perform formal decon with their equipment',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Waiting for county resources delays care. You have water, you have EMS, and you have the authority to initiate decon. Do not leave an exposed person standing by waiting. Establish your decon line now using tanker water and basic setup. County HazMat will supplement and refine, but do not delay initial decon for resource arrival.',
            },
          },
        ],
      },

      {
        id: 'cp5',
        title: 'Scene 5 of 5 — County Coordination & Incident Transfer',
        situation: 'County HazMat arrives at 11:15 AM. You have deconned one exposed technician (now with EMS for evaluation), established cold/warm/hot zones, and coordinated with plant safety to throttle the acid release by closing a supply valve. Spill rate is now negligible. Plant wants to begin recovery/cleanup. County HazMat Officer is requesting a full briefing. You are still the Incident Commander. What is your command decision?',
        choices: [
          {
            id: 'a',
            text: 'Remain as IC, conduct a full briefing with county HazMat, coordinate any additional suppression/recovery, and transition command only when both you and county HazMat agree the incident is stabilized',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Local hazmat response is your jurisdiction. County is a resource/support. You maintain command, brief county on actions taken and current status, establish joint operations plan, and transition command to county only if the incident escalates beyond local containment capacity or requires extended recovery. This incident — contained spill, one exposed person deconned, release slowed — is within your ability to manage with county support.',
            },
          },
          {
            id: 'b',
            text: 'Immediately hand over the incident to county HazMat because they have more specialized equipment and training',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Transferring command unnecessarily abandons your jurisdictional responsibility and fragments command structure. County HazMat is a specialized resource — they support and advise, but unless the incident exceeds your capacity, they do not take command. You have an acid spill that is now under control. Maintain IC while county operates in a support role. Transition only when needed.',
            },
          },
          {
            id: 'c',
            text: 'Approve the plant\'s request to begin cleanup immediately, with county HazMat supervision, to clear the scene faster',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Plant recovery/cleanup operations require formal incident transition and environmental agency (NJ DEP) notification before proceeding. You cannot simply approve the plant to resume operations in the contaminated area. DEP may require soil/surface sampling, documentation, and oversight. Do not permit cleanup without coordination with county and NJ DEP. This is an environmental incident, not just an operational one.',
            },
          },
          {
            id: 'd',
            text: 'Request county HazMat to assume command, then release Engine 22 and return to service',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Releasing Engine 22 before the incident is fully stabilized and transitioned is premature. You should retain operational presence until incident goals are clear (containment, decon, environmental notification) and resources are coordinated. Handing command to county is acceptable if they agree, but releasing your engine immediately after abandons your crew\'s knowledge of the scene and isolates command from local conditions.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Always approach upwind and establish an upwind command post. Wind direction is your first defensive action.',
        'Use on-site experts (plant safety officers) as your ERG reference source. Get verbal product ID, then consult written ERG for distance and hazard confirmation.',
        'Establish three zones (hot, warm, cold) immediately after chemical ID. Do not compress zones or delay zoning for additional resources.',
        'Initiate field decontamination on-scene before transport. Never move a contaminated person off-site without decon.',
        'Maintain command as the local IC unless the incident exceeds your capacity. County HazMat is a resource, not an automatic command replacement.',
        'Coordinate with NJ DEP and the facility on environmental recovery procedures. Do not approve cleanup without multi-agency clearance.',
      ],
      references: ['NFPA 472 (Hazmat Ops)', 'NJ DEP Hazmat Response Guide', 'ERG (Emergency Response Guidebook)', 'OSHA 29 CFR 1910.120', 'ICS-300'],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 2. HAZMAT — POOL CHEMICAL EMERGENCY
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'hazmat-pool-chemical',
    title: 'HazMat — Pool Chemical Emergency',
    description: 'Homeowner mixes incompatible pool chemicals (chlorine + acid) in an attached garage, creating a toxic chlorine gas vapor cloud. Navigate recognition, family evacuation vs. shelter-in-place, ventilation strategy, and medical assessment of exposed occupants.',
    category: 'HazMat',
    difficulty: 'Foundational',
    estimatedMinutes: 20,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🏊',
    badgeColor: 'bg-yellow-100 text-yellow-800',

    setup: {
      dispatch: 'DISPATCH: Engine 8, Medic 12 — chemical smell reported at 147 Cedar Lane, residential. Caller reports "strong chlorine smell" from garage, family experiencing coughing. Police en route.',
      narrative: 'You are the IC on Engine 8, arriving at 14:22 on a Saturday afternoon. 147 Cedar Lane is a single-family Colonial with an attached two-car garage. As you pull up, you observe a pale yellow-green vapor cloud visible in the garage bay (large open doorway). A homeowner is standing in the driveway coughing. His wife and two children (ages 8 and 12) are visible on the front lawn, also coughing. The homeowner waves at you and shouts: "I mixed the pool chemicals by accident — chlorine and acid! The kids were in there for about 30 seconds before I got them out."',
      details: [
        'Residence: Single-family Colonial, attached two-car garage, likely 1980s construction. Garage interior dimension ~20 x 24 feet.',
        'Chemical release: Household chlorine bleach (5–8% hypochlorous acid) + muriatic acid (pool maintenance acid, 30% hydrochloric acid); mixed in plastic bucket; reaction creates toxic chlorine gas',
        'Exposure: Family of 4 (parents + 2 children, ages 8 and 12); approximately 30 seconds exposure in garage before evacuation',
        'Current state: Garage door open, yellow-green vapor visible, no active fire, no structural damage',
        'Area: Residential street, several neighbors visible outdoors, nearby homes within 100–150 feet',
        'Resources: Police en route, Medic 12 assigned, no hazmat unit pre-alerted',
      ],
    },

    scenes: [
      {
        id: 'pc1',
        title: 'Scene 1 of 4 — Recognition & Initial Assessment',
        situation: 'You observe the yellow-green vapor cloud in the garage and the coughing family on the lawn. The homeowner states the exposure was brief (about 30 seconds). No one is in severe respiratory distress at this moment — all are coughing and complaining of burning eyes. The garage door is open. Two neighbors are asking if they should evacuate their homes. What is your immediate action?',
        choices: [
          {
            id: 'a',
            text: 'Recognize the vapor as chlorine gas (Cl2), declare the incident as a hazmat event, establish evacuation zones, and request county HazMat immediately',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. The pale yellow-green vapor is chlorine gas — a toxic respiratory irritant. This is not a common structure fire; it is a chemical hazard requiring specialized response. Declaring a hazmat event immediately elevates the response level, alerts dispatch to the hazard, and ensures county resources are requested early. Establish safe zones, begin evacuation of nearby residents, and protect your crew from exposure.',
            },
          },
          {
            id: 'b',
            text: 'Assume the brief exposure is minor, assess the family\'s vital signs on-scene, and allow them to remain in their driveway while you investigate the garage source',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Chlorine gas effects can be delayed. A 30-second exposure to a concentrated vapor cloud can cause pulmonary edema hours later. Do not minimize the exposure or assume brief = benign. Get the family away from the source immediately, have Medic 12 begin assessment in a clean air area, and elevate the incident classification. Delayed respiratory distress from chlorine exposure is a known phenomenon.',
            },
          },
          {
            id: 'c',
            text: 'Order the homeowner to close the garage door to contain the vapor, then send a crew member to ventilate by opening interior windows',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Closing the garage door traps the chlorine gas and increases concentration. You want vapors to dissipate, not concentrate. Sending a crew member into the garage without respiratory protection to open windows is unsafe — they will inhale chlorine at high concentration. Do not enter. Do not close the door. Let the open garage door provide natural ventilation and keep your crew back.',
            },
          },
          {
            id: 'd',
            text: 'Have the family go into the house and close the doors to shelter in place while you call poison control',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Sheltering in place is appropriate for some outdoor air hazards, but not for an active vapor source 30 feet away. Chlorine gas can infiltrate homes through HVAC systems and under door gaps. Evacuation to fresh air is the priority. Poison control consultation is valuable, but only after the family is in a safe location breathing clean air.',
            },
          },
        ],
      },

      {
        id: 'pc2',
        title: 'Scene 2 of 4 — Evacuation vs. Shelter-in-Place Decision',
        situation: 'Your initial assessment: family is coughing but alert, vital signs stable (RR 24, HR 98 — elevated but responsive to position). Medic 12 is on-scene. The yellow-green vapor is visible but not spreading beyond the garage footprint at this moment. Wind is light (3 mph from the northwest). Neighbors are asking if they should leave. The homeowner wants to go back in to recover his pool chemicals. What do you do?',
        choices: [
          {
            id: 'a',
            text: 'Evacuate your family and immediate neighbors (within 150 feet downwind) to fresh air. Prohibit any entry into the garage. Establish a scene perimeter with police.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Evacuation is correct. Chlorine gas vapor can cause delayed pulmonary edema (hours after exposure). Your family is already exposed — now get them upwind and breathing fresh air. Neighbors within downwind distance are potentially at risk. Establish a perimeter, prohibit re-entry for any reason (the chemicals can wait), and ensure police maintain scene control. This is not a move-in-place situation.',
            },
          },
          {
            id: 'b',
            text: 'Allow the family to remain on the driveway but move them to the side of the house upwind, away from the garage vapor. Advise neighbors to close windows and monitor.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Partial protection is not full protection. The driveway is still near the source. You have already confirmed the family has been exposed to chlorine. Moving them further away is a start, but evacuation to a safe distance (>300 feet) is safer. Chlorine gas can drift, and light wind can shift. Do not ask people to stay in a contaminated neighborhood when evacuation is an option.',
            },
          },
          {
            id: 'c',
            text: 'Shelter the family and neighbors in place (indoors with windows closed) while you ventilate the garage by opening more doors and windows',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Sheltering downwind of an active chlorine source is a poor choice. You cannot guarantee homes are airtight, and increasing ventilation by opening windows can pull contaminated air into homes. Evacuation is safer than sheltering in this scenario. Do not ask people to remain in proximity to an active toxic vapor source.',
            },
          },
          {
            id: 'd',
            text: 'Keep everyone on scene but in gas masks. Have the homeowner retrieve the bucket so you can identify the exact chemicals',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You do not have enough gas masks for a family of 4 + neighbors, and asking the homeowner to re-enter the garage is unacceptable. The reaction is already evident: chlorine gas from incompatible chemicals. You do not need a chemical ID to respond appropriately — you need to evacuate and protect. No one re-enters that garage.',
            },
          },
        ],
      },

      {
        id: 'pc3',
        title: 'Scene 3 of 4 — Ventilation & Source Management',
        situation: 'Family and neighbors have been evacuated to a fresh-air staging area 400 feet upwind. Police are on scene securing the perimeter. The garage vapor is still visible but not increasing in volume (you estimate the chemical reaction has slowed or stopped). Medic 12 has initiated oxygen and monitoring for your family. County HazMat is 12 minutes out. Your crew is asking: should we ventilate the garage to clear the vapor faster, or wait for HazMat?',
        choices: [
          {
            id: 'a',
            text: 'Wait for county HazMat to arrive and manage the source. Your crew should not enter an unknown chlorine environment without Level B minimum protection.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Waiting is safe, but passive. Pool chemical reactions are fairly predictable — chlorine + acid produces Cl2 gas. A 12-minute wait while the garage off-gases naturally (with door open) may be acceptable, but you have the knowledge and ability to accelerate ventilation. Waiting is not wrong, but it is not optimal.',
            },
          },
          {
            id: 'b',
            text: 'Send a crew member in full protective gear (SCBA + Level B suit) to open interior windows and doors, creating cross-ventilation to push the chlorine vapor out and away',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is correct. A crew member in SCBA and protective gear can safely enter the garage, open interior windows and the door to the house, and create cross-ventilation. The goal is to push vapor out and upwind, away from civilians. This is a controlled entry for a well-understood hazard (chlorine from pool chemicals) in a limited space. County HazMat may refine, but you are managing the scene effectively.',
            },
          },
          {
            id: 'c',
            text: 'Have your crew close the garage door and the interior house door to contain the vapor while you call for additional resources',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Closing doors traps vapor and increases concentration. The goal is to disperse the gas, not concentrate it. A contained vapor will linger and could create a secondary hazard if anyone re-enters before full dissipation. Ventilation out is better than containment.',
            },
          },
          {
            id: 'd',
            text: 'Open all windows and doors in the neighborhood to dilute the chlorine gas across a wider area',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Opening windows in neighboring homes spreads the hazard to more people and more structures. You want to concentrate ventilation effort on the source (the garage) and push vapor away from occupied areas, not invite it into homes. Focus on garage ventilation only.',
            },
          },
        ],
      },

      {
        id: 'pc4',
        title: 'Scene 4 of 4 — Medical Assessment & Disposition',
        situation: 'Your crew has completed cross-ventilation of the garage. The yellow-green vapor is now barely visible (mostly dissipated). Medic 12 has been monitoring the family: both children are on supplemental oxygen, coughing less frequently. The 8-year-old has some wheezing. The parents are stable on oxygen as well. County HazMat arrives and confirms no residual vapor threat. All family members are asking: "Can we stay home and rest, or do we need to go to the hospital?"',
        choices: [
          {
            id: 'a',
            text: 'Recommend immediate transport of all family members to the nearest hospital (Saint Peter\'s University Hospital in New Brunswick or Chilton Medical Center) for continued monitoring and evaluation',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Chlorine gas exposure — especially with a child showing wheezing — requires hospital evaluation. Delayed pulmonary edema can develop 12–24 hours post-exposure. The children especially need baseline pulmonary function assessment and monitoring. Do not let them "rest at home" without medical clearance. Transporting all family members allows chest X-rays, pulmonary function testing, and medical observation. This is the safest disposition.',
            },
          },
          {
            id: 'b',
            text: 'Allow the family to remain at home with Medic 12 monitoring every 2 hours via home visit, as long as symptoms stabilize',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Home monitoring lacks the diagnostic capability of a hospital. Pulmonary edema, reactive airway disease, and other delayed chlorine effects require imaging and specialist evaluation. Do not assume "stable now" means "safe to stay home." Hospital observation is the standard of care for chlorine inhalation injuries.',
            },
          },
          {
            id: 'c',
            text: 'Advise the family that their symptoms are resolving and they can manage with rest, fluids, and a follow-up visit to their primary care doctor on Monday',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Advising self-care without hospital evaluation is inappropriate after a documented chlorine inhalation exposure, especially with wheezing in a child. Waiting until Monday delays care. Transport now.',
            },
          },
          {
            id: 'd',
            text: 'Transport only the 8-year-old (who is wheezing) to the hospital. Allow the rest of the family to remain home since they are less symptomatic',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Splitting the family creates a false sense of security for the others. All family members were exposed to chlorine vapor. The parents may develop symptoms later, and the other child is also at risk. Recommend hospital transport for the entire family. If parents insist on staying home, document the refusal, but counsel them on signs of delayed respiratory distress and the need to return immediately if symptoms worsen.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Recognize the pale yellow-green vapor of chlorine gas immediately. Any incompatible chemical mixing (chlorine + acid) produces chlorine gas — a known respiratory hazard.',
        'Evacuate exposed persons upwind and away from the source, even if symptoms are mild. Delayed pulmonary edema from chlorine can develop hours later.',
        'Do not allow civilians to re-enter contaminated areas. The family\'s belongings are not worth exposure.',
        'Ventilation of the source (garage) should be aggressive and controlled — use SCBA-protected crew to create cross-ventilation and push vapors away from occupied areas.',
        'All chlorine inhalation exposures warrant hospital transport for baseline pulmonary function assessment and monitoring. Do not send exposed persons home.',
        'Educate homeowners: never mix chlorine and acid. One is an oxidizer; the other is a strong acid. The reaction is exothermic and produces deadly chlorine gas.',
      ],
      references: ['NFPA 472 (Hazmat Ops)', 'ACGIH TLV (Threshold Limit Values)', 'Poison Control: 1-800-222-1222', 'ERG (Emergency Response Guidebook)', 'Chlorine Institute Emergency Procedures'],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 3. DOWNED POWER LINES — STORM RESPONSE
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'downed-powerlines-storm',
    title: 'Downed Power Lines — Storm Response',
    description: 'A Nor\'easter brings down high-voltage distribution lines across a residential street. One line is draped on a car with the occupant still inside, a transformer is arcing nearby. Navigate danger zone establishment, vehicle occupant communication, utility company coordination, and scene transfer.',
    category: 'HazMat / Utilities',
    difficulty: 'Intermediate',
    estimatedMinutes: 22,
    creditHours: 1.0,
    passingScore: 60,
    icon: '⚡',
    badgeColor: 'bg-yellow-100 text-yellow-700',

    setup: {
      dispatch: 'DISPATCH: Engine 5, Rescue 3 — downed power lines reported at Maple Avenue and Oak Street, residential area. Vehicle underneath, occupant possibly trapped. Nor\'easter continues. JCP&L contacted.',
      narrative: 'You are the IC on Engine 5. You arrive at 17:14 during an active Nor\'easter (wind gusts 35+ mph, heavy rain). The scene is a tree-lined residential street in Martinsville. A large oak tree has failed at the base and brought down primary distribution lines. The power line is now draped across a silver Honda Civic parked on the street. You observe a woman in the driver\'s seat waving at you through the rain. She is alert and alive but visibly frightened. Another downed line is across the sidewalk nearby. A utility pole-mounted transformer is arcing intermittently (bright blue sparks visible every 10–15 seconds).',
      details: [
        'Scene: Maple Avenue at Oak Street, Martinsville; residential area, mix of single-family homes',
        'Hazard: Primary distribution line (13.8 kV, estimated) draped across Honda Civic; second line across sidewalk; transformer actively arcing',
        'Vehicle: Silver Honda Civic, occupant is a female driver, alert, in driver\'s seat, visibly distressed',
        'Weather: Nor\'easter active — wind gusts 35+ mph, heavy rain, poor visibility, continued tree fall risk',
        'Utilities: JCP&L (Jersey Central Power & Light) is primary utility for region; dispatcher has been notified',
        'Nearest hospital: Raritan Medical Center, approximately 4 miles from scene',
      ],
    },

    scenes: [
      {
        id: 'dpl1',
        title: 'Scene 1 of 4 — Danger Zone & Initial Positioning',
        situation: 'Your unit is 200 feet from the downed line. The line is draped across the car but not visibly smoking or arcing. The transformer continues to arc periodically. The occupant is waving and shouting something you cannot hear clearly over the wind. Your crew is asking where to park and whether they should approach the vehicle. What is your first action?',
        choices: [
          {
            id: 'a',
            text: 'Park the engine 200+ feet away (upwind if possible), establish a scene perimeter with cones at least 100 feet around all downed lines, and use a PA system or radio to communicate with the occupant: "STAY IN THE VEHICLE, DO NOT TOUCH ANYTHING."',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. You do not know the voltage of the line, and it could be lethal at any touch or contact. The vehicle is likely grounded and safer than attempting to remove her. A downed power line creates an energized zone that extends outward. Keeping distance, securing the scene, and communicating to stay in place are the correct priorities. You also keep your crew and apparatus away from the hazard. Distance and clear communication save lives.',
            },
          },
          {
            id: 'b',
            text: 'Park near the vehicle to give the occupant confidence, and have a firefighter approach carefully (without touching the line) to assess her condition',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Approaching the vehicle, even without touching the line, puts your crew in an electrocution risk zone. If the occupant exits the vehicle and steps to the ground while the line is in contact, a voltage gradient in the soil (step potential) could electrocute them. The safest place for her right now is inside the vehicle (insulated from ground). Tell her to stay there, keep your crew away, and wait for JCP&L to de-energize the line.',
            },
          },
          {
            id: 'c',
            text: 'Pull a rescue line and attempt to remove the power line from the vehicle using a dry wooden pole to lift it clear',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You do not know if the line is energized, what voltage it carries, or if lifting it will create contact with other hazards. A wooden pole can conduct electricity if wet (from rain). Attempting manual line movement is a high-risk action that should only be done by utility personnel with proper equipment. Do not improvise.',
            },
          },
          {
            id: 'd',
            text: 'Call the occupant and tell her to carefully open the door and step out of the vehicle, away from the line',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'If the line is energized, opening the door and exiting creates electrocution risk. The occupant could create a circuit to ground through contact with the car frame or the ground. The safest position for her is inside the vehicle, NOT attempting to exit. Instruct her to stay inside until you confirm the line is de-energized.',
            },
          },
        ],
      },

      {
        id: 'dpl2',
        title: 'Scene 2 of 4 — Utility Coordination & De-energization',
        situation: 'You have established a scene perimeter and confirmed via PA system that the occupant will stay in the vehicle. JCP&L dispatcher confirms they are sending a crew, ETA 18 minutes. The transformer continues to arc every 15–20 seconds. The wind is strengthening (gusts now 40+ mph). Your crew is concerned about falling branches and additional line failures. The occupant is now crying and very frightened. What is your action?',
        choices: [
          {
            id: 'a',
            text: 'Contact JCP&L dispatch directly via radio or phone. Confirm the incident location, request immediate de-energization of the line, and ask for confirmation when the line is verified dead (no voltage). Remain on scene securing the perimeter.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Direct communication with the utility is faster than through fire dispatch. Provide specific location details (pole number if visible, street address, cross streets), confirm the incident, and request immediate de-energization. Ask JCP&L to radio back confirmation when they have verified the line is dead. Once dead, the hazard is eliminated and rescue becomes routine. This is the standard procedure for downed power line incidents.',
            },
          },
          {
            id: 'b',
            text: 'Request an immediate rescue from Rescue 3. Have them extract the occupant using an insulated rescue ladder and moving her away from the line and vehicle',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Extracting her while the line may be energized is a multi-person electrocution risk. The vehicle is the safest place for her if the line is live. Waiting for utility de-energization confirmation is the correct procedure. Rescue extraction comes after the line is verified dead.',
            },
          },
          {
            id: 'c',
            text: 'Have a firefighter in full insulated PPE (insulated gloves, boots) approach the line and test it with a voltage tester to confirm if it is energized',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Approaching the line for testing is not your responsibility and is dangerous. JCP&L has equipment and expertise to verify voltage safely from a distance. You could be wrong about voltage (13.8 kV distribution lines are lethal), and one mistake kills. Let the utility do their job.',
            },
          },
          {
            id: 'd',
            text: 'Wait for JCP&L to arrive (18 minutes) before taking any further action. Keep the perimeter secure and monitor the occupant.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'You can accelerate the response by calling JCP&L directly rather than waiting. 18 minutes is a long time for a frightened occupant in the rain. Direct utility contact may result in a faster de-energization request and potentially an earlier ETA. Do not be passive when you can communicate the urgency directly.',
            },
          },
        ],
      },

      {
        id: 'dpl3',
        title: 'Scene 3 of 4 — Scene Hazards & Occupant Welfare',
        situation: 'JCP&L confirms the line has been de-energized and a crew is on-scene verifying the voltage (testing shows 0V on the primary). Your occupant is still distressed but safe in the vehicle. Wind gusts continue at 40+ mph. You notice a large branch overhead from the same oak tree is cracked and hanging partially free, swaying in the wind. It is above the vehicle and your crew\'s staging area. What do you prioritize?',
        choices: [
          {
            id: 'a',
            text: 'Recognize the falling branch hazard as a present danger. Immediately relocate the vehicle occupant to a safe zone away from the tree, and reposition your crew apparatus away from the overhead hazard',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. The Nor\'easter and damaged tree create a secondary hazard (falling branch) that may be more immediate than the now-dead power line. The cracked branch could fall at any moment, especially with 40+ mph wind gusts. Move the occupant away from the tree and reposition your crew and apparatus. Then proceed with the extraction once the occupant is in a safe zone.',
            },
          },
          {
            id: 'b',
            text: 'Focus on extracting the occupant immediately now that the line is de-energized. Get her out of the vehicle and away from the scene quickly.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Rushing the extraction without addressing the overhead branch hazard means the occupant might be positioned under the falling branch. Slow down, assess all hazards, move her to a safe location first, then extract. One hazard mitigated is not the same as all hazards mitigated.',
            },
          },
          {
            id: 'c',
            text: 'Wait under the tree for the branch to fall so you can clear it, then proceed with the extraction',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Do not wait for the branch to fall on your crew. This is reckless. Move your people away from the hazard now. Let the branch fall to an empty area, then assess damage to the vehicle and proceed with extraction from a safe position.',
            },
          },
          {
            id: 'd',
            text: 'Have the occupant stay in the vehicle until the wind calms, which may take 1–2 hours',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'The occupant should not remain under a hazardous overhead branch for 1–2 hours. Move her out of danger now. The vehicle is no longer electrically hazardous, so extraction is safe. Do not ask her to tolerate secondary hazards.',
            },
          },
        ],
      },

      {
        id: 'dpl4',
        title: 'Scene 4 of 4 — Extraction & Scene Transfer',
        situation: 'The occupant has been moved to a safe area 150 feet away from the tree, assessed by EMS, and is medically cleared (no injuries, elevated heart rate from stress). JCP&L crew has marked the de-energized line with caution tape and will remain on-scene for cleanup. The vehicle is clear of the power line. The Nor\'easter is continuing, and the branch is still hanging over the street. Rescue 3 is ready to assist with vehicle extraction if needed. What is your incident closure action?',
        choices: [
          {
            id: 'a',
            text: 'Document the scene, confirm with JCP&L that the line is confirmed de-energized and secured, transfer command to JCP&L for utility cleanup, and release your units once the street is safe for normal traffic',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the correct closure procedure. You have: (1) secured the scene, (2) de-energized and verified the hazard with the utility, (3) ensured occupant safety and medical clearance, (4) moved to secondary hazard mitigation. Now hand off to JCP&L for their cleanup, and stay on scene until the street hazards are reduced (line cleared, branch managed if possible). Document scene photos and facts. Your job as IC is done when all life-safety and immediate hazards are addressed.',
            },
          },
          {
            id: 'b',
            text: 'Have your crew remove the hanging branch using a power saw while JCP&L manages the power line cleanup',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Removing tree debris is not your primary responsibility during an active Nor\'easter. Your crew is not tree removal specialists. JCP&L or a separate tree service should handle the branch. Your role is life safety and initial hazard mitigation, not storm cleanup.',
            },
          },
          {
            id: 'c',
            text: 'Release your units immediately now that the occupant is out of the vehicle. JCP&L will manage the rest.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Releasing too early leaves the scene without command presence while secondary hazards (the branch) still exist. Stay on scene until the street is safe for public use or until you transfer command and confirm the next-in-command is in place. Do not abandon the scene.',
            },
          },
          {
            id: 'd',
            text: 'Request police to block off the entire street indefinitely until the Nor\'easter passes and tree service removes the branch',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Blocking the street indefinitely is an overreaction. Once the power line is de-energized and secured, the public safety hazard is greatly reduced. Work with police to manage traffic flow around the hazard until JCP&L and tree service complete cleanup. Do not request excessive blockage that disrupts the neighborhood.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'All downed power lines are potentially lethal — treat as energized until verified otherwise by the utility company.',
        'Occupants should remain in vehicles if a line is draped on it. The vehicle is insulated and safer than the ground outside.',
        'Establish a minimum 100-foot perimeter around downed lines. Do not allow crew or civilian approach without utility confirmation of de-energization.',
        'Contact the utility company directly via radio or phone. Provide location details and request immediate de-energization verification.',
        'Identify secondary hazards (falling branches, transformer arcing) and mitigate before extraction. One hazard resolved does not mean all hazards are resolved.',
        'Transfer command to the utility company once the electrical hazard is verified de-energized. Your units can provide scene security and support.',
      ],
      references: ['NFPA 70E (Electrical Safety)', 'JCP&L Emergency Response Procedures', 'OSHA Downed Line Safety', 'ICS-100', 'IAFF Electrical Safety Fact Sheet'],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 4. PROPANE TANK EMERGENCY
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'propane-tank-emergency',
    title: 'Propane Tank Emergency',
    description: 'A 500-gallon propane tank at a NJ restaurant/commercial property is leaking through a relief valve vent, with potential BLEVE risk if tank temperature increases. Navigate BLEVE awareness, evacuation radius, cooling operations strategy, and monitoring for tank failure signs.',
    category: 'HazMat / Utilities',
    difficulty: 'Intermediate',
    estimatedMinutes: 23,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🔥',
    badgeColor: 'bg-orange-100 text-orange-700',

    setup: {
      dispatch: 'DISPATCH: Engine 12, Tanker 4 — propane tank emergency reported at Sal\'s Italian Bistro, 402 Route 1 North, Rahway. Manager reports strong gas smell, relief valve venting. PSE&G contacted.',
      narrative: 'You are the IC on Engine 12. You arrive at 18:52 on a Wednesday evening at Sal\'s Italian Bistro, a full-service restaurant with an outdoor propane grill setup. The property sits on Route 1 North, immediately adjacent to a gas station and a small office building. Your crew reports a strong propane odor and can see a white vapor cloud venting from the relief valve of a 500-gallon horizontal propane tank positioned on a concrete pad behind the kitchen area. The tank is in direct sunlight (it is still 82°F at this hour). The restaurant manager is panicked and states: "The tank has been venting for about 15 minutes — I noticed it and immediately shut off the grill. The valve just keeps releasing."',
      details: [
        'Facility: Sal\'s Italian Bistro, full-service restaurant with outdoor grilling operation',
        'Hazard: 500-gallon horizontal propane tank, relief valve actively venting (visible white vapor cloud), tank in direct afternoon sunlight, temperature elevated',
        'Location: 402 Route 1 North, Rahway; adjacent to gas station and occupied office building; high traffic area',
        'Current conditions: Weather is clear, temperature 82°F, light wind (3–5 mph); tank is not leaking from the cylinder body (only from relief valve)',
        'Utilities: PSE&G notified; propane supplier (Amerigas or similar) must be contacted',
        'Occupancy: Restaurant interior (dining area), office building, gas station — all nearby within 200 feet',
      ],
    },

    scenes: [
      {
        id: 'pt1',
        title: 'Scene 1 of 4 — BLEVE Awareness & Initial Positioning',
        situation: 'You observe the relief valve venting. The tank is in direct sunlight on a concrete pad with no shade. The manager tells you the valve has been venting continuously for 15 minutes. You know that a propane tank relief valve opens when internal pressure exceeds the safety threshold (typically ~240 PSI for a 500-gallon tank). A relief valve that does not close indicates overpressure inside the tank. What is your initial assessment of BLEVE risk?',
        choices: [
          {
            id: 'a',
            text: 'Recognize the open relief valve and warm tank as BLEVE precursors. A tank in direct sunlight with rising temperature can build dangerous pressure. Position apparatus upwind and at least 300 feet away. Begin evacuation of nearby buildings immediately.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. A relief valve that remains open longer than normal indicates high internal pressure — either from excess heat, overfilling, or failed pressure regulator upstream. A BLEVE (Boiling Liquid Expanding Vapor Explosion) occurs when a pressurized container fails violently, often triggered by heating. Direct sunlight on a tank with continuous relief venting is a red flag. Distance (300+ feet), upwind positioning, and immediate evacuation of the building are the right responses.',
            },
          },
          {
            id: 'b',
            text: 'Assume the relief valve is functioning properly to release excess pressure. Move closer to the tank to try to stop the leak by tightening the valve or closing a shutoff',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You cannot stop a relief valve from outside — it is designed to open when pressure exceeds safe limits. Approaching the tank to interfere with it risks exposure to propane vapor and puts you in the blast zone if a BLEVE occurs. The relief valve is the tank\'s safety feature working as designed — it\'s the cause of the overpressure (heat, overfill, regulator failure) that you must address, not the valve itself.',
            },
          },
          {
            id: 'c',
            text: 'The relief valve venting is normal and not a major concern. Monitor the tank, but there is no immediate evacuation need — just ensure the propane supplier is called',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A relief valve that vents for 15+ minutes straight is not normal operation. Normal venting is brief (seconds) as pressure equalizes. Continuous venting means the tank is still building pressure — a sign of heating or overfill. Do not minimize this. Evacuate and establish distance.',
            },
          },
          {
            id: 'd',
            text: 'Position your apparatus near the tank so you can quickly apply water if the tank ruptures',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You do not want to be near the tank if it BLEVEs. A BLEVE can project fragments hundreds of feet and create a fireball. Positioning near the tank for response puts your crew in the maximum danger zone. Maintain distance (300+ feet) and control the perimeter. Proactive cooling is done from a distance or when there is an actual fire threat, not as a wait-and-see measure.',
            },
          },
        ],
      },

      {
        id: 'pt2',
        title: 'Scene 2 of 4 — Evacuation Radius & Building Clearance',
        situation: 'You have positioned Engine 12 approximately 350 feet away, upwind of the tank. You are requesting evacuation. The adjacent gas station has customers (approximately 8–10 people). The office building above the restaurant has approximately 20–30 employees still at desks (it is 18:52 — people are leaving for the day). The restaurant has about 40 customers inside, plus 15 kitchen/service staff. Manager is asking: "Do I really need to evacuate the whole restaurant? The tank is in the back." What is your evacuation decision?',
        choices: [
          {
            id: 'a',
            text: 'Evacuate ALL buildings within 500 feet: restaurant (full), office building (all occupants), and gas station. This is a potential BLEVE scenario. Use police to manage traffic on Route 1.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. A 500-gallon propane tank BLEVE can project fragments and shock waves significant distances. Evacuating conservatively (500+ feet radius) is the safe approach. The tank location (behind the kitchen) does not matter — BLEVE fragmentation can penetrate walls. Get all occupants out and away. Police manage traffic and provide scene security. This is the proper precaution.',
            },
          },
          {
            id: 'b',
            text: 'Evacuate the restaurant and office building, but allow gas station customers to remain if they stay inside their vehicles',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Gas station vehicles offer limited protection from BLEVE blast. Staying at the gas station (only ~200 feet away) is not safe enough. Evacuate the entire area within 500 feet. Vehicle occupants should be moved to a secure distance, not remain in the blast zone.',
            },
          },
          {
            id: 'c',
            text: 'Evacuate the kitchen and back area of the restaurant, but allow dining customers to remain if they move away from the back wall',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Partial evacuation is not sufficient. BLEVE fragments travel through structures and across large distances. Moving people away from one wall does not protect them from an explosion originating 60 feet away. Full evacuation of the building is necessary.',
            },
          },
          {
            id: 'd',
            text: 'Keep people inside buildings but alert them to move away from windows and doors. This is a precautionary approach that minimizes disruption',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Moving away from windows provides some shielding, but it is not the safest option. A BLEVE can rupture walls and cause structural failure. Complete evacuation to fresh air and distance is the standard and safest response. Do not ask people to shelter in buildings when BLEVE risk exists.',
            },
          },
        ],
      },

      {
        id: 'pt3',
        title: 'Scene 3 of 4 — Cooling Operations & Tank Management',
        situation: 'Buildings have been evacuated. All occupants are now at a staging area 600 feet away. Police have closed Route 1 northbound for a 0.5-mile stretch. The propane tank is still venting from the relief valve. Outside temperature is 82°F and the tank is in direct sunlight (the sun is still 25 degrees above the horizon — about 1 hour of daylight remaining). Propane supplier (Amerigas) is en route, ETA 22 minutes. Your Tanker 4 has 3,000 gallons of water. Do you begin cooling the tank now, or wait for the supplier?',
        choices: [
          {
            id: 'a',
            text: 'Begin cooling operations immediately. Apply water spray to the tank sides and bottom (not the relief valve) to reduce internal temperature and pressure. Have Tanker 4 position for continuous supply.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Proactive cooling reduces tank internal pressure by cooling the liquid propane. This is a standard mitigation for overpressure situations. Apply water to the sides and bottom of the tank, avoiding the relief valve (which you do not want to clog). Cooling reduces pressure, slows or stops venting, and decreases BLEVE risk. Start now — do not wait.',
            },
          },
          {
            id: 'b',
            text: 'Wait for the propane supplier to arrive. They have specialized equipment and procedures. Your applying water could damage the tank or make things worse.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Cooling a propane tank with water is a standard fire service operation, not something exclusive to the supplier. The supplier will perform final mitigation and removal, but in the interim, cooling is a proven risk reduction tactic. Do not wait passively while the tank continues to build pressure in sunlight. Cool now.',
            },
          },
          {
            id: 'c',
            text: 'Move the tank away from direct sunlight by dragging it to a shaded area, then monitor pressure',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Do not attempt to move a pressurized propane tank. Moving it could trigger a leak or rupture. Moving it also puts your crew in the path of potential failure. Let it stay in place and apply cooling water instead. Movement is unnecessary and dangerous.',
            },
          },
          {
            id: 'd',
            text: 'Place a tarp over the tank to block sunlight and prevent further heating',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'A tarp will slow additional heating, but it does not address the heat already inside the tank. A tarp is a passive measure. Water cooling is active and far more effective. Use water, not shade. The tank is already heated from 15+ minutes of venting in sunlight.',
            },
          },
        ],
      },

      {
        id: 'pt4',
        title: 'Scene 4 of 4 — Monitoring & Scene Transfer',
        situation: 'Your crew has been cooling the tank for 8 minutes with steady water spray. The relief valve venting has slowed noticeably — it is now intermittent (every 30–40 seconds) rather than continuous. Water pressure on the tank is stable. Amerigas supplier has arrived on-scene and is setting up their equipment. They are requesting that you cease cooling operations so they can assess the tank and connect a recovery system. What is your action?',
        choices: [
          {
            id: 'a',
            text: 'Continue cooling until the Amerigas tech confirms it is safe to stop. Monitor the relief valve behavior. Once valve closure is confirmed and pressure stabilizes, transfer operations to the supplier.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. You maintain operations until the supplier confirms readiness to take over. Stopping water cooling prematurely could allow pressure to spike again if the tank is not yet adequately cooled. Coordinate with the supplier: "Continue water until you confirm pressure is stable and safe." Once the supplier has established their recovery/vent system, you transfer responsibility. This is controlled handoff.',
            },
          },
          {
            id: 'b',
            text: 'Stop cooling immediately when the supplier asks. They have the expertise and equipment — let them manage the tank from this point.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You should coordinate, not immediately stop. Ask the supplier: "Are you ready for us to cease cooling?" If they say yes, confirm their system is operational first. If there is any doubt, continue cooling. Do not abandon the operation at the first request without confirmation.',
            },
          },
          {
            id: 'c',
            text: 'Stop cooling and release your crew and apparatus immediately. Your job is done once the supplier arrives.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Leaving too soon abandons the scene and your cooling operation. Stay long enough to confirm the supplier has assumed responsibility and the immediate hazard is reduced. A coordinated transition of operations is far safer than an abrupt departure.',
            },
          },
          {
            id: 'd',
            text: 'Continue cooling indefinitely until the tank is completely empty, then release the supplier to clean up',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'The supplier has specialized recovery equipment to safely de-pressure and empty the tank. You continue cooling while the supplier recovers product. Once they confirm the tank is empty or at safe pressure, you cease operations. Do not prolong cooling unnecessary — coordinate the end state with the supplier.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'A relief valve that vents continuously for more than a few seconds signals overpressure — potential BLEVE risk from overheating, overfilling, or regulator failure.',
        'BLEVE fragments and blast effects travel hundreds of feet. Establish a minimum 500-foot evacuation radius for a 500-gallon tank BLEVE scenario.',
        'Propane tanks in direct sunlight are at risk for pressure buildup. Recognize sunny conditions + venting relief valve as a red flag.',
        'Cool pressurized propane tanks with water sprayed to the sides and bottom (not the valve). Cooling reduces internal pressure and risk.',
        'Coordinate with the propane supplier as a partner. You manage immediate life safety and cooling; they manage final recovery and removal.',
        'Do not attempt to move, disassemble, or interfere with a pressurized propane tank. Maintain distance and use cooling as your mitigation.',
      ],
      references: ['NFPA 58 (Liquefied Petroleum Gas Code)', 'NFPA 72 (Fire Alarm Code)', 'Amerigas Emergency Response Procedures', 'PSE&G Gas Safety', 'IAFF Propane Safety Fact Sheet'],
    },
  },

// ══════════════════════════════════════════════════════════════════════
  // 1. PEDIATRIC EMERGENCY — ALLERGIC REACTION AT SCHOOL
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'ems-pediatric-anaphylaxis',
    title: 'Pediatric Emergency — Allergic Reaction at School',
    description: 'Seven-year-old child experiencing severe allergic reaction at NJ elementary school. School nurse has administered EpiPen. Navigate scene assessment, secondary intervention decisions, ALS handoff, parent communication, and pediatric transport destination.',
    category: 'EMS / Rescue',
    difficulty: 'Intermediate',
    estimatedMinutes: 22,
    creditHours: 1.0,
    passingScore: 60,
    icon: '👶',
    badgeColor: 'bg-pink-100 text-pink-700',

    setup: {
      dispatch: 'DISPATCH: Medic 5, respond to Lincoln Elementary School, 240 Broad Street, Newark, for a pediatric medical emergency. Child experiencing allergic reaction. EpiPen has been administered by school nurse.',
      narrative: 'You arrive at Lincoln Elementary School at 14:18. The school nurse meets you at the office with a seven-year-old male patient. The child is sitting upright, breathing with mild stridor, mild facial swelling around the lips and eyes, skin flushed. The nurse reports: "He ate a peanut butter sandwich about 15 minutes ago — he has a known peanut allergy. His lips started tingling, then swelling. I gave him his EpiPen at 14:12. His name is Marcus. His mother works downtown and is on her way — I have her on phone." The school has administered the EpiPen (0.3 mg IM). Marcus is alert, speaking in short sentences. No respiratory distress yet, oxygen saturation is 96% on room air.',
      details: [
        'Patient: Marcus, 7 years old, known peanut allergy with previous mild reactions',
        'Time: 14:18 on-scene arrival. EpiPen administered at 14:12 (6 minutes ago). Onset approximately 10 minutes ago.',
        'Current status: Mild facial edema (lips/eyes), mild stridor, flushed skin, alert, speaking in short sentences, SpO2 96% RA',
        'Scene: School nurse present, class in hallway, mother en route (ETA ~20 minutes downtown). No second-line medications available at school.',
        'Transport options: University Hospital Newark (pediatric emergency department) ~8 minutes, Robert Wood Johnson Children\'s Hospital (New Brunswick) ~18 minutes',
        'Considerations: Biphasic anaphylaxis risk, need for observation and secondary medication, parent communication protocol'
      ],
    },

    scenes: [
      {
        id: 'pe1',
        title: 'Scene 1 of 5 — Initial Assessment & Secondary Dose',
        situation: 'You assess Marcus: mild-to-moderate facial edema, no significant respiratory distress, stridor minimal. Vitals: BP 104/62, HR 112, RR 22, SpO2 96%. The nurse hands you the EpiPen and says, "He got one dose 6 minutes ago." Marcus says his throat feels tight but he can swallow. His mother is still en route. Do you have a plan for a secondary epinephrine dose?',
        choices: [
          {
            id: 'a',
            text: 'Obtain IV access and prepare to administer 0.01 mg/kg IM epinephrine (1:1000) as a second dose if symptoms worsen or stridor increases during transport',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'While IV access is appropriate for a pediatric emergency, the decision to administer a second IM dose should be made now based on current symptoms, not deferred to "if symptoms worsen" during transport. A child with anaphylaxis showing continued symptoms 6 minutes post-EpiPen is a candidate for a second dose now, not wait-and-see. ACLS and PALS guidelines recommend redosing at 5–15 minute intervals if symptoms persist.',
            },
          },
          {
            id: 'b',
            text: 'Administer a second dose of IM epinephrine (0.3 mg, 1:1000) now since 6 minutes have passed and symptoms (stridor, facial edema) persist',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. PALS and emergency medicine guidelines support redosing epinephrine every 5–15 minutes if symptoms persist or recur. Marcus has ongoing facial edema and stridor 6 minutes post-first dose — this indicates incomplete response. A second IM injection is indicated now, before transport. This is not optional or deferred; it\'s an immediate treatment decision. Ensure you have a second EpiPen or draw from an epinephrine ampule.',
            },
          },
          {
            id: 'c',
            text: 'Do not give a second dose now — one EpiPen dose is standard protocol and additional doses should only be given at the hospital',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is outdated thinking. Current PALS, ACLS, and emergency medicine practice supports redosing epinephrine every 5–15 minutes if anaphylaxis symptoms persist. Delaying a second dose in a child with stridor and ongoing edema increases risk of airway compromise during transport. Regional protocols may vary, but national guidelines (AHA, AAP, ACEP) endorse prehospital redosing.',
            },
          },
          {
            id: 'd',
            text: 'Wait for the mother to arrive so she can authorize a second dose and provide more allergy history',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Parental consent is important for many decisions, but life-saving medications in anaphylaxis do not require a delay for consent — your role is to stabilize and treat. The school nurse has already consented to the first EpiPen. You can obtain allergy history from the nurse or check school records. A 20-minute wait for the mother while the child has stridor is clinically inappropriate. Act now, brief the mother when she arrives.',
            },
          },
        ],
      },

      {
        id: 'pe2',
        title: 'Scene 2 of 5 — Airway Management & Positioning',
        situation: 'You administer the second EpiPen dose (0.3 mg IM). Over the next 2 minutes, the stridor decreases slightly, but the facial swelling around the lips and eyes remains moderate. Marcus is still alert, speaking in short sentences. He is sitting in the office chair. You are preparing for transport. What is your airway management strategy?',
        choices: [
          {
            id: 'a',
            text: 'Place Marcus supine on the stretcher immediately to prepare for potential emergency airway procedures',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Placing an anaphylaxis patient supine with airway edema is dangerous — it can increase the risk of aspiration and makes breathing harder for a swollen-airway patient. Anaphylaxis patients with airway involvement prefer upright positioning to maximize gravity and minimize edema pressure on the airway. Keep him upright on the stretcher with head elevated 30–45 degrees.',
            },
          },
          {
            id: 'b',
            text: 'Keep Marcus sitting upright, apply high-flow oxygen, monitor closely for stridor increase, and have suction and BVM ready — transport immediately with ALS capability',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Exactly right. Anaphylaxis patients with airway involvement tolerate the upright position best. High-flow oxygen (15 L/min non-rebreather) is standard. You are prepared for deterioration with suction and BVM at hand. Most importantly: transport with Advanced Life Support capability (likely a paramedic unit) so that airway intervention (IO medications, potential intubation, surgical airway) is available if stridor worsens. This is the correct balance of safe positioning and readiness.',
            },
          },
          {
            id: 'c',
            text: 'Administer IM diphenhydramine (Benadryl) now before transport to reduce histamine effects',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'While antihistamines are often given in anaphylaxis, they are NEVER the priority and should not be given before epinephrine has had time to work. Epinephrine is the definitive agent for airway edema. Antihistamines take 15–30 minutes to work and do nothing to reverse airway compromise. Do not delay transport to give IM Benadryl when the child is at risk of airway obstruction.',
            },
          },
          {
            id: 'd',
            text: 'Call for a paramedic intercept so you can administer IM steroids (dexamethasone) to prevent biphasic anaphylaxis',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Steroids can be part of anaphylaxis management, but they are a secondary intervention to prevent biphasic reactions — they do not treat the acute airway compromise happening now. Do not delay transport waiting for a paramedic intercept when you should be en route. Transport to a pediatric emergency department immediately with your own ALS backup; steroids and further medication can be given en route or at the hospital.',
            },
          },
        ],
      },

      {
        id: 'pe3',
        title: 'Scene 3 of 5 — ALS Handoff & Continued Treatment',
        situation: 'You are en route to University Hospital Newark (pediatric ED). Marcus is upright on the stretcher, still alert, facial swelling stable, minimal stridor now. ALS paramedics meet you at a rendezvous point and take over care. The paramedic asks: "What\'s the clinical course so far?" You report the two EpiPen doses and current status. The paramedic states: "I\'m going to establish an IV and have an epi drip ready if needed." What is your concern, if any, with this approach?',
        choices: [
          {
            id: 'a',
            text: 'No concern — IV epinephrine is standard for pediatric anaphylaxis',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'IV epinephrine in pediatric anaphylaxis is typically reserved for refractory cases or hemodynamic instability. For this patient with two appropriate IM doses showing response, a paramedic starting an IV line is good practice, but continuous IV epi infusion is not routine first-line management. The paramedic should continue IM dosing if needed and reserve IV epi for escalation.',
            },
          },
          {
            id: 'b',
            text: 'Confirm that the paramedic will continue IM epinephrine redosing if symptoms worsen before starting an IV epi infusion',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. IM epinephrine remains the first-line, safest route for prehospital anaphylaxis in a pediatric patient. An IV line is reasonable for vascular access and potential fluid resuscitation, but a running IV epinephrine infusion is typically reserved for severe, refractory anaphylaxis or profound hypotension. This patient has responded to two IM doses. The paramedic should understand the clinical course and IM redosing plan before pivoting to IV drugs.',
            },
          },
          {
            id: 'c',
            text: 'Suggest that the paramedic administer IV antihistamine and steroids instead of epi to avoid complications',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is a significant clinical error. Epinephrine is the only drug proven to reverse anaphylaxis. Antihistamines and steroids are adjuncts only and do not address the life-threatening airway edema and histamine/IgE cascade. Suggesting the paramedic pivot away from IM epi redosing to secondary drugs is inappropriate and dangerous.',
            },
          },
          {
            id: 'd',
            text: 'Note that the paramedic has the clinical judgment to manage ALS interventions; provide a clear handoff and let them lead',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'While paramedic judgment is important, your job as the first responder is to provide a complete clinical handoff and ensure continuity of the treatment plan. Staying silent about clinical concerns (such as premature escalation to IV epi in a responding patient) is a missed opportunity for crew resource management. A brief, professional check-in about IM vs. IV strategy is appropriate.',
            },
          },
        ],
      },

      {
        id: 'pe4',
        title: 'Scene 4 of 5 — Parent Communication & Reassurance',
        situation: 'The paramedics take over transport. Marcus\'s mother arrives at the school just as you are packing your equipment. She is understandably anxious and asks: "Where are you taking him? Is he going to be okay? Did the allergy cause permanent damage?" She wants to follow the ambulance. How do you communicate with her?',
        choices: [
          {
            id: 'a',
            text: 'Tell her to get in her car and follow the ambulance to the hospital; reassure her that Marcus is stable',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Having the parent follow the ambulance independently creates safety risks (she may drive unsafely, get lost, or be separated from her child). Your role is to provide clear direction and reassurance. Offer to have her ride in your vehicle or provide specific hospital directions so she arrives safely and stays with her child.',
            },
          },
          {
            id: 'b',
            text: 'Briefly explain that Marcus had a severe allergic reaction, the second EpiPen dose is working well, he\'s alert and breathing better, and you\'re taking him to University Hospital Newark pediatric ED where he can receive full evaluation and observation. Offer her a ride or escort her vehicle.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Excellent. You provide clear, truthful information (reaction, treatments, current status), name the destination (University Hospital Newark pediatric ED), explain the clinical reasoning (evaluation and observation), and offer logistical support (ride/escort). This balances reassurance with honesty. She understands her child\'s condition, the plan, and that you\'re helping her get there safely. This reduces her anxiety and ensures she arrives with her child.',
            },
          },
          {
            id: 'c',
            text: 'Explain that anaphylaxis can cause permanent damage and that the hospital doctors will determine if there are any long-term effects',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Alarming a parent with worst-case scenarios undermines trust and increases anxiety without benefit. While complications of anaphylaxis are possible, most pediatric anaphylaxis patients recover fully with appropriate treatment — which Marcus received. Reassure her that he is responding well and that the hospital will do a thorough evaluation. Avoid catastrophizing.',
            },
          },
          {
            id: 'd',
            text: 'Tell her to call the hospital directly and ask her not to follow the ambulance so as not to delay transport with her questions',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'While you do not want the parent to delay your transport, dismissing her and telling her to call the hospital is cold and unhelpful. She is her child\'s advocate and needs to know where he is going. A brief, clear verbal handoff to the parent is your responsibility. She will not delay you if you give her clear instructions and logistical support.',
            },
          },
        ],
      },

      {
        id: 'pe5',
        title: 'Scene 5 of 5 — Transport Destination & Escalation',
        situation: 'The paramedics are in-route and have just radioed: "Stridor is increasing again. SpO2 is 94% on high-flow O2. We\'re considering diversion to Robert Wood Johnson Children\'s Hospital (New Brunswick) instead of University Hospital Newark because they have a pediatric intensivist on-site." University Hospital Newark is 8 minutes away; Robert Wood Johnson is 18 minutes away. What do you recommend?',
        choices: [
          {
            id: 'a',
            text: 'Concur with diversion to Robert Wood Johnson — pediatric specialty care is worth the extra 10 minutes',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'In an acute, worsening airway situation with a child, transport time is critical. University Hospital Newark has a full pediatric emergency department and airway specialists available immediately. A 10-minute diversion with stridor increasing and SpO2 dropping is a risk — the child could need emergency airway management en route. The nearest hospital with pediatric capability is the correct choice when airway is deteriorating.',
            },
          },
          {
            id: 'b',
            text: 'Recommend the paramedics proceed to University Hospital Newark (8 minutes) because it is the nearest facility and pediatric airway emergency management is available there immediately',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. With worsening stridor and declining SpO2, time is critical. University Hospital Newark has a full pediatric ED with airway specialists, anesthesia, and surgical airway capability immediately available. A pediatric intensivist at Robert Wood Johnson is valuable for ICU admission, but that comes after stabilization. The paramedics can contact the pediatric ED in advance so they have a team ready. Transport to the nearest appropriate facility for acute airway management.',
            },
          },
          {
            id: 'c',
            text: 'Request the paramedics establish an emergency airway (intubation) en route before diverting to either hospital',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'En-route intubation in a pediatric anaphylaxis patient with neck swelling is extremely high-risk — landmarks are obscured and failed intubation with subsequent emergency surgical airway is a known complication. The paramedics should proceed to the nearest hospital where you have operating room, anesthesia, and surgical airway backup immediately available. Do not advocate for a dangerous pre-hospital procedure when a hospital is 8 minutes away.',
            },
          },
          {
            id: 'd',
            text: 'Tell the paramedics to continue current treatment and monitor — stridor often improves within 10–15 minutes after epi dosing, so wait and see before deciding on diversion',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'While stridor sometimes improves with epi, this patient is worsening — increasing stridor and dropping SpO2 are red flags for progression, not stabilization. "Wait and see" in a deteriorating pediatric airway is not safe medicine. The paramedics should not be delaying a hospital decision while symptoms escalate. Transport decisively to the nearest facility with pediatric airway capability.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Anaphylaxis requires early and repeat IM epinephrine every 5–15 minutes if symptoms persist — do not defer redosing to the hospital.',
        'Maintain upright positioning in airway edema — avoid supine position that increases obstruction risk.',
        'Transport with ALS capability when anaphylaxis involves airway symptoms; prehospital escalation may be needed.',
        'Provide clear, truthful communication to parents about what happened, current status, and the plan — this reduces anxiety and ensures cooperation.',
        'In deteriorating airway situations, the nearest hospital with pediatric airway specialists is the correct destination — do not divert for specialty services when time is critical.',
      ],
      references: [
        'PALS (American Heart Association)',
        'AAP Anaphylaxis Guidelines',
        'New Jersey Department of Health Pediatric Protocols',
        'University Hospital Newark & Robert Wood Johnson Children\'s Hospital',
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 2. BURN INJURIES — INDUSTRIAL ACCIDENT
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'ems-burn-injuries',
    title: 'Burn Injuries — Industrial Accident',
    description: 'Flash fire at NJ industrial facility with three burn patients of varying severity. Navigate triage, burn assessment (rule of nines), treatment priorities, inhalation injury recognition, and transport to specialized burn center.',
    category: 'EMS / Rescue',
    difficulty: 'Advanced',
    estimatedMinutes: 24,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🔥',
    badgeColor: 'bg-red-100 text-red-700',

    setup: {
      dispatch: 'DISPATCH: Structure fire with injuries reported at Harmon Chemical Manufacturing, Route 78, Newark. Multiple patients reported. Fire and Medic units responding.',
      narrative: 'You arrive at Harmon Chemical Manufacturing at 16:42. Heavy smoke is lifting; fire is being suppressed by company fire brigade. Fire Department is on-scene controlling the fire. You encounter three burn patients outside the facility: Patient A (supervisor, 45 y/o male) has partial-thickness burns on face, neck, and chest, approximately 18% TBSA, alert but with singed nasal hairs. Patient B (technician, 32 y/o male) has superficial burns on arms and shoulders, approximately 12% TBSA, alert, in mild pain. Patient C (apprentice, 19 y/o male) has partial- to full-thickness burns on the lower legs and feet, approximately 15% TBSA, alert, painful.',
      details: [
        'Incident: Flash fire in chemical mixing area, duration approximately 30–45 seconds. Company suppression system activated. Rescue occurred by coworkers.',
        'Time: 16:42 arrival. Flash occurred at approximately 16:35. Air quality: smoke present, confined space rescue ongoing for two workers still missing.',
        'Scene safety: Fire is being controlled, hazmat team present due to chemical inventory. No additional explosions reported.',
        'Patients: Three with obvious burns, no airway compromise noted initially.',
        'Transport: St. Barnabas Medical Center Burn Center (Newark) ~12 minutes, University Hospital Newark ~8 minutes (no burn center)',
        'Resources: Three ambulances available, one with paramedic. Additional resources being called.'
      ],
    },

    scenes: [
      {
        id: 'bi1',
        title: 'Scene 1 of 4 — Triage & Burn Assessment',
        situation: 'You have three burn victims. You begin initial triage using the rule of nines. Patient A: face, neck, chest = approximately 18% TBSA. Patient B: arms and shoulders = approximately 12% TBSA. Patient C: lower legs and feet = approximately 15% TBSA. Patient A has audible stridor developing. Which patient do you assign as Priority 1 (immediate/red tag)?',
        choices: [
          {
            id: 'a',
            text: 'Patient C (largest lower-body burns) because leg burns are the most painful and require the most aggressive fluid resuscitation',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Pain severity does not drive triage priority in mass burn casualty events. Patient C has significant lower-extremity burns (15% TBSA), but lower extremities do not include airway or major internal organs. Patient A has developing stridor and airway involvement — this is a higher priority. Triage prioritizes life-threatening threats first (airway), then severe injury.',
            },
          },
          {
            id: 'b',
            text: 'Patient A because he has facial and neck burns with developing stridor, indicating possible inhalation injury and airway compromise',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Absolutely correct. Facial burns combined with stridor is a red flag for inhalation injury and potential airway obstruction. Inhalation injury is the leading cause of morbidity and mortality in burn patients. Patient A must be Priority 1 and transported immediately with high-flow oxygen and airway management ready. His 18% TBSA is significant, but the airway threat makes him Priority 1.',
            },
          },
          {
            id: 'c',
            text: 'Patient B because he has the smallest burn percentage and should be treated first to free up resources for the larger burns',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Triage does not work backward from least severe. Minor burns go last. Patient B (12% TBSA, alert, no airway involvement) is Priority 2. Patient A with stridor is Priority 1. Patient C is Priority 2. You do not delay the most critical patient to treat the least critical first.',
            },
          },
          {
            id: 'd',
            text: 'Wait for the Fire Department hazmat team assessment before assigning priorities, in case there are toxic chemical exposures that change the triage order',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Hazmat information is valuable, but a developing stridor in Patient A is an immediate airway threat that cannot wait. Do not delay triage for additional information. Initiate Priority 1 transport for Patient A now; coordinate with hazmat for chemical exposure data en route. Medical priorities drive triage; chemical exposure data is a secondary consideration in this moment.',
            },
          },
        ],
      },

      {
        id: 'bi2',
        title: 'Scene 2 of 4 — Cooling & Initial Treatment',
        situation: 'Patient A is being transported. Fire department medic is applying high-flow oxygen and preparing for rapid transport. Patient B and Patient C are still on scene. You establish an IV line on Patient B and begin normal saline infusion. Patient C is in significant pain and is asking for pain medication. Current time is 16:50 (approximately 15 minutes post-burn). What is your treatment priority for Patient C?',
        choices: [
          {
            id: 'a',
            text: 'Administer IV opioids (morphine or fentanyl) immediately to manage pain before transport',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Pain control is important, but it is not the first priority in the minutes immediately following a major burn. The first priority for a 15% TBSA burn is fluid resuscitation — burn shock can develop quickly and is life-threatening. You should have already initiated an IV line and begun normal saline at a calculated rate (Parkland formula: 4 mL × %TBSA × body weight in kg ÷ 2 over first 8 hours). Pain medications come after resuscitation is underway.',
            },
          },
          {
            id: 'b',
            text: 'Establish IV access, begin aggressive normal saline infusion per Parkland formula (4 mL × 15% × estimated weight ÷ 2 hours), cool the burn with clean water or saline if not already done, and defer IV analgesia until transport is underway',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Fluid resuscitation is the first life-saving intervention for major burns. The Parkland formula (4 mL × %TBSA × kg ÷ 2 over 8 hours) is the standard burn shock prevention protocol. Cooling (if not already done by company fire suppression) reduces burn depth. Pain control is essential but secondary to preventing burn shock. Initiate IV fluids now, titrate to urine output, and transport rapidly to a burn center.',
            },
          },
          {
            id: 'c',
            text: 'Apply ice packs directly to the burns to cool them rapidly while waiting for the second ambulance to arrive',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Direct ice application can cause cold-related injury (frostbite). If burns have not been cooled by the initial suppression response, use tepid (cool, not cold) water or saline-soaked dressings. However, 15 minutes post-burn, the cooling window is largely closed. The priority now is fluid resuscitation and transport, not additional cooling attempts.',
            },
          },
          {
            id: 'd',
            text: 'Apply sterile dry dressings to the burns and transport without IV fluids, as the burn center will manage all fluid resuscitation',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'While burn centers do manage detailed fluid protocols, prehospital fluid resuscitation is critical for survival. A 15-minute delay without IV fluids means a 15-minute window of unchecked burn shock development. Initiate normal saline immediately. Do not defer resuscitation to the hospital. The burn center will adjust your fluids and monitor urine output, but you must start now.',
            },
          },
        ],
      },

      {
        id: 'bi3',
        title: 'Scene 3 of 4 — Inhalation Injury Recognition',
        situation: 'Patient A is now at St. Barnabas Burn Center. Fifteen minutes later, the Fire Department Paramedic reports via radio: "Patient A\'s stridor is worsening. Breath sounds are diminished bilaterally. We\'re seeing soot in the mouth and singed nasal hairs. SpO2 is 89% on high-flow O2. We\'re approximately 6 minutes from the burn center." The paramedic is asking: "Should we intubate now or wait for the burn center?"',
        choices: [
          {
            id: 'a',
            text: 'Do not intubate en route — wait for the burn center anesthesia team. Intubation in a burn patient en route is too risky.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'While airway management in burn patients is complex, a paramedic who is trained in intubation and sees worsening stridor with declining SpO2 should not be prohibited from intubating. Six minutes away is a long time if the airway occludes. This is a judgment call, but tell the paramedic: "Make the call based on current trends. If you cannot maintain oxygenation, intubate. If stable, run and notify burn center of stridor.\'',
            },
          },
          {
            id: 'b',
            text: 'Confirm that the paramedic has signs of inhalation injury (singed nasal hairs, soot in oropharynx, stridor, carbonaceous sputum) and advise intubation now if SpO2 cannot be maintained above 90% despite high-flow O2',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Exactly right. The classic signs of inhalation injury are present: singed nasal hairs, soot, stridor, and declining SpO2 despite supplemental oxygen. This indicates upper airway edema and possible lower airway/lung injury. Waiting 6 minutes with SpO2 at 89% and worsening stridor risks complete airway obstruction. Advise the paramedic to intubate now with a small-diameter tube (to accommodate swelling), then notify the burn center. Early intubation before complete obstruction is the right call.',
            },
          },
          {
            id: 'c',
            text: 'Advise the paramedic to apply CPAP to increase oxygenation and avoid intubation',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'CPAP can worsen airway swelling by increasing pressure in a compromised airway. With stridor and declining SpO2, a mechanical airway intervention (intubation) is more appropriate than positive pressure. CPAP delays the necessary decision and increases risk of catastrophic obstruction.',
            },
          },
          {
            id: 'd',
            text: 'Advise the paramedic to increase the oxygen concentration to 100% and transport rapidly without intubation — the burn center will manage the airway',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'The patient is already on high-flow O2 at 89% SpO2 with worsening stridor. Simply increasing oxygen concentration will not prevent airway obstruction. Waiting for the hospital to intubate a patient with a closing airway is dangerous and delays a necessary intervention. A trained paramedic should intubate before the airway becomes completely obstructed.',
            },
          },
        ],
      },

      {
        id: 'bi4',
        title: 'Scene 4 of 4 — Burn Center Transport & Resource Management',
        situation: 'You have successfully transported Patient A to St. Barnabas Burn Center. Patient B and Patient C are still on-scene awaiting transport to burn care facilities. Patient B (12% TBSA) is stable, alert, on IV fluids, pain controlled. Patient C (15% TBSA) is in severe pain and becoming increasingly anxious. You have only one ambulance remaining available. Which patient transports first, and where?',
        choices: [
          {
            id: 'a',
            text: 'Transport Patient B first to the nearest hospital (University Hospital Newark) to free up the ambulance for Patient C',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Both Patient B and C have moderate-to-severe burns (>10% TBSA) that require burn center care, not general emergency departments. Sending Patient B to a non-burn-center facility is a diversion error. University Hospital Newark does not have burn center capabilities. Both patients should go to burn centers — the question is which one first, not which goes to a non-burn facility.',
            },
          },
          {
            id: 'b',
            text: 'Transport Patient C (15% TBSA, higher burn percentage, more severe pain) first to St. Barnabas, then return for Patient B',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct prioritization. While both are significant burns, Patient C has a higher TBSA (15% vs. 12%) and is in escalating distress. Transport Patient C immediately to St. Barnabas (or another burn center if St. Barnabas is at capacity). Patient B is more stable and can wait for the ambulance to return. Ensure Patient B has IV fluids running, is on high-flow O2, and is monitored while waiting. Request an additional ambulance to expedite Patient B\'s transport.',
            },
          },
          {
            id: 'c',
            text: 'Transport Patient C to Robert Wood Johnson and Patient B to St. Barnabas to split the load between burn centers',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Splitting between burn centers is not wrong if both are appropriate facilities, but the decision should be based on capacity and transport time, not simply to divide the load. You have one ambulance. Patient C should be transported first because of higher TBSA and distress. Patient B can be transported second. Confirm with both burn centers for bed availability if needed, but sequence based on severity.',
            },
          },
          {
            id: 'd',
            text: 'Call for a helicopter to transport Patient C directly to the burn center to expedite care and free up the ambulance for Patient B',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A 15% TBSA burn is not an automatic helicopter indication in New Jersey. Ground transport to a burn center 12–15 minutes away is appropriate and faster than waiting for helicopter logistics. Helicopter is reserved for longer transport times or when ground transport is not feasible. Use ground ambulance for rapid burn center transport.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Airway involvement (stridor, singed hairs, soot) in burn patients is Priority 1 — inhalation injury is the leading cause of burn mortality.',
        'Apply the rule of nines accurately and initiate Parkland formula fluid resuscitation immediately — burn shock develops quickly.',
        'Recognize inhalation injury signs: singed nasal hairs, carbonaceous sputum, stridor, declining SpO2 on supplemental O2.',
        'Do not delay intubation in a paramedic-staffed unit if airway is deteriorating — early intubation before complete obstruction is safer than waiting.',
        'All moderate-to-severe burns (>10% TBSA) require transport to a burn center, not general emergency departments.',
      ],
      references: [
        'PALS / ACS Advanced Burn Life Support (ABLS)',
        'Parkland Formula (Fluid Resuscitation)',
        'Rule of Nines (Adult & Pediatric)',
        'St. Barnabas Medical Center Burn Center (Newark, NJ)',
        'NFPA Burn Injury Guidelines',
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 3. FLASHOVER SURVIVAL & RECOGNITION
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'safety-flashover-recognition',
    title: 'Flashover Survival & Recognition',
    description: 'Interior crew encounters flashover precursors during residential fire attack. Recognize smoke conditions, thermal layering, and make the critical escape decision. Navigate crew accountability and post-event CISD.',
    category: 'Firefighter Safety',
    difficulty: 'Advanced',
    estimatedMinutes: 23,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🛡️',
    badgeColor: 'bg-purple-100 text-purple-700',

    setup: {
      dispatch: 'DISPATCH: Structure fire, 87 Oak Lane, Morristown, NJ. Two-story wood-frame residence. Smoke showing from first and second floors.',
      narrative: 'Engine 3 arrives at 19:15 on a Tuesday evening. Moderate smoke is issuing from the front and sides of a two-story colonial. You are the Officer on the attack line (Engine 3). Your crew consists of two firefighters: FF1 (6 years experience, stationed with you) and FF2 (2 years experience, on loan from another station). Ladder 4 is 2 minutes behind. Your driver is establishing water supply. The plan is to make entry on Side A, locate the fire, and begin interior attack. All crew members are in full PPE with SCBA. You enter at 19:17.',
      details: [
        'Structure: Two-story wood-frame colonial, approximately 35 years old, vinyl siding, single-pane windows',
        'Fire location: Reported to be in the living room area of the first floor (right side/Side B as you face the structure)',
        'Time: 19:15 arrival, 19:17 entry. Darkness is falling. Interior lights are off.',
        'Crew: Officer (you), FF1 (6 yrs), FF2 (2 yrs). All SCBA-equipped, 1¾" line being charged.',
        'Conditions: Moderate smoke, no flames visible from exterior at entry, fire compartment not yet visible',
        'Escape route: Main entrance on Side A (where you entered). Windows on both sides, staircase to second floor in entry hallway.',
      ],
    },

    scenes: [
      {
        id: 'fs1',
        title: 'Scene 1 of 4 — Reading Smoke & Rollover Recognition',
        situation: 'You are advancing the attack line down the entry hallway toward the living room. The smoke is thick but not yet showing visible flames. You notice: (1) the smoke is dark grey to black, (2) the upper 2–3 feet of the hallway is distinctly darker and more turbulent than the lower level, (3) your gloved hand held at eye level is barely visible — visibility is perhaps 1 foot. You can hear the rumble of fire but haven\'t yet located the seat. FF2 radios: "Officer, should I follow closer?" What is your immediate assessment?',
        choices: [
          {
            id: 'a',
            text: 'Conditions are normal for interior fire operations — keep advancing the line and locate the fire seat',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This assessment misses critical danger signs. The dark upper layer is NOT normal — it indicates thermal layering and rollover (ignition of unburned gases in the superheated upper zone). Rollover is a precursor to flashover. This smoke behavior is a red flag that should trigger heightened awareness and caution, not business-as-usual advancement.',
            },
          },
          {
            id: 'b',
            text: 'You notice thermal layering (dark upper layer distinct from lower layer) and rollover activity (turbulent ignition in the smoke). This is a flashover precursor. Slow your advance, stay low, improve ventilation, and prepare for rapid egress if conditions worsen.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Exactly correct. Thermal layering (distinct upper/lower smoke boundary) combined with rollover (turbulent ignition/glowing in the upper layer) is a classic flashover precursor. This is not time to hesitate — it is time to intensify water application, improve ventilation coordination, and have an escape plan ready. You should be thinking: "Am I in a building that is about to flashover? What is my exit strategy?" This is the moment when recognition saves lives.',
            },
          },
          {
            id: 'c',
            text: 'The smoke conditions indicate low oxygen and potential CO accumulation — order all crew to exit immediately and go defensive',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'The smoke conditions do indicate flashover risk, but your recommendation to exit immediately is slightly premature. You still have a charged line, conditions are not yet uncontrollable, and you have ventilation options (Ladder 4 is 1 minute away). However, your instinct to prioritize crew safety is correct. The better response is: recognize the danger, prepare for egress, improve ventilation, intensify water application, and make a rapid decision: advance with new ventilation support or exit.',
            },
          },
          {
            id: 'd',
            text: 'Request Ladder 4 to perform horizontal ventilation (open windows and doors) immediately to improve smoke conditions',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Horizontal ventilation without a charged interior line in place is uncoordinated and dangerous. Opening windows in this thermal layering condition can accelerate flow paths, push fire toward your position, and worsen conditions rapidly. Ventilation and attack must be coordinated. At this moment, you need vertical (roof) ventilation or a closed-door strategy — not opening windows.',
            },
          },
        ],
      },

      {
        id: 'fs2',
        title: 'Scene 2 of 4 — Thermal Layering & Escalation Decision',
        situation: 'You have recognized the flashover precursors and called for Ladder 4 to standby and be ready for roof ventilation. You hold your position 15 feet from the living room entrance, line charged and ready. Suddenly, the conditions escalate: the smoke becomes even darker (almost black), the turbulence in the upper layer intensifies, and you feel a surge of heat on your helmet and shoulders even though you are 15 feet from the fire compartment. FF1 radios: "Officer, the heat is increasing rapidly. My gauge is reading high-300s Fahrenheit." What is your command?',
        choices: [
          {
            id: 'a',
            text: 'Advance the line toward the fire compartment immediately — you need to apply water directly to knock down the heat',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Advancing toward a rapidly escalating thermal environment in full rollover is extremely dangerous. You are seeing heat rising in the upper layer — the fire is producing enough energy to heat the entire space rapidly. Advancing into this is a classic error that leads to flashover entrapment. The time to advance has passed.',
            },
          },
          {
            id: 'b',
            text: 'Escalating conditions indicate imminent flashover. Order immediate egress: "Ladder 4, we\'re exiting now! Exit this building! Line retreat at hallway entrance!" Stay low, keep spray pattern in defense, exit in order.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct decision. Rapid heat increase, intensifying rollover, and darkening smoke are the final seconds before flashover. This is no longer a "let\'s ventilate and try again" scenario — this is "get out now." Your command is clear, you are ordering an immediate disciplined exit in order (not a panicked run), with the line operator maintaining a defensive spray pattern on egress to protect the crew. This is textbook flashover survival.',
            },
          },
          {
            id: 'c',
            text: 'Request Ladder 4 to attempt roof ventilation immediately while you hold position with the line and provide defensive water coverage',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Roof ventilation takes 2–3 minutes minimum to cut a hole and establish flow. You have seconds before flashover. Asking Ladder to ventilate while you hold your position assumes you have time — you do not. The moment to try ventilation was earlier. Now is the moment to exit. Do not sacrifice crew safety waiting for ventilation that will not arrive in time.',
            },
          },
          {
            id: 'd',
            text: 'Hold position and decrease water application to preserve water pressure in case the fire spreads to the hallway',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Decreasing water application in an escalating thermal environment is the opposite of what you should do. If you stay (which you should not), you would increase water application. But the correct decision is not to stay at all — escalating heat + rollover + darkening smoke = flashover imminent. Exit now.',
            },
          },
        ],
      },

      {
        id: 'fs3',
        title: 'Scene 3 of 4 — Escape Decision & Accountability',
        situation: 'You have ordered immediate egress. The crew is exiting in order: FF1 (nozzle), you (backup/officer), FF2 (rear/safety). You are 20 feet from the front entrance, moving low and fast. Suddenly, FF2 stops and radios: "Officer, my air alarm is going off!" FF1 is at the front door, 15 feet ahead. You are between them. The smoke is even darker now. What do you do?',
        choices: [
          {
            id: 'a',
            text: 'Order FF2 to continue moving to the front door. Maintain crew order. Exit the structure.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. FF2\'s air alarm in a flashover scenario is a low-air condition, but the building is about to flashover. The danger of staying is greater than the danger of a short exit with low air. FF2 is 20 feet from the exit. At a controlled pace moving low toward fresh air, FF2 can reach the door in 20–30 seconds. The priority is crew egress in order without disorganization. Order FF2 to continue moving, direct them to the front entrance, and ensure they exit safely.',
            },
          },
          {
            id: 'b',
            text: 'Go back and escort FF2 out while FF1 covers the hallway with the line from the front door',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Disrupting the egress order by going back creates disorganization and separates the crew. FF1 is trained and 15 feet from the exit. FF2 is functional (air alarm is not a Mayday, just low air). Maintain order: direct FF2 to move forward, you stay in the middle, FF1 covers the entrance. Getting everyone to the same location (outside) is the goal — not going back into danger.',
            },
          },
          {
            id: 'c',
            text: 'Order FF1 to exit to the front porch and set up a defensive position. You and FF2 will exit through a side window to speed up the exit.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Splitting the crew during emergencies creates chaos and accountability problems. One crew exits the known door, all crew goes to the same location. Window escapes should not be the primary egress in a known-door situation 20 feet away. Stay together, exit through the front door in order.',
            },
          },
          {
            id: 'd',
            text: 'Hold position at the hallway entrance with both FF1 and FF2 and wait for Ladder 4 to establish roof ventilation before continuing egress',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Holding position in an escalating flashover scenario buys no time — it wastes the time you have left. Roof ventilation will not be ready. The crew needs to exit now. While your intention to wait for support is understandable, the better decision in flashover imminent is immediate egress. Do not wait.',
            },
          },
        ],
      },

      {
        id: 'fs4',
        title: 'Scene 4 of 4 — Crew Accountability & CISD',
        situation: 'All crew have exited safely and are on the front lawn. Time is 19:24 (7 minutes from entry). Moments after exiting, loud flames and a bright orange glow erupt from the front windows — flashover has occurred inside. Incident Commander confirms all three crew members are accounted for and physically safe. FF2 is shaken, stating: "I can\'t believe we almost got caught in that. My air was running out. I thought we were done." FF1 and you are standing nearby. Fire Department is setting up defensive operations. Incident Commander approaches and asks: "Do you want to re-enter for secondary search or overhaul?"',
        choices: [
          {
            id: 'a',
            text: 'Negative. The building is now fully involved. Request defensive operations, confirm no occupants are unaccounted for, and stand by for overhaul after fire is knocked down.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct decision. A flashover means the building is now fully involved and unsurvivable for any interior crew. You entered, made a search effort, and exited safely before flashover. Re-entry is not justified. Confirm with the homeowner/dispatch that no occupants are known to be trapped (you did a quick primary search during your 7-minute entry), then defensive operations are appropriate. Overhaul happens after knockdown.',
            },
          },
          {
            id: 'b',
            text: 'Prepare your crew for re-entry to conduct a thorough secondary search now that you know flashover has occurred',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This building is fully flashover now. Any re-entry is a suicide mission. The interior is uninhabitable and will remain so for 30+ minutes of fire suppression. No secondary search justifies crew entry into a fully involved, flashover-stage fire. Defensive operations are the only option.',
            },
          },
          {
            id: 'c',
            text: 'Have FF1 and FF2 head inside the ambulance immediately for medical clearance. Schedule mandatory CISD (Critical Incident Stress Debriefing) for the crew within 24 hours.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Medical clearance and CISD are appropriate, but the decision should be: immediate medical evaluation if anyone has symptoms, and CISD scheduled for 24–48 hours post-incident (not during immediate incident operations). Additionally, a hot debrief (30–60 minutes after scene clearance) often occurs before formal CISD. The crew is shaken but physically safe — address immediate medical needs, but don\'t remove them from accountability until command releases them.',
            },
          },
          {
            id: 'd',
            text: 'Your crew did excellent work. Tell them to stand by for further assignments once fire operations continue.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'While your crews did good work exiting safely, dismissing the emotional impact of a flashover near-miss without acknowledgment or support is poor leadership. FF2 is clearly shaken. A brief check-in ("Everyone okay? Anyone need medical?"), acknowledgment of the decision to exit ("We made the right call — we recognized the precursors and got out before things went critical"), and information about CISD is important leadership after a traumatic event.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Thermal layering (distinct upper/lower smoke boundary) and rollover (turbulent ignition in the upper layer) are precursors to flashover — recognize them and prepare to exit.',
        'Rapidly escalating heat and darkening smoke are final warnings — order immediate egress, not additional ventilation attempts.',
        'Maintain crew order during egress — all crew exits together through the primary known exit, not splitting or using alternate routes unnecessarily.',
        'A low-air alarm during an imminent flashover does not warrant delaying egress — the greater danger is staying in the building.',
        'Post-flashover, defensive operations are mandatory — no re-entry is justified in a fully involved structure.',
        'After a traumatic near-miss event, leadership includes acknowledging crew stress, ensuring medical evaluation, and scheduling formal CISD within 24–48 hours.',
      ],
      references: [
        'NFPA 1500 (Firefighter Safety and Health)',
        'NFPA 1710 (Structural Firefighting)',
        'Underwriters Laboratories (UL) Flashover Research',
        'International Association of Fire Chiefs (IAFC) Flashover Doctrine',
        'Critical Incident Stress Debriefing (CISD) Protocols',
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 4. ACTIVE THREAT / MCI — MASS CASUALTY AT PUBLIC VENUE
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'ems-active-threat-mci',
    title: 'Active Threat / MCI — Mass Casualty at Public Venue',
    description: 'Mass casualty incident at a NJ public venue (concert event) with multiple trauma patients and scene security concerns. Navigate Rescue Task Force (RTF) staging, warm zone triage using SALT protocol, hemorrhage control priorities, and patient movement to treatment area.',
    category: 'EMS / Rescue',
    difficulty: 'Advanced',
    estimatedMinutes: 25,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🚨',
    badgeColor: 'bg-red-100 text-red-700',

    setup: {
      dispatch: 'DISPATCH: Active threat (shots fired) at Prudential Center Arena, Newark, NJ. Multiple casualties reported. Police and EMS units responding. Tactical situation ongoing.',
      narrative: 'You are a Medic with the EMS rapid response team (part of the initial active threat response). Police have declared a Rescue Task Force (RTF) mission: law enforcement establishes scene security and creates a warm zone where EMS can operate and evacuate casualties. You arrive at 22:18. Police are on-scene, threat has been suppressed (shooter contained/in custody), and police are establishing a warm zone perimeter. Initial reports indicate 12–15 patients with gunshot wounds, blast injuries, and crush injuries from people fleeing. Police indicate approximately 8 patients are ambulatory (able to walk out), 4–5 are non-ambulatory. Scene is partially cleared of threats, but some areas remain unsecured.',
      details: [
        'Incident: Active shooting at arena concert, police response approximately 3–4 minutes, threat suppressed at 22:16',
        'Scene: Large indoor venue with multiple exits, darkened interior, crowd still partially present in some areas',
        'Casualties: Est. 12–15 patients ranging from minor injuries (laceration, bruises) to critical (penetrating trauma, obvious hemorrhage)',
        'Police RTF status: Warm zone established, but not all areas cleared; police escorts required for medics in some zones',
        'EMS resources: 3 ambulances on-scene immediately, 5 additional en route. ALS backup available.',
        'Triage approach: SALT rapid triage (Sort, Assess, Lifesaving interventions, Treatment/transport) required to manage volume',
      ],
    },

    scenes: [
      {
        id: 'mci1',
        title: 'Scene 1 of 4 — RTF Staging & Warm Zone Entry',
        situation: 'You are briefed by the Police RTF Commander: "We have a warm zone established. Medics, you will enter in pairs with police escorts. Scene is not fully clear, but we believe primary threat area is secured. You will proceed to the arena floor, triage victims, and begin movement to the cold zone exit point where ambulances are staging. What are your initial actions as the first EMS pair entering the warm zone?"',
        choices: [
          {
            id: 'a',
            text: 'Enter the warm zone immediately and begin treating the most visibly injured patients you see first',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Rushing to individual patients without a coordinated triage approach in an MCI will scatter your resources and result in inefficient care delivery. MCI doctrine requires: (1) scene overview/command establishment, (2) triage of all patients, (3) prioritized treatment based on severity, (4) coordinated transport. Enter with a police escort, establish a brief command post/triage area, and prepare to do a systematic triage walk-through first.',
            },
          },
          {
            id: 'b',
            text: 'Enter with police escort, establish a command point/triage checkpoint near the arena floor entrance, identify an area for treatment/staging, and conduct a rapid overview of the scene before initiating triage',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. MCI operations begin with scene safety, command establishment, and organization. You establish a triage checkpoint/command area, confirm police security, do a 360° overview (how many patients? where are they? any ongoing threats?), and then initiate triage. This prevents wasted movement and ensures all patients are accounted for. You are setting up an MCI structure, not responding to individual 911 calls.',
            },
          },
          {
            id: 'c',
            text: 'Request that all ambulatory patients self-evacuate to the exit point and wait for you there while you stay in the arena with a police escort looking for non-ambulatory patients',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Unsupervised self-evacuation is dangerous — patients may collapse, cause secondary injuries, or be contaminated by scene hazards (broken glass, ongoing danger). Additionally, triage requires assessment of all patients before evacuation prioritization. Do not allow unguided self-evacuation. Triage all patients, then move in priority order.',
            },
          },
          {
            id: 'd',
            text: 'Ask police to clear all remaining civilians from the arena before you enter so you have an unobstructed scene',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'While scene security is important, waiting for a complete civilian evacuation could take significant time. The warm zone allows you to enter and begin care while police continue clearing operations. Your job is to work in the warm zone with police support — do not delay care waiting for perfect conditions. Accept the warm zone as-is and proceed with triage and treatment.',
            },
          },
        ],
      },

      {
        id: 'mci2',
        title: 'Scene 2 of 4 — SALT Triage & Prioritization',
        situation: 'You are now on the arena floor conducting triage using the SALT protocol (Sort, Assess, Lifesaving interventions, Treatment/transport). You encounter: Patient A (male, walking, alert, holding his leg wound), Patient B (female, sitting but responsive, obvious abdominal bleeding), Patient C (male, lying supine, not responding to voice, breathing shallow). You have 2 other EMS personnel with you. What is your immediate triage sequence?',
        choices: [
          {
            id: 'a',
            text: 'Triage Patient A immediately and transport to the ambulance while the other medics assess Patients B and C',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This violates SALT protocol. You are performing individual treatment/transport instead of completing triage of ALL patients first. In an MCI, you must assess all patients, prioritize all of them, then begin coordinated treatment/transport. Transporting a walking wounded before triaging non-ambulatory critical patients is inefficient.',
            },
          },
          {
            id: 'b',
            text: 'Apply SALT protocol: Sort (identify all ambulatory vs. non-ambulatory), Assess (brief neuro/breathing/perfusion check), Lifesaving interventions (hemorrhage control, airway clearance), then assign colors (Critical/Red, Urgent/Yellow, Delayed/Green, Expectant/Black). Triage all three patients, then coordinate treatment/transport priorities.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Perfect. SALT triage ensures all patients are assessed using a consistent framework. In this scenario: Patient A (walking, normal consciousness) = likely Yellow or Green after rapid assessment. Patient B (sitting, responsive, obvious abdominal bleeding) = likely Red/Critical (uncontrolled hemorrhage). Patient C (unresponsive, shallow breathing) = Red/Critical (airway/breathing compromise). Completing triage of all patients before transporting any ensures you do not miss a critical patient while dealing with a walking wounded.',
            },
          },
          {
            id: 'c',
            text: 'Focus all resources on Patient C (unresponsive) as the most critical and begin advanced life support immediately while others continue triage',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'In an MCI with 12–15 patients, committing all resources to one unresponsive patient is not appropriate — resources are limited. SALT triage allows you to quickly assess Patient C\'s condition (unresponsive, shallow breathing = Red/Critical, but the severity and reversibility matter). If Patient C is in cardiac arrest from penetrating trauma with uncontrolled hemorrhage, they may be expectant in an MCI context. Complete triage first to allocate limited resources optimally.',
            },
          },
          {
            id: 'd',
            text: 'Perform detailed vital signs and physical exams on each patient before assigning triage colors',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Detailed exams are not appropriate in MCI rapid triage. SALT is rapid (30 seconds per patient maximum). You assess Level of Consciousness, Respiratory effort, Perfusion (skin color/pulse), and obvious hemorrhage. Detailed vital signs and exams happen after triage categorization during treatment/transport phases. Do not slow triage with detailed assessments when rapid assessment will suffice.',
            },
          },
        ],
      },

      {
        id: 'mci3',
        title: 'Scene 3 of 4 — Hemorrhage Control Priorities',
        situation: 'Triage is complete. You have identified: 3 Red/Critical patients (including Patient B with abdominal bleeding and Patient C with shallow breathing), 5 Yellow/Urgent patients, 4 Green/Delayed. Your team must begin lifesaving interventions before transport. Patient B has obvious abdominal bleeding but is alert. Patient D (Red) has a lower-leg wound with severe bleeding that is controlled only by direct pressure. Patient E (Red) has a junctional wound at the groin with dark venous bleeding. You have one tourniquet, one pressure dressing, and a hemostatic gauze available. Which patient gets the tourniquet first?',
        choices: [
          {
            id: 'a',
            text: 'Patient D (lower leg) because extremity wounds are easier to tourniquet than junctional wounds',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. A lower-leg wound above the knee is a textbook tourniquet application. Patient D has uncontrolled bleeding that responds to direct pressure but needs tourniquet placement above the knee to achieve proximal control. A tourniquet is appropriate, effective, and will rapidly control hemorrhage. Patient E\'s groin wound is junctional (where a tourniquet cannot be applied) and requires a different approach (hemostatic gauze, pressure dressing, manual compression). Tourniquet Patient D, then address Patient E with hemostatic gauge and pressure.',
            },
          },
          {
            id: 'b',
            text: 'Patient E (groin) because junctional hemorrhage is more life-threatening',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'While groin wounds can be highly hemorrhagic, a tourniquet cannot be applied to a junctional wound. You are not solving Patient E\'s problem by trying to use a tourniquet there — you will use hemostatic gauze and pressure dressing instead. Use the tourniquet on the patient who can benefit from it (Patient D), and address junctional hemorrhage with appropriate techniques.',
            },
          },
          {
            id: 'c',
            text: 'Patient B (abdominal) because she is alert and asking for help',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Abdominal hemorrhage cannot be managed with a tourniquet. Patient B requires rapid transport to a trauma center for surgical control. The tourniquet is not indicated for abdominal trauma. Allocate the tourniquet to the patient who will benefit from it (Patient D with an extremity wound) and ensure Patient B gets priority transport.',
            },
          },
          {
            id: 'd',
            text: 'Distribute the available hemorrhage-control devices equally among all three Red patients and transport immediately',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'While the intent to treat all Red patients is correct, you must prioritize which lifesaving intervention goes to which patient based on wound location. The tourniquet is highly effective for extremity wounds (Patient D) and not applicable to junctional wounds (Patient E) or abdominal wounds (Patient B). Use each tool appropriately for the patient who benefits most.',
            },
          },
        ],
      },

      {
        id: 'mci4',
        title: 'Scene 4 of 4 — Patient Movement & Transport Coordination',
        situation: 'Hemorrhage control interventions are complete: Patient D has a tourniquet, Patient E has hemostatic gauze and pressure dressing, Patient B is prepped for rapid transport. You now have 3 ambulances on-scene. You have 3 Red patients and 5 Yellow patients that need transport. Police are preparing to clear the final civilians and create a secure exit corridor for ambulances. What is your transport sequence?',
        choices: [
          {
            id: 'a',
            text: 'Load all Red patients (3) in the first ambulance, all Yellow patients (5) in the next two ambulances, to keep similar-acuity patients together',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This violates MCI transport doctrine. You do not batch patients by acuity — you distribute critical patients across ambulances to prevent overwhelming a single ALS crew. If all 3 Red patients are in one ambulance, you have one crew managing 3 critical patients, which is unsafe. Distribute one critical patient per ambulance to maximize capability. Additionally, yellows should be interspersed or transported after reds to ensure resource allocation prioritizes critical care.',
            },
          },
          {
            id: 'b',
            text: 'Load one Red patient per ambulance (3 ambulances, 3 Red patients), then hold the 5 Yellow patients for additional ambulance arrivals. Red patients transport immediately to the trauma center (University Hospital Newark ~ 10 min away).',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct MCI transport strategy. One critical patient per ambulance ensures adequate ALS care. Red patients are transported immediately to the nearest level 1 trauma center (University Hospital Newark). Yellow patients wait for additional ambulance capacity — holding them 10–15 minutes is appropriate for an MCI when red/critical patients are the priority. This maximizes resources and ensures critical patients get rapid, dedicated care.',
            },
          },
          {
            id: 'c',
            text: 'Transport 1 Red patient and 2 Yellow patients per ambulance to maximize ambulance efficiency and get more patients to the hospital faster',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Overstuffing ambulances with mixed acuities stretches crew resources. A crew managing one Red and two Yellows may not be able to provide optimal care to the critical patient. MCI best practice is one critical patient per ambulance with appropriate crew-to-patient ratios. You move patients more efficiently by sending reds first, not by mixing acuities.',
            },
          },
          {
            id: 'd',
            text: 'Request that all ambulances stage in the warm zone and wait for police to complete civilian evacuation before transporting any patients',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Do not delay critical patient transport waiting for civilian evacuation completion. The warm zone allows ambulances to stage and load safely while police continue their operations. Your Red patients need to depart to the trauma center immediately. Police can manage evacuation sequencing to allow ambulance movement. Transport critical patients now — do not wait.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'In Rescue Task Force (RTF) operations, establish a command post, triage checkpoint, and treatment area before beginning patient care — do not scatter resources chasing individual patients.',
        'SALT triage (Sort, Assess, Lifesaving interventions, Treatment/transport) ensures rapid, systematic assessment of all MCI patients and optimal resource allocation.',
        'Hemorrhage control: use tourniquets for extremity wounds, hemostatic gauze and pressure for junctional wounds, rapid transport for cavity (abdominal/thoracic) bleeding.',
        'Distribute critical patients across multiple ambulances (one Red per ambulance) to prevent overwhelming a single ALS crew.',
        'In MCIs, transport critical (Red) patients first with dedicated ALS care; Yellows can wait for additional ambulance capacity; Greens and Blacks wait or stay on-scene as appropriate.',
      ],
      references: [
        'SALT Mass Casualty Triage (Kirschenbaum, et al.)',
        'NAEMT Rescue Task Force Doctrine',
        'American College of Surgeons ATLS (Active Threat Protocol)',
        'Department of Homeland Security Mass Casualty Management Guidelines',
        'New Jersey EMS Protocols (Hemorrhage Control)',
      ],
    },
  },

// ══════════════════════════════════════════════════════════════════════
  // 1. HIGH-RISE STANDPIPE OPERATIONS
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'structure-fire-highrise',
    title: 'High-Rise Standpipe Operations',
    description: 'Fire on the 8th floor of a 12-story residential high-rise in Jersey City. Navigate standpipe connections, stairwell management, search operations, and ventilation challenges in a complex structure.',
    category: 'Structural Firefighting',
    difficulty: 'Advanced',
    estimatedMinutes: 25,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🏗️',
    badgeColor: 'bg-orange-100 text-orange-700',

    setup: {
      dispatch: 'DISPATCH: Engine 25, Ladder 12, Battalion Chief 2 — respond to 250 Marshall Street, Jersey City, for a reported high-rise structure fire. Caller reports fire on the 8th floor, heavy smoke in common hallway.',
      narrative: 'You are the Officer on Engine 25, arriving at a 12-story residential high-rise in downtown Jersey City at 16:45. Multiple residents are evacuating down the stairs. You can see heavy grey smoke venting from the 8th-floor stairwell window on Side A. The building is a 1990s concrete construction with Class II (2½ inch) standpipes on every floor. Your driver is confirming water supply at the street-level FDC (Fire Department Connection). Battalion Chief 2 will arrive in 2 minutes and establish command.',
      details: [
        'Structure: 12-story concrete high-rise residential, ~180 units, Class II standpipes on all floors, 2½" connections',
        'Incident location: 8th floor, Apartment 8C, fire in a kitchen, heavy smoke in common hallway',
        'Water supply: FDC on Marshall Street side (frontal access), hydrant 200 feet away on side street',
        'Life safety: Residents evacuating, unconfirmed if all units are vacant on affected floors',
        'Building access: Four stairwells (A, B, C, D), stairwell A is smoky (fire side), stairwell D is clear',
        'NJ Building Code requires regular fire pump testing — pump is operational and accessible in basement',
      ],
    },

    scenes: [
      {
        id: 'hr1',
        title: 'Scene 1 of 5 — Lobby Operations & Building Systems',
        situation: 'You arrive in the lobby with your crew. The building engineer is at the security desk and reports: "8th floor kitchen fire, we\'ve got the fire pump running, but the standpipe pressure is only 60 PSI at the 8th floor outlet." A resident is still descending the stairs coughing heavily. What is your immediate action?',
        choices: [
          {
            id: 'a',
            text: 'Contact the building engineer, confirm fire pump status, and request they increase pump pressure to 100 PSI for the standpipe before you connect.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. A 60 PSI static pressure reading at the 8th floor is too low to deliver adequate flow through a 2½" line with friction loss. The fire pump should be capable of maintaining 65 PSI at the FDC with a fully charged line flowing. Having the engineer boost pump discharge pressure or verify pump operation is critical before you commit a crew to the standpipe. Once you have confirmation of adequate pressure, you proceed with confidence. This coordination prevents a line crew from advancing without enough water.',
            },
          },
          {
            id: 'b',
            text: 'Immediately have your driver connect at the FDC and charge your 2½" standpipe line regardless of pressure — you\'ll compensate with nozzle adjustment.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Inadequate pressure at height is a dangerous assumption. At the 8th floor, friction loss in a 2½" line plus elevation gain (approximately 80 feet) means 60 PSI input will not deliver usable flow at the nozzle. "Compensating" by adjusting the nozzle does not create pressure — it wastes water and leaves your crew with little offensive capability. Always verify adequate supply pressure before committing a standpipe line crew.',
            },
          },
          {
            id: 'c',
            text: 'Bypass the standpipe and send your crew up the stairs with a 1¾" line, connecting at each floor as needed.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Hauling a 1¾" line up 8 flights of stairs in a high-rise is operationally exhausting and defeats the purpose of a standpipe system. High-rises have standpipes for exactly this reason — to avoid manual hauling. The standpipe, even at 60 PSI, is still the preferred line. The solution is to fix the pressure, not abandon the system.',
            },
          },
          {
            id: 'd',
            text: 'Ask the evacuating resident what apartment the fire is in and whether anyone else is upstairs before taking any other action.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Life safety information is valuable — but it should be gathered in parallel with your logistics check, not instead of it. Your driver should confirm water supply and pressure while you (or another crew member) interview the evacuee. Do both simultaneously. The building engineer is your primary contact for structural and system information, not evacuees.',
            },
          },
        ],
      },

      {
        id: 'hr2',
        title: 'Scene 2 of 5 — Standpipe Connection & Line Selection',
        situation: 'Pump pressure has been confirmed at 85 PSI at the FDC. Your driver has connected and charged a 2½" line. You are now staging your crew on the 7th floor with the line uncharged, preparing to advance to 8. Battalion Chief 2 has arrived and established command in the lobby. Smoke is banking down from above. You have two options for final line selection: a 2½" single line or a 1¾" dual-line setup. What do you choose and why?',
        choices: [
          {
            id: 'a',
            text: 'Advance a single 2½" line with two firefighters operating, holding the hallway outside Apartment 8C until the fire is knocked down.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'A single 2½" line can knock down the fire — that\'s true. However, using a large line with a small crew leaves you with no flexibility for search support or interior coordination. In a high-rise residential scenario with possible trapped victims, having two assault teams (dual 1¾" lines) gives you the ability to execute search while maintaining a secondary attack line. A single large line is simpler but less adaptable to the complexity of a 12-story structure.',
            },
          },
          {
            id: 'b',
            text: 'Establish a pressure governor on the 2½" line and split to two 1¾" lines, allowing your crew to operate both attack and search with the same water source.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. A pressure governor reduces the 2½" supply to dual 1¾" lines, each at approximately 50 PSI — adequate for interior operations. This setup gives you a search team and an attack team from a single standpipe connection, which is exactly how high-rise operations should be structured. You maintain versatility: one line for aggressive knockdown, one for search protection and backup attack if the fire extends. This is best practice in residential high-rises.',
            },
          },
          {
            id: 'c',
            text: 'Take the 2½" line up yourself and have your crew follow with a search rope instead of a second line.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A search rope without a dedicated line is a liability in a high-rise. Your search crew has no water protection if conditions deteriorate or if the fire extends into the hallway. NFPA 1710 and high-rise best practices require that every interior crew has water supply. A rope without a line leaves the search team vulnerable and operationally unsound.',
            },
          },
          {
            id: 'd',
            text: 'Connect both the 2½" and a 1¾" line from different floor standpipe outlets for maximum redundancy.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Connecting at different floor outlets creates logistical complexity and splits your crew across multiple locations in a smoke-filled environment. The goal is to concentrate your force at the problem floor and coordinate through a single standpipe connection with a pressure governor split. Operating from two separate connections makes communication and coordination harder, not better.',
            },
          },
        ],
      },

      {
        id: 'hr3',
        title: 'Scene 3 of 5 — Stairwell Management & Staging',
        situation: 'Your crew has established staging on the 7th floor with two 1¾" lines charged. You are about to commit the attack team to the 8th floor hallway. However, Stairwell A (the primary egress for your crew) is heavily smoked, and continuous evacuation traffic is still coming down. Your driver is calling from the 3rd floor: "Air handling unit on 3 is discharging smoke into the common hallway." What is your priority action?',
        choices: [
          {
            id: 'a',
            text: 'Request Battalion to have building engineer shut down the HVAC system immediately to stop smoke spread, then proceed with attack once the airflow stops.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. HVAC systems can channel smoke and heat vertically throughout a building, creating hazardous conditions throughout multiple floors and making evacuation dangerous. Requesting the building engineer to shut down the system immediately is a command coordination task that directly improves life safety and your operating conditions. Your driver\'s observation of smoke discharge on the 3rd floor is a critical red flag. Command should relay this to the engineer to disable the system now. Once airflow stops, evacuation becomes safer and your stairwell conditions improve.',
            },
          },
          {
            id: 'b',
            text: 'Ignore the HVAC issue — it\'s not your crew\'s problem. Focus on the fire floor and let someone else manage building systems.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'HVAC-driven smoke spread is absolutely the IC\'s problem and indirectly your crew\'s problem. Smoke cascading down the stairwell increases risk for every firefighter and every evacuating resident. A simple request to disable the system takes seconds and can prevent injuries floors away from the fire. The "not my job" mindset is exactly how secondary casualties occur in high-rises.',
            },
          },
          {
            id: 'c',
            text: 'Have your crew take Stairwell D instead of Stairwell A to avoid the smoke, even though it adds distance to the 8th floor.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Taking an alternate stairwell is not a bad idea tactically — but it doesn\'t solve the underlying problem that HVAC is spreading smoke to multiple floors and creating a hazard for all occupants. The better answer is to request HVAC shutdown while using Stairwell D. Both actions: redirect your crew AND fix the systemic problem so other floors remain safer.',
            },
          },
          {
            id: 'd',
            text: 'Advance your attack line immediately before conditions get worse, and address the HVAC issue during overhaul.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'HVAC shutdown is not an overhaul task — it\'s an immediate life safety measure. By the time you finish the fire attack and reach overhaul, the system will have already spread smoke and heat through multiple floors, potentially trapping residents or creating secondary fire extensions. Address hazardous building system issues during active operations, not after.',
            },
          },
        ],
      },

      {
        id: 'hr4',
        title: 'Scene 4 of 5 — Floor-Above Search',
        situation: 'Your attack line has knocked down the main fire in Apartment 8C. Ladder 12\'s officer is calling: "Conducting primary search on Floor 8 now. We\'ve got heavy smoke and some extension into the hallway above — can you confirm if the 9th floor is occupied and secure?" Your Battalion Chief is asking if you want to initiate a search on the 9th floor (above the fire) to check for residents who may not have evacuated, or hold on the 8th floor and monitor the fire from above.',
        choices: [
          {
            id: 'a',
            text: 'Request a separate engine company be assigned to the 9th floor to conduct a primary search of accessible units and check for extension.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Assigning a separate company to the 9th floor is reasonable if resources are available — but the question is whether to initiate the search at all right now. The fire in 8C is knocked down. Doing a search on the floor above before confirming you have control of the fire below is consuming resources that might be needed for overhaul or exposure protection on the 8th floor. The better approach: confirm fire is out on 8, then systematically move up.',
            },
          },
          {
            id: 'b',
            text: 'Hold your crew on the 8th floor and use a thermal camera to scan the ceiling and walls of the fire apartment for hidden extension upward before committing to a 9th floor search.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Before you commit a search team to the 9th floor, you need to confirm there is no fire above the 8th floor ceiling. A thermal camera scan of the 8C ceiling and void space will show if heat is escaping upward or if there is hidden fire extension. Once you confirm no extension, a 9th floor search becomes safer and more purposeful. This is the right sequencing: verify conditions first, then search methodically. Thermal verification prevents crews from walking into an extension they didn\'t know about.',
            },
          },
          {
            id: 'c',
            text: 'Send Ladder 12\'s search team directly up the stairs to conduct a 9th floor search immediately — time is critical for any trapped residents.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A 9th floor search before confirming fire control and checking for upward extension is reckless. If there is fire or heat extension above the 8th floor, a search team ascending the stairs could walk into active fire or dangerous thermal conditions. The Ladder company is already engaged on the 8th floor with their primary search. The correct sequence is: knock down the fire, verify no extension, then search above. Jumping to a search without confirmation of safe conditions is how crews get hurt.',
            },
          },
          {
            id: 'd',
            text: 'Assume the 9th floor is evacuated and skip the search entirely — focus all resources on the 8th floor fire.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Never assume occupancy in a residential high-rise is complete. Someone may not have heard the alarm, may be sleeping, or may have been in an elevator when the fire started. A primary search of accessible units on the 9th floor is standard practice in high-rise fires, especially when there is fire extension involved. Skipping it to save resources is a life safety failure.',
            },
          },
        ],
      },

      {
        id: 'hr5',
        title: 'Scene 5 of 5 — Ventilation Challenges & Vertical Spread',
        situation: 'The fire in Apartment 8C is extinguished, but Ladder 12 reports heavy smoke still banking through the 8th floor hallway and rising up the stairwell. Battalion Chief is asking whether to open windows and doors in the fire apartment for cross-ventilation, or keep them closed to avoid pushing smoke toward unaffected units. What is your recommendation and reasoning?',
        choices: [
          {
            id: 'a',
            text: 'Keep windows and doors in 8C closed until you have confirmed no fire extension throughout the entire building and the stairwell is cleared. Open for ventilation only after structural verification.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. In a high-rise, opening windows in the fire apartment without confirming all extensions are extinguished risks pushing heat and smoke vertically through the building\'s air gaps, stairwells, and mechanical voids. This can create fire extension several floors above, reignite dormant fires, and contaminate upper floors. The rule: verify all fire is out through thermal imaging and ceiling checks, complete your search above and below, then coordinate ventilation. In high-rises, ventilation is the last step, not the first. Closing the fire apartment contains the problem while you work methodically.',
            },
          },
          {
            id: 'b',
            text: 'Open all windows and doors in 8C immediately to push smoke out and improve visibility for the search teams.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Opening the fire apartment before confirming fire control and extension creates stack effect in the stairwell, pushing hot smoke upward and potentially into occupied units above. This is a classic cause of high-rise fire extension. In a residential high-rise with a possible fire extension risk (as indicated by Ladder\'s report of smoke in upper hallway), opening the fire unit before you verify conditions above is operationally dangerous.',
            },
          },
          {
            id: 'c',
            text: 'Open only one window on the opposite side (downwind) of the building to ventilate, keeping the stairwell door closed.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Partial ventilation through one window might seem like a compromise, but it doesn\'t address the core issue: you have not yet confirmed whether fire exists above the 8th floor. Opening any window in the fire apartment creates a pressure differential. The correct answer requires confirmation of no extension first, then systematic ventilation. Half-measures don\'t provide safety — they only delay the right decision.',
            },
          },
          {
            id: 'd',
            text: 'Have the building engineer activate the stairwell pressurization system to push clean air down the stairs and negate the need for fire apartment ventilation.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Stairwell pressurization systems are designed to protect occupant evacuation, not to solve firefighting smoke issues. Activating the system after fire has already entered the stairwell may not be effective, and it adds another building system variable you\'re trying to manage. The straightforward answer: control the fire apartment first through inspection and verification, then ventilate in a controlled manner. Building system tricks are not a substitute for proper fire control sequencing.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Always verify standpipe pressure is adequate for your target floor before committing crews — friction loss and elevation gain reduce pressure significantly in high-rises.',
        'Use pressure governors to split large-diameter standpipe connections into dual smaller lines for flexibility — one attack team and one search team from a single connection.',
        'HVAC systems can spread smoke and heat vertically throughout a building — coordinate with building engineers immediately to disable systems that are distributing smoke.',
        'Before opening the fire apartment for ventilation, confirm all fire is extinguished through thermal imaging and ceiling verification — opening prematurely can cause extension above.',
        'Search above and below the fire floor methodically using separate crews once fire attack is underway — assume occupancy until proven otherwise in residential high-rises.',
        'High-rise stairwell management requires continuous egress coordination — keep evacuation paths clear and monitor for smoke infiltration from HVAC or stack effect.',
      ],
      references: ['NFPA 1710 (High-Rise Operations)', 'NFPA 1620 (Fire Department Pre-Incident Planning)', 'IFSTA High-Rise Essentials', 'NJ Building Code — Chapter 12 (Interior Finish)'],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 2. EV BATTERY FIRE IN RESIDENTIAL GARAGE
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'vehicle-fire-ev-garage',
    title: 'EV Battery Fire in Residential Garage',
    description: 'A Tesla charging in an attached residential garage enters thermal runaway, threatening the structure. Manage EV fire suppression, thermal runaway dynamics, exposure protection, and extended monitoring.',
    category: 'Vehicle / Brush Fire',
    difficulty: 'Intermediate',
    estimatedMinutes: 20,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🔋',
    badgeColor: 'bg-red-100 text-red-700',

    setup: {
      dispatch: 'DISPATCH: Engine 8, Engine 12 — respond to 142 Oak Hill Drive, Fort Lee, for a reported vehicle fire in an attached garage. Caller reports "electric car on fire, lots of smoke, and sparks flying from under the hood."',
      narrative: 'You arrive at 142 Oak Hill Drive, a 1980s-era suburban colonial with an attached single-car garage on the right side (Side C). The garage door is closed. Heavy white/grey smoke is venting from the gaps around the door frame. You can hear a low-pitched buzzing sound and occasional popping from inside. The homeowner is standing in the driveway and says: "I was charging my Tesla Model 3 when it just started smoking. I got out immediately." Engine 12 is 2 minutes behind you. It is 19:15 on a Tuesday evening.',
      details: [
        'Vehicle: 2022 Tesla Model 3 Long Range (~420 kWh lithium-ion battery pack), charging via Level 2 home charger (240V) in the garage',
        'Structure: 1980s Cape Cod colonial, vinyl siding, attached garage with shared wall, approximately 2,000 sq ft living space, roof is asphalt shingle',
        'Garage contents: One vehicle, standard tools, gasoline can (5 gallons, sealed)',
        'Building occupancy: Homeowner + spouse inside the main house (living room, approximately 30 feet from garage wall)',
        'Exposure: Neighboring property (duplex) approximately 15 feet to the west (Side B), with large windows',
        'Weather: 58°F, wind 12 mph from the north (pushing any airflow toward the neighboring duplex)',
      ],
    },

    scenes: [
      {
        id: 'ev1',
        title: 'Scene 1 of 4 — Approach & Reconnaissance',
        situation: 'You are at the garage entrance. Smoke is venting, and you can see a faint orange glow at the bottom of the garage door. The homeowner has moved to a safe distance in the driveway. Your driver is positioning Engine 8 with the booster tank ready. What is your first tactical action as Incident Commander?',
        choices: [
          {
            id: 'a',
            text: 'Enter the garage immediately with a 1¾" line to identify the vehicle and assess the fire extent.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Entering an enclosed garage space with a burning EV and active thermal runaway is extremely dangerous. Thermal runaway produces intense heat, toxic fumes (hydrogen fluoride, carbon monoxide), and unpredictable re-ignition. The smoke color and glowing interior indicate active battery thermal runaway, not a simple vehicle compartment fire. You cannot see the full extent of the hazard. Reconnaissance from outside is the safer first step.',
            },
          },
          {
            id: 'b',
            text: 'Open the garage door completely to identify the vehicle condition and establish visual confirmation that it is indeed an electric vehicle on fire.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Opening the garage door without understanding what you\'re opening into is reckless. A wide-open door to a space with active thermal runaway can create a draft that accelerates oxygen flow to the battery and intensifies the fire. Additionally, thermal runaway can produce exothermic reactions that ignite when exposed to fresh air. You need intelligence first — talk to the homeowner to confirm the vehicle type, then assess from a protected vantage point.',
            },
          },
          {
            id: 'c',
            text: 'Interview the homeowner for confirmation of the vehicle type and fire behavior before taking action, then request additional resources (second alarm) while establishing a scene perimeter.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. The homeowner\'s confirmation that this is an electric vehicle is critical information — it changes your entire tactical approach. EV fires, especially lithium-ion thermal runaway, require different suppression methods and extended monitoring. Establishing scene perimeter and requesting additional resources early shows appropriate incident escalation for an EV fire in an attached garage with exposures. You gather intelligence, size up safely, and prepare resources before committing to interior operations.',
            },
          },
          {
            id: 'd',
            text: 'Assume it\'s a conventional gasoline engine fire and attack with a standard exterior fog pattern to cool the structure.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Assuming a gasoline fire and using standard fog techniques on a lithium-ion battery thermal runaway is a fundamental error. Lithium-ion thermal runaway requires sustained, heavy water application to cool the battery and suppress thermal spread — not brief fog patterns. Standard vehicle fire tactics are inadequate for EV battery fires. The homeowner\'s identification of an electric vehicle should immediately trigger your knowledge of EV-specific suppression needs.',
            },
          },
        ],
      },

      {
        id: 'ev2',
        title: 'Scene 2 of 4 — Attack Strategy & Water Volume',
        situation: 'The homeowner confirms a 2022 Tesla Model 3 on the Level 2 charger. Engine 12 has arrived. You have two engines and a ladder truck available. The fire is still smoking and glowing but hasn\'t breached the garage exterior. Your driver asks: "Should we use the booster tank with fog (200 gallons) or call for a tanker for sustained water application?" What is your decision and rationale?',
        choices: [
          {
            id: 'a',
            text: 'Use the booster tank with a standard fog pattern to avoid over-suppression and let the fire burn down naturally.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Allowing a lithium-ion thermal runaway to "burn down naturally" is dangerous and ineffective. Thermal runaway in a battery pack can sustain internal exothermic reactions for hours without external suppression. Using only a booster tank (200 gallons) with fog will not cool the battery pack sufficiently to stop the reaction. Additionally, the fire could re-ignite or spread to the gasoline can stored in the garage. EV battery fires demand sustained, high-volume water application.',
            },
          },
          {
            id: 'b',
            text: 'Request a tanker or water shuttle to establish sustained water supply (at least 2,000+ gallons available), then attack with a solid stream at the vehicle until the fire is completely extinguished and the battery pack is cooled.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Lithium-ion thermal runaway requires sustained cooling — not just knockdown. A single booster tank of 200 gallons is insufficient. You need a continuous water supply (tanker or shuttle) capable of delivering at least 2,000 gallons over an extended period. A solid stream, not fog, delivers water directly into the engine compartment and battery housing for effective cooling. This approach addresses the unique challenge of EV fires: you are fighting a chemical reaction that can reignite for hours without adequate cooling. Requesting the tanker early, before you commit to attack, is the right incident management decision.',
            },
          },
          {
            id: 'c',
            text: 'Use Class D extinguishing powder (sodium chloride or graphite) from the engine to suppress the lithium-ion reaction.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Class D extinguishing agents are designed for metal fires (magnesium, potassium, etc.), not for lithium-ion batteries. While some facilities use specialized battery suppression systems, the standard fire service approach for EV lithium-ion thermal runaway is sustained water cooling. Class D powder on a lithium battery fire is ineffective and can create additional hazards by coating the scene. Water is the appropriate suppression agent for this scenario.',
            },
          },
          {
            id: 'd',
            text: 'Advance a fog line to suppress the smoke and improve visibility inside the garage, then assess if fire is still present.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Fog lines are good for knockdown visibility in conventional structure fires, but they don\'t provide the sustained cooling that EV battery thermal runaway requires. Additionally, you\'re making your crew enter an enclosed space with active thermal runaway to "assess" — that\'s premature commitment before intelligence gathering. The better approach: request sustained water supply first, attack with a solid stream from a safer distance or from outside the structure.',
            },
          },
        ],
      },

      {
        id: 'ev3',
        title: 'Scene 3 of 4 — Exposure Protection & Structural Integrity',
        situation: 'Your attack crew is applying sustained water to the Tesla engine compartment via a solid stream from outside the garage. Water is pooling in the garage and beginning to flow out under the garage door. The fire appears to be cooling, but your crew notices that the shared wall between the garage and the main house is becoming warm to the touch (above the drywall). The neighboring duplex (15 feet away) has windows facing the garage side. What is your priority action?',
        choices: [
          {
            id: 'a',
            text: 'Continue attacking the EV fire, establish water drainage channels to prevent pooling, and station a crew member with a temperature sensor to monitor the shared wall at intervals.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Monitoring the wall is good awareness — but if the wall is already warm, you\'ve waited too long to react. The better action is proactive exposure protection: position a secondary line charged and ready to protect the interior side of the shared wall from inside the main house, and alert the neighboring residents to evacuate as a precaution. Monitoring without backup suppression is insufficient when exposures are at risk.',
            },
          },
          {
            id: 'b',
            text: 'Stop the primary attack momentarily, position a secondary crew to enter the main house and establish a fog line along the interior side of the shared garage wall, then resume vehicle attack once interior exposure protection is in place.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. A warm shared wall indicates heat transfer from the garage into the structure. Your priority is to protect that exposure from the inside. Positioning an interior crew with a fog line (not attacking aggressively, but ready to suppress any fire that breaks through the drywall) gives you defensive depth. Once interior protection is established, resume the primary attack on the vehicle. This dual-action approach protects life safety and the main structure while still fighting the vehicle fire. The neighboring duplex should also be alerted for precautionary evacuation.',
            },
          },
          {
            id: 'c',
            text: 'Assume the drywall will hold and focus all resources on the EV attack. The wall is just getting warm, not burning.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A warm shared wall is not a neutral observation — it is a warning sign of heat transfer that can ignite drywall from inside the house. Garage fires, especially EV thermal runaway with sustained heat production, are a known cause of secondary fires in attached structures. Ignoring the warning sign and betting on the drywall is a life safety failure. The structure fire risk in the main house is as important as the vehicle fire in the garage.',
            },
          },
          {
            id: 'd',
            text: 'Immediately evacuate the main house and abandon the attack to focus all resources on preventing the fire from spreading through the shared wall.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Full evacuation of the house is reasonable as a precaution — but abandoning the vehicle attack is not necessary. You have adequate resources (two engines, a ladder truck) to simultaneously cool the vehicle AND protect the shared wall from inside the house. Interior protection and continued exterior attack are not mutually exclusive. Abandoning the attack allows the vehicle fire to continue producing heat indefinitely, making the wall exposure threat even greater.',
            },
          },
        ],
      },

      {
        id: 'ev4',
        title: 'Scene 4 of 4 — Extended Monitoring & Re-ignition Risk',
        situation: 'The visible fire in the Tesla is extinguished. Water has been applied continuously for 45 minutes, and the garage is cool. Your crew wants to pack up. However, you are aware that lithium-ion battery packs can experience delayed re-ignition and thermal runaway 12-24 hours after apparent suppression. A tanker is still on scene. What is your decision on scene clearance and monitoring?',
        choices: [
          {
            id: 'a',
            text: 'Clear the scene after confirming no visible smoke or flame. Advise the homeowner to call 911 immediately if smoke reappears.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Clearing the scene after 45 minutes of attack on a lithium-ion thermal runaway fire is premature. Battery packs can store residual heat inside the cell structure and reignite hours later without warning. Telling the homeowner to "call back if smoke appears" is a poor risk management strategy — by the time smoke is visible, an interior re-ignition could already be consuming the structure. EV fires require extended on-scene monitoring or a planned re-inspection protocol.',
            },
          },
          {
            id: 'b',
            text: 'Leave Engine 8 on scene with a charged line and one crew member with thermal imaging to monitor the vehicle for 2 hours, then conduct a final walkdown before clearing.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Extended monitoring with thermal imaging allows you to detect any residual heat or re-ignition risk before the crew completely demobilizes. A 2-hour watch period (or longer, depending on local protocols) is appropriate for EV battery thermal runaway incidents. If no reignition occurs during monitoring, a final walkdown with thermal imaging confirms the battery pack is cooled. This approach balances operational efficiency with the known risk profile of EV fires and protects the main structure and exposures.',
            },
          },
          {
            id: 'c',
            text: 'Leave two firefighters with the homeowner overnight to monitor the garage continuously for 12 hours.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Stationing crew members for 12 hours of continuous watch is operationally excessive and poor resource management. A 2-4 hour monitoring period with thermal imaging is more practical and still addresses the re-ignition risk. If conditions warrant longer monitoring, arrange for a follow-up inspection the next day rather than maintaining a crew on scene overnight.',
            },
          },
          {
            id: 'd',
            text: 'Disconnect the Level 2 charger from the vehicle and leave the garage door open to allow air circulation, then clear the scene.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Disconnecting the charger and opening the garage is reasonable to prevent re-activation of charging — but neither action addresses the core risk, which is residual heat inside the battery pack. Fresh air circulation in an open garage will not cool a thermally damaged lithium-ion battery pack efficiently. You still need sustained water cooling or on-scene thermal monitoring. Disconnecting and opening are supportive actions, but they do not replace proper EV fire protocol.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Lithium-ion EV battery thermal runaway requires identification and immediate escalation — do not use standard vehicle fire tactics. Confirm vehicle type with the homeowner before sizing up.',
        'EV battery fires demand sustained water cooling (2,000+ gallons minimum), not brief fog patterns. Request tanker or water shuttle early, before committing to attack.',
        'In attached garage fires, establish interior exposure protection (secondary crew with fog line) on the shared wall before or during exterior attack.',
        'Lithium-ion batteries can experience delayed re-ignition 12-24 hours after apparent suppression. Maintain thermal monitoring and on-scene presence for at least 2-4 hours.',
        'Always confirm all building occupants have evacuated. In attached garage scenarios, have neighboring properties evacuate as a precaution.',
        'EV fires in residential garages are a growing risk — familiarize your department with EV suppression tactics, thermal imaging protocols, and post-fire monitoring procedures.',
      ],
      references: ['NFPA 1680 (Standard on Operations and Firefighting Personnel Safety)', 'Tesla Safety Bulletin — Battery Thermal Events', 'SAE J3150 (EV Fire Extinguishment Practices)', 'NJ Fire Code — Chapter 3 (Use and Occupancy), Garage Provisions'],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 3. ELEVATOR ENTRAPMENT / TECHNICAL RESCUE
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'technical-rescue-elevator',
    title: 'Elevator Entrapment & Technical Rescue',
    description: 'Four occupants trapped in an elevator at a Newark office building; one reports chest pain. Manage building coordination, power isolation, manual override, and patient assessment.',
    category: 'MVA / Technical Rescue',
    difficulty: 'Foundational',
    estimatedMinutes: 20,
    creditHours: 1.0,
    passingScore: 60,
    icon: '🛗',
    badgeColor: 'bg-blue-100 text-blue-700',

    setup: {
      dispatch: 'DISPATCH: Engine 3, Ladder 5, Rescue 1 — respond to 100 Broad Street, Newark, for a reported elevator entrapment. Occupants trapped between floors, one reports chest discomfort.',
      narrative: 'You arrive at 100 Broad Street, a 15-story class A office building in downtown Newark at 13:22 on a Wednesday afternoon. Building security meets you in the lobby and reports: "Elevator 3 (of four) lost power about 5 minutes ago. We have four people inside — they called the main desk. One of them says she\'s having chest pain. Elevator is stuck between the 8th and 9th floors." The building engineer is en route to the elevator machine room. Your crew has equipment for manual elevator override and rescue operations.',
      details: [
        'Building: 15-story class A office building (Newark), built 1995, four passenger elevators, each car capacity 2,500 lbs (14 persons typical)',
        'Elevator status: Elevator 3 lost power (cause unknown), stuck between 8th and 9th floors, approximately 40 feet above ground',
        'Occupants: 4 adults, one female reporting chest discomfort/mild pain, three others stable',
        'Building power: Main electrical panel in basement, backup generator available, all elevators have manual override capabilities',
        'Building engineer: David Chen, licensed elevator technician, on-site within 5 minutes',
        'Elevator car design: Standard traction elevator with call buttons, emergency intercom, alarm bell, standard car size (~7\'x9\'), ventilation adequate',
      ],
    },

    scenes: [
      {
        id: 'tech1',
        title: 'Scene 1 of 4 — Initial Assessment & Occupant Communication',
        situation: 'You are in the lobby. The elevator call button light on Elevator 3 is dark (no power). You can hear faint voices from inside the car. Building security is asking if you want them to activate the emergency intercom to reassure the occupants, or if you want to establish direct communication from the elevator machine room first. One of the occupants has chest pain. What is your immediate action?',
        choices: [
          {
            id: 'a',
            text: 'Activate the emergency intercom immediately to establish direct communication with the occupants, reassure them, and gather details on the patient\'s condition.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Direct communication with trapped occupants is a life safety priority. The intercom allows you to calm the occupants, gather critical information about the patient\'s symptoms (is she conscious? responsive? pain severity?), and establish a rapport that helps manage panic. From the intercom, you can also request they avoid physical exertion and stay calm, which is important for the patient with chest discomfort. Establishing communication takes 30 seconds and provides invaluable intel for your rescue plan.',
            },
          },
          {
            id: 'b',
            text: 'Go directly to the machine room to assess power and override options before communicating with the occupants — communication can wait until you understand your technical options.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'While understanding your technical options is important, abandoning occupant communication to focus on machinery is the wrong priority order. Occupants in an elevator are in distress and uncertainty amplifies panic. A brief communication to reassure them and assess the patient\'s condition is faster and more critical than your machinery assessment. You can do both — but communication comes first.',
            },
          },
          {
            id: 'c',
            text: 'Request the building engineer meet you at the machine room to assess power and override before communicating with occupants.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Having the building engineer assess options is necessary — but delaying occupant communication while you wait for or conduct that assessment is poor prioritization. The occupants need reassurance and the patient needs assessment now. Communicate first via the lobby intercom (takes seconds), then move to the machine room. Do both in parallel: establish communication while you or another crew member heads to the machine room.',
            },
          },
          {
            id: 'd',
            text: 'Dispatch EMS directly to the 8th floor landing in case the patient has a cardiac event and needs immediate treatment.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'EMS should definitely be notified and ready — but stationing EMS on the 8th floor landing without knowing the patient\'s actual condition or when the patient will be removed is premature and spreads EMS thin. First, communicate with the occupants to assess the patient\'s actual condition (is it truly a cardiac event or anxiety/indigestion?). The patient is currently safe inside the elevator. Once you have confirmed the condition and have a timeline for extraction, then position EMS appropriately.',
            },
          },
        ],
      },

      {
        id: 'tech2',
        title: 'Scene 2 of 4 — Building Engineer Coordination & Power Isolation',
        situation: 'Through the intercom, you confirm the patient is a 56-year-old female with mild chest discomfort, short of breath, conscious and alert. The building engineer (David Chen) has arrived at the elevator machine room. He reports: "The elevator lost power because the main breaker for the elevator system tripped. I can reset it, but I want to confirm there\'s no short circuit in the car before I restore power. I can also manually operate the override to bring the car to the 8th floor landing." What is your decision on power management?',
        choices: [
          {
            id: 'a',
            text: 'Have the engineer immediately restore power to the breaker so the elevator can operate normally and bring occupants down without manual override.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Restoring power to a tripped breaker without investigating why it tripped is dangerous. A short circuit or electrical fault could have caused the trip. Restoring power could trigger a fire, electrocute the occupants, or cause the elevator to move unpredictably. The engineer\'s caution is appropriate. You must confirm the cause of the power loss before restoration. Manual override is the safer option while investigation continues.',
            },
          },
          {
            id: 'b',
            text: 'Approve the engineer\'s proposal: use manual override to bring the car to the 8th floor landing, isolate the breaker (do not restore power), and prepare for a manual rescue from the 8th floor.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Using manual override respects the engineer\'s legitimate concern about the cause of the power loss. Manual override moves the car to the 8th floor landing (where it is only 10-15 feet above the 8th floor level) without restoring power. Once at the 8th floor, you can manually open the elevator doors and the car gate, and assist occupants out to the landing. This is the standard procedure for elevator entrapment when power integrity is questionable. Manual override is a standard feature on modern elevators for exactly this reason.',
            },
          },
          {
            id: 'c',
            text: 'Isolate the breaker permanently and wait for an elevator service technician from the company to arrive before taking any further action.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Waiting for an external contractor is passive incident management when you have a licensed building engineer on scene and a patient with chest discomfort in the car. The building engineer (David Chen) is likely a certified elevator technician and can perform manual override. Manual override doesn\'t require the manufacturer — it\'s a standard feature that firefighters and building engineers can operate. Waiting extends the occupants\' entrapment unnecessarily.',
            },
          },
          {
            id: 'd',
            text: 'Have the engineer restore power and use electrical power to bring the car down normally, while you position EMS at the 1st floor to receive the patient immediately.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Restoring power to a tripped breaker without investigation is the same risk as in choice (a). You do not know why the breaker tripped. The engineer\'s hesitation is a red flag that should be heeded. Additionally, positioning EMS to receive the patient at the 1st floor assumes you can control the descent — but if power restoration causes an electrical issue, you could lose control or create a hazard. Manual override is the safer approach.',
            },
          },
        ],
      },

      {
        id: 'tech3',
        title: 'Scene 3 of 4 — Manual Override & Door Opening',
        situation: 'The engineer has manually moved Elevator 3 to the 8th floor landing. The car is now at approximately the same level as the 8th floor. However, both the elevator doors (outer doors) and the car gate (inner gate) are mechanically stuck — likely because the power loss left the lock mechanism in a partially energized state. The engineer can use a manual key override for the outer doors, but the car gate requires manual prying. One occupant in the car is becoming increasingly anxious. What is your action?',
        choices: [
          {
            id: 'a',
            text: 'Have the engineer use the manual key override to open the outer doors, then use a pry bar to manually open the car gate. Position your crew to assist occupants out of the car to the landing.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. Manual key override for the outer doors is the standard procedure — that\'s what it exists for. Prying the car gate open is a safe, straightforward technique when the power-operated latch is stuck. Once both barriers are open, your crew assists occupants one at a time from the car to the 8th floor landing. The anxious occupant benefits from calm crew presence and clear direction. This is textbook manual elevator rescue procedure.',
            },
          },
          {
            id: 'b',
            text: 'Wait for the elevator service company to arrive with proper tools to open both doors. Do not attempt manual override — it could damage the equipment.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Elevators are designed to be manually overridden in emergencies. The manual key override for outer doors is a standard feature — using it is not damage; it\'s the intended procedure. Waiting for an external service company to arrive while occupants remain trapped (especially one with chest discomfort) is poor incident management. You have the tools and knowledge to perform safe manual rescue without waiting. "Do not damage the equipment" is secondary to "rescue the occupants now."',
            },
          },
          {
            id: 'c',
            text: 'Position your ladder truck outside the 8th floor windows to extract occupants through a window instead of using the elevator doors.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Window extraction from the 8th floor is exponentially more dangerous and more complex than opening elevator doors. You would need to access the windows, break them (if necessary), position a ladder at the 8th floor level, and extract occupants one at a time in a very exposed configuration. This is a last-resort option only if the elevator car itself is on fire or if the doors cannot be opened by any reasonable means. The elevator doors and car gate can be opened with manual overrides — that is the correct solution.',
            },
          },
          {
            id: 'd',
            text: 'Ask the anxious occupant to calm down, assure them help is on the way, and spend 10 minutes trying to communicate the situation before opening any doors.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Calm communication is important — but once you have communication established and have a clear plan to rescue the occupants (manual override + prying), executing the rescue immediately is better than prolonging their entrapment. Extended waiting increases anxiety. Quick, confident action to open doors and extract occupants is more reassuring than promises to "help is on the way." The occupants need to see your crew taking decisive action.',
            },
          },
        ],
      },

      {
        id: 'tech4',
        title: 'Scene 4 of 4 — Patient Assessment & Extraction',
        situation: 'All four occupants have been successfully extracted from the elevator car to the 8th floor landing. The patient (56-year-old female with chest discomfort) is now on the landing with your crew. She is conscious, alert, and breathing normally, but she still reports chest pressure and mild shortness of breath. EMS is en route (2 minutes away). Your Rescue 1 crew has her sitting down and has placed her on oxygen. What is your next priority action?',
        choices: [
          {
            id: 'a',
            text: 'Perform a full physical examination (vital signs, EKG, etc.) and treat any findings while waiting for EMS to arrive.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Firefighters are not paramedics. Full vital sign assessment and EKG interpretation are beyond firefighter scope of practice in most jurisdictions. Your role is to position the patient safely, provide oxygen if trained and equipped to do so, keep them calm, and prepare them for EMS handoff. Over-treating or over-assessing can create liability and delays. Focus on: oxygen, positioning, reassurance, and a clear handoff report to EMS when they arrive.',
            },
          },
          {
            id: 'b',
            text: 'Place the patient in a recovery position, ensure adequate oxygen delivery, keep her calm and warm, and prepare a concise handoff report (age, symptoms, timeline, oxygen status) for EMS arrival.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. You are providing supportive care, not diagnosis. Recovery position (if she is stable and conscious), oxygen, warmth, and calm presence are exactly what a patient with chest discomfort needs from firefighters. A clear handoff to EMS with vital information (age 56, chest pressure and SOB post-entrapment, alert, on oxygen) gives EMS the context they need to assess and treat. This is appropriate scope and appropriate care.',
            },
          },
          {
            id: 'c',
            text: 'Reassure the patient that she\'s just having anxiety from the elevator entrapment and that she\'ll be fine. No need to transport her if she refuses.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Never downplay or dismiss chest discomfort and shortness of breath, regardless of the cause. Anxiety from entrapment is possible — but you cannot diagnose that on scene. Chest pressure in a 56-year-old is a cardiac concern until proven otherwise. Transport refusal is the patient\'s right, but your role is to strongly recommend EMS evaluation and clearly document her condition and your recommendation. Do not assume it\'s "just anxiety."',
            },
          },
          {
            id: 'd',
            text: 'Ask the patient if she wants to walk down the stairs or take another elevator to ground level to avoid repeat entrapment trauma.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A patient reporting chest discomfort and shortness of breath should not be exerting herself by climbing stairs. Additionally, she is in the care of firefighters and EMS — the decision on transport method is not hers to make lightly. EMS will evaluate her condition and determine if she can safely walk or if she needs a stretcher. Your job is to provide care and facilitate EMS transport, not to delegate decisions to a potentially compromised patient.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Occupant communication via elevator intercom is the first priority — reassure, gather patient information, and manage panic. Do not delay communication to assess technical options.',
        'Never restore power to a tripped elevator breaker without investigating the cause of the trip. Manual override is the safer option when power integrity is questioned.',
        'Manual key override for elevator outer doors is a standard firefighter procedure — use it confidently. Manual prying of car gates is appropriate when power-operated latches are stuck.',
        'Firefighter role in elevator rescue is supportive care and extraction, not full medical assessment. Position patient safely, provide oxygen, keep them calm, and prepare clear handoff to EMS.',
        'Chest discomfort post-entrapment should never be dismissed as "just anxiety." Recommend transport and clear documentation of symptoms and your assessment.',
        'Building engineers with elevator certification can assist with manual override procedures. Confirm their credentials and coordinate actions clearly.',
      ],
      references: ['NFPA 1670 (Rescue Operations)', 'ASME A17.1 (Elevator Safety Code)', 'NJ Building Code — Chapter 30 (Elevators and Conveying Systems)', 'IFSTA Rescue Essentials', 'AHA Guidelines for EMS (Chest Discomfort Assessment)'],
    },
  },

// ══════════════════════════════════════════════════════════════════════
  // 1. EXPERT: MULTI-ALARM COMMERCIAL WITH COLLAPSE INDICATORS
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'expert-commercial-collapse',
    title: 'Expert: Multi-Alarm Commercial with Collapse Indicators',
    description: 'Legacy mill building. Interior crews are committed and searching when you notice collapse indicators — sagging truss, wall lean, mortar deterioration. Do you pull everyone immediately, losing search for confirmed trapped, or maintain limited interior with monitoring?',
    category: 'Structural Firefighting',
    difficulty: 'Expert',
    estimatedMinutes: 30,
    creditHours: 1.0,
    passingScore: 70,
    icon: '🏚️',
    badgeColor: 'bg-red-100 text-red-800',

    setup: {
      dispatch: 'DISPATCH: Engine 8, Ladder 3, Rescue 2 — multi-alarm structure fire at 247 River Road, former textile mill. Two-alarm assignment. Heavy smoke visible from street.',
      narrative: 'You are the Incident Commander. It is 22:47 on a cold November night. The building is a 4-story brick mill constructed in 1892, approximately 120,000 square feet. Heavy dark smoke issues from the north wall (Side A). Flames are visible on the second floor. Your first-alarm companies have committed crews: Engine 8 interior attack on Floor 2, Ladder 3 conducting a primary search in the southeast corner where a worker reported a colleague trapped during evacuation. Your crews have been interior for 8 minutes. Mutual aid is 12 minutes out. You are standing at the command post (Side C, rear of structure) when your Safety Officer pulls you aside and says: "I am concerned about this building. Look at the northeast corner — that brick is deteriorating badly. And the roof line on the fire side appears to sag about 3 feet compared to the opposite corner. The truss beneath that sag is stressed. I think we need to reconsider committing crews."',
      details: [
        'Structure: 4-story brick mill, 1892, wood-frame floor and roof construction (lightweight trusses likely)',
        'Occupancy: Industrial — 3 workers reported inside during evacuation, one confirmed trapped in southeast corner Floor 2',
        'Fire location: Heavy smoke and flame on Side A (north), Floor 2, appearing to spread vertically',
        'Crews interior: Engine 8 (3 personnel) conducting attack Floor 2 Side A, Ladder 3 (4 personnel) conducting primary search Floor 2 southeast',
        'Visible collapse indicators: Northeast corner brick mortar spalling, roof line sagging approximately 3 feet on fire side, possible truss distress',
        'Weather: 38°F, calm, low humidity',
        'Access: Limited to Sides B and C due to surrounding buildings; heavy traffic on River Road',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 5 — Recognition of Collapse Risk',
        situation: 'Your Safety Officer is pointing out collapse indicators: sagging roof line, deteriorated mortar on the northeast corner, and what appears to be deformation in the brick wall on the fire side. Engine 8 reports they are making progress on the fire — they have darkened the interior. Ladder 3 reports they are 4 minutes into their primary search and have found no victim yet. You have approximately 6-7 minutes before the second alarm arrives. What is your immediate assessment action?',
        choices: [
          {
            id: 'a',
            text: 'Conduct a rapid exterior collapse assessment with your Safety Officer: photograph/document the northeast corner and roof line, check for cracks in the brick, and communicate findings to crew officers interior. Do not pull crews yet — gather intelligence first.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert decision. Before making a potentially life-or-death command, you need to confirm the seriousness of what you are seeing. A rapid 2-3 minute assessment with photographs, checking for active cracks (vs. pre-existing deterioration), and observing the roof line more systematically gives you facts. You then communicate with the officers interior: "Be advised, I am seeing possible structural distress. Continue operations but accelerate your activity and stay alert for movement or sound." This respects both the search priority and the emerging risk. NFPA 1500 requires the IC to conduct ongoing size-up, including structural integrity assessment. You cannot order a crew out based on a gut feeling — you need confirmation.',
            },
          },
          {
            id: 'b',
            text: 'Immediately order Engine 8 and Ladder 3 to exit the structure with the discovered victim (if found). Radio: "All interior crews, evacuate to the exterior immediately due to suspected structural compromise."',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is the safe-sounding but ultimately wrong answer for an expert officer. You are pulling crews and terminating a confirmed victim search based on a Safety Officer\'s concern and a roof line that MAY be sagging. The crews have not reported any structural distress sounds — no cracking, no popping, no movement. If you order an evacuation and there is no collapse, and a civilian dies in a room 20 feet from where Ladder 3 was searching, you have made an irreversible decision based on incomplete information. Expert command requires balancing life safety against crew safety with evidence, not reaction. You are also creating chaos in a committed crew by ordering a sudden evacuation with incomplete communication.',
            },
          },
          {
            id: 'c',
            text: 'Pull Engine 8 immediately (fire is knocked down anyway), but allow Ladder 3 to continue the search since they have not reported any structural issues.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'This is a compromise, and it is partially reasonable — but it is half-measures in the worst way. If the collapse risk is real, splitting the crews does not help Ladder 3. If it is not real, you have wasted Engine 8\'s resources by pulling them when they could be supporting the search from the stairwell or conducting secondary search on Floor 3. Either commit to full evacuation (with evidence) or maintain both crews with heightened alert. Splitting crews under collapse risk to preserve the search is not a valid compromise.',
            },
          },
          {
            id: 'd',
            text: 'Contact the building engineer or property owner via police liaison to ask if the roof sag and wall distress are pre-existing (normal for a 130-year-old building) or new. Base your crew decision on their answer.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'While information is valuable, you do not have time for a building engineer interview at 22:47. The property owner may not even answer. More critically, a 130-year-old industrial building with visible mortar spalling and roof sag may have ALWAYS been in questionable condition — that does not mean it is safe for crews to operate inside during a fire. Your assessment is based on current conditions and fire intensity, not historical building status. Make the decision based on what you observe now.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 5 — Crew Withdrawal with Confirmed Trapped Civilian',
        situation: 'You and your Safety Officer complete a rapid assessment. You observe a visible vertical crack in the northeast brick (new, not filled), the roof line sag is real (approximately 2.5 feet), and you notice a faint popping sound when the wind gusts. At the same moment, Ladder 3 radios: "Ladder 3 to Command — we have located one victim, Floor 2 southeast corner. Male, conscious, can move slowly. We are bringing him out now. ETA to Side C entrance: 3 minutes." Engine 8 is still interior on the attack line, Side A. Second alarm is 4 minutes out. What is your action?',
        choices: [
          {
            id: 'a',
            text: 'Radio to all interior crews: "All companies be advised, I am observing signs of structural distress. Accelerate your operations and prepare to exit to the exterior immediately. Ladder 3, maintain your removal. Engine 8, knock down remaining fire and prepare to exit." Prepare RIC at the stairwell exit on Side C.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is command under pressure. You have confirmed structural concern (vertical crack, roof sag, popping sounds). You have a live victim being removed and an attack crew interior. The correct action is: (1) alert all crews of the structural concern without creating panic, (2) maintain the Ladder 3 removal (you cannot stop them mid-way), (3) order Engine 8 to complete their immediate fire knockdown and exit, (4) position a rescue team at the stairwell in case either crew needs immediate assistance. You are NOT ordering a mass evacuation — you are giving crews time-critical information that will increase their operational pace. This respects both the victim removal and the crew safety concern. By the time Engine 8 can complete their action, the second alarm will be arriving and you will have a stronger defensive posture.',
            },
          },
          {
            id: 'b',
            text: 'Immediately order all crews to exit NOW, including Ladder 3. Sacrifice the victim recovery to ensure crew safety — do not let crews become trapped.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are ordering a crew to drop a live, conscious victim three floors up and exit a burning building mid-rescue. This decision is irreversible and catastrophic. If the building does not collapse, you have left a civilian to die. If it does collapse while Ladder 3 is mid-evacuation with the victim, you have made the situation worse. Ladder 3 was already in the stairwell when your structural concern became apparent — they are in the safest part of the building relative to the fire floor. Your job is to support that operation, not terminate it based on fear.',
            },
          },
          {
            id: 'c',
            text: 'Wait for the second alarm to arrive before making any crew decision. Maintain the status quo with Engine 8 and Ladder 3 interior.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Waiting 4 minutes while you have visual evidence of structural distress (active crack, roof sag, popping sounds) is negligent. You have actionable intelligence. You do not order crews to exit immediately, but you also do not delay communication of the risk. Delaying communication forces crews to make decisions blind while structural integrity may be degrading.',
            },
          },
          {
            id: 'd',
            text: 'Radio Engine 8 to continue their attack and finish the fire completely before any crew exits. Tell Ladder 3 to slow their removal to give Engine 8 time to work.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are making a civilian removal slower and forcing an attack crew to work longer in a building you have just assessed as structurally questionable. This prioritizes fire extinguishment over life safety — the opposite of the fireground priority sequence. You have evidence of structural concern and a viable removal in progress. Accelerate operations, do not slow them.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 5 — Debris Field Medical Operations',
        situation: 'As Ladder 3 exits the stairwell with the victim at the Side C entrance, you hear a sharp CRACK and a rumble. The northeast corner of the building (Floors 3-4) collapses inward — brick and mortar into the alley, dust clouds rising. No one is injured, but the collapse is real and violent. Engine 8 was on Floor 2, Side A — the opposite corner from the collapse. They radio immediately: "Engine 8 to Command — we are safe, Fire is knocked down. We are exiting to the stairwell now." The victim removal is complete and the patient is in EMS hands. Your incident has now transitioned: you have a partial structural collapse, crews still interior (Engine 8 exiting), surrounding buildings potentially at risk, and you now have a complex debris field on the south side of the building. Police are establishing a perimeter. The second alarm is pulling up. What is your command priorities in the first 60 seconds?',
        choices: [
          {
            id: 'a',
            text: 'Priority 1: Confirm Engine 8 exits safely and account for all personnel. Priority 2: Establish the collapse debris as a hazard zone (no entry). Priority 3: Request law enforcement to expand the evacuation perimeter to 1.5x the building height on all sides and notify the Fire Marshal and OSHA.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is textbook incident command after a structural collapse. Your life safety priorities are: (1) crews still interior must exit safely — you maintain focus on Engine 8 until they report clear, (2) the debris field must be controlled to prevent secondary collapse or entry by untrained personnel, (3) you activate the investigative and legal framework immediately — Fire Marshal and OSHA notification is mandatory for a structural collapse, and law enforcement perimeter expansion protects surrounding properties and civilians. The National Institute for Occupational Safety and Health (NIOSH) guidance on structural collapse (NIOSH Report 2009-116, "Structural Collapse During Training and Overhaul") emphasizes immediate scene control and investigative notification. You are not yet committing crews to search the collapse debris — you are establishing safety first.',
            },
          },
          {
            id: 'b',
            text: 'Commit your RIT team and second-alarm resources immediately to search the collapse debris for any additional trapped victims or Engine 8 personnel.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You have not yet confirmed where Engine 8 is or whether there are victims in the debris. Rushing crews into an active collapse zone without stabilization is a cascade failure waiting to happen. Collapses often trigger secondary collapses — you could lose more personnel. First, account for all personnel interior. Second, allow the debris to "settle" for a few minutes. Third, bring in heavy equipment and trained rescue teams. Do not make a partial structural collapse worse by committing crews unprepared to enter unstable debris.',
            },
          },
          {
            id: 'c',
            text: 'Focus entirely on documenting the collapse scene with photographs and video for the investigation. This will be crucial evidence.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Documentation is important, but it is not your first priority as IC. Your first priority is life safety (crew accountability), second is scene control (hazard containment), third is preservation of evidence. Focusing on evidence collection before you know where your crews are or whether the perimeter is safe is a misalignment of priorities.',
            },
          },
          {
            id: 'd',
            text: 'Declare this a non-rescuable collapse and transition to a recovery operation. Pull all crews to a safe distance.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'You do not yet know if this is a "non-rescuable" collapse. You have one corner of the building down, but you have not confirmed whether any civilians are trapped in the debris, and Engine 8 has reported safe. Before declaring anything non-rescuable, you must: confirm crew accountability, assess the debris, and determine if a rescue operation is viable. However, the instinct to pull crews to a safe distance is correct — you just need to maintain that stance until you have more information.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 5 — Structural Investigation and Second-Guessing',
        situation: 'Engine 8 reports all personnel clear and safe at the Side C assembly point at 23:04. Police have expanded the evacuation perimeter. The Fire Marshal has been notified and is en route. OSHA has been called. The collapse debris is stable — no secondary collapse. The victim from the building is transported to the regional burn center in stable condition. At 23:15, a NJ State Police investigator approaches you and says: "We are treating this as a potential criminal investigation. There were reports of unpermitted welding work on the third floor yesterday. We need to preserve the scene and prevent unauthorized entry. No fire department personnel should enter the collapse zone until we have completed our investigation — that could take 24-48 hours." Simultaneously, your Fire Marshal says: "I need to get inside the building and determine the fire origin before OSHA shows up. Every hour we wait, evidence degrades." What is your response?',
        choices: [
          {
            id: 'a',
            text: 'Respect both investigations but separate their scope: fire origin investigation occurs in the non-collapsed areas of the building (Sides B, D, Floor 1 basement) with OSHA and Fire Marshal present. The collapse debris zone is law enforcement\'s domain until they clear it. Request that both agencies coordinate on personnel and timeline before any entry.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert answer. A collapse involving potential unpermitted welding is both a fire AND a potential criminal matter. Your role is not to choose between them — it is to manage the scene safely and facilitate both investigations. Fire origin determination is legitimate and time-sensitive. Law enforcement investigation is legitimate and requires scene preservation. But they are investigating different zones and aspects. Establish a unified command with Fire Marshal, OSHA, and State Police. Allow the Fire Marshal to work the non-collapsed zones and determine the fire\'s origin and point of ignition. Allow law enforcement to photograph and document the collapse zone before anyone enters it. Once law enforcement has completed scene documentation (typically 4-8 hours), controlled entry by structural engineers and fire investigators can begin. This respects both investigations and avoids the liability of choosing between them.',
            },
          },
          {
            id: 'b',
            text: 'Prioritize the Fire Marshal\'s investigation. The collapse is a consequence of the fire — fire origin is the root cause. Do not let police investigation delay the fire origin determination.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Fire origin is important, but a collapse involving unpermitted welding is a potential criminal act (criminal negligence, building code violation, etc.). You cannot unilaterally decide that one investigation takes precedence over the other. If you allow the Fire Marshal to work the collapse zone and destroy evidence of criminal conduct, the state police will rightly question your authority. The collapse zone is NOT the fire origin zone in this case — they are separate questions. The fire origin can be determined in the non-collapsed portions of the building while police document the collapse.',
            },
          },
          {
            id: 'c',
            text: 'Close the entire scene to all investigations for 24 hours. Allow the debris to fully settle and ensure no secondary collapses occur. Everyone — Fire Marshal, OSHA, police — can begin work tomorrow.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'While scene stabilization is important, a 24-hour delay is excessive and prevents necessary investigation. Law enforcement needs to photograph and document the collapse NOW, while it is fresh. Fire investigators need to work the non-collapsed zones while evidence is accessible. A better approach is a phased response: immediate law enforcement documentation, then structured fire investigation in stable zones, then controlled collapse zone entry. Waiting a full day delays critical information gathering.',
            },
          },
          {
            id: 'd',
            text: 'Tell both agencies that this is YOUR fire scene and you will coordinate all access. No state police investigation can occur without your approval.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is an overreach of your authority. You are the IC of the fire suppression operation, but you do not have unilateral authority over a criminal investigation or OSHA investigation. NJ State Police have the legal authority to investigate potential criminal conduct on the scene. OSHA has the legal authority to investigate the cause of the collapse and the building\'s structural deficiency. Your role is to manage the fire suppression scene safely and facilitate the necessary investigations through unified command, not to restrict law enforcement\'s access.',
            },
          },
        ],
      },

      {
        id: 's5',
        title: 'Scene 5 of 5 — Post-Incident Review and Accountability',
        situation: 'Three days later, you are in a debrief with your chiefs and the Fire Marshal. The investigation has revealed: (1) the collapse was caused by unpermitted welding that weakened a load-bearing brick pier on the third floor, (2) the welding was done the previous day by a contractor without approval, (3) the fire started in an adjacent room and spread, heating the weakened pier and causing the collapse, (4) the building had 50+ code violations and should have been condemned months earlier, (5) a structural engineer reports that the roof sag you observed was pre-existing and not indicative of imminent collapse — the collapse was triggered by the fire heating the already-weakened pier. One chief says: "You made the right call pulling crews before the collapse happened, but you got lucky. The roof sag wasn\'t actually the problem. We need to know: should we have pulled earlier, or was your decision correct?" A board member asks: "Should the Fire Department have condemned this building? Could we have prevented this collapse through code enforcement?" What is your honest assessment?',
        choices: [
          {
            id: 'a',
            text: 'Your collapse recognition decision was sound based on available intelligence at the time. The roof sag, mortar deterioration, and popping sounds were legitimate concerns even if they were not the ultimate cause. You made the best decision with imperfect information, which is the mark of expert command. However, the pre-fire building violations should have been escalated by the Fire Department months earlier through an integrated code enforcement program. This is a systemic failure, not an IC failure.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert debrief answer. You are defending your fireground decisions (which were sound) while acknowledging the larger systemic failure. NFPA 1 and NJ Fire Code require regular building inspections and violation tracking. The 50+ code violations in a 130-year-old mill should have triggered escalating enforcement — condemnation, reinspection, court involvement. The Fire Department\'s code enforcement program failed to prevent a hazardous condition. Your IC decision was correct at the time — you observed signs of distress and managed crew safety accordingly. But the real lesson is that prevention and code enforcement are more effective than fireground decision-making. The NIOSH report on the 2011 Philadelphia Warehouse Collapse (which involved similar violations and led to the "Philadelphia Type" collapse assessment) emphasizes that building violations discovered during code enforcement can prevent fireground disasters. You owned your IC responsibility; now own the institutional responsibility for code enforcement.',
            },
          },
          {
            id: 'b',
            text: 'You got lucky. The roof sag was not the problem, so your collapse concern was misplaced. You should have allowed crews to continue interior operations and let the fire burn longer. The collapse would have happened anyway, but you would have had more time for the search and attack.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is dangerously false reasoning. You do not know at incident time that the roof sag is "not the problem." The roof sag, mortar spalling, and popping sounds are legitimate collapse indicators in a fire environment. The fact that the ACTUAL failure was caused by hidden welding damage does not mean your observation of structural distress was wrong. You made the correct call with the information available. Do not second-guess good fireground decision-making because the ultimate failure had a different root cause.',
            },
          },
          {
            id: 'c',
            text: 'You should have pulled all crews immediately upon seeing any collapse indicators. Waiting to confirm the level of risk was irresponsible. The victim rescue was lucky to succeed — if the building had collapsed 2 minutes earlier, Ladder 3 would have been trapped.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is over-correction driven by hindsight. You assessed the risk, communicated it to crews interior, accelerated operations, and maintained the victim rescue. Immediate evacuation based solely on roof sag in a 130-year-old building would be a hair-trigger response that would endanger crews and abandon confirmed victims on every pre-existing structural deficiency in an old industrial area. Your measured response — assess, confirm, communicate, accelerate — is the expert approach.',
            },
          },
          {
            id: 'd',
            text: 'The building should have been condemned, but the Fire Department is not responsible for code enforcement. That is the Building Department\'s job. Fire should not have to inspect or report violations.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'This is legally and practically incorrect. NJ Fire Code (NJAC 5:23-2.1) explicitly gives the Fire Department authority and responsibility to inspect buildings for fire code compliance and to report violations to the building official and judicatory. Fire and Building Departments are separate but complementary. If the Fire Department knows of 50+ violations and does nothing, you have abdicated responsibility. The integration of fire and building code enforcement is what prevents disasters. NFPA 1 emphasizes that fire services have a role in building lifecycle management.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Structural assessment is ongoing. Observe carefully: roof sag, mortar spalling, unusual sounds, and deformation are legitimate collapse indicators even in old buildings.',
        'Alert crews to risk without panic. "Be aware and accelerate" is not the same as "evacuate immediately." Crews need time-critical information to manage their own risk.',
        'A partial collapse is not necessarily a non-rescuable collapse. Confirm crew accountability, assess debris stability, and sequence rescue operations carefully.',
        'Structural collapse investigation is both a fire AND potentially a criminal matter. Use unified command to separate scope: fire origin vs. collapse cause.',
        'Code enforcement and building inspections are preventive fireground command. An integrated code program prevents collapses more effectively than fireground decisions manage them.',
      ],
      references: [
        'NIOSH Report 2009-116: Structural Collapse',
        'NIOSH Philadelphia Warehouse Collapse (2011)',
        'NFPA 921 (fire investigation)',
        'NFPA 1 (fire code)',
        'NJ Administrative Code 5:23-2.1 (fire code authority)',
        'ICS-300 (unified command)',
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 2. EXPERT: SIMULTANEOUS MAYDAY AND CIVILIAN RESCUE
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'expert-dual-mayday-rescue',
    title: 'Expert: Simultaneous Mayday and Civilian Rescue',
    description: 'Confirmed civilian rescue in progress on Floor 2. Mayday from firefighter on Floor 3 — simultaneously. RIT is deployed but you only have one team. Radio traffic is overwhelming. A second alarm is 8 minutes out. Who do you save when you cannot save everyone?',
    category: 'Firefighter Safety',
    difficulty: 'Expert',
    estimatedMinutes: 30,
    creditHours: 1.0,
    passingScore: 70,
    icon: '⚠️',
    badgeColor: 'bg-red-100 text-red-800',

    setup: {
      dispatch: 'DISPATCH: Engine 12, Ladder 4, Rescue 1 — structure fire, 4-story apartment building at 890 Oak Street. Occupied building, heavy smoke and fire on Floors 2-3.',
      narrative: 'You are the Incident Commander. It is 03:42 on a Saturday morning. The building is a 4-story residential building (built 1985), occupied. Heavy orange flames and black smoke issue from the east side (Side B) of the building on Floors 2 and 3. Your first-alarm companies are committed: Engine 12 is advancing an attack line from the interior stairwell on Floor 2 to address fire in Apartment 2D. Ladder 4 has initiated a primary search on Floor 2. Rescue 1 has deployed a RIT and is standing by at the stairwell entrance on Side A (the safe side). You have defensive positions established outside the structure. It is now 03:47. Five minutes into the incident.',
      details: [
        'Structure: 4-story, post-1985 construction, standard wood-frame, 8 units per floor',
        'Fire location: Floors 2-3, east side (Side B), Heavy fire in 2D and 3D',
        'Crews committed: Engine 12 interior Floor 2, Ladder 4 conducting search Floor 2, RIT deployed at stairwell',
        'Occupancy: It is 03:47 Saturday morning. Most units likely occupied but sleeping. Evacuation unclear.',
        'Resources: Only Rescue 1 RIT available. Engine 12, Ladder 4 still operating. Second alarm is 8 minutes out.',
        'Environmental: 42°F, calm wind, darkness. Visibility limited.',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 5 — The Double Signal',
        situation: 'At 03:49, Ladder 4 radios: "Ladder 4 to Command — we have located one victim on Floor 2, west end of hallway. Adult, unresponsive but breathing. Starting removal now. ETA to stairwell: 4 minutes." Simultaneously, Rescue 1 (stationed at the stairwell) radios: "Rescue 1 to Command — we have a Mayday! Firefighter down on Floor 3. We heard what sounds like a collapse or a wall failure on the south side of Floor 3. A firefighter is not answering radio calls. RIT is staging for deployment now." The two situations are happening at the same time. You have one RIT team. You have a civilian being removed from Floor 2 down the stairs. You have an unreachable firefighter on Floor 3 with unknown status. What is your first radio transmission and command action?',
        choices: [
          {
            id: 'a',
            text: 'Broadcast on primary channel: "All units, we have a Mayday on Floor 3, firefighter down. Ladder 4, maintain your civilian removal to the stairs — keep the stairwell clear for RIT. Rescue 1, deploy your RIT to Floor 3 immediately. Engine 12, stand by." Then assign a secondary crew to meet Ladder 4 at the stairwell to facilitate the civilian hand-off to EMS.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the critical-incident command decision. You are prioritizing the Mayday (your firefighter) while explicitly protecting the civilian removal in progress. Here is why: (1) Ladder 4 is already in the stairwell with the victim — they are in a protected path and can continue without RIT. (2) The firefighter on Floor 3 is in immediate critical danger (unknown status, collapsed wall, unreachable). (3) The Mayday is a TIME-CRITICAL life safety emergency for one of your own. (4) You have one RIT and you must deploy it to the highest immediate threat. Your communication to Ladder 4 is explicit — "maintain your removal" — so they know NOT to stop or change course. You then immediately support both: RIT goes to the firefighter, a secondary team (perhaps a support crew) goes to assist Ladder 4\'s descent. This is the FDNY/NFPA priority: Mayday is the highest command priority. However, you do not abandon the civilian by stopping the removal already in progress.',
            },
          },
          {
            id: 'b',
            text: 'Order Ladder 4 to STOP the civilian removal and return the victim to the floor. Redirect all resources including RIT to assist Ladder 4 in securing the victim in place, and deploy RIT to the firefighter only after the civilian is fully secured.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is the compassionate-sounding but ultimately catastrophic decision. You are ordering a crew in the stairwell with a live victim to reverse course and re-enter a floor in a burning building to "secure" the victim. This puts more people at risk, wastes critical time that the firefighter on Floor 3 does not have, and trades a mobile victim (who is being actively removed) for a static victim (who is now in danger again). If you tell Ladder 4 "stop," they are now frozen and vulnerable. The Mayday takes absolute priority in incident command. The civilian removal was already in progress — you do not stop a removal that is working.',
            },
          },
          {
            id: 'c',
            text: 'Direct the RIT to the civilian removal point at the stairwell to assist Ladder 4, since a civilian in immediate distress is less complicated to manage than a firefighter with unknown status on an elevated floor.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are rationalizing the easier problem. A Mayday is non-negotiable. An unknown firefighter status on Floor 3 with a collapsed wall is potentially a Mayday-in-progress — the firefighter may be trapped, injured, or dying. A civilian removal in progress in the stairwell is a safer, more controlled situation. RIT must deploy to the Mayday. The civilian removal can be supported by other means (secondary crew assist, EMS at the stairwell entrance).',
            },
          },
          {
            id: 'd',
            text: 'Broadcast: "Ladder 4 and Rescue 1, both operations are critical. Continue as you are. I am calling for an emergency second alarm and additional RIT now." Then wait for mutual aid to arrive before deploying RIT.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Calling for additional resources is correct — you SHOULD request an emergency second alarm. But waiting for mutual aid while a firefighter is potentially dying on Floor 3 is not acceptable. You have RIT on scene NOW. They must deploy now. Yes, you need a second alarm, but you cannot wait for it while your firefighter\'s condition is unknown. The second alarm provides additional resources for ongoing operations, not a backup RIT. Your RIT goes to the Mayday immediately.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 5 — RIT Deployment and Communication Chaos',
        situation: 'You have deployed the RIT to Floor 3. The radio traffic is now intense: RIT is searching for the downed firefighter on Floor 3 (calling out the name, getting no response). Ladder 4 is continuing down the stairs with the civilian, but is reporting slow progress because the stairs are partially obscured by smoke. Engine 12 is asking if they should continue their interior attack or withdraw. Rescue 1 at the stairwell is reporting that the civilian is starting to regain consciousness and is combative/disoriented. A neighbor on the ground is yelling that "they can see another person at a third-floor window." Multiple radio transmissions are happening at once. Your radio operator is asking you for priority. What is your immediate radio discipline action?',
        choices: [
          {
            id: 'a',
            text: 'Establish a "Mayday Priority Channel." Announce: "All units, this is Command. Mayday operations on Frequency 2. All non-emergency traffic on Frequency 1. Engine 12, remain in position, stand by for update. RIT, continue search on Frequency 2 only. Ladder 4, maintain your removal. I need confirmation you copy."',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is expert radio discipline under chaos. The Mayday is consuming all available radio bandwidth and drowning out critical tactical communication. Separating the Mayday RIT operation onto a secondary frequency (which your dispatch center should support) allows: (1) RIT to communicate their search status without competing with other traffic, (2) tactical crews (Engine 12, Ladder 4) to continue operations on a clear primary channel, (3) Command to monitor both channels and make informed decisions. You are not ignoring the Mayday by moving it to a secondary channel — you are PROTECTING the Mayday operation by giving RIT clean communication. You also provide explicit instructions to Engine 12 and Ladder 4 so they do not make independent decisions during the chaos. NFPA 1500 and ICS protocols require radio discipline during emergencies. The third-floor window report is secondary to the Mayday but is noted.',
            },
          },
          {
            id: 'b',
            text: 'Tell everyone to stop transmitting except for RIT. Broadcast: "All units, radio silence except Mayday operations. Stand by." Listen to RIT\'s search alone until they report results.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Radio silence is a blunt tool. While it clears the channel for the Mayday, it blinds you to Engine 12\'s status, Ladder 4\'s progress, and the critical third-floor window report. A better approach is frequency separation, not silence. You need to know if Engine 12 is safe, if Ladder 4 is progressing, and if there is indeed another victim at a window. Radio silence is appropriate for a few minutes in a Mayday, but separating frequencies is more operational.',
            },
          },
          {
            id: 'c',
            text: 'Ignore the chaos and focus solely on the Mayday. Tell all other units to make independent tactical decisions and report only critical updates.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are abandoning command responsibility. Engine 12 needs guidance on whether to continue interior operations. Ladder 4 needs to know their priority is to remove the civilian. The third-floor window report needs assessment. Command must remain engaged with both the Mayday and the broader incident. Ignoring non-Mayday radio traffic is not a solution — managing it is.',
            },
          },
          {
            id: 'd',
            text: 'Request that the police helicopter with its communication system take over coordinating the non-Mayday traffic so your fire department radio is dedicated only to the Mayday.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Police helicopters do not have the ability to coordinate fire department operations, and you do not have time to establish that kind of external support during an active Mayday. You have the tools you need: your dispatch center can put you on a secondary frequency. Use your own dispatch system, not external assets, to solve your radio problem.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 5 — Divided Loyalties and Resource Allocation',
        situation: 'It is now 03:54. Ladder 4 reports: "Civilian removal complete, patient in EMS hands at Side A. Ladder 4 moving to reposition." RIT reports: "RIT to Command, we have located the firefighter on Floor 3, south wall collapse area. Firefighter is unconscious, severe right leg injury, possible entrapment. We are beginning extrication. RIT has approximately 8 minutes of air remaining on their primary member. Second alarm is still 5 minutes out." At the same moment, Engine 12 reports: "Engine 12 to Command, fire on Floor 3 is spreading rapidly. We need support on the attack or we recommend withdrawal." The third-floor window report from the neighbor is still pending verification. Your Ladder 4 is now available and asking: "Where do you need us?" What is your resource allocation decision?',
        choices: [
          {
            id: 'a',
            text: 'Direct Ladder 4: "Proceed to RIT on Floor 3 to assist with firefighter extrication and provide rescue support. This is highest priority." To Engine 12: "Continue interior operations if you can maintain crew safety. Use fire growth as your exit trigger." Maintain watch on the third-floor window and prepare to reassess if the window victim is confirmed.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'You are allocating your best available resource (Ladder 4) to the Mayday rescue operation. Here is the logic: (1) RIT has found the firefighter and is beginning extrication but is low on air — they need tactical support to complete the rescue. (2) Ladder 4 is available and trained. (3) The firefighter is now a confirmed rescue priority (Mayday) — not a potential victim. (4) Engine 12 is managing the fire growth and can self-evacuate if conditions exceed their limits. (5) The third-floor window report is unconfirmed and secondary to the Mayday. You are not abandoning the fire attack — you are acknowledging that a firefighter rescue is now the command priority and allocating your best available crew to that operation. This respects both the Mayday and the ongoing tactical situation.',
            },
          },
          {
            id: 'b',
            text: 'Direct Ladder 4 to support Engine 12 on Floor 3 to knock down the fire immediately. Tell Engine 12: "Ladder 4 is coming up with an additional line. Hold the fire until we can suppress it completely." This reduces the risk environment for RIT.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are prioritizing fire suppression over firefighter rescue. While the logic (reduce heat and hazard for RIT) sounds good, it commits Ladder 4 to fire attack while RIT is in the middle of a low-air extrication on the same floor. You will have three teams (Engine 12, Ladder 4, RIT) competing for space, air, and radio time on the same floor. This creates coordination chaos and wastes Ladder 4\'s resources on fire attack when their best use is extrication support. The fire is important but secondary to the Mayday.',
            },
          },
          {
            id: 'c',
            text: 'Hold Ladder 4 in reserve outside the structure. Tell Engine 12 to withdraw immediately. Wait for the second alarm to arrive with fresh RIT before any further interior operations.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are abandoning the RIT team in the middle of an extrication with low air, 5 minutes from second-alarm arrival. An 8-minute air supply does not wait. The RIT needs support NOW. Ladder 4 is your best available resource. Waiting is not an option when a firefighter is trapped.',
            },
          },
          {
            id: 'd',
            text: 'Direct Engine 12 to cease interior operations and redeploy to assist RIT on Floor 3. This consolidates your interior resources on the Mayday and abandons the fire for now.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'While the Mayday is highest priority, completely abandoning fire suppression while firefighters are interior can create a situation where the fire spreads uncontrolled and traps additional crews or victims. A better approach is to keep Engine 12 engaged but defensive, managing fire growth while Ladder 4 provides RIT support. You do not need to choose between fire and rescue — you balance them.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 5 — Family on Scene Demanding Information',
        situation: 'It is 03:58. Ladder 4 has reached RIT on Floor 3 and is assisting with firefighter extrication. The firefighter is being removed slowly due to the leg entrapment. Second alarm is now 2 minutes out. The firefighter\'s spouse has arrived on scene in civilian clothes, having heard the radio traffic (they monitor the scanner). The spouse is at the police line, visibly panicked, asking police to let them through. Police are holding them back but they are asking you (the IC) if you can "just tell us what is happening to them." Your Safety Officer is trying to manage family presence while maintaining the scene perimeter. What is your immediate action regarding family information and scene management?',
        choices: [
          {
            id: 'a',
            text: 'Assign your Aide or Chief Officer to speak briefly with the family member in a controlled setting away from the main command post. Provide: confirmation that a firefighter has been located and rescued, that EMS is standing by, but NO specifics about injuries. Direct them to the hospital for updated information from EMS. Ensure police maintain the scene perimeter. Do not distract the IC or active operations with family communication.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is compassionate but firm incident command. The family member\'s emotional need is real and legitimate — they have heard a Mayday involving their spouse. However, your job is not to provide real-time medical updates (you do not have them) or emotional support (EMS/hospital is better equipped). You acknowledge the family, provide minimal factual information (someone is being rescued), and direct them to the proper resource (hospital). By assigning an aide/chief officer, you do not distract the IC from active operations. You maintain scene security and protect the operation. The families of firefighters often monitor scanner traffic and show up at scenes — you need a plan for this situation. NFPA 1500 and major fire departments have protocols for family presence on scene. This is expert-level management of a emotional situation.',
            },
          },
          {
            id: 'b',
            text: 'Tell police to keep the family member away from the scene entirely. Do not acknowledge them or provide any information. Maintain operational security and focus on the rescue.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is callous and counterproductive. The family member will not leave and will become more panicked if completely ignored. A brief, humane acknowledgment and direction to the hospital costs you nothing and can prevent scene disruption. Operational security is maintained — you are not compromising any tactical information.',
            },
          },
          {
            id: 'c',
            text: 'Step away from the command post personally and brief the family member on the firefighter\'s condition, the nature of the leg injury, and the exact location of the injury. Provide as much detail as possible so they know what to expect at the hospital.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are abandoning the command post during an active Mayday operation. You do not have detailed medical information (only RIT\'s radio report of "severe leg injury, possible entrapment"). You are not a medical provider and should not be speculating on the severity or prognosis. Direct them to EMS and the hospital. Your place is at the command post.',
            },
          },
          {
            id: 'd',
            text: 'Allow the family member inside the police line to the command post so they can hear the radio traffic and know exactly what is happening in real-time.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This compromises operational security, disrupts the command post with emotional distress, and allows a civilian to be exposed to ongoing risk communication. It also distracts you from command responsibilities. The answer is compassion combined with boundary management.',
            },
          },
        ],
      },

      {
        id: 's5',
        title: 'Scene 5 of 5 — Incident Debrief and Ethical Reflection',
        situation: 'It is 04:12. The firefighter has been successfully removed from Floor 3 with RIT and Ladder 4 assistance. The firefighter is transported to the regional trauma center with a crushed right leg and has undergone emergency surgery. The civilian from Floor 2 is treated at a local hospital for smoke inhalation — stable condition. The fire is contained and extinguished. The second alarm has supported overhaul. Later that morning, you receive information that the third-floor window person was actually a report of a curtain or light reflection (false alarm/neighbor misidentification). At the debrief, one of your veteran officers says: "You made the right call on the Mayday. But we still don\'t know if the civilian on Floor 2 would have made it out alive if we had delayed their removal by a minute or two to focus more on the Mayday. How do you live with that trade-off? How do you know if your priority order was actually right?" What is your honest response?',
        choices: [
          {
            id: 'a',
            text: '"I do not know. I made a decision based on Mayday protocol, which is clear: firefighters in immediate critical danger take the highest priority. But I also maintained the civilian removal operation in progress — I did not stop it. The civilian was already in the stairwell, already being removed, already protected. I did not interrupt that to prioritize the firefighter. I supported both simultaneously. If I had stopped Ladder 4\'s removal to focus entirely on the firefighter, and the civilian had been overcome by smoke, I would bear that responsibility. Instead, I enabled both operations and got both people out alive. Both outcomes are the result of command decisions, not accidents. And that is why the decision was right — not because I am certain, but because I respected both life safety protocols simultaneously."',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is expert-level reflection. You are acknowledging the genuine ethical dilemma (both were critical, both could have died) while defending the decision as sound. The key insight is that you did NOT choose between the civilian and the firefighter — you enabled BOTH operations by managing priorities intelligently. The civilian removal was already in progress, so supporting it required minimal resource allocation (secondary team assistance at the stairwell). The firefighter required the RIT, which was your most critical resource. By separating the resource needs and managing them distinctly, you avoided a false either/or choice. This is FDNY/NFPA best practice: Mayday is the highest priority, but you do not interpret that as "abandon all other operations." You manage both. The honest uncertainty in your response is actually a sign of mature incident command — you recognize the weight of the decision without being paralyzed by it.',
            },
          },
          {
            id: 'b',
            text: '"I followed protocol. Mayday is the highest priority. If the civilian had been lost, that would be tragic, but the protocol is clear: firefighters come first. I will not second-guess the decision now that both survived. Protocol exists for a reason."',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are hiding behind protocol to avoid the ethical complexity. While MAYDAY IS the highest priority, the decision to maintain the civilian removal in progress is not a "secondary" choice — it is an integrated command decision that respects both protocols. You are correct that you followed protocol, but you are incorrect in suggesting that it was an either/or decision. The strength of your actual decision (enable both operations) is lost if you just defer to "protocol says firefighters first." Own the decision more thoughtfully.',
            },
          },
          {
            id: 'c',
            text: '"I would do it differently now. I should have pulled all interior crews and gone defensive to protect everyone. The civilian removal and the firefighter rescue were too risky, and I should have waited for the second alarm."',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is false hindsight correction driven by guilt. You made the right decision with the information available and the protocols in place. You do not re-decide based on outcome. If you go fully defensive on every incident with civilian and firefighter risk, you will never mount interior operations or rescues. Your decision was sound. Do not undermine it now.',
            },
          },
          {
            id: 'd',
            text: '"That is a question for the department to address systemically. It is not my decision to make — that is a policy question for the chief and the union."',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Deflecting to "policy" is a way to avoid ownership of a real decision you made. You ARE the incident commander. You DID make the decision. You can defer larger policy questions to the chief, but the incident-level decision is yours to own and defend. Take responsibility.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Mayday is the highest command priority. However, this does not mean "abandon all other operations." It means "allocate the highest-priority resource (RIT) to the Mayday while managing other operations intelligently."',
        'When multiple critical operations are in progress, separate your resource allocation by criticality and scope. An RIT can focus on the firefighter while a secondary team supports the civilian removal.',
        'Radio discipline during Mayday is essential. Use secondary frequencies or radio silence strategically to give RIT the communication space they need without blinding you to other operations.',
        'Family presence at incident scenes is common and must be managed with compassion and boundary management. Assign an aide/chief to provide brief information and direct them to the hospital.',
        'Incident command under simultaneous critical threats requires accepting ethical trade-offs and then owning those decisions without second-guessing based on outcome.',
      ],
      references: [
        'FDNY Mayday Protocol',
        'NFPA 1500 Firefighter Safety',
        'NFPA 1561 Incident Management',
        'Critical Incident Stress Management (CISM)',
        'ICS-300 (Command under chaos)',
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 3. EXPERT: HAZMAT UNKNOWN WITH MASS EXPOSURE
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'expert-hazmat-unknown-agent',
    title: 'Expert: HazMat Unknown with Mass Exposure',
    description: 'White powder / unknown substance at a NJ transit hub. Multiple people symptomatic. Could be chemical, biological, or a hoax. Law enforcement wants crime scene. EMS needs access. Manage competing priorities.',
    category: 'HazMat',
    difficulty: 'Expert',
    estimatedMinutes: 30,
    creditHours: 1.0,
    passingScore: 70,
    icon: '☣️',
    badgeColor: 'bg-red-100 text-red-800',

    setup: {
      dispatch: 'DISPATCH: Engine 15, HazMat 1, Rescue 1 — report of unknown white powder at Newark Penn Station, commuter lounge area. Multiple people complaining of respiratory symptoms. NJATC (state terrorism coordinator) activated.',
      narrative: 'You are the HazMat Specialist and Incident Commander. It is 08:42 on a Thursday morning. Newark Penn Station is a major NJ Transit hub with several hundred commuters present at any given time. Transit Authority security has identified a package containing a white powder in the main commuter lounge (interior, climate-controlled space). Approximately 20 people report respiratory symptoms, itching, or throat irritation. The substance is unknown. Could be fentanyl, anthrax, talc, flour, or something else. It could be a hoax or a genuine threat. Your HazMat team is en route. EMS has 3 ambulances standing by 200 feet from the lounge. NJ State Police are establishing a perimeter. The facility manager wants to shut down the HVAC system immediately. A law enforcement supervisor is asking you: "Is this a crime scene? Should we treat it as a biological threat?" You have approximately 90 seconds to make initial decisions before more people could be exposed.',
      details: [
        'Location: Newark Penn Station, interior climate-controlled lounge, high foot traffic area',
        'Substance: White powder, unidentified. No odor reported. In a small cardboard package.',
        'Exposure: ~20 symptomatic people (respiratory symptoms, itching, throat irritation), ~200+ additional people in the station',
        'HVAC: Single central system. Manager wants to shut it down immediately.',
        'Resources: HazMat 1 en route (ETA 4 minutes), EMS 3 ambulances standing by, NJ State Police, NJATC activated',
        'Time pressure: Very high. Every minute of exposure increases the exposed population.',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 5 — Initial Approach and Detection Equipment Limits',
        situation: 'Your HazMat unit is still 3 minutes out. The transit facility manager is standing next to you asking: "Should I shut down the HVAC? If this is anthrax or some kind of biological agent, the air system will spread it everywhere." The law enforcement supervisor is saying: "We need to secure this as a crime scene immediately. Nobody should touch the package." EMS is radioing: "We have 20+ symptomatic people. They need triage and medical assessment now. How long do we wait before we come in?" You do not have chemical detection equipment on scene yet. What is your initial directive?',
        choices: [
          {
            id: 'a',
            text: 'Tell the facility manager: "Do NOT shut down the HVAC yet. Shutting it down traps contaminated air in the lounge. Let it run — it is still diluting the agent and pushing it out of the space. We will assess particle distribution when my HazMat unit arrives." Tell law enforcement: "Preserve the package\'s location but do not move it or isolate the room completely yet." Tell EMS: "Begin triage of symptomatic people outside the lounge entrance. Do not bring them into the lounge. We need to assess exposure scope first."',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is expert HazMat decision-making under uncertainty. Here is the reasoning: (1) HVAC systems in public buildings are designed to provide continuous air exchange. Shutting it down actually concentrates the contaminant in a smaller space. Running it continues to dilute and push the agent out. (2) Law enforcement\'s instinct to preserve the crime scene is correct, but you do not sacrifice life safety for evidence preservation at this stage. You secure the location, document its position, but you do not create an airtight seal. (3) EMS triage begins now, outside the lounge entrance, which allows you to assess the exposure pattern (how many symptomatic, how severe) without committing paramedics into an unknown hazard zone. You are buying time for your HazMat unit to arrive and conduct proper detection. NFPA 472 (Competencies for Operations-Level Responders) requires responders to avoid entering unknown hazmat zones without proper detection. You are following that protocol.',
            },
          },
          {
            id: 'b',
            text: 'Tell the facility manager to shut down the HVAC immediately to prevent wider spread. Evacuate the entire lounge and establish a 200-foot perimeter. Do not allow EMS into the lounge — treat it as a contaminated space until identified.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are overreacting and making decisions based on worst-case scenario rather than triage. Shutting down the HVAC in a large public building actually concentrates the agent in the lounge. A 200-foot perimeter may be excessive if the substance is a false alarm or a minimal irritant. EMS needs to assess the 20 symptomatic people NOW — delaying medical assessment for symptomatic people is a decision with its own consequence. You are not allowing EMS "into the lounge" — you are allowing them to triage people at the entrance. A better approach is proportional response: assess, then escalate.',
            },
          },
          {
            id: 'c',
            text: 'Tell the facility manager to shut down the HVAC. Tell EMS to enter the lounge fully protective and immediately transport all symptomatic people for decontamination. Tell law enforcement to collect the package as evidence without disturbing it.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You have now made three poor decisions simultaneously: (1) shut down HVAC (concentrating the agent), (2) send EMS into an unidentified hazmat zone without proper detection or your HazMat team on scene (violates NFPA 472), (3) collect evidence before life safety is addressed. You are prioritizing evidence and a worst-case containment over proper hazmat protocol and EMS safety.',
            },
          },
          {
            id: 'd',
            text: 'Keep the HVAC running. Tell law enforcement not to touch the package. Tell EMS to wait 5 minutes for your HazMat team to arrive and conduct detection before any medical operations begin.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Your decision on HVAC and package preservation is correct. However, telling EMS to wait 5 minutes while 20 people are symptomatic and potentially deteriorating is not acceptable. Triage can begin immediately at the lounge entrance without sending paramedics into the hazmat zone. Do not delay medical assessment of symptomatic people.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 5 — Mass Decon Decision with Limited Resources',
        situation: 'Your HazMat unit has arrived and conducted preliminary detection. The white powder tests negative for known chemical agents (using colorimetric and ion mobility spectrometry). It is not anthrax on the presumptive Bacillus test. However, the substance is still unidentified — it could be a compound not in your detection library, or it could be an unusual biological agent. You have 27 people who are now symptomatic (the count grew as people became aware of the incident). EMS is requesting guidance: "Do we decon everyone or just the 27? How aggressive do we get?" You have one decon shower truck available. Law enforcement is asking: "Can we collect the package for analysis now?" Your HazMat officer says: "I recommend precautionary decon for anyone in the lounge, plus the 27 symptomatic people. That is approximately 100+ people. Our single decon truck can handle that in about 2 hours if we run it continuously. But I want to send samples to the FBI and CDC for analysis first — that means the substance stays with us and law enforcement gets it after we confirm it is not a threat." What is your decision on mass decon and evidence handling?',
        choices: [
          {
            id: 'a',
            text: 'Approve targeted decon: (1) Immediate decon for the 27 symptomatic people (full shower, clothes change, medical evaluation), (2) precautionary decon for the ~200 people in the lounge (quick rinse, clothes change if requested, baseline observation), (3) keep the package with your HazMat team, photograph and document it for law enforcement, then release it to the FBI after preliminary field analysis. This balances life safety (aggressive decon for symptomatic) with resource management (proportional decon for potentially exposed).',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert resource and risk management decision. Here is the logic: (1) Symptomatic people get full decon — they are confirmed exposed and potentially absorbing the agent. (2) People in the lounge get precautionary decon — they were in the same air space but may not be as exposed. A quick rinse and clothing change addresses the bulk of a contact hazard without requiring 2 hours on showers. (3) The package stays with your HazMat team for proper field analysis and chain of custody before law enforcement takes it. You are not impeding the criminal investigation — you are conducting proper hazmat assessment first. NFPA 472 requires that response decisions be based on identification and threat assessment. You are doing both. The proportional decon approach is supported by NFPA 704 and CDC guidance — you do not "blanket decon" everyone without evidence justifying it.',
            },
          },
          {
            id: 'b',
            text: 'Require full shower decon for all 100+ people in the lounge. This will take 3-4 hours but ensures maximum safety. Immediately release the package to law enforcement for evidence handling.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Full decon for 100+ people based on an unidentified substance that tested negative for known agents is resource-intensive and not evidence-based. You are creating a 3-4 hour incident, overwhelming EMS and decon resources, and potentially causing medical complications (shock, hypothermia) for minimally exposed people. Proportional response is the correct approach. Additionally, releasing the package to law enforcement before your HazMat team has conducted field analysis creates a chain-of-custody problem and prevents proper hazmat identification.',
            },
          },
          {
            id: 'c',
            text: 'Skip decon entirely for the lounge occupants. The substance tested negative for known agents, so treat this as a false alarm. Have EMS evaluate the 27 symptomatic people for underlying medical conditions (anxiety, asthma, etc.). Turn the package over to law enforcement immediately.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are assuming the substance is safe because it tested negative for known agents. An unknown substance that caused 27 people to develop respiratory symptoms deserves at least precautionary decon for those exposed. You are also skipping proper hazmat analysis and evidence handling. The tested negative result does NOT mean it is safe — it means it is not on your library. Proper response is precautionary decon while waiting for lab confirmation.',
            },
          },
          {
            id: 'd',
            text: 'Require full decon for the 27 symptomatic people only. Tell the ~200 lounge occupants to leave the station and self-observe for 24 hours. Keep the package with your HazMat team but allow law enforcement to photograph and document it before final analysis.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Your approach to the symptomatic people is correct. However, telling 200 people to leave the station and self-observe without any decon or baseline medical assessment creates a liability problem if anyone develops complications later. At minimum, offer precautionary decon at the station (quick rinse/clothing change) so people can be decontaminated before they leave. Allowing law enforcement to photograph the package while your team retains possession is good evidence handling.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 5 — Hospital Notification and Surge Planning',
        situation: 'It is now 10:15 (approximately 90 minutes after the initial incident). You have completed targeted decon of the 27 symptomatic people. All have been transported to three regional hospitals (Newark Beth Israel, Saint Michael\'s, and University Hospital). Your HazMat unit has conducted preliminary field analysis and sent samples to the FBI lab (ETA 4-6 hours for full results). The substance is still unidentified. You now need to notify the receiving hospitals of: (1) the unknown substance exposure, (2) the symptoms presented (respiratory irritation, itching, throat irritation), (3) decon already completed, (4) the potential for delayed symptoms if this is a biological or chemical agent. The hospitals are asking: "Should we isolate these patients? Should we prepare for a surge? What PPE recommendations do you have?" What is your hospital notification protocol?',
        choices: [
          {
            id: 'a',
            text: 'Send HazMat liaison to each hospital with: (1) a written summary of exposures and decon performed, (2) the preliminary negative test results for known agents, (3) a recommendation for baseline isolation (cohorting of the 27 patients in one ward) pending identification, (4) standard respiratory precautions for ER staff, (5) request for baseline labs and repeat vitals every 2 hours to catch delayed symptoms. Advise hospitals that you will update them when the FBI lab results arrive.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is balanced hospital coordination. You are providing: (1) relevant information (what they were exposed to, what is known), (2) reassurance (negative tests for known agents, decon completed), (3) precautionary measures (cohorting, isolation protocols), (4) medical monitoring (baseline labs, repeat vitals), (5) ongoing communication (update on lab results). You are not creating panic (no surge preparation yet for an unidentified substance with negative preliminary results), but you are not dismissing the threat either. The hospitals can now make informed triage and isolation decisions. CDC and NFPA 472 guidance emphasizes clear, timely communication with medical facilities.',
            },
          },
          {
            id: 'b',
            text: 'Send an urgent alert to all three hospitals: "Unknown biological or chemical agent exposure. Recommend maximum isolation, full PPE for all staff, surge preparation. 27 exposed patients en route." This ensures the hospitals take the threat seriously.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are creating medical and resource panic without evidence to justify it. The substance tested negative for known agents. The symptoms are mild (respiratory irritation, itching, throat irritation) — not the severe systemic symptoms you would expect from anthrax or a high-lethality chemical agent. Telling hospitals to prepare for a surge or assume maximum isolation will deplete PPE, disrupt normal operations, and create staff stress. You are not being protective — you are being reactive without proportionality.',
            },
          },
          {
            id: 'c',
            text: 'Do not send detailed notifications to the hospitals yet. Wait until the FBI lab results come back in 4-6 hours. In the meantime, tell hospitals to treat the patients as standard respiratory exposure cases.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are withholding critical information from the hospitals that are now responsible for these patients. Hospitals need to know: what were they exposed to, what have you tested, what symptoms should trigger escalated care. Standard respiratory protocols are appropriate, but the hospitals need context. Waiting 4-6 hours without communication is poor coordination.',
            },
          },
          {
            id: 'd',
            text: 'Send a brief summary to hospitals: "27 patients exposed to unknown substance. Decon completed. Substance tests negative for standard agents. Monitor for delayed symptoms." Tell hospitals to contact you with any questions but do not recommend specific isolation or PPE protocols — let them decide.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Your summary is appropriate and factual. However, you should provide recommendations on isolation and PPE protocols based on your HazMat assessment and the exposure pattern. Leaving that decision entirely to the hospitals without guidance creates variability in care and isolation decisions. You are the HazMat expert — guide the hospitals with recommendations, even if they ultimately make their own decisions.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 5 — Law Enforcement vs. Fire Scene Control Conflict',
        situation: 'It is 11:30. The FBI field office has arrived at Newark Penn Station. An FBI Special Agent is now the lead on the investigation (it has been elevated from local law enforcement). The agent is saying: "This is now a potential federal crime — we are taking control of the package and the scene. All evidence must be processed by FBI forensics. Your HazMat team needs to step back." Your HazMat officer is saying: "We need to maintain control of the hazmat assessment. The package could still be dangerous. The FBI is focusing on the criminal investigation, but our job is life safety and chemical/biological threat assessment. We need to continue our analysis in parallel with their investigation." Transit Authority police are asking: "Whose authority takes precedence — fire, law enforcement, or FBI?" You are the incident commander. What is your unified command structure and scope division?',
        choices: [
          {
            id: 'a',
            text: 'Establish unified command: (1) FBI leads the criminal investigation and evidence handling (the package, forensics, motive), (2) Fire HazMat maintains primary responsibility for hazmat assessment and threat identification (field analysis, lab coordination, decon protocols), (3) Transit Authority provides facility control and access. Regular briefing (every 30 minutes) to keep both agencies aligned. You remain overall IC but each agency owns its scope.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is expert unified command. The FBI and Fire have different but complementary mandates. The FBI investigates crimes. Fire assesses hazmat threats. Both can occur simultaneously without conflict if you clearly separate scope. Your HazMat team is not impeding the FBI investigation by conducting field analysis — in fact, the FBI benefits from your preliminary assessment of the threat level. By establishing regular briefings and clear scope boundaries, both agencies can work without stepping on each other. ICS-300 guidance on unified command emphasizes this kind of scope separation when multiple agencies are involved.',
            },
          },
          {
            id: 'b',
            text: 'Defer entirely to the FBI. Withdraw your HazMat team and allow FBI forensics to take complete control of the package and the scene. Your job is done once you have completed decon.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are abdicating hazmat responsibility to a criminal investigation agency. The FBI is excellent at forensics, but they are not hazmat specialists. If the substance is later identified as a known chemical or biological agent with ongoing hazard (like residual contamination or secondary exposure vectors), your HazMat team will not be present to manage it. You do not hand off hazmat assessment to law enforcement. You maintain parallel responsibility.',
            },
          },
          {
            id: 'c',
            text: 'Tell the FBI that this is a fire department incident and they must defer to your HazMat authority for evidence handling and scene control. Law enforcement can observe but not direct operations.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are overreaching your authority. The FBI has legal jurisdiction over potential federal crimes. You can work in parallel with them, but you cannot exclude them from evidence handling or scene control on a crime. Unified command respects all agencies\' authorities.',
            },
          },
          {
            id: 'd',
            text: 'Establish a joint task force: FBI, Fire HazMat, and Transit Authority all share control of the package and evidence processing. Make decisions by consensus.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'While the intent is good, requiring consensus on every decision slows operations and creates deadlock if agencies disagree. Better approach is clear scope assignment (FBI leads criminal investigation, Fire leads hazmat assessment) with regular communication and coordination.',
            },
          },
        ],
      },

      {
        id: 's5',
        title: 'Scene 5 of 5 — Media Management with Unknown Threat',
        situation: 'It is now 12:45. News helicopters have arrived over Newark Penn Station. Local news is reporting "POTENTIAL BIOLOGICAL OR CHEMICAL ATTACK AT NEWARK PENN STATION — DOZENS HOSPITALIZED." Social media is filled with speculation and fear. Concerned citizens are calling the police demanding to know if the station is safe. Transit Authority is facing calls from news outlets asking: "Is the public in danger? Was this terrorism?" The FBI is refusing to comment. Your HazMat team still does not have full lab results (FBI lab results delayed — now ETA 3-4 more hours). You are being asked to do a public statement on behalf of the fire department. What is your approach to media and public communication?',
        choices: [
          {
            id: 'a',
            text: 'Prepare a brief, factual statement: "An unknown substance was identified in Newark Penn Station this morning. The substance tested negative for known chemical and biological threat agents. All exposed individuals have been decontaminated and are receiving medical evaluation. The substance is under investigation by federal and local authorities. Additional information will be available when analysis is complete. There is no known ongoing public threat at this time." Limit questions and defer specifics to law enforcement.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This statement is factual, honest, and proportional. It: (1) confirms the incident without sensationalizing, (2) provides the most important reassurance (tested negative, decontaminated), (3) directs attention to the investigation process (deflating media speculation), (4) does not overstate certainty (says "no known ongoing threat" rather than "safe"), (5) defers to law enforcement for criminal aspects. You are not downplaying the situation, but you are also not feeding media panic. NFPA and DHS guidance on emergency communication emphasizes this approach: accurate, transparent, and measured.',
            },
          },
          {
            id: 'b',
            text: 'Issue a strong reassurance statement: "The substance has been tested and is not a threat. Newark Penn Station is completely safe. All individuals have been treated and released. This incident is over. No further concerns." This will calm the public immediately.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are overstate certainty. You do not yet have final lab results. The substance is still unidentified. You cannot say it is "not a threat" without complete analysis. If you make this statement and then the substance is later identified as a known biological agent, you have undermined public trust and the credibility of emergency communication. Be honest about what you know and what you do not know yet.',
            },
          },
          {
            id: 'c',
            text: 'Refuse to comment and defer all media inquiries to the FBI. Tell the news that fire department details are confidential and you will not be providing information.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A complete media blackout creates a vacuum that feeds speculation and conspiracy theories. You do not need to comment on the criminal investigation, but you CAN and SHOULD comment on the public health aspects (decon completed, exposures managed, medical monitoring in place). Transparency builds trust.',
            },
          },
          {
            id: 'd',
            text: 'Issue a detailed, technical statement about your HazMat testing procedures, the specific tests you performed, the preliminary results, and the timeline for final FBI lab analysis. Provide as much information as possible to show that the response was thorough.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'While transparency is good, a highly technical statement will confuse the media and general public and can be misquoted or sensationalized. Keep it simple and clear. You do not need to explain every test you ran — just the bottom line: what did you find, what does it mean for safety.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Unknown substance response requires tiered decision-making: (1) life safety first, (2) proper detection and analysis, (3) investigation/evidence handling in parallel.',
        'HVAC management in unknown substance incidents: running HVAC dilutes and disperses the agent. Shutting it down concentrates it. Understand building systems before making decisions.',
        'Mass decon decisions should be proportional to evidence. Symptomatic people get full decon. Potentially exposed people get precautionary decon. Non-exposed people do not need decon.',
        'Unified command with law enforcement and FBI requires clear scope separation: Fire owns hazmat assessment and life safety. Law enforcement owns criminal investigation and evidence. Both work in parallel.',
        'Media communication on unknown threats must be honest about uncertainty. "No known ongoing threat" is different from "completely safe." Accuracy builds trust; false certainty destroys it.',
      ],
      references: [
        'NFPA 472 (HazMat Operations)',
        'NFPA 704 (Hazard Labeling)',
        'CDC HazMat Response Guidance',
        'ICS-300 (Unified Command)',
        'Department of Homeland Security Emergency Communication Guidelines',
      ],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 4. EXPERT: HIGHWAY MCI WITH HAZMAT AND ENTRAPMENT
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'expert-highway-complex-mci',
    title: 'Expert: Highway MCI with HazMat and Entrapment',
    description: 'Multi-vehicle pileup on NJ Turnpike in fog. Tanker (placard obscured), two entrapments, 8+ walking wounded, limited access, mutual aid 15+ minutes out. Resources do not match needs.',
    category: 'MVA / Technical Rescue',
    difficulty: 'Expert',
    estimatedMinutes: 30,
    creditHours: 1.0,
    passingScore: 70,
    icon: '🚧',
    badgeColor: 'bg-red-100 text-red-800',

    setup: {
      dispatch: 'DISPATCH: Engine 22, Rescue 3, HazMat 2 — multi-vehicle accident on NJ Turnpike northbound, mile marker 63. Heavy fog reported. Unknown number of vehicles.',
      narrative: 'You are the Incident Commander. It is 06:47 on a grey Friday morning. Visibility on the Turnpike is extremely limited due to fog (approximately 80-100 feet). Your first unit on scene (Engine 22) reports: "Command, we have a multi-vehicle pileup — at least 5 vehicles, possibly 6. Heavy fog making assessment difficult. We have 1 tractor-trailer tanker (placard obscured by damage/angle), 2 sedans with occupants requesting help, 1 SUV on its side, and at least 8 people walking around or flagging us down. The tanker is positioned between two of the damaged vehicles. Mutual aid is currently unavailable — units are tied up on I-78 with a separate MCI." Your Rescue and HazMat teams are 6 minutes out. You have no backup. The Turnpike is backed up behind the incident and more vehicles are approaching through fog. Your job: triage priorities and resource allocation with insufficient resources.',
      details: [
        'Location: NJ Turnpike northbound, mile marker 63, multi-lane highway',
        'Weather: Fog (80-100 feet visibility), 48°F, slick pavement (recent rain)',
        'Vehicles: 5-6 vehicles total. One tanker (placard obscured), two sedans with visible occupants, one SUV on side',
        'Entrapments: Two vehicles with obvious entrapment, at least 2 people. Four additional people with visible injuries.',
        'Walking wounded: 8+ ambulatory people with varying injuries',
        'Hazmat concern: Tanker placard is obscured. Unknown product. Tanker appears intact (no visible leak) but orientation is unstable.',
        'Backup/Mutual Aid: Unavailable initially. Mutual aid ETA 15+ minutes. NJ State Police establishing traffic control.',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 5 — Triage Priority with Unknown HazMat Proximity',
        situation: 'Engine 22 is now on scene. You are establishing command at the upstream end of the incident (upwind and uphill). Visibility is severely limited by fog. Engine 22 reports: "We can see at least 8 walking wounded in the roadway and emergency lane. Two vehicles appear to have trapped occupants. The tanker is in the center of the incident zone, blocking access to one of the trapped vehicles. The tanker\'s placard is not visible — it is facing downward or is obscured by damage." Your HazMat team is 6 minutes out. Your Rescue team is 6 minutes out. EMS has 3 ambulances responding. What is your immediate triage approach and hazmat containment decision?',
        choices: [
          {
            id: 'a',
            text: 'Establish a 300-foot cordon around the tanker immediately (working with State Police). Triage the walking wounded at the upstream end of the incident (away from tanker). Establish an assembly point for walking wounded. Hold any rescue operations pending HazMat identification of the tanker product. This assumes the worst and protects both crews and bystanders.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert hazmat/MCI balance. You are making a critical assumption: unknown tanker = potential hazard until proven safe. A 300-foot cordon is the standard precautionary distance for an unknown tanker on a highway. You are prioritizing: (1) immediate hazmat containment to prevent secondary incidents, (2) triage and treatment of walking wounded in a safe zone, (3) holding rescue operations for the trapped occupants until you know what is in the tanker. This seems to sacrifice the trapped occupants, but if the tanker contains chlorine gas, anhydrous ammonia, or a flammable liquid, committing rescue crews without identification could create a much larger disaster. The walking wounded can be treated now. The trapped victims cannot be accessed safely until HazMat clears the tanker. This is proportional risk management. NFPA 1002 (Hazmat operations) and DOT placard identification guidance support this approach — never approach an unknown tanker assuming it is safe.',
            },
          },
          {
            id: 'b',
            text: 'Assign Engine 22 to immediately begin extracting the trapped occupants from the two trapped vehicles while your crews are available. Set up a separate EMS triage area for the walking wounded. The tanker appears structurally intact — treat it as a secondary concern until HazMat arrives.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are assuming the tanker is safe based on visual inspection. An unknown tanker could contain a substance that is immediately hazardous to life (chlorine, ammonia, hydrogen sulfide, flammable liquid vapor). Committing rescue crews to extrication work in immediate proximity to an unknown tanker is exposing them to an invisible hazard. The trapped victims are in danger, but creating a larger incident by exposing crews to unknown hazmat is not the solution. You are trading one rescue for a potential cascade failure.',
            },
          },
          {
            id: 'c',
            text: 'Evacuate the entire incident area immediately (walking wounded, all vehicles) to a distance of 500 feet. Wait for HazMat to arrive and assess the tanker before any rescue or treatment operations begin.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is an overreaction. You are ordering evacuation of ambulatory, injured people from a severe fog environment (they could wander into oncoming traffic). The tanker appears structurally intact — there is no evidence of a leak or vaporous hazard. A 300-foot cordon is appropriate. Complete evacuation of the entire incident area is excessive and creates additional risk by moving injured people.',
            },
          },
          {
            id: 'd',
            text: 'Prioritize the trapped occupants immediately. Assign Engine 22 to begin extrication while waiting for HazMat. Keep the walking wounded in place and gather information about the tanker from the driver if possible.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Gathering information from the tanker driver is helpful, but it should not delay hazmat precautions. The driver may not know what they are carrying (independent contractor) or may be injured and unable to communicate clearly. An unknown tanker placard means you must assume hazard until proven safe. A moderate approach would be: gather driver info while establishing cordon and preparing to extricate trapped occupants once HazMat confirms safety.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 5 — Dual Extrication Resource Split',
        situation: 'Your HazMat team has arrived (time 06:53). They are working on approaching the tanker to identify the placard. They are reporting: "The placard is partially obscured but we can see numbers — appears to be a flammable liquid. We are running product identification now. ETA 3 minutes for definitive identification." Your Rescue team has also arrived and is asking: "We can see two vehicles with trapped occupants. Vehicle 1 (the sedan on the right side of the roadway) has one occupant, moderate injuries, entrapment of the legs. Vehicle 2 (the vehicle partially under the tanker) has one occupant, potentially more serious injuries, we cannot see them clearly due to the tanker position. Where do we deploy our limited crews?" You have one Rescue team (4-6 personnel). You have two extrication jobs. You do not have mutual aid yet (ETA still 10+ minutes). What is your extrication priority?',
        choices: [
          {
            id: 'a',
            text: 'Deploy the Rescue team to Vehicle 1 (the more accessible sedan with moderate injuries and clearer extrication needs). Establish a defensive position at Vehicle 2 with Engine 22 (provide reassurance to the trapped occupant, monitor for deterioration, prepare tools). Once Rescue completes Vehicle 1, they immediately transition to Vehicle 2. EMS provides continuous reassessment of both patients.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert resource sequencing decision. You are: (1) committing full rescue resources to the most tractable extrication (Vehicle 1) to complete it efficiently and free resources, (2) maintaining contact with the more difficult victim (Vehicle 2) through Engine 22 to provide reassurance and detect changes, (3) planning for sequential operations rather than splitting limited crews across two jobs, (4) using mutual aid arrival to support Vehicle 2 extrication. The victim in Vehicle 2 is in a more serious situation (possibly crushed, partially obscured by tanker), but attempting a concurrent extrication with split crews would result in two slow, difficult operations. A sequential approach — complete the first, then commit full strength to the second — is faster and safer. Vehicle 2 victim gets assurance and monitoring while waiting. This respects both victims within resource limits.',
            },
          },
          {
            id: 'b',
            text: 'Split the Rescue team: half to Vehicle 1, half to Vehicle 2. This allows simultaneous extrication of both victims, cutting total time in half.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Splitting a limited rescue team results in two weak extrication operations instead of one strong one. Technical rescue operations require dedicated crews with proper tools and sequence. Splitting the team means neither victim gets adequate resources. Simultaneous operations on two extrications often take LONGER than sequential operations because crews are working at reduced capacity. A sequential approach is more effective.',
            },
          },
          {
            id: 'c',
            text: 'Prioritize Vehicle 2 (the more serious injury) immediately. Commit all Rescue resources to the vehicle under the tanker. Vehicle 1 can wait — the injuries are moderate.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'While Vehicle 2 appears more serious, attempting extrication of a partially trapped victim under a hazmat vehicle (tanker) without full HazMat clearance is risky. Additionally, Vehicle 2 may require more complex extrication (possibly requiring heavy equipment to lift the tanker). Vehicle 1 is more immediately solvable. The better approach is: extricate Vehicle 1 first (freeing resources quickly), then commit to Vehicle 2 with full strength and potentially additional equipment. Vehicle 1 victim\'s condition is not critically unstable while waiting.',
            },
          },
          {
            id: 'd',
            text: 'Hold all extrication operations pending mutual aid arrival. You do not have enough resources to handle two simultaneous extrications safely. Wait for backup.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Waiting 10+ minutes while two people are trapped is not acceptable unless their conditions are truly stable and mutual aid is confirmed to arrive. A better approach is to begin operations with your available resources and be ready to adjust when mutual aid arrives. Time is critical in extrication — every minute a trapped person waits increases the chance of deterioration.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 5 — Secondary Collision Risk in Fog',
        situation: 'It is now 06:58. Your Rescue team is 8 minutes into the extrication of Vehicle 1. Visibility remains extremely limited (approximately 80 feet). You have controlled the upstream lane and are directing traffic, but vehicles are continuing to approach the incident zone at normal speeds, barely visible in the fog until they are 40-50 feet away. You are getting radio reports from State Police: "We have flagmen upstream, but vehicles keep appearing out of the fog and nearly striking our crews. This fog is extremely dangerous — vehicles are not slowing down." At the same moment, HazMat confirms: "The tanker is a flammable liquid (gasoline or diesel — still working on exact product). It appears intact. 150-foot minimum cordon established. Vehicle 2 extrication can proceed." What is your decision on secondary collision prevention while extrication is ongoing?',
        choices: [
          {
            id: 'a',
            text: 'Coordinate with State Police to immediately establish a hard closure: do not allow any traffic northbound past mile marker 60. Divert all traffic to parallel routes. Use impact attenuators (TMA trucks) at the incident zone perimeter. Request that State Police establish flagmen at 200+ feet upstream with emergency vehicles creating rolling blockade if needed. This may back up traffic significantly, but it prevents secondary collisions during extrication.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert approach to secondary collision prevention in limited visibility. A hard closure is more expensive and disruptive than typical incident management, but fog + high-speed highway + ongoing extrication = cascade failure risk. The 2015 NHTSA study on multi-vehicle pileups in fog found that secondary collisions are common and often worse than the primary incident. Your decision to: (1) close the roadway completely, (2) use TMA (traffic management attenuator/truck-mounted attenuator) equipment, (3) establish deep upstream warning, (4) potentially use rolling blockade are all appropriate for limited-visibility scenarios. Turnpike management may complain about the closure, but you are preventing a secondary disaster. This is proportional to the risk.',
            },
          },
          {
            id: 'b',
            text: 'Rely on State Police flagmen at the scene and in the upstream lane. They are trained for traffic management. Continue extrication operations.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Human flagmen in 80-foot visibility fog are inadequate protection. Vehicles are appearing out of the fog with little warning. Flagmen cannot see or stop approaching traffic in time in this environment. You need hard infrastructure (TMA trucks) and upstream distance (200+ feet of warning). Relying on flagmen alone in this visibility is not safe.',
            },
          },
          {
            id: 'c',
            text: 'Ask Turnpike Authority to activate the changeable message signs upstream to alert drivers to slow down and merge. This should reduce speeds without requiring a full closure.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Message signs are helpful but not sufficient in fog. Drivers may not see the signs clearly in fog, or they may not slow down enough. You are relying on voluntary compliance in a high-risk environment. A hard closure or at least a formal lane reduction with TMA equipment is needed.',
            },
          },
          {
            id: 'd',
            text: 'Accelerate the extrication timeline. Tell Rescue to work faster and get out of the roadway within 10 minutes to reduce the secondary collision window.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Rushing extrication operations to reduce traffic delay is a false priority. Extrication takes as long as it takes. Pushing Rescue to work faster increases the risk of causing additional injury to the trapped victim or injury to Rescue personnel. The solution to secondary collision risk is traffic management, not rushing the rescue.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 5 — Tanker Identification and Evacuation Radius Decision',
        situation: 'It is now 07:04. Rescue team has completed extrication of Vehicle 1 (patient now in EMS care). HazMat is continuing to identify the exact tanker product. Preliminary identification suggests the tanker is carrying unleaded gasoline (flammable liquid). They are working to confirm the exact contents. At the same moment, EMS is asking: "The walking wounded are now staged at the upstream assembly point, approximately 150 feet from the incident. How close can they be while HazMat operations are ongoing? Some are asking if they can be transported now." Your Rescue team is moving to Vehicle 2 extrication (the vehicle partially under the tanker). The driver of that vehicle is conscious and reporting back pain and chest pain, but is stable and communicating. You are making decisions on evacuation radius and patient flow. What is your decision?',
        choices: [
          {
            id: 'a',
            text: 'Maintain the 150-foot assembly point for walking wounded pending final HazMat identification. Once HazMat confirms the product (gasoline or diesel), establish a 300-foot minimum safe radius based on DOT/EPA guidelines. Allow EMS to begin transport of the walking wounded from the assembly point as vehicles become available. Keep the Vehicle 2 trapped patient at that location pending extrication (they are not being moved without full stabilization).',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the balanced approach. You are: (1) maintaining a precautionary distance (150 feet) while waiting for final product identification, (2) establishing an appropriate safe radius once the product is confirmed (300 feet for gasoline/diesel based on DOT guidance), (3) allowing walking wounded transport to begin, which reduces the exposed population and frees EMS resources, (4) recognizing that the Vehicle 2 patient cannot be moved until fully extricated and stabilized. The tanker appears intact (no vaporous release), so a 300-foot radius is appropriate for flammable liquids rather than a much larger evacuation. You are managing resources efficiently while maintaining safety margins.',
            },
          },
          {
            id: 'b',
            text: 'Immediately evacuate all walking wounded to 500+ feet away. Do not allow any patient transport until HazMat gives final clearance on the tanker. If the tanker ruptures, the 150-foot assembly point could be in a dangerous zone.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are overreacting to a precautionary level. The tanker is intact with no signs of rupture. Evacuating all walking wounded to 500+ feet means moving injured people further from medical care. The 150-foot assembly point is reasonable pending product confirmation. Once the product is identified, a 300-foot radius for gasoline is standard. You do not need to assume a catastrophic tanker failure for an unopened, intact vehicle.',
            },
          },
          {
            id: 'c',
            text: 'Allow the walking wounded to leave the scene immediately and self-transport to nearby hospitals. Their injuries are minor — they can drive themselves or call friends for a ride. This frees them from the incident zone.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are losing track of patients and creating liability. Walking wounded need at least a rapid assessment and documentation of their identity and injuries. Allowing self-transport means you lose continuity of care and documentation. EMS needs to at least triage and record these patients even if transport is delayed.',
            },
          },
          {
            id: 'd',
            text: 'Keep all patients (walking wounded and Vehicle 2 trapped victim) at the current assembly point until mutual aid arrives and you can establish a fully safe operational perimeter.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Waiting for mutual aid means the walking wounded are staged for 10+ more minutes in a fog-shrouded incident zone with secondary collision risk. A better approach is to begin transport of walking wounded now (they are more mobile) while Rescue focuses on the trapped victim.',
            },
          },
        ],
      },

      {
        id: 's5',
        title: 'Scene 5 of 5 — Helicopter LZ in Limited Visibility',
        situation: 'It is now 07:12. The Vehicle 2 extrication is progressing but is complex — the vehicle is partially under the tanker and the patient has reported increasing chest pain. EMS is concerned about possible internal injury and is recommending helicopter transport to the regional trauma center (15 minutes away by air vs. 20+ minutes by ground ambulance in traffic). However, helicopter landing zone (LZ) selection is complicated by extreme fog. The helicopter is offering two options: (1) attempt a landing in an open area of the Turnpike median if you can clear it and guide them in via ground personnel, or (2) transport by ground ambulance (longer time but safe). The Weather Service is reporting that fog should improve in about 15-20 minutes. What is your decision on helicopter transport vs. ground transport?',
        choices: [
          {
            id: 'a',
            text: 'Request ground ambulance transport. The 20-minute ground transport time difference is not life-critical for the patient\'s current condition (stable but in pain). Helicopter operations in 80-foot visibility with a median LZ on a highway in fog are too risky — the risk of a helicopter accident outweighs the time benefit. Wait for visibility to improve or commit to proven ground transport.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert risk-versus-benefit decision. You are acknowledging that: (1) the patient is stable (chest pain, but communicating and stable vitals), (2) ground transport adds 20 minutes but is safe and proven, (3) helicopter operations in 80-foot visibility on a median LZ are extremely high-risk, (4) there is a realistic chance that fog improves in 15-20 minutes. Helicopter accidents have killed first responders and have caused secondary disasters. NTSB recommendations on helicopter operations in limited visibility emphasize that the risk of the operation must not exceed the benefit to the patient. A stable patient with a 20-minute time difference does not meet the threshold for high-risk helicopter operations. This is the conservative, defensible decision. If the patient deteriorates to critical (loss of airway, shock), you can reassess.',
            },
          },
          {
            id: 'b',
            text: 'Approve helicopter transport. The patient has potential internal injury and every minute counts. Clear and mark the median LZ with personnel, use strobes and headlights to guide the helicopter in. Accept the risk in order to get the patient to the trauma center faster.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You are underestimating the risk of helicopter operations in fog. A helicopter attempting to land in a median on a Turnpike in 80-foot visibility with ground personnel guidance is a high-accident scenario. If the helicopter crashes, you now have a critical incident with potential crew fatalities and additional ground personnel in danger. The 20-minute time difference for a stable patient does not justify this risk. Helicopter transport is appropriate for critical, time-dependent patients (life-threatening hemorrhage, severe trauma, stroke). Internal injuries require rapid assessment, but the patient is currently stable.',
            },
          },
          {
            id: 'c',
            text: 'Delay the transport decision. Hold the patient in the Vehicle 2 position until the fog improves (15-20 minutes). Once visibility improves, offer the helicopter option.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'This is actually reasonable but awkward. The patient is currently in extrication and cannot be held in place indefinitely. A better approach is to complete the extrication and begin ground transport immediately. If visibility improves during transport and the patient deteriorates, the helicopter can potentially intercept the ambulance en route (helicopter-to-ground transfer). But do not delay extrication to wait for visibility.',
            },
          },
          {
            id: 'd',
            text: 'Ask the helicopter crew to attempt the landing. It is their aircraft and their decision. Your job is to clear the LZ and guide them in. If they are willing to attempt it, support them.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is an abdication of incident command. You are the IC and you make the call on whether a high-risk operation is justified. Deferring the decision to the helicopter crew is inappropriate — they can give you their assessment of risk, but the operational decision belongs to you. You control the incident. You make the call.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Unknown tanker = unknown hazard. Establish precautionary cordon and hold rescue operations pending HazMat identification. Assuming an unknown tanker is safe has caused cascade failures and crew fatalities.',
        'Limited resources require sequential operations, not simultaneous split operations. Complete the most tractable extrication first, then redeploy to the next victim. Sequential operations are often faster than split operations.',
        'Secondary collision prevention in fog/limited visibility is a top-level incident command priority. Hard closures, TMA equipment, and deep upstream warning are appropriate — do not rely on flagmen and message signs alone.',
        'Evacuation radius decisions should be based on DOT/EPA product-specific guidelines, not worst-case assumptions. Gasoline/diesel: 300 feet. Chlorine: 1 mile. Know your products.',
        'Helicopter operations: the risk must not exceed the patient benefit. A 20-minute time difference for a stable patient does not justify high-risk helicopter operations in fog.',
      ],
      references: [
        'DOT Placard Identification and Hazard Classes',
        'EPA Hazmat Response Guidelines',
        'NFPA 1002 (Hazmat Operations)',
        'NTSB Helicopter Safety Recommendations',
        '2015 NHTSA Multi-Vehicle Pileup Study',
        'NJ Turnpike Authority Emergency Operations Manual',
      ],
    },
  },

// ══════════════════════════════════════════════════════════════════════
  // 1. MULTI-UNIT RESIDENTIAL — HOARDING CONDITIONS WITH BARRICADED VICTIM
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'expert-ems-hoarding-fire',
    title: 'Multi-Unit Residential — Hoarding Conditions & Patient Refusal',
    description: 'Fire in a unit with severe hoarding conditions. Victim is barricaded inside and refusing rescue. Adjacent units have elderly residents requiring evacuation assistance. Toxic smoke, compressed gas cylinders in the hoard, and the tension between patient autonomy and duty to rescue.',
    category: 'EMS / Rescue',
    difficulty: 'Expert',
    estimatedMinutes: 30,
    creditHours: 1.0,
    passingScore: 70,
    icon: '🏠',
    badgeColor: 'bg-red-100 text-red-800',

    setup: {
      dispatch: 'DISPATCH: Engine 7, Ladder 5, Medic 3 — respond to 847 Riverside Avenue, Unit 2C for a reported structure fire, multi-unit residential. Caller reports smoke inside Unit 2C; occupant on phone refusing to exit.',
      narrative: 'You are the IC, arriving first on Engine 7 at 10:47 a.m. on a Wednesday. 847 Riverside is a six-story, 1980s concrete multi-unit complex. Thin smoke is issuing from the window of Unit 2C on the second floor. A maintenance worker is on the ground floor stating: "That\'s Marcus\'s unit — he collects stuff. He\'s on the phone with 911 saying he won\'t leave." You can hear a male voice shouting from the window. Unit 2B (adjacent) has an elderly woman with a walker on her balcony looking concerned. Unit 3C above is occupied — elderly male resident inside. Your crew is 4 personnel. Ladder 5 is 4 minutes out. Medic 3 is 3 minutes out.',
      details: [
        'Structure: 6-story, concrete construction, built 1982, 40 units (4 per floor)',
        'Fire location: Unit 2C, second floor, Front Left (Side A) as you face the structure',
        'Weather: 58°F, wind 6 mph, clear conditions',
        'Stairwell access: One central stairwell, one exterior stairwell on Side D (rear)',
        'Occupancy: Mixed — seniors on fixed income, some with mobility issues',
        'Life safety: Unit 2B (adjacent) has mobility-impaired elderly female. Unit 3C above has elderly male. Unit 2D on same floor — unknown occupancy.',
        'Caller (Marcus, Unit 2C): Male, age 31, stating "I don\'t need help, I got it handled" — sounds calm but determined',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 5 — Size-Up & Occupancy Assessment',
        situation: 'You are on the ground floor of the Riverside complex. Smoke is light to moderate from Unit 2C window. The maintenance worker says: "Marcus has, like, magazines and stuff piled everywhere in there. He hasn\'t let maintenance in for three years. Could be anything." Unit 2B resident (Mrs. Chen, 78) is on her balcony gesturing for attention. You haven\'t entered the building interior yet. What is your first priority action?',
        choices: [
          {
            id: 'a',
            text: 'Enter the stairwell and go directly to Unit 2C to attempt entry and assess the fire condition',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Entering the stairwell before a complete external size-up and a communication plan with Marcus is tactically unsound. Hoarding environments create unique hazards — compressed gas cylinders (propane, acetylene), unknown reactive chemicals, structural collapse risks from weight accumulation, and potential zoonotic hazards (mold, rodent feces, insect infestations). NFPA 1670 and NIOSH Special Investigations Branch reports on hoarding-fire LODDs emphasize: never enter a hoarding fire without understanding the full scope. More immediately, Mrs. Chen in Unit 2B is already exposed — you need to know occupancy in adjacent units and any common HVAC pathways before you commit resources to 2C. Establish command and conduct a full external survey first.',
            },
          },
          {
            id: 'b',
            text: 'Establish command, conduct a 360° size-up including checking all accessible unit balconies/windows for occupants, identify egress routes, and attempt radio contact with Marcus to confirm he refuses evacuation',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'Correct. This is the expert-level decision. Before entering a complex multi-unit fire with a barricaded, refusing occupant, you must: (1) establish command, (2) identify all life safety exposures (adjacent units, floors above/below), (3) confirm egress/ingress routes and capacity, (4) attempt direct communication with the refusing party to document their mental status and intent. Hoarding fires involve unknown hazards — that requires intelligence. Mrs. Chen in 2B is a confirmed exposure. Unit 3C above is a potential exposure. You need occupancy confirmation for all six units on floor 2 and at minimum floor 3. This approach allows you to make informed decisions about forced entry, evacuation assistance for adjacent units, and whether Marcus truly understands his danger.',
            },
          },
          {
            id: 'c',
            text: 'Call for EMS to stand by. Request that maintenance or building management attempt to speak with Marcus and convince him to leave voluntarily',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Requesting EMS standby is reasonable — but delegating initial occupancy assessment and refusal documentation to maintenance or building management is a command error. A building manager cannot legally represent Marcus\'s mental state or capacity to the fire service. You (the IC) must establish direct communication to assess his mental status, document his refusal with specifics, and confirm he understands the danger. If Marcus is experiencing a psychiatric crisis, cognitive impairment, or substance intoxication, a building manager cannot safely relay that assessment. Additionally, this delays your own size-up. EMS should be staged for potential interior rescue or care of evacuees from 2B/3C, not standing idle. You direct the operation.',
            },
          },
          {
            id: 'd',
            text: 'Declare the scene unsafe and hold all personnel outside. Do not enter until HAZMAT confirms the hoarding environment is safe to enter',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is an overcautious freeze. Smoke is visible and light-to-moderate — that indicates an active fire with oxygen still available, meaning egress is time-critical for Marcus and for Mrs. Chen in 2B. You cannot delay fire attack and life safety operations while waiting for a HAZMAT assessment. Hoarding fires are dangerous, yes — but they are a recognized occupancy type that structural firefighters can manage with proper intelligence and PPE. NFPA 1670 addresses hazards in hoarding scenes; HAZMAT is not the gating factor here. Command the operation, conduct the size-up, and make informed entry decisions.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 5 — Hazard Recognition in the Hoard',
        situation: 'Your crew has reached Unit 2C. Engine 7 reports: "Door is chained from inside. Smoke is light grey, tolerable. Can hear Marcus moving around inside. No crackling fire sound. Multiple stacks of material visible through the window — magazines, newspapers, plastic bags, what looks like old appliances piled to the ceiling." Your driver reports: "I can see what looks like a blue propane tank on the floor near the window, maybe other canisters." Marcus is still refusing to open the door, saying "I got it handled, there\'s a small fire but I\'m putting it out." What is your assessment and next action?',
        choices: [
          {
            id: 'a',
            text: 'Order an immediate forced entry. Marcus is lying about the fire size — the propane tank is a major hazard and could explode. This requires immediate aggressive attack.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Forcing entry to a hoarded space with exposed compressed gas cylinders without a charged line in position and without venting is extremely dangerous. A forced entry can disturb piles and cause structural collapse onto firefighters, rupture cylinders, or create pockets of mixed oxidizer/fuel that ignite. Marcus\'s claim that he has a "small fire" may be accurate — the light grey smoke and lack of fire sounds suggest a slow-burn, possibly in buried material. NFPA 1670 (Hazmat Operations) and post-incident analysis of hoarding fires show that forced entry without hazard mitigation is a leading cause of injuries in these calls. Before forcing, you need: (1) all visible compressed gas cylinders confirmed, (2) external water supply ready, (3) ventilation plan in place. Marcus\'s refusal is problematic — but the solution is not immediate aggressive force. It is escalation with intelligence.',
            },
          },
          {
            id: 'b',
            text: 'Request a HAZMAT team to identify and inventory the compressed gas cylinders and any other hazardous materials before any crew makes entry. Stage personnel outside. Do not attempt forced entry until HAZMAT clears the scene.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Waiting for a HAZMAT team to simply identify propane tanks is a delay you cannot afford if there is an active fire with a victim refusing exit. A propane tank visible in a hoarding fire is a known hazard you can manage with proper technique — you do not need HAZMAT to confirm it is propane. The light smoke and no fire sounds suggest the fire is not immediately life-threatening, but that can change. The right move is not to delay — it\'s to ventilate, establish water supply, and prepare for forced entry with hazard awareness. Marcus will not voluntarily open the door, and time is not your ally in a structure fire.',
            },
          },
          {
            id: 'c',
            text: 'Position a charged line at the door. Ventilate the window (or break it for ventilation). Request Ladder 5 to assess the window for safe forced entry angle. Brief your crew on hoarding fire hazards (compressed gas, collapse, hidden fire pockets) before any entry. Prepare for forced entry with Marcus\'s continued refusal documented.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert sequence. You are balancing speed with hazard awareness. (1) Charged line at the door prevents fire from flowing toward you as you breach. (2) Ventilating the window reduces smoke and allows assessment — it also removes fuel for the fire. (3) Ladder 5 assesses the window structure for safe access. (4) You brief your crew on the specific hazards of hoarding fires: compressed gas (do not cut or puncture), fire can be in inaccessible pile locations, structural collapse risk from overloaded floors and doorways blocked by material. (5) You document Marcus\'s refusal ("Patient is alert, refusing evacuation, stated he got it handled at 10:51 a.m.") to establish decision-making record for liability and for medical assessment if he later needs rescue. This approach moves forward with intelligence, not aggression.',
            },
          },
          {
            id: 'd',
            text: 'Leave a crew at the door to keep Marcus talking and wait for Ladder 5 to arrive. In the meantime, prioritize evacuation of Mrs. Chen (Unit 2B) and Unit 3C. Marcus\'s refusal is his choice — do not force entry if he doesn\'t want help.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Respecting patient autonomy is important — but a patient refusing evacuation from a burning building due to hoarding disorder (compulsive hoarding is often linked to severe anxiety, depression, or cognitive impairment) is not a simple do-not-resuscitate decision. Marcus may lack capacity to make this choice safely. More critically, if the fire accelerates or spreads through common HVAC pathways, his refusal becomes moot — he becomes a rescue, not an evacuee. Focusing on 2B and 3C is correct priority-wise, but abandoning 2C without exhaust attempt to establish capacity assessment, forcing entry, or at least establishing external fire control is negligent. You must attempt rescue. If Marcus\'s refusal is clearly informed and he is of sound mind, document it — but do not assume that until assessed.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 5 — Evacuation of Mobility-Impaired Adjacent Resident',
        situation: 'Ladder 5 has arrived. You have a charged line at Unit 2C. Unit 2C smoke is now moderate — the fire is growing. Marcus is still refusing. However, Mrs. Chen in Unit 2B is now more distressed on her balcony. Her door to the interior hallway is open (she opened it for ventilation/air). Fire\' smoke is beginning to enter Unit 2B through the shared wall (likely from a gap in the common HVAC or structural penetration). Mrs. Chen has a walker and moves very slowly. She does not want to leave her unit ("This is my home, I don\'t want to go outside"). Ladder 5 reports they can breach Unit 2C. Your driver reports the stairwell is filling with smoke. What is your immediate priority?',
        choices: [
          {
            id: 'a',
            text: 'Evacuate Mrs. Chen immediately via the stairwell to the ground floor. Have your driver assist her with the walker. This is a life safety priority over Marcus.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Mrs. Chen absolutely needs evacuation — but the stairwell is now filled with smoke. Using a smoke-filled stairwell to move a mobility-impaired elderly woman is dangerous. She could fall, inhale toxic products, or become disoriented. The right evacuation route for her is the exterior stairwell (Side D rear) if available, or a window/balcony carry to an aerial ladder if that\'s the safer option. Never force a mobility-impaired person down a smoke-filled interior stairwell. Coordinate with Ladder 5 — one of their mission sets is exactly this: removing mobility-impaired civilians via aerial means. You are correct that she is the priority, but your evacuation route is wrong.',
            },
          },
          {
            id: 'b',
            text: 'Order Mrs. Chen to stay in her unit with windows and doors closed. Order a crew to focus on forced entry to Unit 2C immediately. Once the fire in 2C is knocked down, smoke will stop entering 2B and Mrs. Chen will be safer in place.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Ordering a resident to shelter-in-place in a building with an active fire is risky. Yes, fires often knock down quickly — but you cannot guarantee that, and Mrs. Chen is already distressed with moderate smoke entering her unit. She is also elderly and may have respiratory sensitivity. Sheltering her in place while you attack 2C assumes: (1) no fire spread to 2B itself, (2) no common HVAC extension to other units, (3) Marcus allows entry without escalation. None of those are certain. Evacuation is the priority. The challenge is the safe route, not whether to evacuate.',
            },
          },
          {
            id: 'c',
            text: 'Request Ladder 5 to position an aerial ladder to Mrs. Chen\'s balcony. Coordinate with your crew at Unit 2C for a forced entry with a charged line and aggressive ventilation. Have a firefighter assist Mrs. Chen to the ladder while the attack team breaches 2C. Evacuate Mrs. Chen to ground level via ladder, then support the interior attack.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the correct expert sequencing. Mrs. Chen is the immediate life safety priority, and the aerial ladder is the safest route for a mobility-impaired person with a walker. Ladder 5 is designed exactly for this mission. Simultaneously, your crew at 2C forces entry with a charged line — forcing through a door with water already flowing prevents the fire from venting toward your crew and prevents the fire from accelerating due to air inflow. The forced entry and evacuation happen concurrently. Once Mrs. Chen is down and the 2C fire is knocked down, smoke ingress to 2B stops and any other residents are safer. This coordination between interior attack and external rescue is the hallmark of professional incident command.',
            },
          },
          {
            id: 'd',
            text: 'Evacuate all residents from the entire second floor and floor three via the exterior stairwell as a precaution. Hold Unit 2C without entry until the building is fully cleared.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Over-evacuation wastes resources and can actually increase safety risk — elderly residents being moved from their units can fall, become disoriented, or have medical crises from the stress. You do not automatically evacuate entire floors. You evacuate exposed occupants (those in the fire unit, adjacent units with fire exposure, and units in the path of spread). Holding Unit 2C without entry while the fire continues to burn is unacceptable. Fires do not pause for administrative decisions. A 30-second delay in knockdown in a hoarding fire with compressed gas present multiplies the risk exponentially. Attack the fire while evacuating the directly exposed. This is not an either-or.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 5 — Rescue of Refusing Patient During Escalating Fire',
        situation: 'Mrs. Chen is now safely on the ground. Your crew has forced the door to Unit 2C and is attacking the fire with the charged line. The fire was indeed in buried material (a pile of old furniture cushions) — heavy black smoke is now pouring from the window and doorway as ventilation happens. One of the compressed gas cylinders is now visibly exposed as material shifts. Marcus is coughing heavily, still saying "Don\'t help me, get out of my place!" but he is clearly disoriented and his voice is growing weaker. A visible flame is now licking from the pile. Your crew is managing the knockdown but cannot safely advance past the doorway due to the compressed gas and structural instability. Medic 3 is on scene and standing by. What is your decision on Marcus\'s rescue?',
        choices: [
          {
            id: 'a',
            text: 'Document Marcus\'s refusal as his autonomous choice. Do not force rescue. Continue the attack from the doorway, knock down the fire, and if Marcus voluntarily exits, EMS is ready. If he does not, that is his decision.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is a failure of duty to rescue. Marcus is now clearly incapacitated — his disorientation and weakening voice indicate hypoxia and/or toxic gas exposure. A patient in this state cannot make an autonomous refusal. NJ law (and all U.S. fire codes) obligate the fire service to initiate rescue of life safety hazard victims. "Competent" refusal requires the patient to be alert, oriented, and capable of understanding the danger. Marcus meets none of those criteria. Additionally, his hoarding disorder and his behavior pattern suggest he may lack baseline decision-making capacity. Documenting a refusal while he is incapacitated and then watching him potentially succumb is gross negligence. You must attempt rescue. The challenge is how to do it safely around the compressed gas.',
            },
          },
          {
            id: 'b',
            text: 'Declare the environment immediately unsafe due to the exposed compressed gas and potential structural collapse. Order all crews out. Request a second alarm and attempt external rescue via window/balcony. Do not expose crews to the interior hazard.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Retreating entirely due to the compressed gas overstates the risk. One exposed cylinder does not make the entire environment untenable. Your crew is already in the doorway with a charged line and protective gear. The instinct to protect crews is correct — but the execution is a full retreat when a tactical approach (move the cylinder, advance the line, access Marcus via a specific route) can work. A second alarm request is fine, but that takes time. Marcus is incapacitating now. You have a crew in position. The right move is to brief your crew on the cylinder location, advance carefully, locate Marcus, and extract him via the doorway where the line is operating.',
            },
          },
          {
            id: 'c',
            text: 'Order the attack crew to advance carefully along the wall opposite the compressed gas cylinder, locate Marcus, and drag him to the doorway/exit. Have Medic 3 stand ready at the door to receive him and immediately begin treatment. Document this as a rescue of an incapacitated victim under NJ Title 5 (Fire Safety).',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert rescue decision. Marcus is incapacitated — he is no longer a willing subject, he is a victim requiring rescue. Your crew is already in position with a charged line. The path around the compressed gas cylinder is identified. A careful advance along the interior wall away from the gas and the fire keeps the crew safe while accessing Marcus. Once located, dragging him the short distance to the door where the line is operating removes him from the worst conditions. Medic 3 receives him immediately for oxygen and assessment. You are exercising your duty to rescue while managing crew safety. Documenting this rescue (timestamp, Marcus\'s condition, rescue technique) under NJ Title 5 Chapter 52 (Fire Safety Act) protects both you and the department — it shows the rescue was conducted under fire service obligation, not as a medical operation.',
            },
          },
          {
            id: 'd',
            text: 'Wait for the fire to be completely knocked down and ventilation to clear before sending anyone in to locate Marcus. Once the atmosphere is safer, enter with fresh personnel and perform a comprehensive search.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'The instinct to wait for safer conditions is understandable — but in a structure fire, "waiting for it to be safer" often means waiting for a fatality. Marcus is incapacitating now. Fire growth in hoarding materials is unpredictable — it can accelerate suddenly. The black smoke now coming from Unit 2C and the visible flame mean the fire is past its ignition phase. Waiting costs lives. Your crew is already in position. The safer move is to advance now while you have visibility and control with the charged line, not to retreat and wait. Timing matters in rescue.',
            },
          },
        ],
      },

      {
        id: 's5',
        title: 'Scene 5 of 5 — Decon & Hazard Documentation for Investigation',
        situation: 'Marcus has been extracted and is now with Medic 3. He is on oxygen, coughing, and more alert but has moderate carbon monoxide poisoning (carboxyhemoglobin ~18%) and was inhaling unknown smoke products from the buried fire. He will be transported to Regional Medical Center for monitoring. The fire is now knocked down. Overhaul reveals the fire originated in the pile of furniture cushions — apparently, Marcus was using a kerosene heater in the center of the hoard (not visible until material was moved), and it tipped over or overheated. Multiple compressed propane canisters were scattered throughout. Fire Prevention has arrived to begin investigation. However, your crew members who entered Unit 2C are now reporting respiratory irritation, eye irritation, and mild headaches. What is your priority action for crew safety and scene management?',
        choices: [
          {
            id: 'a',
            text: 'Immediately decon all crew members who entered Unit 2C using soap and water, have them remove and bag all gear, and have them transported to occupational health for evaluation. Do not allow them to leave the scene without medical clearance. The fire investigator can work the scene with appropriate PPE.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert crew health and scene management sequence. Post-incident decontamination is mandatory — crews entered a hoarding environment with unknown combustion byproducts, potential mold spores, insecticide residues, and other occupant hazards. Respiratory irritation and eye irritation indicate exposure to irritant gases or particulates. Removing gear immediately and bagging it prevents off-gassing in the rig. Occupational health evaluation is not optional after a hoarding fire entry — these exposures are cumulative and can have chronic health effects. NIOSH guidance on hoarding fire entries (see NIOSH Alert: Preventing Deaths and Injuries in Hoarded Facilities) emphasizes post-incident health assessment. The fire investigator can work the scene with respiratory protection and gear — the scene is not going anywhere. Your crew\'s health is the priority.',
            },
          },
          {
            id: 'b',
            text: 'Have your crew self-monitor their symptoms. If they feel worse, they can report to occupational health later. The fire investigator needs the scene, so complete overhaul and scene preservation quickly so they can work.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Delaying occupational health evaluation after a hoarding fire exposure is negligent. Hoarding fires expose firefighters to a unique suite of hazards: pathogenic molds (including black mold with mycotoxins), rodent and insect feces/remnants, chemical residues, and unknown combustion byproducts. Symptoms like respiratory irritation can worsen over hours — you cannot rely on crews to self-report or self-manage. Additionally, post-incident documentation of exposure and medical evaluation protects the department from liability claims later. If a crew member develops chronic respiratory issues, you have no record of the exposure incident if you delayed evaluation. Occupational health assessment on-scene or immediately after is standard.',
            },
          },
          {
            id: 'c',
            text: 'Shut down the scene entirely. Declare it a biohazard due to the unknown contents of the hoard. Request a professional biohazard remediation company to clear the scene before fire investigation can proceed.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Hoarding environments are hazardous, but they are not "biohazards" requiring professional remediation closure. That terminology is reserved for bloodborne pathogen, chemical, or radiological hazards that exceed normal fire service exposure protocols. A hoarding fire is a known occupancy type. Your crews manage it with respiratory protection and post-incident decon — which you are doing. Requesting external remediation before fire investigation wastes time and creates confusion about jurisdiction. The investigator will use appropriate PPE and can work the scene. Your job is to protect your crews through decon and health follow-up, not to shut down the entire operation. That said, Medic 3 should verify no bloodborne pathogen or severe biohazard is present during the rescue — if they discover needles, medical waste, or visible blood/body fluid, then you escalate to hazmat. But based on your current information, this is standard hoarding fire protocol.',
            },
          },
          {
            id: 'd',
            text: 'Have your crew rinse off with the hose on scene and return to service. Minor respiratory irritation is expected after interior fire operations. Continue with normal post-incident cleanup.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Rinsing with a hose is not decontamination — it removes surface soot but does not remove volatile organic compounds, mold spores, or chemical residues that have been inhaled. Crews who are reporting eye irritation and respiratory irritation are showing signs of chemical/biological exposure, not just smoke inhalation. Returning them to service without medical evaluation is irresponsible and exposes the department to liability. Hoarding fire exposures are cumulative — a firefighter who enters multiple hoarding scenes over a career can develop chronic lung disease if individual exposures are not documented and managed. NFPA 1001 (Firefighter Professional Qualifications) and NJ regulations require incident-specific health monitoring for hazardous exposures.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'Hoarding fires present unique hazards: compressed gas, structural collapse, toxic combustion byproducts, mold spores, and chemical residues. Never enter without hazard intelligence.',
        'A patient refusing evacuation from a burning building due to mental health, cognitive impairment, or hoarding disorder may not have decision-making capacity. Assess capacity before accepting refusal.',
        'In multi-unit residential fires, adjacent units and upper/lower floors can be exposed via common HVAC or structural penetrations. Identify all life safety exposures early.',
        'Mobility-impaired residents in active fire situations should be evacuated via aerial ladder or exterior routes, never down smoke-filled interior stairwells.',
        'After hoarding fire entries, decontamination and occupational health evaluation are mandatory. Do not rely on crews to self-monitor.',
        'Document all rescue decisions, refusals, and crew exposures for liability protection and for post-incident analysis.',
      ],
      references: ['NIOSH Alert: Hoarded Facilities', 'NFPA 1670 (Operations)', 'NJ Title 5 Chapter 52 (Fire Safety Act)', 'NFPA 1001 (Firefighter Qualifications)', 'IFSTA Rescue Operations Ch. 8'],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 2. WILDLAND-URBAN INTERFACE — EVACUATION COMMAND WITH RESOURCE SCARCITY
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'expert-wui-evacuation',
    title: 'Wildland-Urban Interface — Evacuation Command & Structure Triage',
    description: 'Fast-moving brush fire approaching a NJ Pine Barrens community. Wind shift predicted in 45 minutes. You must choose: evacuate all residents (300+ homes, many elderly) or defend in place. You don\'t have enough resources for both. Weather data conflicts with field observations. A school bus with 40 children is in the evacuation zone.',
    category: 'Vehicle / Brush Fire',
    difficulty: 'Expert',
    estimatedMinutes: 30,
    creditHours: 1.0,
    passingScore: 70,
    icon: '🌳',
    badgeColor: 'bg-red-100 text-red-800',

    setup: {
      dispatch: 'DISPATCH: All available units — brush fire approaching Pinewood Estates subdivision, NJ 539 south of Fort Dix. Fire moving NE at approximately 10 mph. National Weather Service has issued Red Flag Warning; wind shift predicted 14:00-14:30 hrs, expected shift to SW at 15-25 mph.',
      narrative: 'You are the Incident Commander, arriving at a brush fire incident at 11:45 a.m. on a Friday in late May. The fire is approximately 2.5 miles south of Pinewood Estates, a residential community of 300+ homes in the Pine Barrens. Current wind is NE at 8-12 mph, pushing fire toward the community. Local dispatcher reports: "School bus departing Lakewood Elementary School at 11:50 — route passes through Pinewood Estates, approximately 40 students and 2 adults." Your available resources: 6 engines (yours + 5 mutual aid), 2 ladder trucks (defensive only), 1 water tender, 1 brush truck, and 3 chiefs. County EMS has 4 ambulances staged. Police has 2 units for traffic control. The forecast wind shift is predicted at 14:00-14:30, but your crews on the ground report the fire behavior is already showing instability — small vortices, direction variations — suggesting the wind shift may come earlier.',
      details: [
        'Topography: Pinewood Estates sits on sandy, rolling terrain. Fire can travel faster than predicted on sand.',
        'Vegetation: Pine barrens typical — low scrub, pitch pine, scattered oak. High fuel load due to drought conditions (NJ has been dry for 6 weeks).',
        'Community: 300+ residential structures, predominantly single-family homes on 0.5–1 acre lots. Estimated 450–550 residents, with 25–30% elderly population.',
        'Evacuation routes: Single main exit (Pinewood Drive to NJ 539 north). One alternate secondary road (Cranberry Lane, east to NJ 70). School bus will use Pinewood Drive (main route).',
        'Structures: Most homes are wood-frame, 1–2 stories. Roofing is predominantly asphalt shingle. Some metal roofs in newer development. Defensibility is mixed — some homes have good clearance, others are very close to vegetation.',
        'Distance to community: 2.5 miles. At 10 mph, fire reaches community edge in 15 minutes if no containment. But sand terrain can accelerate spread.',
        'Weather conflict: NWS predicts wind shift at 14:00-14:30. Your crews report signs of shift at 11:50 already. Shift direction: NE wind to SW wind (pushing fire back into burned area, or spreading east to different communities).',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 5 — Evacuation vs. Defend-In-Place Decision with Limited Resources',
        situation: 'You are coordinating from the command post, 1.5 miles from the fire head. The fire is moving steadily. Your brush unit has established a 500-foot perimeter. NWS reiterates: wind shift forecast 14:00-14:30. But your crew reports the fire is already showing erratic behavior — a thermal updraft column is forming, and the fire\'s direction has shifted 10 degrees in the last 10 minutes. Police reports: "School bus is now 5 minutes from Pinewood Estates, will enter community in 6 minutes." With your 6 engines and 2 ladder trucks, you can: (A) begin pre-positioning for structure defense along Pinewood Drive (slowing evacuation), or (B) begin immediate full mandatory evacuation (requires multiple passes, takes 30-40 minutes). You cannot do both adequately. What is your priority decision?',
        choices: [
          {
            id: 'a',
            text: 'Order immediate mandatory evacuation using both evacuation routes. Stage law enforcement on both Pinewood Drive and Cranberry Lane to direct traffic. Call for the school bus to divert to an alternate pickup (do not enter Pinewood Estates). Hold all engines in defensive staging positions on the community perimeter for structure defense after evacuation.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Evacuation is the right instinct — but this choice assumes you can accomplish both evacuation AND defensive positioning simultaneously with your resources. You have 6 engines. Staging them for structure defense while evacuation is ongoing depletes your firefighting force when you need maximum interior capability. Additionally, evacuating 450+ residents from a single main exit (Pinewood Drive) during a fire emergency with only 2 police units is a traffic bottleneck. People panic. School buses cannot be diverted mid-route safely — the driver has passenger custody. The school bus is a life safety factor, yes, but it also must use the same evacuation route as residents, creating a complex coordination problem. This answer prioritizes structure protection over human life evacuation, which is the wrong priority. However, it does order evacuation, which is better than defend-in-place.',
            },
          },
          {
            id: 'b',
            text: 'Issue a Mandatory Evacuation Order for Pinewood Estates. Use ALL available resources (6 engines, 2 ladders, brush truck) to work with police on traffic management and evacuation support. Hold off on structure defense for now. The school bus should be allowed to complete its route and exit with resident traffic. Command prioritizes life safety over structures.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert life-safety-first decision, even though it means accepting that some structures will burn. A Mandatory Evacuation Order is unambiguous — it legally obligates residents to leave. Using ALL firefighting resources for evacuation support (blocking intersections, assisting elderly residents, managing traffic flow) rather than pre-positioning for structure defense ensures the best possible egress. The school bus must complete its route because stopping or diverting it mid-route creates a different hazard (students stranded, driver confusion). By allowing it to flow with evacuation traffic, police and your crews know where a child-carrying vehicle is. The fire is 2.5 miles away, estimated 15 minutes to community edge — that is adequate time for evacuation IF you deploy full resources to it. Yes, structures will burn. That is the trade-off when life safety and property both cannot be protected with available resources. NFPA Wildland-Urban Interface standards prioritize life safety. The structures can be rebuilt; lives cannot.',
            },
          },
          {
            id: 'c',
            text: 'Order residents to shelter in place with their homes defended. Have them seal windows, turn on external lights, park cars in garages, and await further instructions. Deploy all engines around the community perimeter for structure defense. This avoids the chaos of evacuation and uses firefighting resources efficiently.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Shelter-in-place is a valid strategy for smaller, slower-moving wildfires with clear evacuation routes — but not here. The fire is 15 minutes away, possibly less due to sandy terrain and unstable wind. Shelter-in-place requires residents to make immediate home-hardening decisions (seal windows, wet roofs, clear gutters) that most homeowners cannot accomplish in the remaining time. Additionally, a 450-resident community cannot be defended with 6 engines and 2 ladders. You are spreading resources so thin that structure defense fails anyway, AND you trap residents in homes that become untenable if wind or fire direction changes. The school bus with 40 children makes this decision even worse — you are betting that 40 school-age children will successfully shelter in a residence during a wildfire. This is a liability nightmare. Evacuation is slower and chaotic, but it removes the human factor from the fire\'s path. Shelter-in-place with inadequate firefighting resources is a recipe for LODDs.',
            },
          },
          {
            id: 'd',
            text: 'Divide your resources: 4 engines for structure defense, 2 engines for evacuation support. Request mutual aid for additional evacuation support. Establish a evacuation route with lane control and begin selective evacuation of high-risk areas (near the fire, elderly residents).',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Dividing resources is a middle-ground that actually worsens outcomes. Four engines cannot defend a 300-home community — you lack the water supply, the personnel, and the spatial coverage. Those 4 engines will accomplish limited structure saves while the remaining 2 fail to provide adequate evacuation support. You are creating a worst-of-both-worlds scenario: structures are inadequately defended (most still burn) AND evacuation is too slow (residents face accelerating fire conditions mid-evacuation). Requesting mutual aid is appropriate, but mutual aid takes time to arrive — at 11:50 with a 15-minute fire arrival window, additional resources will not arrive in time. Selective evacuation of high-risk areas is smart, but it must be coordinated with full evacuation orders to all — you cannot evacuate "high-risk" homes while others stay. That creates dangerous delay and confusion. The expert move is to commit fully to one strategy — in this case, evacuation.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 5 — School Bus Priority & Route Selection',
        situation: 'Your Mandatory Evacuation Order is being broadcast. Police are setting up on both Pinewood Drive and Cranberry Lane. The school bus (Lakewood Elementary, 40 students, 2 adults) is now 3 minutes from entering Pinewood Estates on Pinewood Drive (the main evacuation route). Your dispatcher reports: "Bus driver is on radio asking if there is a safer alternate route — driver is aware of the fire." Simultaneously, fire observers report: "Fire head is now visible, approximately 1.5 miles from community. Wind is shifting NOW — erratic, possibly earlier than forecast. Fire behavior is unpredictable."',
        choices: [
          {
            id: 'a',
            text: 'Direct the school bus driver to proceed on Pinewood Drive with evacuation traffic. Radio that you will stage fire units to provide escort and priority passage. School bus exits with resident evacuation.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Staging fire units as escort to the school bus on the evacuation route redeploys firefighting resources from evacuation management and structure defense to a single vehicle. While protecting the bus is important, it is not more important than managing the entire evacuation flow. Fire personnel should be directing traffic, assisting elderly residents, and ensuring route clarity — not escorting a single bus. Additionally, a fire engine escort may actually slow the bus (engines are large, reduce visibility for other drivers, attract attention). The bus driver is trained for emergency driving. The safer approach is to ensure the evacuation route itself is clear and managed, not to provide a dedicated escort.',
            },
          },
          {
            id: 'b',
            text: 'Divert the school bus to Cranberry Lane (the alternate east route). Radio the driver: "Proceed on Cranberry Lane, which is less congested. Fire units will ensure that route is clear." This removes the bus from the main evacuation bottleneck.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert school bus routing decision. The bus carries the most vulnerable occupants — 40 children with lower heat tolerance, lower decision-making ability, and higher panic response than adults. Placing them on the secondary route (Cranberry Lane to NJ 70) removes them from the congested primary evacuation route where panicked residents are driving. Police can focus evacuation management on Pinewood Drive (residents). Fire units stage on Cranberry Lane to ensure that route is clear and passable. The bus exits Pinewood Estates safely with less traffic chaos. Yes, Cranberry Lane is longer — but it is less congested and provides a safer passage for children. Once the bus is clear, fire units can return to evacuation support on Pinewood Drive.',
            },
          },
          {
            id: 'c',
            text: 'Order the bus driver to hold position outside the community — do not enter Pinewood Estates at all. Have police establish a perimeter and wait for the fire to clear the area. Students will be transported after the fire passes.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Stranding 40 students on a roadside near an active wildfire is an evacuation failure, not a success. The fire is erratic and the wind is shifting — you cannot predict where it will go in 30 minutes. Holding a school bus with children on the roadside near active fire creates a situation where the bus itself could be in the fire\'s path if conditions change. Additionally, the driver has custody responsibility — holding students indefinitely on a roadside without shelter is legally and ethically problematic. The bus must either complete its route through the community and exit, or it must not enter at all. Holding it in a limbo zone is the worst option.',
            },
          },
          {
            id: 'd',
            text: 'Have police stop the bus at the community boundary. Transfer the 40 students to a fire engine, load the remaining 2 adults and one firefighter in a second engine, and convoy them out via a different route.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'This is creative and shows resource thinking — but it is operationally problematic. Transferring 40 school-age children from a bus to fire engines under time pressure is chaotic. The bus has safety systems, communication, and known capacity. Fire engines are not passenger vehicles. Additionally, you are removing 2 fire engines from evacuation support to provide student transport — that is a resource loss you cannot afford. The bus driver is trained for this exact scenario. The better approach is to trust the driver with a clear route (Cranberry Lane) and police support, not to replace the bus with fire units.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 5 — Wind Shift Happens Early; Plans Change',
        situation: 'It is now 12:15 p.m. The school bus has exited via Cranberry Lane (safe). Evacuation on Pinewood Drive is 60% complete — approximately 180 residents are en route, 70+ remain in homes. The fire, however, has accelerated. Observers report: "Wind shift is happening NOW — SW at 15-18 mph. Fire is now moving rapidly NW into the community. Previous prediction of 14:00-14:30 shift was wrong — shift is happening at 12:15." The fire is now entering the northern edge of Pinewood Estates. Your fire perimeter crew reports: "We have homes already igniting on the north side. Fire is spotting ahead via wind-blown embers. We are establishing structure defense on the south/central residential core. But we will not be able to save the north perimeter homes." What is your incident command action?',
        choices: [
          {
            id: 'a',
            text: 'Immediately order evacuation completion of all remaining residents on Pinewood Drive. Hold all engines in defensive positions to protect the central and southern residential areas. Accept that north perimeter homes are lost.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert real-time adaptation decision. Your initial evacuation plan assumed a 14:00-14:30 wind shift. The shift happened 1.5 hours early due to conditions you cannot control. The fire is now in the community. Attempting to save the north perimeter homes now means deploying firefighting resources away from evacuation routes — that slows evacuation of the remaining 70 residents. Those 70 residents are your priority. The north homes are a loss you must accept. Issue an urgent completion evacuation order: "All residents must exit NOW via Pinewood Drive. Fire is on the north edge. Do not delay." Simultaneously, your crews establish defensive positions on homes in the central and southern residential zones where you have the capacity to make a difference. This is triage at the community scale. The north homes burn. The central and southern homes have a fighting chance. The remaining 70 residents achieve safety. That is the outcome you can achieve.',
            },
          },
          {
            id: 'b',
            text: 'Deploy all available engines to the north perimeter to defend those homes. Reduce evacuation support. Order remaining residents to shelter in place in their homes in the southern zone until fire has moved through.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This commits your limited firefighting resources to a defensive action on the north edge while simultaneously abandoning the remaining 70 residents\' evacuation. You are betting that shelter-in-place will work — it will not. The fire is erratic, wind-driven, spotting ahead. Residents sheltering in place with inadequate firefighting support have low survival probability. NIOSH and NFPA post-incident analyses of deadly wildfire events (e.g., Camp Fire CA, Dixie Fire CA) consistently show that shelter-in-place with inadequate defensibility leads to LODDs. The north homes are already beyond saving if fire is actively advancing. Attempting to save them while abandoning resident evacuation is a catastrophic prioritization error.',
            },
          },
          {
            id: 'c',
            text: 'Request all mutual aid and additional firefighting resources immediately. Begin a controlled counter-fire operation on the north edge to slow the fire advance. This buys time for evacuation completion.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'A counter-fire (backburn) operation in an active wind-driven fire in a residential community is extremely high-risk and requires specific conditions: fuel break space, experienced personnel, and control room to work. You do not have those conditions. Wind-driven fires can overwhelm backburn operations, creating a two-front fire that accelerates rather than slows spread. Additionally, requesting mutual aid and waiting for it to arrive (potentially 30+ minutes) costs time you do not have. Your 70 remaining residents need evacuation completion in the next 15-20 minutes. Attempting a sophisticated counter-fire operation now wastes resources and risks personnel. Accept the north homes and focus on the evacuation that is achievable.',
            },
          },
          {
            id: 'd',
            text: 'Hold defensive positions on all residential areas. Do not press evacuation urgently. Allow the fire to move around homes — fire typically moves rapidly past structures but allows pockets of unburned area. Residents can shelter as fire passes.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'This is the shelter-in-place misunderstanding. While it is true that some fires move rapidly past certain structures, leaving small pockets of safety, this is NOT a reliable survival strategy in an 15+ mph wind-driven fire entering a residential community at 12:15 p.m. The fire is spotting ahead, meaning it is creating new fire fronts beyond the main fire body. Residents cannot predict where those spotting events will occur. Additionally, this approach requires homes to have already-prepared defensible space and fire-resistant features — most Pinewood Estates homes do not. Pressing evacuation urgently while holding defensive positions elsewhere is the correct approach. Betting on pockets of safety is a gambling strategy, not a fire command strategy.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 5 — Structure Triage: Which Homes to Defend, Which to Concede',
        situation: 'It is 12:35 p.m. Evacuation is now 95% complete — approximately 8-10 residents remain unaccounted for (likely refused evacuation or sheltering in place). The fire is moving through the community. Your crews are now conducting active structure defense in the central and southern zones. You have 4 engines deployed on defense, but there are 180+ defendable homes in that zone. Your fire crew reports: "We can defend homes with good clearance (100+ feet from vegetation) and metal roofs. Homes within 50 feet of trees or with wood roofing are likely to burn if we don\'t focus on them — but we don\'t have the water volume to defend all of them." Your water tender is running low. County mutual aid is 20 minutes out. What is your triage guidance to your crews?',
        choices: [
          {
            id: 'a',
            text: 'Defend all homes uniformly. Establish a rotation — 5 minutes per home, move to the next. This ensures every home receives some firefighter protection.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Spreading resources evenly across all homes means defending none of them adequately. Five minutes of firefighter presence per home is insufficient to prevent ignition. Fires spread from structure to structure through ember intrusion and radiant heat. A home needs continuous water application on vulnerable surfaces (roof, siding, vents) to resist ignition. Brief, rotating visits will result in homes burning after you leave because you have not suppressed the immediate fire threat. Triage requires you to choose which homes can be saved with adequate resources, and which cannot.',
            },
          },
          {
            id: 'b',
            text: 'Concentrate all 4 engines on the 30-40 homes with the best defensibility (good clearance, metal roofs, open siding). Defend those homes aggressively with sustained water application. Accept that the remaining 140+ homes in that zone will burn.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert triage decision. You are making an informed choice about resource allocation and outcome. Homes with 100+ feet of clearance and metal roofs have the highest probability of surviving with firefighter support. By concentrating your resources on those homes with sustained water application, you maximize the number of structures that survive. Yes, 140+ homes with poor defensibility will burn — that is the trade-off. But you are saving 30-40 homes instead of attempting to save all 180 and saving none. This is documented in NFPA 1144 (Wildfire Preparedness) and post-incident analyses: triage for defensibility is the only way to maximize survival in resource-limited wildfire events. Your crews know the trade-off. Document it in your incident log for post-incident review. Mutual aid arriving later can support mop-up on the lower-defensibility homes, but the decision now is about maximizing lives and saveable property.',
            },
          },
          {
            id: 'c',
            text: 'Focus engines on homes with occupants still inside. Defend those homes prioritarily. For unoccupied homes, do not spend resources.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Prioritizing occupants is sound logic — but your evacuation is 95% complete. There are only 8-10 unaccounted residents, likely sheltering in place. You do not know where they are. Using them as a targeting criterion for engine placement wastes time trying to find them instead of defending homes. Additionally, once you determine occupant locations, defending those specific homes may place firefighters in high-risk positions if the fire is approaching rapidly. The better criterion is defensibility of the structure itself, not whether occupants are inside. If occupants are sheltering in a defensible home, firefighters defending that home also protect the occupants.',
            },
          },
          {
            id: 'd',
            text: 'Withdraw all engines from structure defense. The fire has entered the community and resources are stretched. Prioritize search and rescue for the 8-10 unaccounted residents. Structures are secondary to life safety.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Withdrawing all structure defense to search for 8-10 unaccounted residents (who are likely sheltering in place, not lost) abandons defensible homes to the fire. Additionally, attempting active search and rescue in an active wildfire is extremely high-risk — your crews will face spotting fires, erratic wind, and low visibility. The 8-10 residents have sheltered somewhere — they are not wandering lost. Once the fire front passes (30-40 minutes), you can conduct systematic welfare checks on sheltering residents. Structure defense while that is happening is appropriate. The priority is not either-or; it is both: defend structures while acknowledging that active rescue search during the fire is too dangerous.',
            },
          },
        ],
      },

      {
        id: 's5',
        title: 'Scene 5 of 5 — Post-Incident & Community Accountability',
        situation: 'It is 14:30 (2:30 p.m.). The fire has moved through Pinewood Estates and is now moving west toward other areas. Your crews have held the central and southern residential zones — approximately 35 homes saved (out of 180 in that zone), 145 homes lost. The north perimeter is completely burned (approximately 60 homes). Total losses: 205 homes out of 300. 480 residents evacuated safely; 8 residents unaccounted during the fire have now been located sheltering in homes — all safe. Zero LODDs. However, residents who lost homes are arriving at the command post furious: "Why didn\'t you save our houses? Where were the firefighters? What were you doing?" Local news is also on-scene demanding interviews. What is your immediate post-incident command response?',
        choices: [
          {
            id: 'a',
            text: 'Conduct a brief media statement: "All residents were evacuated safely. Firefighting resources focused on structure defense where defensible. The fire was faster and more erratic than predicted. We saved over 35 homes and no lives were lost. Incident documentation will be available post-incident."',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert post-incident command response. It acknowledges life safety success (all residents safe), it explains the strategic decision (defensibility-based triage), it acknowledges the environmental challenge (fire behavior exceeded forecast), and it sets expectations for accountability (incident documentation). It does not defensively blame residents, the weather, or mutual aid. It also does not over-promise future litigation or compensation. The statement is factual and firm. For residents demanding answers, the appropriate response is to document their concerns, provide your incident command log, and allow the post-incident review process to examine the decision chain. Angry residents post-incident are expected — your job is to communicate clearly and stand behind sound incident decisions. NJ Department of Environmental Protection will conduct a post-incident review; cooperate fully. This statement protects the incident command integrity while honoring resident concerns.',
            },
          },
          {
            id: 'b',
            text: 'Avoid media. Tell residents that mutual aid arrived too late and that county mutual aid should have been pre-positioned. Blame the weather forecast for the early wind shift. Indicate that better resources would have saved more homes.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Deflecting responsibility to mutual aid, weather forecasts, or county resource pre-positioning is a command failure. You were the Incident Commander. You made the decisions. While external factors (early wind shift) and resource limitations are real, blaming them publicly undermines your credibility and the department\'s credibility. Worse, it invites litigation and regulatory investigation — residents and their attorneys will see this as an admission that you had inadequate resources. A professional IC owns the decision chain: you made triage decisions based on the information you had, you prioritized life safety, you documented your actions. That is defensible. Deflection is not. Additionally, telling residents "better resources would have saved more homes" is an admission of inadequacy that invites third-party liability claims.',
            },
          },
          {
            id: 'c',
            text: 'Tell angry residents: "We saved all your lives, which is what matters. Property can be rebuilt. This is not the fire department\'s responsibility to save every home — it\'s on you to have evacuation plans and defensible space." Move on to other operational tasks.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'The core message — prioritizing life safety — is correct. However, the tone is dismissive and will inflame resident anger. While it is true that property owners bear some responsibility for defensible space and preparedness, telling grieving homeowners that their property loss is "not your responsibility" is tactically poor and legally dangerous. These residents evacuated under your order. They trusted the fire service to protect their community. The expert approach is to acknowledge their loss while explaining the incident command decision-making with empathy. The phrase "property can be rebuilt" may be true factually, but it is tone-deaf coming from a fire officer to someone who just lost their family home. Life safety is the priority, yes — but communicate that with empathy and explanation, not dismissal.',
            },
          },
          {
            id: 'd',
            text: 'Offer to meet individually with every resident who lost a home and commit to replacing their homes using fire department budget.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Individual meetings are appropriate for community relations — but committing fire department resources to rebuild homes is outside the scope of incident command and sets an impossible expectation. Property recovery is a FEMA/insurance/personal responsibility issue, not a fire service issue. You can offer support (connecting them to disaster recovery services, insurance advocacy, county/state assistance programs) — but you cannot commit department resources to property replacement. This promise, made in an emotional post-incident moment, will haunt your department when it cannot be fulfilled.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'In wildland-urban interface fires with limited resources, life safety evacuation is the non-negotiable priority. Accept that some structures will be lost.',
        'Wind shift timing is critical. Early shifts (before forecast) are common in large fires. Monitor ground conditions continuously, do not rely solely on forecast.',
        'School buses and vulnerable occupant groups require dedicated logistical planning. Separate them from general evacuation routes when possible.',
        'Structure triage based on defensibility (clearance, roofing, construction) maximizes survival outcomes. Spreading resources evenly across all structures saves none.',
        'Early and sustained mandatory evacuation orders are more effective than late, uncertain shelter-in-place directives.',
        'Post-incident accountability requires owning the decision chain, explaining the resource constraints, and acknowledging both successes (life safety) and losses (structures). Deflection erodes credibility.',
      ],
      references: ['NFPA 1144 (Wildfire Preparedness)', 'NIOSH report: Camp Fire (CA) Post-Incident Analysis', 'NIOSH report: Dixie Fire (CA) Post-Incident Analysis', 'NJ Forest Fire Service Standards', 'ICS-300 Wildfire Incident Management'],
    },
  },

  // ══════════════════════════════════════════════════════════════════════
  // 3. HIGH-ANGLE RESCUE WITH DETERIORATING PATIENT — CONFINED SPACE + SILO
  // ══════════════════════════════════════════════════════════════════════
  {
    id: 'expert-high-angle-industrial',
    title: 'High-Angle Rescue with Deteriorating Patient — Industrial Silo',
    description: 'Worker fallen into a 60-foot industrial silo at a NJ grain/chemical facility. Confined space + high angle + potential atmospheric hazard. Patient is conscious but deteriorating (suspected internal bleeding). Your technical rescue team has the skills, but the atmospheric readings are borderline. Do you send your team into a marginally safe environment for a patient with uncertain survival prospects?',
    category: 'HazMat / Utilities',
    difficulty: 'Expert',
    estimatedMinutes: 30,
    creditHours: 1.0,
    passingScore: 70,
    icon: '🏗️',
    badgeColor: 'bg-red-100 text-red-800',

    setup: {
      dispatch: 'DISPATCH: Engine 12, Ladder 6, Medic 1, Technical Rescue Team (TRT) — worker rescue, grain facility 1400 Route 18, Edison. Caller reports employee fell into main storage silo approximately 8:15 a.m. Caller has made voice contact with employee — he is conscious but injured.',
      narrative: 'You are the Incident Commander, arriving at Edison Grain & Feed Co. at 8:32 a.m. on a Tuesday in late August. A 38-year-old employee (Marcus) fell into the main grain storage silo while performing interior inspection at approximately 8:15 a.m. The silo is approximately 60 feet tall, 18 feet diameter, and contains corn grain at approximately 12 feet depth. Marcus is conscious, calling for help, but reports significant pain in his left hip and lower back (potential internal bleeding based on pain location). Marcus is alert and oriented. He has fallen to the bottom of the silo, sitting in the grain. Your Technical Rescue Team has arrived. They report: "Silo entrance is at the top, rope access required. We have high-angle equipment. But we need to assess atmospheric hazard first." The facility owner is on scene stating: "The silo was emptied and inspected 2 days ago. The atmosphere should be safe." Your hazmat contractor (hired for standby during this type of work) is reporting from a gas detector: "Preliminary readings show oxygen at 19.2%, carbon dioxide at 0.8%, hydrogen sulfide at 0 ppm. But these are readings from the silo entrance, not at the grain surface where the patient is. At depth in grain, readings could be different. I recommend we take readings at 30 feet and at the grain surface before committing personnel."',
      details: [
        'Silo specs: 60 feet tall, 18 feet diameter, constructed 1995, painted steel.',
        'Grain depth: 12 feet of corn grain in the bottom.',
        'Oxygen reading (entrance): 19.2% (normal atmosphere is 20.9%; 19.2% is low but borderline workable)',
        'CO2 reading: 0.8% (normal is 0.04%; 0.8% is elevated but not immediately dangerous)',
        'H2S reading: 0 ppm (no immediate chemical hazard, but substrate at depth could release H2S)',
        'Patient: Marcus, 38, conscious, alert, oriented. Pain in left hip/lower back. Possible internal injuries from fall. Time underwater gravity increase: 17+ minutes since fall.',
        'Patient mobility: Cannot climb. Requires high-angle rescue with patient packaging.',
        'Rescue equipment: Your TRT has full high-angle rigging, rope systems, litter, harnesses. Two rescue technicians trained to NFPA 1670 Rope Rescue Level 2.',
        'Atmospheric monitoring: Hazmat contractor has gas detector and can stage readings at intervals.',
      ],
    },

    scenes: [
      {
        id: 's1',
        title: 'Scene 1 of 5 — Atmospheric Assessment & Go/No-Go Decision',
        situation: 'Your hazmat contractor is preparing to lower the gas detector on a rope to 30 feet (halfway to patient). The process will take approximately 10 minutes. Marcus is still conscious but sounding weaker on radio. He is asking: "How long until you get me out?" Your TRT lead is asking: "Do we wait for the full atmospheric profile, or do we start rigging the entrance in the meantime to shorten extraction time if we do enter?" The silo facility is approximately 50 years old in some sections and 25 years in others. The owner says, "We don\'t have records of what was stored in here before corn. Could have been fertilizer, pesticides, anything."',
        choices: [
          {
            id: 'a',
            text: 'Order full atmospheric monitoring first: readings at 30 feet, readings at the grain surface, and a composite profile. Do not begin rigging until you have confirmed oxygen is at least 19.5% at the patient location and CO2 is below 5%. If readings are marginal, request County HAZMAT or Regional Urban Search and Rescue (USAR) team.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Full atmospheric monitoring is the safe, textbook answer — but it has a cost. Taking 15-20 minutes to get a complete profile while Marcus is deteriorating in the silo means potentially losing a salvageable patient due to internal bleeding. Additionally, depending on outside HAZMAT or USAR teams adds 30+ minutes of delay. NFPA 1670 (Confined Space Operations) mandates atmospheric monitoring, yes — but the standard also acknowledges that rescue operations can proceed in marginally safe atmospheres if the risk-benefit calculation justifies it and proper precautions are taken. Marcus is conscious and alert NOW. In 20 minutes, he may be unconscious from blood loss. This answer prioritizes protocol compliance over patient outcome optimization.',
            },
          },
          {
            id: 'b',
            text: 'Conduct rapid atmospheric readings at 30 feet and at the grain surface (expedited, 5-minute protocol). Simultaneously, have TRT begin rigging the silo entrance and preparing high-angle system. If readings come back safe (O2 >19%, CO2 <5%), enter immediately. If readings are marginal (O2 19-19.5%, CO2 5-8%), do an expedited risk-benefit assessment before committing.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert risk-benefit decision. You are not abandoning atmospheric safety protocols — you are executing them in parallel with rescue preparation instead of serially. Rapid readings at 30 feet and at grain surface take 5 minutes instead of 15. While those readings are being taken, your TRT is not idle; they are rigging, which will save critical time if you do enter. The conditional entry decision (based on readings) demonstrates that you understand the risk. Readings of 19.2-19.5% O2 and 0.8-8% CO2 are in the marginal range. At that point, your decision is: "Can my rescue technicians safely work in this atmosphere for 30-45 minutes with SCBA and rescue procedures?" If they can, you enter. If the CO2 spikes to 10%+ or O2 drops below 19%, you do not. Marcus is alert and deteriorating — that is the clinical driver. NFPA 1670 allows "go" decisions in marginal atmospheres if rescue risk is monitored and managed.',
            },
          },
          {
            id: 'c',
            text: 'Start rigging the silo immediately without waiting for additional atmospheric readings. The preliminary readings show low hazard. Time is more important than additional data. Enter, extract Marcus, and manage complications after extraction.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This violates NFPA 1670 and creates unnecessary risk. You have one atmospheric reading (from the entrance, not at patient depth). H2S is 0, but stored material history is unknown — the grain could have been sitting on top of old pesticides or other chemicals that off-gas at depth. Proceeding without even a 30-foot reading is reckless. Yes, speed matters for a deteriorating patient — but entering a confined space with insufficient atmospheric data has killed rescuers. This is the decision that NIOSH Hazmat Rescue fatality investigations specifically flag. Do not skip atmospheric monitoring even to speed rescue.',
            },
          },
          {
            id: 'd',
            text: 'Keep Marcus talking on radio and provide reassurance. Assess his level of consciousness every 3 minutes. If he becomes unconscious, escalate to outside rescue teams. If he remains conscious, continue monitoring for now without entering until you have a full understanding of hazards.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is a delayed-action approach that may result in patient death. Marcus reported pain in the left hip and lower back, which suggests possible internal bleeding. Conscious deterioration in that scenario is rapid — 20 minutes to unconsciousness is realistic. Continuing to monitor while delaying rescue is a form of passive abandonment. Your TRT is trained, equipped, and on scene. The preliminary atmospheric reading is low-hazard. The responsible action is to assess rapidly and enter if readings support entry. Delaying for extended monitoring while Marcus potentially bleeds internally is medically indefensible.',
            },
          },
        ],
      },

      {
        id: 's2',
        title: 'Scene 2 of 5 — Rigging Plan Under Time Pressure',
        situation: 'Hazmat has returned readings: 30-foot level shows O2 19.4%, CO2 1.2%, H2S 0. Grain surface shows O2 18.9%, CO2 2.1%, H2S 0 (slightly lower on O2, but still workable with SCBA). Your TRT lead says: "We can enter with SCBA. But we have a problem: the silo is 60 feet deep. Marcus is at the bottom — 12 feet down from the grain surface, so approximately 48 feet below the entrance. To extract him, we need to package him in a litter, rig him for vertical removal, and haul him 60 feet. That is a complex high-angle extraction. Standard procedure is to lower a rescuer, assess the patient, package the patient, rig for haul, then haul — estimated time 1.5-2 hours." Marcus just reported to radio: "My vision is getting fuzzy, I feel cold." These are signs of significant blood loss and shock.',
        choices: [
          {
            id: 'a',
            text: 'Execute the standard 1.5-2 hour extraction procedure. Package properly, rig correctly, prioritize technical safety. Do not attempt to speed up the process — patient safety during extraction is paramount.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is technically the safest approach — but it may result in patient death. Marcus is now showing signs of decompensating shock (fuzzy vision, cold sensation). In a suspected internal bleeding scenario, decompensation can accelerate rapidly. Two hours may be longer than Marcus remains viable. The expert decision recognizes that there are two safety considerations: (1) rescuer safety during extraction, (2) patient survival given acute medical deterioration. You need to balance them. Standard procedure is necessary, but abbreviated packaging and expedited rigging can happen if the core technical safety elements (patient packaging, secure rigging, controlled haul) are maintained. You are not skipping steps — you are executing critical steps at maximum speed.',
            },
          },
          {
            id: 'b',
            text: 'Request that Marcus attempt to climb out on his own. Coach him through self-rescue. This would take 10-15 minutes and avoid the complexity of high-angle rigging if it works.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Marcus has reported left hip and lower back pain plus signs of shock (fuzzy vision, cold sensation). He cannot climb. Coaching him to self-rescue a 60-foot vertical surface with suspected internal injuries and decompensating shock is a recipe for a second rescue (patient falls mid-climb, becomes more injured) or for patient death during the climb. Do not expect patient self-rescue in this scenario.',
            },
          },
          {
            id: 'c',
            text: 'Expedite the extraction: lower one rescuer with a harness/carabiner only (no litter), have Marcus hook into the harness, haul Marcus rapidly without full patient packaging. Once Marcus is top, Medic 1 provides emergency treatment. This cuts extraction time to 30-45 minutes.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert risk-benefit extraction plan. Marcus is showing signs of decompensating shock — speed is now a medical imperative. Rapid hauling with a harness/carabiner system (rescue technician holding Marcus secured) is faster than litter-based packaging, and it avoids the time cost of full structural rigging. Yes, this is less "smooth" for the patient than a litter — but a patient in shock needs to reach medical care quickly more than they need a cushioned descent. One rescue technician descends, assess Marcus for level of consciousness and gross injury, hooks Marcus into harness, and signals for expedited haul (30-45 minutes for 60 feet is rapid but achievable with proper rigging). Medic 1 is positioned at the top for immediate airway/shock management. This balances patient medical deterioration (speed) with rescuer safety (harness, controlled system) and technical rescue standards (NFPA 1670 allows multiple extraction modalities). You are not abandoning safety — you are executing an accelerated-but-safe extraction.',
            },
          },
          {
            id: 'd',
            text: 'Lower a rescue technician with Medic 1 (two-person descent). Medic 1 initiates IV access and fluid resuscitation in the silo while the rescue technician prepares Marcus for extraction. This addresses shock while extraction is being rigged.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Good thinking from a medical standpoint — but operationally problematic. Lowering both a rescue technician AND a paramedic into a 60-foot confined space creates a two-person rescue liability if either becomes incapacitated in the marginal atmosphere. Additionally, IV access in a confined space at depth with limited movement is technically difficult and adds time. The faster approach is one rescue technician extracting Marcus rapidly, with Medic 1 providing immediate treatment at the top. That is where Marcus needs medical care most urgently — not at the bottom of a silo.',
            },
          },
        ],
      },

      {
        id: 's3',
        title: 'Scene 3 of 5 — Patient Packaging with Spinal Precautions at Height',
        situation: 'Your rescue technician has descended and is now at Marcus\'s side. Marcus is conscious but increasingly disoriented. He is having difficulty following simple commands ("Can you grab my hand?" results in slow response). His left leg is at an unnatural angle — likely fractured femur. Additionally, given the mechanism (fall into silo), there is a possibility of spinal injury. Your rescue tech is asking: "Do I package him in a full spinal immobilization device (which will take 10 minutes), or do I apply a rapid torso-only harness and get him out now?" Medic 1 is at the top, ready to receive him immediately.',
        choices: [
          {
            id: 'a',
            text: 'Order full spinal immobilization with a backboard and c-collar. Patient safety requires proper spinal precautions even if it takes extra time. Do not compromise on spinal care.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Full spinal immobilization is the textbook standard for trauma with potential spinal injury — BUT in a high-angle rescue scenario with a decompensating patient, you must weigh this against the time cost and the medical reality. Marcus is showing signs of shock (disorientation, slow response). In shock, the "window of survivability" for internal bleeding may be closing. A 10-minute packaging delay in a rapid extraction scenario can tip the balance from salvageable to dead-on-arrival. Additionally, in a confined space like a silo, maneuvering a backboard around the patient to achieve placement takes time and may be difficult. Medic 1 is at the top and can maintain spinal precautions during the haul. The expert decision recognizes that full spinal immobilization may be deferred in favor of a rapid extract with post-extraction spinal care.',
            },
          },
          {
            id: 'b',
            text: 'Apply a rapid torso harness securing the torso and pelvis, but forgo the backboard and c-collar. Instruct the rescue tech to keep Marcus\'s head as stable as possible during the haul. Medic 1 will apply spinal precautions immediately after extraction.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert medical-technical decision. Marcus is decompensating — time is the critical factor. A torso harness that secures his torso and pelvis provides basic spinal protection without the time cost of full backboard packaging. During the haul, the rescue tech maintains Marcus\'s head and neck as neutral as possible (even without c-collar, conscious guidance limits movement). Once Marcus is extracted and at ground level, Medic 1 applies a c-collar and does a full spinal assessment in a controlled environment with better light, space, and resources. This approach balances: (1) patient deterioration requiring speed, (2) spinal care through post-extraction stabilization, (3) realistic high-angle extraction constraints. It is not abandoning spinal precaution — it is executing it in two phases: basic stability (harness + rescue tech control), and full stabilization (c-collar and board post-extraction).',
            },
          },
          {
            id: 'c',
            text: 'Do not worry about spinal injury. Marcus needs to get out fast. Use a simple carabiner attachment and haul immediately with no additional packaging.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Completely abandoning spinal consideration creates the risk of converting a potentially survivable injury (internal bleeding + suspected spinal injury) into a catastrophic outcome (spinal cord damage from movement during extraction). A simple carabiner without any torso or body stabilization allows Marcus to rotate, swing, or shift during the 60-foot haul, which could cause spinal cord injury if a fracture exists. Speed is important, but not at the cost of converting a survivable trauma into a fatal one. The torso harness is the minimum acceptable standard here.',
            },
          },
          {
            id: 'd',
            text: 'Have the rescue tech ask Marcus where he has pain and assess his neuro status. If Marcus denies back pain and can move his legs, then spinal injury is unlikely. Proceed with minimal packaging.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Patient self-report in a shock/altered mental state is unreliable. Marcus is already showing signs of disorientation — he is responding slowly to commands. His pain assessment is compromised. Additionally, a patient can have a spinal fracture without neurological symptoms initially (stable fracture) — those symptoms emerge with movement. A fall into a silo is a mechanism that suggests spinal injury regardless of patient symptoms. Do not base spinal precaution decisions on altered-mental-state patient assessment. Use the mechanism and apply protective measures.',
            },
          },
        ],
      },

      {
        id: 's4',
        title: 'Scene 4 of 5 — Extraction with Patient Status Change: Cardiac Arrest During Haul',
        situation: 'Your rescue technician has packaged Marcus in a torso harness and signaled for haul. The extraction is underway — Marcus is approximately 30 feet from the entrance (halfway up) when Medic 1 reports: "Radio contact with Marcus is lost. Visual contact shows he appears unresponsive. Patient may have gone into cardiac arrest." Hauling speed is approximately 2 feet per second — another 15 seconds to the entrance. Your TRT lead is asking: "Do we continue hauling at normal speed to get him out for resuscitation, or do we slow down/stop to check on him?" CPR in a silo during extraction is not possible.',
        choices: [
          {
            id: 'a',
            text: 'Maintain hauling speed and extract Marcus immediately. Once he is at the top, Medic 1 will initiate resuscitation. Stopping mid-haul to assess while Marcus is in cardiac arrest wastes time.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert decision. Marcus may be in cardiac arrest. If so, he has minutes before irreversible brain damage. Stopping the haul to check on him while suspended 30 feet in the air adds delay and accomplishes nothing — you cannot provide CPR mid-haul in a silo. The only location where resuscitation is possible is at the top. Maintain extraction speed, get him out, and hand him to Medic 1 for resuscitation. The 15-second delay of continuous hauling is infinitely better than stopping mid-extraction. Once he is at ground level, Medic 1 begins CPR immediately.',
            },
          },
          {
            id: 'b',
            text: 'Slow the haul to a safe stop. Have the rescue technician at the top descend back down to check on Marcus (creating two rescuers on rope). Assess his condition, then haul.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'Stopping and sending a second rescuer down wastes critical time and doubles the number of people in a confined space. Marcus is 15 seconds from the surface. Stopping the haul, sending someone down, checking, then resuming could add 5-10 minutes to extraction. In a cardiac arrest scenario, every second counts. This is the opposite of the right decision.',
            },
          },
          {
            id: 'c',
            text: 'Halt the haul immediately. Do not extract a patient in cardiac arrest — it is futile. Stand down the extraction and call for a pronouncement team.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'You do not know that Marcus is in cardiac arrest — Medic 1 lost radio contact and observed unresponsiveness, but unresponsiveness does not equal cardiac arrest. Additionally, even if Marcus IS in cardiac arrest, the only way to determine if resuscitation is futile is to extract him and attempt it. You do not give up on a potential rescue 15 seconds before getting a patient to ground level where resuscitation is possible. Extracting Marcus and attempting CPR is standard protocol for any potential arrest scenario.',
            },
          },
          {
            id: 'd',
            text: 'Continue the haul slowly while having the rescue technician manage Marcus\'s airway by tilting his head back and ensuring patency. This provides basic life support while extracting.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'Attempting airway management while suspended on a rope hauling a patient is extremely difficult and dangerous. If Marcus is in cardiac arrest, he needs chest compressions (CPR), which cannot be performed mid-haul. Tilting his head may cause spinal movement if a spinal injury exists. The rescue tech is securing the extraction — they cannot manage the airway safely while securing a suspended patient. Continue the haul and deliver Marcus to Medic 1, who can manage the airway and resuscitate in a controlled location.',
            },
          },
        ],
      },

      {
        id: 's5',
        title: 'Scene 5 of 5 — Post-Incident Crew Wellness & Decision Review',
        situation: 'Marcus was extracted and delivered to Medic 1 in cardiac arrest. Resuscitation was initiated (CPR, IV access, advanced airways) and continued for 20 minutes. Return of spontaneous circulation was achieved at 9:07 a.m. He is now en route to Regional Medical Center. Your rescue technicians have exited the silo and removed SCBA. However, both rescue technicians are now reporting headaches, mild dizziness, and difficulty concentrating — signs of CO2 exposure or fatigue. They spent 35 minutes in the silo atmosphere (O2 18.9%, CO2 2.1%) with SCBA, and another 15 minutes on-scene. One of them is asking: "Did we make the right call going in? The patient went into arrest in the silo, and we still had to do the full rescue. Was it worth the risk?" There is already discussion of a post-incident review by the fire department and the facility.',
        choices: [
          {
            id: 'a',
            text: 'Debrief the crew: "You made the right call. Atmospheric readings were workable, patient was salvageable at entry, extraction was executed properly, and Marcus is now receiving hospital care. The cardiac arrest may or may not have been preventable. You did your job." Recommend the crew take the rest of the day off and follow up with occupational health.',
            outcome: {
              points: 2,
              correct: true,
              narrative: 'This is the expert post-incident crew wellness response. Your rescue technicians did execute a sound, risk-based decision: atmospheric readings were acceptable, patient was conscious and alert, time was critical due to blood loss signs, and extraction was completed safely. The cardiac arrest during extraction is a clinical outcome you could not have predicted or prevented. The crew needs to understand that: (1) their decision to enter was justified by the data available, (2) their execution was professional, (3) the adverse outcome (arrest) was not caused by a bad decision. Additionally, they need immediate wellness support: rest, occupational health follow-up (to monitor for CO2 exposure symptoms), and a formal post-incident review. Acknowledging their psychological distress while reaffirming sound decision-making protects both crew morale and department accountability.',
            },
          },
          {
            id: 'b',
            text: 'Tell the crew: "The decision to enter was marginal at best. O2 at 18.9% is below normal, CO2 was elevated. You should have waited for better atmospheric readings. The patient arrest proves the call was too risky."',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is a false reconstruction of the incident. O2 at 18.9% with SCBA protection and CO2 at 2.1% is acceptable per NFPA 1670. Blaming the crew retrospectively because the patient had a cardiac arrest creates a false causality — the arrest was not caused by the atmospheric conditions, it was caused by the patient\'s underlying injuries (internal bleeding, shock). Second-guessing the crew after the fact for a decision that was sound under the information available is demoralizing and erodes confidence in future rescue decisions. This is poor leadership.',
            },
          },
          {
            id: 'c',
            text: 'Schedule an immediate critical incident stress debriefing (CISD) for all rescue team members. Do not discuss the decision quality until after formal investigation.',
            outcome: {
              points: 1,
              correct: false,
              narrative: 'CISD is valuable — but delaying discussion of decision quality until a formal investigation is incomplete stewardship. The crew needs both immediate wellness support AND immediate reassurance that the decision was sound. Withholding that reassurance until a formal review creates anxiety and self-doubt. The proper approach is: (1) immediate field debrief with leadership affirmation, (2) same-day occupational health follow-up, (3) formal post-incident review within 1-2 days. Do not weaponize the investigation process by withholding leadership support.',
            },
          },
          {
            id: 'd',
            text: 'Do not debrief the crew immediately. Wait for the formal post-incident review before discussing the decision. Maintain professional distance.',
            outcome: {
              points: 0,
              correct: false,
              narrative: 'This is a leadership failure. Your rescue technicians are questioning whether they made the right call, they are experiencing physiological symptoms (headaches, dizziness), and they are processing a patient outcome that deteriorated during their operation. Maintaining "professional distance" while they struggle is abandonment of crew welfare. Immediate leadership debrief with wellness support is a critical function. Do the debrief, affirm sound decisions, ensure occupational health follow-up, then do the formal investigation. Both can happen.',
            },
          },
        ],
      },
    ],

    debrief: {
      keyLessons: [
        'In confined space rescues with borderline atmospheric readings, risk-benefit assessment allows entry if atmosphere is marginal (O2 19%+, CO2 <10%) and patient deterioration is acute.',
        'High-angle extraction time can be dramatically shortened by expedited (vs. standard) packaging when patient medical deterioration justifies speed.',
        'Spinal precautions in high-angle rescues can occur in two phases: basic stability during extraction (harness + rescuer control) and full stabilization post-extraction.',
        'Maintain extraction even if patient status changes during the operation (apparent cardiac arrest) — the only place to provide resuscitation is at the surface.',
        'Post-incident crew debriefing must happen immediately and must include leadership affirmation of sound decision-making, not just investigation.',
        'Atmospheric monitoring and rescue execution can happen in parallel (simultaneous rigging and gas sampling) to balance safety and speed.',
      ],
      references: ['NFPA 1670 (Confined Space Operations)', 'NFPA 1006 (Rescue Technician Professional Qualifications)', 'NIOSH IDLH values (Hydrogen Sulfide)', 'NJ Public Employees\' Occupational Safety and Health Program (PEO SH)', 'American Heart Association ACLS Guidelines'],
    },
  },
];

export function getScenarioById(id) {
  return SCENARIOS.find((s) => s.id === id) || null;
}
