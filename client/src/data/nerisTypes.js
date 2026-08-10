/**
 * nerisTypes.js — Official NERIS incident types and actions/tactics
 *
 * Derived from the NERIS Core Data Schema (ulfsri/neris-framework)
 * released under public domain by the US Fire Administration / FSRI.
 *
 * Incident types use a 3-level hierarchy: category → subcategory → type
 * Actions & tactics use a 3-level hierarchy: category → subcategory → detail
 *
 * Each incident type includes an NFIRS crosswalk for backward compatibility
 * with departments still transitioning from NFIRS.
 */

// ─── NERIS INCIDENT TYPES ───────────────────────────────────────────────────

export const NERIS_INCIDENT_TYPES = {
  FIRE: {
    label: 'Fire',
    icon: '🔥',
    subcategories: {
      STRUCTURE_FIRE: {
        label: 'Structure Fire',
        types: {
          STRUCTURAL_INVOLVEMENT_FIRE: { label: 'Structural Involvement', nfirs: ['111','112','113','114','115','116','117','118'] },
          ROOM_AND_CONTENTS_FIRE:      { label: 'Room and Contents Fire', nfirs: ['121'] },
          CONFINED_COOKING_APPLIANCE_FIRE: { label: 'Confined Cooking / Appliance Fire', nfirs: ['113','116'] },
          CHIMNEY_FIRE:                { label: 'Chimney Fire', nfirs: ['114'] },
        },
      },
      OUTSIDE_FIRE: {
        label: 'Outside Fire',
        types: {
          VEGETATION_GRASS_FIRE:       { label: 'Vegetation / Grass Fire', nfirs: ['142','143'] },
          WILDFIRE_WILDLAND:           { label: 'Wildfire — Wildland', nfirs: ['141'] },
          WILDFIRE_URBAN_INTERFACE:    { label: 'Wildfire — Urban Interface', nfirs: ['141'] },
          TRASH_RUBBISH_FIRE:          { label: 'Trash / Rubbish Fire', nfirs: ['150','151'] },
          DUMPSTER_OUTDOOR_CONTAINER_FIRE: { label: 'Dumpster / Outdoor Container Fire', nfirs: ['154'] },
          CONSTRUCTION_WASTE:          { label: 'Construction Waste Fire', nfirs: ['153'] },
          OUTSIDE_TANK_FIRE:           { label: 'Outside Tank Fire', nfirs: ['160'] },
          UTILITY_INFRASTRUCTURE_FIRE: { label: 'Utility Infrastructure Fire', nfirs: ['162'] },
          OTHER_OUTSIDE_FIRE:          { label: 'Other Outside Fire', nfirs: ['140','150','160'] },
        },
      },
      TRANSPORTATION_FIRE: {
        label: 'Transportation Fire',
        types: {
          VEHICLE_FIRE_PASSENGER:      { label: 'Vehicle Fire — Passenger', nfirs: ['131'] },
          VEHICLE_FIRE_COMMERCIAL:     { label: 'Vehicle Fire — Commercial', nfirs: ['132'] },
          VEHICLE_FIRE_RV:             { label: 'Vehicle Fire — RV', nfirs: ['136','137'] },
          VEHICLE_FIRE_FOOD_TRUCK:     { label: 'Vehicle Fire — Food Truck', nfirs: ['131'] },
          BOAT_PERSONAL_WATERCRAFT_BARGE_FIRE: { label: 'Boat / Watercraft / Barge Fire', nfirs: ['134'] },
          POWERED_MOBILITY_DEVICE_FIRE: { label: 'Powered Mobility Device Fire', nfirs: ['138'] },
          TRAIN_RAIL_FIRE:             { label: 'Train / Rail Fire', nfirs: ['133'] },
          AIRCRAFT_FIRE:               { label: 'Aircraft Emergency', nfirs: ['135'] },
        },
      },
      SPECIAL_FIRE: {
        label: 'Special Fire',
        types: {
          ESS_FIRE:                    { label: 'ESS (Energy Storage System) Fire', nfirs: ['210'] },
          EXPLOSION:                   { label: 'Explosion', nfirs: ['210','211','212','213'] },
          INFRASTRUCTURE_FIRE:         { label: 'Infrastructure Fire (Tunnel, Bridge)', nfirs: ['200'] },
        },
      },
    },
  },

  HAZSIT: {
    label: 'Hazardous Situation',
    icon: '⚠️',
    subcategories: {
      HAZARDOUS_MATERIALS: {
        label: 'Hazardous Materials',
        types: {
          GAS_LEAK_ODOR:               { label: 'Gas Leak / Gas Odor', nfirs: ['411','412'] },
          FUEL_SPILL_ODOR:             { label: 'Fuel Spill / Fuel Odor', nfirs: ['413'] },
          CARBON_MONOXIDE_RELEASE:     { label: 'Carbon Monoxide Release', nfirs: ['424'] },
          HAZMAT_RELEASE_TRANSPORT:    { label: 'HazMat Release — Transportation', nfirs: ['410','420'] },
          HAZMAT_RELEASE_FACILITY:     { label: 'HazMat Release — Fixed Facility', nfirs: ['410','420'] },
          BIOLOGICAL_RELEASE_INCIDENT: { label: 'Biological Release / Incident', nfirs: ['431'] },
          RADIOACTIVE_RELEASE_INCIDENT: { label: 'Radioactive Release / Incident', nfirs: ['430'] },
        },
      },
      HAZARD_NONCHEM: {
        label: 'Non-Chemical Hazard',
        types: {
          MOTOR_VEHICLE_COLLISION:     { label: 'Motor Vehicle Collision', nfirs: ['322','323','324'] },
          ELEC_POWER_LINE_DOWN_ARCHING_MALFUNC: { label: 'Power Line Down / Arcing / Malfunction', nfirs: ['441','442'] },
          ELEC_HAZARD_SHORT_CIRCUIT:   { label: 'Electrical Hazard / Short Circuit', nfirs: ['440'] },
          BOMB_THREAT_RESPONSE_SUSPICIOUS_PACKAGE: { label: 'Bomb Threat / Suspicious Package', nfirs: ['371'] },
        },
      },
      OVERPRESSURE: {
        label: 'Overpressure',
        types: {
          RUPTURE_WITHOUT_FIRE:        { label: 'Rupture Without Fire', nfirs: ['210','211'] },
          NO_RUPTURE:                  { label: 'No Rupture', nfirs: ['200'] },
        },
      },
      INVESTIGATION: {
        label: 'Investigation',
        types: {
          ODOR:                        { label: 'Odor Investigation', nfirs: ['460'] },
          SMOKE_INVESTIGATION:         { label: 'Smoke Investigation', nfirs: ['320','321'] },
        },
      },
    },
  },

  MEDICAL: {
    label: 'Medical',
    icon: '🏥',
    subcategories: {
      ILLNESS: {
        label: 'Illness',
        types: {
          CARDIAC_ARREST:              { label: 'Cardiac Arrest', nfirs: ['321'] },
          CHEST_PAIN_NON_TRAUMA:       { label: 'Chest Pain (Non-Trauma)', nfirs: ['321'] },
          HEART_PROBLEMS:              { label: 'Heart Problems', nfirs: ['321'] },
          STROKE_CVA:                  { label: 'Stroke / CVA', nfirs: ['321'] },
          BREATHING_PROBLEMS:          { label: 'Breathing Problems', nfirs: ['321'] },
          CONVULSIONS_SEIZURES:        { label: 'Convulsions / Seizures', nfirs: ['321'] },
          DIABETIC_PROBLEMS:           { label: 'Diabetic Problems', nfirs: ['321'] },
          UNCONSCIOUS_VICTIM:          { label: 'Unconscious Victim', nfirs: ['321'] },
          ALTERED_MENTAL_STATUS:       { label: 'Altered Mental Status', nfirs: ['321'] },
          OVERDOSE:                    { label: 'Overdose / Poisoning', nfirs: ['321'] },
          ABDOMINAL_PAIN:              { label: 'Abdominal Pain / Problems', nfirs: ['321'] },
          ALLERGIC_REACTION_STINGS:    { label: 'Allergic Reaction / Stings', nfirs: ['321'] },
          BACK_PAIN_NON_TRAUMA:        { label: 'Back Pain (Non-Trauma)', nfirs: ['321'] },
          HEADACHE:                    { label: 'Headache', nfirs: ['321'] },
          NAUSEA_VOMITING:             { label: 'Nausea / Vomiting', nfirs: ['321'] },
          PREGNANCY_CHILDBIRTH:        { label: 'Pregnancy / Childbirth', nfirs: ['321'] },
          PSYCHOLOGICAL_BEHAVIOR_ISSUES: { label: 'Psychological / Behavioral', nfirs: ['321'] },
          PANDEMIC_EPIDEMIC_OUTBREAK:  { label: 'Pandemic / Epidemic / Outbreak', nfirs: ['321'] },
          SICK_CASE:                   { label: 'Sick Case', nfirs: ['321'] },
          WELL_PERSON_CHECK:           { label: 'Well Person Check', nfirs: ['321'] },
          UNKNOWN_PROBLEM:             { label: 'Unknown Problem', nfirs: ['321'] },
          NO_APPROPRIATE_CHOICE:       { label: 'No Appropriate Choice', nfirs: ['321'] },
        },
      },
      INJURY: {
        label: 'Injury / Trauma',
        types: {
          MOTOR_VEHICLE_COLLISION:     { label: 'Motor Vehicle Collision', nfirs: ['322','323'] },
          FALL:                        { label: 'Fall', nfirs: ['321'] },
          ASSAULT:                     { label: 'Assault', nfirs: ['321'] },
          GUNSHOT_WOUND:               { label: 'Gunshot Wound', nfirs: ['321'] },
          STAB_PENETRATING_TRAUMA:     { label: 'Stab / Penetrating Trauma', nfirs: ['321'] },
          BURNS_EXPLOSION:             { label: 'Burns / Explosion', nfirs: ['321'] },
          DROWNING_DIVING_SCUBA_ACCIDENT: { label: 'Drowning / Diving / SCUBA Accident', nfirs: ['321'] },
          CHOKING:                     { label: 'Choking', nfirs: ['321'] },
          ELECTROCUTION:               { label: 'Electrocution', nfirs: ['321'] },
          EYE_TRAUMA:                  { label: 'Eye Trauma', nfirs: ['321'] },
          HEMORRHAGE_LACERATION:       { label: 'Hemorrhage / Laceration', nfirs: ['321'] },
          HEAT_COLD_EXPOSURE:          { label: 'Heat / Cold Exposure', nfirs: ['321'] },
          CARBON_MONOXIDE_OTHER_INHALATION_INJURY: { label: 'CO / Inhalation Injury', nfirs: ['321'] },
          ANIMAL_BITES:                { label: 'Animal Bites', nfirs: ['321'] },
          POISONING:                   { label: 'Poisoning', nfirs: ['321'] },
          INDUSTRIAL_INACCESSIBLE_ENTRAPMENT: { label: 'Industrial / Entrapment (Non-Vehicle)', nfirs: ['321'] },
          OTHER_TRAUMATIC_INJURY:      { label: 'Other Traumatic Injury', nfirs: ['321'] },
        },
      },
      OTHER: {
        label: 'Other Medical',
        types: {
          MEDICAL_ALARM:               { label: 'Medical Alarm', nfirs: ['321'] },
          HEALTHCARE_PROFESSIONAL_ADMISSION: { label: 'Healthcare Professional Admission', nfirs: ['321'] },
          TRANSFER_INTERFACILITY:      { label: 'Transfer / Interfacility', nfirs: ['321'] },
          AIRMEDICAL_TRANSPORT:        { label: 'Airmedical Transport', nfirs: ['321'] },
          STANDBY_REQUEST:             { label: 'Standby Request', nfirs: ['321'] },
          INTERCEPT_OTHER_UNIT:        { label: 'Intercept Other Unit', nfirs: ['321'] },
          COMMUNITY_PUBLIC_HEALTH:     { label: 'Community Public Health', nfirs: ['321'] },
        },
      },
    },
  },

  RESCUE: {
    label: 'Rescue',
    icon: '🚒',
    subcategories: {
      STRUCTURE: {
        label: 'Structure',
        types: {
          BUILDING_STRUCTURE_COLLAPSE: { label: 'Building / Structure Collapse', nfirs: ['351','461'] },
          CONFINED_SPACE_RESCUE:       { label: 'Confined Space Rescue', nfirs: ['353'] },
          ELEVATOR_ESCALATOR_RESCUE:   { label: 'Elevator / Escalator Rescue', nfirs: ['353'] },
          EXTRICATION_ENTRAPPED:       { label: 'Extrication / Entrapped', nfirs: ['351','357'] },
        },
      },
      OUTSIDE: {
        label: 'Outside',
        types: {
          CONFINED_SPACE_RESCUE:       { label: 'Confined Space Rescue', nfirs: ['354'] },
          HIGH_ANGLE_RESCUE:           { label: 'High Angle Rescue', nfirs: ['355'] },
          LOW_ANGLE_RESCUE:            { label: 'Low Angle Rescue', nfirs: ['355'] },
          STEEP_ANGLE_RESCUE:          { label: 'Steep Angle Rescue', nfirs: ['355'] },
          TRENCH:                      { label: 'Trench Rescue', nfirs: ['356'] },
          EXTRICATION_ENTRAPPED:       { label: 'Extrication / Entrapped', nfirs: ['354','357'] },
          BACKCOUNTRY_RESCUE:          { label: 'Backcountry Rescue', nfirs: ['355'] },
          LIMITED_NO_ACCESS:           { label: 'Limited / No Access', nfirs: ['357'] },
        },
      },
      TRANSPORTATION: {
        label: 'Transportation (Land)',
        types: {
          MOTOR_VEHICLE_EXTRICATION_ENTRAPPED: { label: 'MVC Extrication / Entrapment', nfirs: ['352'] },
          TRAIN_RAIL_COLLISION_DERAILMENT: { label: 'Train / Rail Collision / Derailment', nfirs: ['352'] },
          AVIATION_COLLISION_CRASH:    { label: 'Aviation Collision / Crash', nfirs: ['352'] },
          AVIATION_STANDBY:            { label: 'Aviation Standby', nfirs: ['352'] },
        },
      },
      WATER: {
        label: 'Water',
        types: {
          PERSON_IN_WATER_STANDING:    { label: 'Person in Water — Standing/Lake', nfirs: ['361'] },
          PERSON_IN_WATER_SWIFTWATER:  { label: 'Person in Water — Swiftwater/River', nfirs: ['361','363'] },
          WATERCRAFT_IN_DISTRESS:      { label: 'Watercraft in Distress', nfirs: ['364'] },
        },
      },
    },
  },

  PUBSERV: {
    label: 'Public Service',
    icon: '🤝',
    subcategories: {
      CITIZEN_ASSIST: {
        label: 'Citizen Assist',
        types: {
          CITIZEN_ASSIST_SERVICE_CALL: { label: 'Citizen Assist / Service Call', nfirs: ['500','511','512'] },
          PERSON_IN_DISTRESS:          { label: 'Person in Distress', nfirs: ['480','481'] },
          LOST_PERSON:                 { label: 'Lost Person', nfirs: ['482'] },
          LIFT_ASSIST:                 { label: 'Lift Assist', nfirs: ['511'] },
        },
      },
      ALARMS_NONMED: {
        label: 'Alarms (Non-Medical)',
        types: {
          FIRE_ALARM:                  { label: 'Fire / Smoke Alarm', nfirs: ['700','710','711'] },
          GAS_ALARM:                   { label: 'Gas Alarm', nfirs: ['721'] },
          CO_ALARM:                    { label: 'CO Alarm', nfirs: ['721'] },
          OTHER_ALARM:                 { label: 'Other Alarm', nfirs: ['730','740'] },
        },
      },
      DISASTER_WEATHER: {
        label: 'Disaster / Weather',
        types: {
          WEATHER_RESPONSE:            { label: 'Weather Response', nfirs: ['811','812','813'] },
          DAMAGE_ASSESSMENT:           { label: 'Damage Assessment', nfirs: ['814','815'] },
        },
      },
      OTHER: {
        label: 'Other',
        types: {
          MOVE_UP:                     { label: 'Move-Up', nfirs: ['571'] },
          STANDBY:                     { label: 'Standby', nfirs: ['571'] },
          DAMAGED_HYDRANT:             { label: 'Damaged Hydrant', nfirs: ['571'] },
        },
      },
    },
  },

  NOEMERG: {
    label: 'No Emergency',
    icon: '✅',
    subcategories: {
      FALSE_ALARM: {
        label: 'False Alarm',
        types: {
          INTENTIONAL_FALSE_ALARM:     { label: 'Intentional False Alarm', nfirs: ['711'] },
          MALFUNCTIONING_ALARM:        { label: 'Malfunctioning Alarm', nfirs: ['712','713'] },
          ACCIDENTAL_ALARM:            { label: 'Accidental Alarm', nfirs: ['714','715'] },
          BOMB_SCARE:                  { label: 'Bomb Scare', nfirs: ['371'] },
          OTHER_FALSE_CALL:            { label: 'Other False Call', nfirs: ['700','740'] },
        },
      },
      GOOD_INTENT: {
        label: 'Good Intent',
        types: {
          NO_INCIDENT_FOUND_LOCATION_ERROR: { label: 'No Incident Found / Location Error', nfirs: ['600','611'] },
          CONTROLLED_BURNING_AUTHORIZED: { label: 'Controlled Burning (Authorized)', nfirs: ['621'] },
          SMOKE_FROM_NONHOSTILE_SOURCE: { label: 'Smoke Scare (Nonhostile Source)', nfirs: ['651','652'] },
          INVESTIGATE_HAZARDOUS_RELEASE: { label: 'Investigate Hazardous Release (Nothing Found)', nfirs: ['671','672'] },
        },
      },
      CANCELLED: {
        label: 'Cancelled',
        // NOEMERG||CANCELLED is a 2-LEVEL value in the live spec — the empty
        // type key means the stored path ends at the subcategory.
        types: {
          '':                          { label: 'Cancelled', nfirs: ['611'] },
        },
      },
    },
  },

  LAWENFORCE: {
    label: 'Law Enforcement Support',
    icon: '🚔',
    // LAWENFORCE is a BARE 1-LEVEL value in the live spec — the empty
    // subcategory/type keys mean the stored path is just 'LAWENFORCE'.
    subcategories: {
      '': {
        label: 'Law Enforcement Support',
        types: {
          '':                          { label: 'Law Enforcement Support', nfirs: ['551'] },
        },
      },
    },
  },
};


// ─── NERIS ACTIONS & TACTICS ────────────────────────────────────────────────

export const NERIS_ACTIONS_TACTICS = {
  COMMAND_AND_CONTROL: {
    label: 'Command & Control',
    items: [
      { code: 'ESTABLISH_INCIDENT_COMMAND', label: 'Establish Incident Command' },
      { code: 'SAFETY_OFFICER_ASSIGNED', label: 'Safety Officer Assigned' },
      { code: 'PIO_ASSIGNED', label: 'PIO Assigned' },
      { code: 'NOTIFY_OTHER_AGENCIES', label: 'Notify Other Agencies' },
      { code: 'INCIDENT_ASSESSMENT_COMPLETED', label: 'Incident Assessment (360°) Completed' },
      { code: 'ACCOUNTABILITY_OFFICER_ASSIGNED', label: 'Accountability Officer Assigned' },
    ],
  },
  SUPPRESSION: {
    label: 'Suppression',
    items: [
      { code: 'STRUCTURAL_FIRE_SUPPRESSION.INTERIOR', label: 'Structural — Interior' },
      { code: 'STRUCTURAL_FIRE_SUPPRESSION.EXTERIOR', label: 'Structural — Exterior' },
      { code: 'STRUCTURAL_FIRE_SUPPRESSION.EXTERIOR_AND_INTERIOR', label: 'Structural — Interior & Exterior' },
      { code: 'OUTSIDE_FIRE_SUPPRESSION.ESTABLISH_FIRE_LINES', label: 'Outside — Establish Fire Lines' },
      { code: 'OUTSIDE_FIRE_SUPPRESSION.BACKBURN', label: 'Outside — Backburn' },
      { code: 'OUTSIDE_FIRE_SUPPRESSION.CONFINEMENT', label: 'Outside — Confinement' },
      { code: 'OUTSIDE_FIRE_SUPPRESSION.STRUCTURE_PROTECTION', label: 'Outside — Structure Protection' },
      { code: 'OUTSIDE_FIRE_SUPPRESSION.FIRE_CONTROL_EXTINGUISHMENT', label: 'Outside — Fire Control / Extinguishment' },
      { code: 'OUTSIDE_FIRE_SUPPRESSION.FIRE_RETARDANT_DROP', label: 'Outside — Fire Retardant Drop' },
      { code: 'OUTSIDE_FIRE_SUPPRESSION.WATER_DROP', label: 'Outside — Water Drop' },
    ],
  },
  CONTAINMENT: {
    label: 'Containment',
    items: [
      { code: 'OUTSIDE_FIRE_SUPPRESSION.HAND_CREW_FUEL_BREAK', label: 'Hand Crew Fuel Break' },
      { code: 'OUTSIDE_FIRE_SUPPRESSION.DOZER_FUEL_BREAK', label: 'Dozer Fuel Break' },
    ],
  },
  VENTILATION: {
    label: 'Ventilation',
    items: [
      { code: 'VERTICAL', label: 'Vertical Ventilation' },
      { code: 'VERTICAL.PRIOR_TO_SUPPRESSION', label: 'Vertical — Prior to Suppression' },
      { code: 'VERTICAL.DURING_SUPPRESSION', label: 'Vertical — During Suppression' },
      { code: 'VERTICAL.POST_SUPPRESSION', label: 'Vertical — Post Suppression' },
      { code: 'HORIZONTAL', label: 'Horizontal Ventilation' },
      { code: 'HORIZONTAL.PRIOR_TO_SUPPRESSION', label: 'Horizontal — Prior to Suppression' },
      { code: 'HORIZONTAL.DURING_SUPPRESSION', label: 'Horizontal — During Suppression' },
      { code: 'HORIZONTAL.POST_SUPPRESSION', label: 'Horizontal — Post Suppression' },
      { code: 'POSITIVE_PRESSURE', label: 'Positive Pressure Ventilation' },
      { code: 'POSITIVE_PRESSURE.PRIOR_TO_SUPPRESSION', label: 'PPV — Prior to Suppression' },
      { code: 'POSITIVE_PRESSURE.DURING_SUPPRESSION', label: 'PPV — During Suppression' },
      { code: 'POSITIVE_PRESSURE.POST_SUPPRESSION', label: 'PPV — Post Suppression' },
      { code: 'HYDRAULIC', label: 'Hydraulic Ventilation' },
      { code: 'HYDRAULIC.PRIOR_TO_SUPPRESSION', label: 'Hydraulic — Prior to Suppression' },
      { code: 'HYDRAULIC.DURING_SUPPRESSION', label: 'Hydraulic — During Suppression' },
      { code: 'HYDRAULIC.POST_SUPPRESSION', label: 'Hydraulic — Post Suppression' },
    ],
  },
  SEARCH_STRUCTURE: {
    label: 'Search — Structure',
    items: [
      { code: 'DOOR_INITIATED_SEARCH', label: 'Door-Initiated Search' },
      { code: 'DOOR_INITIATED_SEARCH.PRIOR_TO_SUPPRESSION', label: 'Door-Initiated — Prior to Suppression' },
      { code: 'DOOR_INITIATED_SEARCH.DURING_SUPPRESSION', label: 'Door-Initiated — During Suppression' },
      { code: 'DOOR_INITIATED_SEARCH.POST_SUPPRESSION', label: 'Door-Initiated — Post Suppression' },
      { code: 'WINDOW_INITIATED_SEARCH', label: 'Window-Initiated Search' },
      { code: 'WINDOW_INITIATED_SEARCH.PRIOR_TO_SUPPRESSION', label: 'Window-Initiated — Prior to Suppression' },
      { code: 'WINDOW_INITIATED_SEARCH.DURING_SUPPRESSION', label: 'Window-Initiated — During Suppression' },
      { code: 'WINDOW_INITIATED_SEARCH.POST_SUPPRESSION', label: 'Window-Initiated — Post Suppression' },
    ],
  },
  NON_STRUCTURE_SEARCH: {
    label: 'Search — Non-Structure',
    items: [
      { code: 'SEARCH_AREA_OF_COLLAPSE', label: 'Search Area of Collapse' },
      { code: 'SEARCH_UNDERGROUND_INFRASTRUCTURE', label: 'Search Underground (Cave / Mine)' },
      { code: 'WIDE_AREA_OUTDOOR_SEARCH', label: 'Wide Area / Outdoor Search' },
      { code: 'SEARCH_WATERWAY', label: 'Search Waterway' },
      { code: 'BODY_RECOVERY', label: 'Body Recovery' },
      { code: 'USAR_K9_SEARCH', label: 'USAR K9 Search' },
    ],
  },
  EMERGENCY_MEDICAL_CARE: {
    label: 'Emergency Medical Care',
    items: [
      { code: 'PATIENT_ASSESSMENT', label: 'Patient Assessment' },
      { code: 'PROVIDE_BASIC_LIFE_SUPPORT', label: 'Provide Basic Life Support (BLS)' },
      { code: 'PROVIDE_ADVANCED_LIFE_SUPPORT', label: 'Provide Advanced Life Support (ALS)' },
      { code: 'PROVIDE_TRANSPORT', label: 'Provide Transport' },
      { code: 'PATIENT_REFERRAL', label: 'Patient Referral' },
    ],
  },
  // The next three are BARE single-level NERIS values (no children in the
  // live spec) — code:'' means the stored path is just the category itself.
  FORCIBLE_ENTRY: {
    label: 'Forcible Entry',
    items: [
      { code: '', label: 'Forcible Entry' },
    ],
  },
  INVESTIGATION: {
    label: 'Investigation',
    items: [
      { code: '', label: 'Investigation' },
    ],
  },
  SALVAGE_AND_OVERHAUL: {
    label: 'Salvage & Overhaul',
    items: [
      { code: '', label: 'Salvage & Overhaul' },
    ],
  },
  PERSONNEL_CONTAMINATION_REDUCTION: {
    label: 'Personnel Contamination Reduction',
    items: [
      { code: 'ON_SCENE_CONTAMINATION_REDUCTION', label: 'On-Scene Contamination Reduction' },
      { code: 'CLEAN_CAB_TRANSPORT', label: 'Clean Cab Transport' },
      { code: 'PPE_WASHED_POST_INCIDENT', label: 'PPE Washed Post-Incident' },
    ],
  },
  HAZARDOUS_SITUATION_MITIGATION: {
    label: 'HazMat Mitigation',
    items: [
      { code: 'TAKE_SAMPLES', label: 'Take Samples' },
      { code: 'SPILL_CONTROL', label: 'Spill Control' },
      { code: 'LEAK_STOP', label: 'Leak Stop' },
      { code: 'REMOVE_HAZARD', label: 'Remove Hazard' },
      { code: 'DECONTAMINATION', label: 'Decontamination' },
      { code: 'ATMOSPHERIC_MONITORING_INTERIOR', label: 'Atmospheric Monitoring — Interior' },
      { code: 'ATMOSPHERIC_MONITORING_EXTERIOR_FENCELINE', label: 'Atmospheric Monitoring — Exterior / Fenceline' },
    ],
  },
  PROVIDE_EVACUATION_SUPPORT: {
    label: 'Evacuation Support',
    items: [
      { code: 'CONNECTED_INTERIOR_SPACES', label: 'Connected Interior Spaces' },
      { code: 'REMOTE_INTERIOR_SPACES', label: 'Remote Interior Spaces' },
      { code: 'NEARBY_BUILDINGS', label: 'Nearby Buildings' },
      { code: 'LARGE_AREA', label: 'Large Area' },
    ],
  },
  PROVIDE_EQUIPMENT: {
    label: 'Provide Equipment',
    items: [
      { code: 'PROVIDE_SPECIAL_EQUIPMENT', label: 'Provide Special Equipment' },
      { code: 'PROVIDE_LIGHT', label: 'Provide Light' },
      { code: 'PROVIDE_ELECTRICAL_POWER', label: 'Provide Electrical Power' },
      { code: 'PROVIDE_DRONE_VIDEO_EQUIPMENT', label: 'Provide Drone / Video Equipment' },
    ],
  },
  PROVIDE_SERVICES: {
    label: 'Provide Services',
    items: [
      { code: 'RESTORE_SPRINKLER_SYSTEM', label: 'Restore Sprinkler System' },
      { code: 'RESTORE_RESET_ALARM_SYSTEM', label: 'Restore / Reset Alarm System' },
      { code: 'SHUT_DOWN_ALARM', label: 'Shut Down Alarm' },
      { code: 'SHUT_DOWN_SPRINKLER_SYSTEM', label: 'Shut Down Sprinkler System' },
      { code: 'SECURE_PROPERTY', label: 'Secure Property' },
      { code: 'REMOVE_WATER', label: 'Remove Water' },
      { code: 'ASSIST_UNINJURED_PERSON', label: 'Assist Uninjured Person' },
      { code: 'ASSIST_ANIMAL', label: 'Assist Animal' },
      { code: 'PROVIDE_APPARATUS_WATER', label: 'Provide Apparatus / Water' },
      { code: 'CONTROL_CROWD', label: 'Control Crowd' },
      { code: 'CONTROL_TRAFFIC', label: 'Control Traffic' },
      { code: 'DAMAGE_ASSESSMENT', label: 'Damage Assessment' },
    ],
  },
  INFORMATION_ENFORCEMENT: {
    label: 'Information / Enforcement',
    items: [
      { code: 'REFER_TO_PROPER_AHJ', label: 'Refer to Proper AHJ' },
      { code: 'ENFORCE_CODE_OR_LAW', label: 'Enforce Code or Law' },
      { code: 'PROVIDE_PUBLIC_INFORMATION', label: 'Provide Public Information' },
    ],
  },
};


// ─── NO-ACTION REASONS ──────────────────────────────────────────────────────

export const NERIS_NO_ACTION_REASONS = [
  { code: 'CANCELLED', label: 'Cancelled' },
  { code: 'STAGED_STANDBY', label: 'Staged / Standby' },
  { code: 'NO_INCIDENT_FOUND', label: 'No Incident Found' },
];

// NERIS type_hazard_disposition — required on every hazsit-typed incident.
// Values verbatim from the live NERIS API (spec 1.4.x); labels plain-language.
export const NERIS_HAZARD_DISPOSITIONS = [
  { code: 'COMPLETED_FIRE_SERVICE_ONLY', label: 'Completed — fire service only' },
  { code: 'COMPLETED_WITH_FIRE_SERVICE_PRESENT', label: 'Completed with fire service present' },
  { code: 'RELEASED_TO_LOCAL_AGENCY', label: 'Released to local agency' },
  { code: 'RELEASED_TO_COUNTY_AGENCY', label: 'Released to county agency' },
  { code: 'RELEASED_TO_STATE_AGENCY', label: 'Released to state agency' },
  { code: 'RELEASED_TO_FEDERAL_AGENCY', label: 'Released to federal agency' },
  { code: 'RELEASED_TO_PRIVATE_AGENCY', label: 'Released to private agency' },
  { code: 'RELEASED_TO_PROPERTY_OWNER', label: 'Released to property owner' },
];

/**
 * Convert the UI's dotted internal dialect to the NERIS '||' path format
 * used for STORAGE and submission (D2: store the standard's own format).
 * e.g. 'FIRE.STRUCTURE_FIRE.CHIMNEY_FIRE' → 'FIRE||STRUCTURE_FIRE||CHIMNEY_FIRE'
 */
export function toNerisPath(dotted) {
  if (!dotted || typeof dotted !== 'string') return null;
  if (dotted.includes('||')) return dotted;
  // Empty segments come from bare 1/2-level values ('NOEMERG.CANCELLED.',
  // 'LAWENFORCE..') — filtered so the stored path matches the spec exactly.
  return dotted.split('.').filter(Boolean).join('||');
}

/** Inverse of toNerisPath — for hydrating UI pickers from persisted values. */
export function fromNerisPath(path) {
  if (!path || typeof path !== 'string') return '';
  return path.includes('||') ? path.split('||').join('.') : path;
}


// ─── PHASE-2 VOCABULARIES (P2-W4) ───────────────────────────────────────────
// Codes VERBATIM from server/src/constants/neris/enums.json (spec 1.4.76) —
// labels plain-language. Drift-tested against the server enum layer in
// server/src/tests/nerisClientDataDrift.test.js: a value the server would 422
// can never ship in a picker.

// type_fire_condition_arrival
export const NERIS_FIRE_CONDITIONS = [
  { code: 'NO_SMOKE_FIRE_SHOWING', label: 'No smoke or fire showing' },
  { code: 'SMOKE_SHOWING', label: 'Smoke showing' },
  { code: 'SMOKE_FIRE_SHOWING', label: 'Smoke and fire showing' },
  { code: 'STRUCTURE_INVOLVED', label: 'Structure involved' },
  { code: 'FIRE_SPREAD_BEYOND_STRUCTURE', label: 'Fire spread beyond structure' },
  { code: 'FIRE_OUT_UPON_ARRIVAL', label: 'Fire out upon arrival' },
];

// type_water_supply
export const NERIS_WATER_SUPPLY = [
  { code: 'HYDRANT_GREATER_500', label: 'Hydrant (≥500 GPM)' },
  { code: 'HYDRANT_LESS_500', label: 'Hydrant (<500 GPM)' },
  { code: 'TANK_WATER', label: 'Tank water' },
  { code: 'WATER_TENDER_SHUTTLE', label: 'Water tender shuttle' },
  { code: 'DRAFT_FROM_STATIC_SOURCE', label: 'Draft from static source' },
  { code: 'NURSE_OTHER_APPARATUS', label: 'Nurse / other apparatus' },
  { code: 'SUPPLY_FROM_FIRE_BOAT', label: 'Supply from fire boat' },
  { code: 'FOAM_ADDITIVE', label: 'Foam additive' },
  { code: 'NONE', label: 'None' },
];

// type_fire_invest_need
export const NERIS_FIRE_INVEST_NEED = [
  { code: 'YES', label: 'Yes' },
  { code: 'NO', label: 'No' },
  { code: 'NO_CAUSE_OBVIOUS', label: 'No — cause obvious' },
  { code: 'NOT_EVALUATED', label: 'Not evaluated' },
  { code: 'NOT_APPLICABLE', label: 'Not applicable' },
  { code: 'OTHER', label: 'Other' },
];

// type_fire_invest_type
export const NERIS_FIRE_INVEST_TYPES = [
  { code: 'INVESTIGATED_ON_SCENE_RESOURCE', label: 'On-scene resource' },
  { code: 'INVESTIGATED_BY_ARSON_FIRE_INVESTIGATOR', label: 'Arson / fire investigator' },
  { code: 'INVESTIGATED_BY_STATE_FIRE_MARSHAL', label: 'State fire marshal' },
  { code: 'INVESTIGATED_BY_NONFIRE_LAW_ENFORCEMENT', label: 'Non-fire law enforcement' },
  { code: 'INVESTIGATED_BY_INSURANCE', label: 'Insurance investigator' },
  { code: 'INVESTIGATED_BY_OUTSIDE_AGENCY', label: 'Outside agency' },
  { code: 'INVESTIGATED_BY_OTHER', label: 'Other investigator' },
  { code: 'NONE', label: 'None' },
];

// type_suppress_appliance
export const NERIS_SUPPRESS_APPLIANCES = [
  { code: 'SMALL_DIAMETER_FIRE_HOSE', label: 'Small-diameter fire hose' },
  { code: 'MEDIUM_DIAMETER_FIRE_HOSE', label: 'Medium-diameter fire hose' },
  { code: 'BOOSTER_FIRE_HOSE', label: 'Booster fire hose' },
  { code: 'MASTER_STREAM', label: 'Master stream' },
  { code: 'ELEVATED_MASTER_STREAM_STANDPIPE', label: 'Elevated master stream / standpipe' },
  { code: 'GROUND_MONITOR', label: 'Ground monitor' },
  { code: 'BUILDING_STANDPIPE', label: 'Building standpipe' },
  { code: 'BUILDING_FDC', label: 'Building FDC' },
  { code: 'FIRE_EXTINGUISHER', label: 'Fire extinguisher' },
  { code: 'AIRATTACK_HELITACK', label: 'Air attack / helitack' },
  { code: 'NONE', label: 'None' },
  { code: 'OTHER', label: 'Other' },
];

// type_fire_bldg_damage
export const NERIS_FIRE_BLDG_DAMAGE = [
  { code: 'NO_DAMAGE', label: 'No damage' },
  { code: 'MINOR_DAMAGE', label: 'Minor damage' },
  { code: 'MODERATE_DAMAGE', label: 'Moderate damage' },
  { code: 'MAJOR_DAMAGE', label: 'Major damage' },
];

// type_room
export const NERIS_ROOMS = [
  { code: 'KITCHEN', label: 'Kitchen' },
  { code: 'BEDROOM', label: 'Bedroom' },
  { code: 'BATHROOM', label: 'Bathroom' },
  { code: 'LIVING_SPACE', label: 'Living space' },
  { code: 'HALLWAY_FOYER', label: 'Hallway / foyer' },
  { code: 'BASEMENT', label: 'Basement' },
  { code: 'ATTIC', label: 'Attic' },
  { code: 'GARAGE', label: 'Garage' },
  { code: 'BALCONY_PORCH_DECK', label: 'Balcony / porch / deck' },
  { code: 'UTILITY_ROOM', label: 'Utility room' },
  { code: 'OFFICE', label: 'Office' },
  { code: 'ASSEMBLY', label: 'Assembly area' },
  { code: 'OTHER', label: 'Other' },
  { code: 'UNKNOWN', label: 'Unknown' },
];

// type_fire_cause_in — structure-fire causes
export const NERIS_FIRE_CAUSE_IN = [
  { code: 'COOKING', label: 'Cooking' },
  { code: 'ELECTRICAL', label: 'Electrical' },
  { code: 'OPEN_FLAME', label: 'Open flame' },
  { code: 'SMOKING_MATERIALS_ILLICIT_DRUGS', label: 'Smoking materials / illicit drugs' },
  { code: 'OPERATING_EQUIPMENT', label: 'Operating equipment' },
  { code: 'BATTERY_POWER_STORAGE', label: 'Battery / power storage' },
  { code: 'CHEMICAL', label: 'Chemical' },
  { code: 'EXPLOSIVES_FIREWORKS', label: 'Explosives / fireworks' },
  { code: 'HEAT_FROM_ANOTHER_OBJECT', label: 'Heat from another object' },
  { code: 'OTHER_HEAT_SOURCE', label: 'Other heat source' },
  { code: 'ACT_OF_NATURE', label: 'Act of nature' },
  { code: 'INCENDIARY', label: 'Incendiary' },
  { code: 'UNABLE_TO_BE_DETERMINED', label: 'Unable to be determined' },
];

// type_fire_cause_out — outside-fire causes
export const NERIS_FIRE_CAUSE_OUT = [
  { code: 'DEBRIS_OPEN_BURNING', label: 'Debris / open burning' },
  { code: 'SPREAD_FROM_CONTROLLED_BURN', label: 'Spread from controlled burn' },
  { code: 'EQUIPMENT_VEHICLE_USE', label: 'Equipment / vehicle use' },
  { code: 'BATTERY_POWER_STORAGE', label: 'Battery / power storage' },
  { code: 'POWER_GEN_TRANS_DIST', label: 'Power generation / transmission / distribution' },
  { code: 'RAILROAD_OPS_MAINTENANCE', label: 'Railroad operations / maintenance' },
  { code: 'FIREARMS_EXPLOSIVES', label: 'Firearms / explosives' },
  { code: 'FIREWORKS', label: 'Fireworks' },
  { code: 'RECREATION_CEREMONY', label: 'Recreation / ceremony' },
  { code: 'SMOKING_MATERIALS_ILLICIT_DRUGS', label: 'Smoking materials / illicit drugs' },
  { code: 'STRUCTURE', label: 'Spread from structure' },
  { code: 'NATURAL', label: 'Natural' },
  { code: 'INCENDIARY', label: 'Incendiary' },
  { code: 'UNABLE_TO_BE_DETERMINED', label: 'Unable to be determined' },
];

// type_casualty_cause
export const NERIS_CASUALTY_CAUSES = [
  { code: 'CAUGHT_TRAPPED_BY_FIRE_EXPLOSION', label: 'Caught / trapped by fire or explosion' },
  { code: 'CAUGHT_TRAPPED_BY_OBJECT', label: 'Caught / trapped by object' },
  { code: 'STRUCK_CONTACT_WITH_OBJECT', label: 'Struck / contact with object' },
  { code: 'COLLAPSE', label: 'Collapse' },
  { code: 'FALL_JUMP', label: 'Fall / jump' },
  { code: 'EXPOSURE', label: 'Exposure' },
  { code: 'STRESS_OVEREXERTION', label: 'Stress / overexertion' },
  { code: 'VEHICLE_COLLISION', label: 'Vehicle collision' },
  { code: 'OTHER', label: 'Other' },
];

// type_medical_patient_care
export const NERIS_MEDICAL_PATIENT_CARE = [
  { code: 'PATIENT_EVALUATED_CARE_PROVIDED', label: 'Patient evaluated — care provided' },
  { code: 'PATIENT_EVALUATED_NO_CARE_REQUIRED', label: 'Patient evaluated — no care required' },
  { code: 'PATIENT_EVALUATED_REFUSED_CARE', label: 'Patient evaluated — refused care' },
  { code: 'PATIENT_REFUSED_EVALUATION_CARE', label: 'Patient refused evaluation / care' },
  { code: 'PATIENT_SUPPORT_SERVICES_PROVIDED', label: 'Patient support services provided' },
  { code: 'PATIENT_DEAD_ON_ARRIVAL', label: 'Patient dead on arrival' },
];

// type_medical_transport
export const NERIS_MEDICAL_TRANSPORT = [
  { code: 'TRANSPORT_BY_EMS_UNIT', label: 'Transport by EMS unit' },
  { code: 'OTHER_AGENCY_TRANSPORT', label: 'Other agency transport' },
  { code: 'PATIENT_REFUSED_TRANSPORT', label: 'Patient refused transport' },
  { code: 'NONPATIENT_TRANSPORT', label: 'Non-patient transport' },
  { code: 'NO_TRANSPORT', label: 'No transport' },
];

// type_medical_patient_status
export const NERIS_MEDICAL_PATIENT_STATUS = [
  { code: 'IMPROVED', label: 'Improved' },
  { code: 'UNCHANGED', label: 'Unchanged' },
  { code: 'WORSE', label: 'Worse' },
];

// ─── AID TRACKING (type_aid / type_aid_direction) ───────────────────────────

export const NERIS_AID_DIRECTIONS = [
  { code: 'GIVEN', label: 'Aid given' },
  { code: 'RECEIVED', label: 'Aid received' },
];

export const NERIS_AID_TYPES = [
  { code: 'SUPPORT_AID', label: 'Support aid' },
  { code: 'IN_LIEU_AID', label: 'In-lieu aid' },
  { code: 'ACTING_AS_AID', label: 'Acting as aid' },
];

// ─── CASUALTY & RESCUE CAPTURE (P2-D2) ──────────────────────────────────────
// Entry shape mirrors the server's neris_casualty_rescues validator
// (server/src/utils/nerisValidate.js): { type, injury, cause?, rescue_type?,
// removal? }. `type` is WHO THE PERSON IS; `rescue_type` is WHO PERFORMED the
// rescue — any combination is legal (a civilian rescued by a firefighter is
// the most common rescue in the data).

export const NERIS_CASUALTY_PERSON_TYPES = [
  { code: 'FF', label: 'Firefighter' },
  { code: 'NONFF', label: 'Civilian' },
];

export const NERIS_CASUALTY_INJURIES = [
  { code: 'NONE', label: 'Not injured' },
  { code: 'INJURED_NONFATAL', label: 'Injured' },
  { code: 'INJURED_FATAL', label: 'Fatal' },
];

// Rescue performer — grouped: the first three are FIREFIGHTER-PERFORMED
// (ffPerformed: true); only those may carry a `removal` method.
export const NERIS_RESCUE_TYPES = [
  { code: 'RESCUED_BY_FIREFIGHTER', label: 'Rescued by firefighter', ffPerformed: true },
  { code: 'RESCUED_BY_FF_RIT', label: 'Rescued by firefighter (RIT)', ffPerformed: true },
  { code: 'EVAC_ASSISTED_BY_FIREFIGHTER', label: 'Evacuation assisted by firefighter', ffPerformed: true },
  { code: 'RESCUED_BY_NONFIREFIGHTER', label: 'Rescued by non-firefighter', ffPerformed: false },
  { code: 'SELF_EVACUATION', label: 'Self-evacuation', ffPerformed: false },
  { code: 'NO_RESCUE_NEEDED', label: 'No rescue needed', ffPerformed: false },
];

/** The three firefighter-performed rescue codes — the only ones that take a removal method. */
export const FF_PERFORMED_RESCUE_TYPES = NERIS_RESCUE_TYPES
  .filter((r) => r.ffPerformed)
  .map((r) => r.code);

// How an FF-performed rescue got the person out.
export const NERIS_REMOVALS = [
  { code: 'REMOVAL_FROM_STRUCTURE', label: 'Removal from structure' },
  { code: 'EXTRICATION', label: 'Extrication' },
  { code: 'DISENTANGLEMENT', label: 'Disentanglement' },
  { code: 'RECOVERY', label: 'Recovery' },
  { code: 'OTHER', label: 'Other' },
];


// ─── HELPER: Flat list for quick lookup and backward-compatible dropdowns ───

/**
 * Returns a flat array of { code, label, category, subcategory } for all
 * NERIS incident types. Useful for search, filtering, and simple selects.
 */
export function flatIncidentTypes() {
  const result = [];
  for (const [catCode, cat] of Object.entries(NERIS_INCIDENT_TYPES)) {
    for (const [subCode, sub] of Object.entries(cat.subcategories)) {
      for (const [typeCode, type] of Object.entries(sub.types)) {
        result.push({
          code: `${catCode}.${subCode}.${typeCode}`,
          label: type.label,
          category: cat.label,
          subcategory: sub.label,
          categoryCode: catCode,
          subcategoryCode: subCode,
          typeCode,
          nfirs: type.nfirs,
        });
      }
    }
  }
  return result;
}

/**
 * Maps old OpenFirehouse flat incident type strings to the best NERIS code.
 * Used for backward compatibility with existing incident records.
 */
export const LEGACY_TYPE_MAP = {
  'Structure Fire':          'FIRE.STRUCTURE_FIRE.STRUCTURAL_INVOLVEMENT_FIRE',
  'Vehicle Fire':            'FIRE.TRANSPORTATION_FIRE.VEHICLE_FIRE_PASSENGER',
  'Brush / Wildland Fire':   'FIRE.OUTSIDE_FIRE.WILDFIRE_WILDLAND',
  'Dumpster / Rubbish Fire': 'FIRE.OUTSIDE_FIRE.DUMPSTER_OUTDOOR_CONTAINER_FIRE',
  'Vehicle Accident':        'HAZSIT.HAZARD_NONCHEM.MOTOR_VEHICLE_COLLISION',
  'Technical Rescue':        'RESCUE.OUTSIDE.EXTRICATION_ENTRAPPED',
  'Water Rescue':            'RESCUE.WATER.PERSON_IN_WATER_STANDING',
  'Medical / EMS':           'MEDICAL.ILLNESS.SICK_CASE',
  'Hazmat':                  'HAZSIT.HAZARDOUS_MATERIALS.HAZMAT_RELEASE_FACILITY',
  'Gas Leak':                'HAZSIT.HAZARDOUS_MATERIALS.GAS_LEAK_ODOR',
  'Public Assist':           'PUBSERV.CITIZEN_ASSIST.CITIZEN_ASSIST_SERVICE_CALL',
  'False Alarm':             'NOEMERG.FALSE_ALARM.ACCIDENTAL_ALARM',
  'Mutual Aid':              'PUBSERV.OTHER.MOVE_UP',
  'Other':                   'PUBSERV.CITIZEN_ASSIST.CITIZEN_ASSIST_SERVICE_CALL',
};

/**
 * Given a NERIS dotted code like "FIRE.STRUCTURE_FIRE.CHIMNEY_FIRE",
 * returns the human-readable label or the code itself if not found.
 */
export function nerisLabel(code) {
  if (!code || !code.includes('.')) return code || '';
  const [catCode, subCode, typeCode] = code.split('.');
  const cat = NERIS_INCIDENT_TYPES[catCode];
  if (!cat) return code;
  if (!subCode) return cat.label;
  const sub = cat.subcategories[subCode];
  if (!sub) return cat.label;
  if (!typeCode) return `${cat.label} — ${sub.label}`;
  const type = sub.types[typeCode];
  return type ? type.label : code;
}


// ─── FP (Fire Protection modules, 0063) — alarm/suppression vocabularies ─────
// Codes are drift-tested (EXACT set equality) against the server's generated
// enums.json; the official question wording below is drift-tested against the
// spec's own x-ui-label strings (generated into enums.json — never retyped
// without the test noticing).

// fire_protection_presence — the tri-state every module leads with.
// Deliberately NO unknown at this level (NERIS's fix for NFIRS's unknown rates);
// UNKNOWN/UNABLE_TO_DETERMINE live only in leaf vocabularies below.
export const NERIS_FP_PRESENCE = [
  { code: 'PRESENT', label: 'Present' },
  { code: 'NOT_PRESENT', label: 'Not present' },
  { code: 'NOT_APPLICABLE', label: 'Not applicable' },
];

// type_alarm_smoke
export const NERIS_ALARM_SMOKE_TYPES = [
  { code: 'HARDWIRED', label: 'Hardwired' },
  { code: 'INTERCONNECTED', label: 'Interconnected' },
  { code: 'REPLACEABLE_BATTERY_POWERED', label: 'Replaceable battery' },
  { code: 'LONG_LIFE_BATTERY_POWERED', label: 'Long-life (10-yr) battery' },
  { code: 'COMBINATION', label: 'Combination (smoke/CO)' },
  { code: 'BED_SHAKER', label: 'Bed shaker' },
  { code: 'HARD_OF_HEARING_WITH_STROBE', label: 'Hard-of-hearing / strobe' },
  { code: 'UNKNOWN', label: 'Unknown' },
];

// type_alarm_operation — shared by the smoke-alarm operation branch and the
// fire-alarm operation_type (one spec set, two uses).
export const NERIS_ALARM_OPERATIONS = [
  { code: 'OPERATED_ALERTED_OCCUPANT', label: 'Operated — alerted occupants' },
  { code: 'OPERATED_FAILED_TO_ALERT_OCCUPANT', label: 'Operated — failed to alert occupants' },
  { code: 'FAILED_TO_OPERATE', label: 'Failed to operate' },
  { code: 'NO_OCCUPANT_TO_NOTIFY', label: 'No occupant to notify' },
  { code: 'INSUFFICIENT_SOURCE', label: 'Fire too small to activate (insufficient source)' },
];

// type_occupant_response
export const NERIS_OCCUPANT_RESPONSES = [
  { code: 'EVACUATED', label: 'Evacuated' },
  { code: 'ATTEMPTED_TO_EXTINGUISH', label: 'Attempted to extinguish' },
  { code: 'ATTEMPTED_TO_RESCUE_OCCUPANTS', label: 'Attempted to rescue occupants' },
  { code: 'ATTEMPTED_TO_RESCUE_ANIMALS', label: 'Attempted to rescue animals' },
  { code: 'IGNORED_ALARM', label: 'Ignored alarm' },
  { code: 'UNABLE_TO_RESPOND', label: 'Unable to respond' },
  { code: 'UNKNOWN', label: 'Unknown' },
];

// type_alarm_failure
export const NERIS_ALARM_FAILURES = [
  { code: 'NO_BATTERY', label: 'No battery' },
  { code: 'EXPIRED', label: 'Expired unit' },
  { code: 'DEVICE_MALFUNCTION', label: 'Device malfunction' },
  { code: 'IMPROPER_INSTALLATION', label: 'Improper installation / placement' },
  { code: 'TAMPER', label: 'Tampered / disabled' },
  { code: 'OTHER_NON_FUNCTIONAL_CAUSE', label: 'Other non-functional cause' },
  { code: 'UNABLE_TO_DETERMINE', label: 'Unable to determine' },
];

// type_alarm_fire
export const NERIS_ALARM_FIRE_TYPES = [
  { code: 'AUTOMATIC', label: 'Automatic' },
  { code: 'MANUAL', label: 'Manual (pull stations)' },
  { code: 'MANUAL_AND_AUTOMATIC', label: 'Manual and automatic' },
];

// type_alarm_other
export const NERIS_ALARM_OTHER_TYPES = [
  { code: 'CARBON_MONOXIDE', label: 'Carbon monoxide (CO)' },
  { code: 'HEAT_DETECTOR', label: 'Heat detector' },
  { code: 'NATURAL_GAS', label: 'Natural gas' },
  { code: 'OTHER_CHEMICAL_DETECTOR', label: 'Other chemical detector' },
];

// type_suppress_fire
export const NERIS_SUPPRESS_FIRE_TYPES = [
  { code: 'WET_PIPE_SPRINKLER_SYSTEM', label: 'Wet-pipe sprinkler' },
  { code: 'DRY_PIPE_SPRINKLER_SYSTEM', label: 'Dry-pipe sprinkler' },
  { code: 'PRE_ACTION_SYSTEM', label: 'Pre-action system' },
  { code: 'DELUGE_SYSTEM', label: 'Deluge system' },
  { code: 'CLEAN_AGENT_SYSTEM', label: 'Clean-agent system' },
  { code: 'INDUSTRIAL_DRY_CHEM_SYSTEM', label: 'Industrial dry-chem system' },
  { code: 'OTHER', label: 'Other' },
  { code: 'UNKNOWN', label: 'Unknown' },
];

// type_full_partial — coverage extent of a suppression system
export const NERIS_FULL_PARTIAL = [
  { code: 'FULL', label: 'Full coverage' },
  { code: 'PARTIAL', label: 'Partial coverage' },
  { code: 'EXTENT_UNKNOWN', label: 'Extent unknown' },
];

// type_suppress_operation — shared by fire_suppression's effectiveness branch
// and cooking_fire_suppression's flat operation_type (one spec set, two uses).
export const NERIS_SUPPRESS_OPERATIONS = [
  { code: 'OPERATED_EFFECTIVE', label: 'Operated — effective' },
  { code: 'OPERATED_NOT_EFFECTIVE', label: 'Operated — not effective' },
  { code: 'NO_OPERATION', label: 'Did not operate' },
];

// type_suppress_no_operation
export const NERIS_SUPPRESS_NO_OPERATIONS = [
  { code: 'SYSTEM_SHUTOFF_PRIOR_TO_INCIDENT', label: 'System shut off before the incident' },
  { code: 'SYSTEM_SHUTOFF_DURING_INCIDENT', label: 'System shut off during the incident' },
  { code: 'SYSTEM_DAMAGED_COMPROMISED', label: 'System damaged / compromised' },
  { code: 'SYSTEM_INOPERABLE', label: 'System inoperable' },
  { code: 'SYSTEM_NOT_SUITABLE', label: 'System not suitable for this fire' },
  { code: 'INSUFFICIENT_WATER_SUPPLY', label: 'Insufficient water supply' },
  { code: 'INSUFFICIENT_SOURCE', label: 'Fire too small to activate (insufficient source)' },
  { code: 'UNABLE_TO_DETERMINE', label: 'Unable to determine' },
];

// type_suppress_cooking
export const NERIS_SUPPRESS_COOKING_TYPES = [
  { code: 'COMMERCIAL_HOOD_SUPPRESSION', label: 'Commercial hood suppression' },
  { code: 'RESIDENTIAL_HOOD_MOUNTED', label: 'Residential hood-mounted' },
  { code: 'TEMPERATURE_LIMITING_STOVE', label: 'Temperature-limiting stove' },
  { code: 'ELECTRIC_POWER_CUTOFF_DEVICE', label: 'Electric power cutoff device' },
  { code: 'OTHER', label: 'Other' },
];

// The OFFICIAL question wording — the spec's own x-ui-label strings, verbatim.
// Drift-tested against enums.json fire_protection_labels (generated from the
// vendored OpenAPI snapshot). USFA/FSRI's words, not ours.
export const NERIS_FP_QUESTIONS = {
  smoke_alarm: 'Describe whether there was at least one smoke alarm present.',
  fire_alarm: 'Describe whether the building was fitted with a whole building fire alarm system that includes fire detection devices, alarm pull stations, and alarm notification devices.',
  other_alarm: 'Describe whether other alarm systems for detecting gases or other harmful conditions were installed within the building.',
  fire_suppression: 'Describe whether there was a fire suppression (sprinkler) system in the building.',
  cooking_fire_suppression: 'Describe whether there was any type of fire protection system or fire prevention technology focused on reducing damage from cooking fires installed above or in proximity of the cooking appliance.',
};
