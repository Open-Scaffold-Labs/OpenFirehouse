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
          BACKOUNTRY_RESCUE:           { label: 'Backcountry Rescue', nfirs: ['355'] },
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
        types: {
          CANCELLED:                   { label: 'Cancelled', nfirs: ['611'] },
        },
      },
    },
  },

  LAWENFORCE: {
    label: 'Law Enforcement Support',
    icon: '🚔',
    subcategories: {
      LAWENFORCE: {
        label: 'Law Enforcement Support',
        types: {
          LAW_ENFORCEMENT_SUPPORT:     { label: 'Law Enforcement Support', nfirs: ['551'] },
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
      { code: 'STRUCTURAL_FIRE_SUPPRESSION_INTERIOR', label: 'Structural — Interior' },
      { code: 'STRUCTURAL_FIRE_SUPPRESSION_EXTERIOR', label: 'Structural — Exterior' },
      { code: 'STRUCTURAL_FIRE_SUPPRESSION_EXTERIOR_AND_INTERIOR', label: 'Structural — Interior & Exterior' },
      { code: 'OUTSIDE_FIRE_SUPPRESSION_ESTABLISH_FIRE_LINES', label: 'Outside — Establish Fire Lines' },
      { code: 'OUTSIDE_FIRE_SUPPRESSION_BACKBURN', label: 'Outside — Backburn' },
      { code: 'OUTSIDE_FIRE_SUPPRESSION_CONFINEMENT', label: 'Outside — Confinement' },
      { code: 'OUTSIDE_FIRE_SUPPRESSION_STRUCTURE_PROTECTION', label: 'Outside — Structure Protection' },
      { code: 'OUTSIDE_FIRE_SUPPRESSION_FIRE_CONTROL_EXTINGUISHMENT', label: 'Outside — Fire Control / Extinguishment' },
      { code: 'OUTSIDE_FIRE_SUPPRESSION_FIRE_RETARDANT_DROP', label: 'Outside — Fire Retardant Drop' },
      { code: 'OUTSIDE_FIRE_SUPPRESSION_WATER_DROP', label: 'Outside — Water Drop' },
    ],
  },
  CONTAINMENT: {
    label: 'Containment',
    items: [
      { code: 'HAND_CREW_FUEL_BREAK', label: 'Hand Crew Fuel Break' },
      { code: 'DOZER_FUEL_BREAK', label: 'Dozer Fuel Break' },
    ],
  },
  VENTILATION: {
    label: 'Ventilation',
    items: [
      { code: 'VERTICAL', label: 'Vertical Ventilation' },
      { code: 'VERTICAL_PRIOR_TO_SUPPRESSION', label: 'Vertical — Prior to Suppression' },
      { code: 'VERTICAL_DURING_SUPPRESSION', label: 'Vertical — During Suppression' },
      { code: 'VERTICAL_POST_SUPPRESSION', label: 'Vertical — Post Suppression' },
      { code: 'HORIZONTAL', label: 'Horizontal Ventilation' },
      { code: 'HORIZONTAL_PRIOR_TO_SUPPRESSION', label: 'Horizontal — Prior to Suppression' },
      { code: 'HORIZONTAL_DURING_SUPPRESSION', label: 'Horizontal — During Suppression' },
      { code: 'HORIZONTAL_POST_SUPPRESSION', label: 'Horizontal — Post Suppression' },
      { code: 'POSITIVE_PRESSURE', label: 'Positive Pressure Ventilation' },
      { code: 'POSITIVE_PRESSURE_PRIOR_TO_SUPPRESSION', label: 'PPV — Prior to Suppression' },
      { code: 'POSITIVE_PRESSURE_DURING_SUPPRESSION', label: 'PPV — During Suppression' },
      { code: 'POSITIVE_PRESSURE_POST_SUPPRESSION', label: 'PPV — Post Suppression' },
      { code: 'HYDRAULIC', label: 'Hydraulic Ventilation' },
      { code: 'HYDRAULIC_PRIOR_TO_SUPPRESSION', label: 'Hydraulic — Prior to Suppression' },
      { code: 'HYDRAULIC_DURING_SUPPRESSION', label: 'Hydraulic — During Suppression' },
      { code: 'HYDRAULIC_POST_SUPPRESSION', label: 'Hydraulic — Post Suppression' },
    ],
  },
  SEARCH_STRUCTURE: {
    label: 'Search — Structure',
    items: [
      { code: 'DOOR_INITIATED_SEARCH', label: 'Door-Initiated Search' },
      { code: 'DOOR_INITIATED_SEARCH_PRIOR_TO_SUPPRESSION', label: 'Door-Initiated — Prior to Suppression' },
      { code: 'DOOR_INITIATED_SEARCH_DURING_SUPPRESSION', label: 'Door-Initiated — During Suppression' },
      { code: 'DOOR_INITIATED_SEARCH_POST_SUPPRESSION', label: 'Door-Initiated — Post Suppression' },
      { code: 'WINDOW_INITIATED_SEARCH', label: 'Window-Initiated Search' },
      { code: 'WINDOW_INITIATED_SEARCH_PRIOR_TO_SUPPRESSION', label: 'Window-Initiated — Prior to Suppression' },
      { code: 'WINDOW_INITIATED_SEARCH_DURING_SUPPRESSION', label: 'Window-Initiated — During Suppression' },
      { code: 'WINDOW_INITIATED_SEARCH_POST_SUPPRESSION', label: 'Window-Initiated — Post Suppression' },
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
  FORCIBLE_ENTRY: {
    label: 'Forcible Entry',
    items: [
      { code: 'FORCIBLE_ENTRY', label: 'Forcible Entry' },
    ],
  },
  INVESTIGATION: {
    label: 'Investigation',
    items: [
      { code: 'INVESTIGATION', label: 'Investigation' },
    ],
  },
  SALVAGE_AND_OVERHAUL: {
    label: 'Salvage & Overhaul',
    items: [
      { code: 'SALVAGE_AND_OVERHAUL', label: 'Salvage & Overhaul' },
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


// ─── AID TRACKING ──────────────────────────────────────────────────────────

export const NERIS_AID_DIRECTION = [
  { code: 'GIVEN', label: 'Aid Given' },
  { code: 'RECEIVED', label: 'Aid Received' },
];

export const NERIS_AID_TYPE = [
  { code: 'MUTUAL_AID', label: 'Mutual Aid' },
  { code: 'AUTOMATIC_AID', label: 'Automatic Aid' },
  { code: 'OTHER_AID', label: 'Other Aid' },
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
