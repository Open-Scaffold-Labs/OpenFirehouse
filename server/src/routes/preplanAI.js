'use strict';
/**
 * routes/preplanAI.js — AI Pre-Plan Generator for OpenFirehouse
 *
 * POST /api/preplan-ai/generate      — Generate a pre-incident plan using AI
 * POST /api/preplan-ai/enhance       — Enhance an existing pre-plan with AI suggestions
 * POST /api/preplan-ai/hazard-analysis — Analyze specific hazards for a property
 * POST /api/preplan-ai/size-up       — Generate a tactical size-up checklist
 */

const express = require('express');
const router = express.Router();
const { pool } = require('../db');

// AI provider calls go through the ONE guarded helper (utils/aiClient): budget
// check before, real token usage after, centralized model + key-safe errors.
// Prompt-injection guarding (promptGuard) is applied at each call site.
const { callAI, sendAIError } = require('../utils/aiClient');
const { guardedSystemPrompt, guardedUserPrompt } = require('../utils/promptGuard');

// ── POST /api/preplan-ai/generate ─────────────────────────────────────────────
/**
 * Generate a comprehensive pre-incident plan using AI
 */
router.post('/generate', async (req, res) => {
  try {
    const {
      address,
      propertyType,
      constructionType,
      stories,
      squareFootage,
      occupancyType,
      knownHazards,
      waterSupply,
      accessPoints,
      specialConsiderations,
    } = req.body;

    if (!address) return res.status(400).json({ error: 'address is required' });
    if (!propertyType) return res.status(400).json({ error: 'propertyType is required' });

    const systemPrompt = `You are a fire department tactical planning expert specializing in New Jersey fire services and building operations. Your role is to generate comprehensive pre-incident plans for buildings and properties.

When creating pre-incident plans, emphasize:
- New Jersey specific considerations (NJAC regulations, mutual aid districts, NJ construction styles)
- NFPA standards and best practices
- Building construction types per NFPA 220
- Occupancy classifications (NFPA 101 Life Safety Code)
- Incident scenarios (structure fire, hazmat, technical rescue, EMS MCI)
- Tactical considerations for each scenario
- Water supply strategies and hydrant locations
- Apparatus placement and staging areas
- Ventilation and exposure considerations
- Evacuation routes and RIT (Rescue in Trouble) setup
- Command post and incident control considerations

Generate the pre-incident plan in JSON format with these sections:
{
  "address": "property address",
  "propertyInfo": {
    "type": "property type",
    "constructionType": "construction classification",
    "stories": number,
    "squareFootage": number,
    "occupancyType": "classification",
    "yearBuilt": "estimated or known",
    "utilities": ["electrical main location", "gas shutoff location", "water supply details"]
  },
  "scenarios": [
    {
      "type": "scenario name (e.g., Structure Fire, Hazmat, Technical Rescue)",
      "initialActions": ["action 1", "action 2"],
      "apparatusStrategy": "deployment and positioning",
      "tacticalObjectives": ["objective 1", "objective 2"],
      "hazardsToMonitor": ["hazard 1", "hazard 2"],
      "riskLevel": "low/moderate/high/extreme"
    }
  ],
  "tactics": {
    "waterSupply": "hydrant locations, supply lines, relay considerations",
    "ventilation": "roof access, vertical shafts, window locations",
    "exposures": "adjacent buildings, occupancy exposure risks",
    "evacuationRoutes": "primary and secondary routes, special needs",
    "apparatusPlacement": "recommended staging areas and apparatus positions"
  },
  "waterSupply": {
    "hydrantLocations": ["location 1", "location 2"],
    "supplyCapability": "GPM capacity estimate",
    "relayRequired": boolean,
    "tankerDeliveryAreas": "where tanker shuttles recommended"
  },
  "safety": {
    "ritConsiderations": "RIT setup and personnel",
    "hazardsToMonitor": ["hazard 1", "hazard 2"],
    "ppeRequirements": "special PPE needs",
    "collapseRisks": "construction-specific collapse concerns"
  },
  "commandSetup": {
    "commandPostLocation": "recommended location",
    "stagingArea": "staging area location and capacity",
    "vehicleAccessRoutes": "primary access roads for apparatus"
  },
  "specialHazards": ["hazard 1", "hazard 2"]
}`;

    const hazardsText = knownHazards ? `Known hazards: ${knownHazards}` : 'None specified';
    const accessText = accessPoints ? `Access points: ${accessPoints}` : 'Standard street access';
    const waterText = waterSupply ? `Water supply notes: ${waterSupply}` : 'Public hydrant supply';
    const specialText = specialConsiderations ? `Special considerations: ${specialConsiderations}` : 'None specified';

    const userPrompt = `Generate a comprehensive pre-incident plan for the following property:

Address: ${address}
Property Type: ${propertyType}
Construction Type: ${constructionType}
Stories: ${stories || 'Unknown'}
Square Footage: ${squareFootage || 'Unknown'}
Occupancy Type: ${occupancyType || 'Unknown'}
${hazardsText}
${waterText}
${accessText}
${specialText}

Focus on NJ-specific considerations, NJAC regulations, and mutual aid coordination. Provide detailed tactical considerations for each scenario. Return only valid JSON.`;

    const planJson = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Data:\n', userPrompt),
      {
        maxTokens: 4096,
        temperature: 0.7,
        heavy: false,
        meta: { stationId: req.user.department_id, action: 'preplan_generate' },
      },
    );

    let plan;
    try {
      plan = JSON.parse(planJson);
    } catch (e) {
      console.error('Failed to parse AI response as JSON:', planJson);
      return res.status(500).json({ error: 'AI response was not valid JSON' });
    }

    res.json({ plan });
  } catch (e) {
    if (sendAIError(res, e)) return;
    console.error('Error generating pre-plan:', e.message);
    res.status(500).json({ error: 'Failed to generate pre-plan' });
  }
});

// ── POST /api/preplan-ai/enhance ───────────────────────────────────────────────
/**
 * Enhance an existing pre-plan with AI suggestions
 */
router.post('/enhance', async (req, res) => {
  try {
    const { preplanId } = req.body;

    if (!preplanId) return res.status(400).json({ error: 'preplanId is required' });

    // Fetch the existing pre-plan from the database — scoped to caller's station
    const queryResult = await pool.query(
      'SELECT * FROM pre_plans WHERE id = $1 AND department_id = $2',
      [preplanId, req.user.department_id]
    );

    if (!queryResult.rows || queryResult.rows.length === 0) {
      return res.status(404).json({ error: 'Pre-plan not found' });
    }

    const existingPlan = queryResult.rows[0];

    const systemPrompt = `You are a fire department tactical planning expert specializing in pre-incident plan review and enhancement. Review existing pre-plans and suggest improvements, missing considerations, and updated tactics based on New Jersey fire service standards and NFPA guidelines.

Return a JSON object with this structure:
{
  "suggestions": [
    {
      "category": "category name",
      "priority": "high/medium/low",
      "suggestion": "specific suggestion text",
      "rationale": "why this matters"
    }
  ],
  "riskRating": "low/moderate/high/extreme",
  "completenessScore": 0-100,
  "summary": "brief overall assessment"
}`;

    const planDetails = JSON.stringify(existingPlan);

    const userPrompt = `Review this pre-incident plan and suggest improvements:

${planDetails}

Identify:
1. Missing tactical considerations
2. Gaps in hazard assessment
3. Water supply strategy improvements
4. Ventilation/access limitations not addressed
5. RIT and safety considerations that could be enhanced
6. NJ-specific regulatory compliance items

Provide constructive, actionable suggestions prioritized by impact. Return only valid JSON.`;

    const enhancementJson = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Data:\n', userPrompt),
      {
        maxTokens: 4096,
        temperature: 0.7,
        heavy: false,
        meta: { stationId: req.user.department_id, action: 'preplan_enhance' },
      },
    );

    let enhancements;
    try {
      enhancements = JSON.parse(enhancementJson);
    } catch (e) {
      console.error('Failed to parse enhancement response:', enhancementJson);
      return res.status(500).json({ error: 'AI response was not valid JSON' });
    }

    res.json({ suggestions: enhancements.suggestions || [], riskRating: enhancements.riskRating || 'moderate', completenessScore: enhancements.completenessScore || 0 });
  } catch (e) {
    if (sendAIError(res, e)) return;
    console.error('Error enhancing pre-plan:', e.message);
    res.status(500).json({ error: 'Failed to enhance pre-plan' });
  }
});

// ── POST /api/preplan-ai/hazard-analysis ──────────────────────────────────────
/**
 * Analyze specific hazards for a property
 */
router.post('/hazard-analysis', async (req, res) => {
  try {
    const { propertyType, hazards, constructionType } = req.body;

    if (!propertyType) return res.status(400).json({ error: 'propertyType is required' });

    const systemPrompt = `You are a fire department hazmat and tactical specialist focusing on pre-incident planning. Analyze specific hazards in buildings and provide detailed tactical guidance for fire operations.

Return a JSON object with this structure:
{
  "analysis": {
    "fireBehavior": "description of fire behavior predictions based on hazards",
    "collapseRisk": "assessment of structural collapse potential",
    "hazmatRisks": "identification and behavior of hazardous materials",
    "ppeRequirements": "specific PPE requirements for responders",
    "tacticalNotes": "specific tactical considerations for fire operations",
    "exposureRisks": "risks to adjacent properties or exposures",
    "ventilationStrategy": "recommended ventilation approach given hazards"
  }
}`;

    const hazardsText = hazards && hazards.length > 0 ? hazards.join(', ') : 'None specified';

    const userPrompt = `Analyze the following property hazards for fire department pre-incident planning:

Property Type: ${propertyType}
Construction Type: ${constructionType || 'Unknown'}
Identified Hazards: ${hazardsText}

Provide detailed analysis of:
1. How these hazards affect fire behavior and spread
2. Collapse risk assessment based on hazards and construction type
3. Specific hazmat exposure risks and response protocols
4. Required PPE and protection levels for responders
5. Tactical adjustments needed for fire operations
6. Exposure risks to adjacent properties
7. Optimal ventilation strategy given the hazards

Return only valid JSON with detailed, actionable analysis.`;

    const analysisJson = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Data:\n', userPrompt),
      {
        maxTokens: 4096,
        temperature: 0.7,
        heavy: false,
        meta: { stationId: req.user.department_id, action: 'preplan_hazard_analysis' },
      },
    );

    let analysis;
    try {
      analysis = JSON.parse(analysisJson);
    } catch (e) {
      console.error('Failed to parse hazard analysis response:', analysisJson);
      return res.status(500).json({ error: 'AI response was not valid JSON' });
    }

    res.json({ analysis: analysis.analysis || analysis });
  } catch (e) {
    if (sendAIError(res, e)) return;
    console.error('Error analyzing hazards:', e.message);
    res.status(500).json({ error: 'Failed to analyze hazards' });
  }
});

// ── POST /api/preplan-ai/size-up ───────────────────────────────────────────────
/**
 * Generate a tactical size-up checklist for a specific incident
 */
router.post('/size-up', async (req, res) => {
  try {
    const { incidentType, propertyType, conditions } = req.body;

    if (!incidentType) return res.status(400).json({ error: 'incidentType is required' });

    const systemPrompt = `You are a fire department incident commander and tactical specialist. Generate comprehensive size-up checklists for various incident types.

Return a JSON object with this structure:
{
  "sizeUp": {
    "initialActions": [
      { "step": 1, "action": "action description", "priority": "immediate/high/standard" }
    ],
    "decisionPoints": [
      { "point": "decision to make", "ifYes": "action if true", "ifNo": "action if false" }
    ],
    "benchmarks": [
      { "benchmark": "benchmark criteria", "action": "action if benchmark is met", "riskLevel": "low/moderate/high/extreme" }
    ],
    "resources": ["resource 1", "resource 2"],
    "contingencies": [
      { "scenario": "if X happens", "response": "response action" }
    ]
  }
}`;

    const conditionsText = conditions || 'Current conditions unknown';

    const userPrompt = `Generate a tactical size-up checklist for this incident:

Incident Type: ${incidentType}
Property Type: ${propertyType || 'Unknown'}
Current Conditions: ${conditionsText}

Provide a structured tactical size-up checklist including:
1. Initial actions on arrival (in priority order)
2. Key decision points with if/then logic
3. Benchmark criteria that trigger escalation or additional resource requests
4. Minimum recommended resources for this scenario
5. Contingency plans for common complications
6. Safety priorities and hazard recognition points

Tailor to New Jersey fire service standards and mutual aid coordination. Return only valid JSON.`;

    const sizeUpJson = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Data:\n', userPrompt),
      {
        maxTokens: 4096,
        temperature: 0.7,
        heavy: false,
        meta: { stationId: req.user.department_id, action: 'preplan_size_up' },
      },
    );

    let sizeUp;
    try {
      sizeUp = JSON.parse(sizeUpJson);
    } catch (e) {
      console.error('Failed to parse size-up response:', sizeUpJson);
      return res.status(500).json({ error: 'AI response was not valid JSON' });
    }

    res.json({ sizeUp: sizeUp.sizeUp || sizeUp });
  } catch (e) {
    if (sendAIError(res, e)) return;
    console.error('Error generating size-up:', e.message);
    res.status(500).json({ error: 'Failed to generate size-up checklist' });
  }
});

module.exports = router;
