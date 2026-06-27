const express = require('express');
const { pool } = require('../db');

const router = express.Router();

// AI provider calls go through the ONE guarded helper (utils/aiClient): budget
// check before + usage recording after, centralized model strings, key-safe
// error mapping. Untrusted record data is wrapped via promptGuard at each call.
const { callAI, sendAIError } = require('../utils/aiClient');
const { guardedSystemPrompt, guardedUserPrompt } = require('../utils/promptGuard');

// ─── Actual DB schema reference ─────────────────────────────────────────────
// members:                id, "memberNumber", name, rank, role, status, joined, ...
// training:               id, "memberId", "memberName", "courseName", type, status, "completedDate", "expiresDate", hours, instructor, ...
// member_qualifications:  id, member_id, station_id, cert_type, cert_name, issued_date, expiry_date, issuing_authority, cert_number, status, ...
// incidents:              id, "incidentNumber", date, time, type, ...
// ─────────────────────────────────────────────────────────────────────────────

// GET /api/training-ai/gaps - Training gap analysis
router.get('/gaps', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    // Get all active members (status column uses 'Active' / 'Probationary' etc.)
    const membersRes = await pool.query(
      `SELECT id, name, "createdAt" FROM members WHERE status IN ('Active', 'Probationary') AND department_id = $1`,
      [stationId]
    );
    const members = membersRes.rows;
    const totalMembers = members.length;

    // Get members with expired or expiring certifications (within 90 days)
    // expiry_date is stored as TEXT, so we cast it
    const expiringRes = await pool.query(`
      SELECT mq.id, m.name, mq.cert_name AS qualification_name, mq.expiry_date,
             CASE
               WHEN mq.expiry_date ~ '^\\d{4}-\\d{2}-\\d{2}' THEN
                 (mq.expiry_date::date - CURRENT_DATE)
               ELSE NULL
             END AS days_until_expiry
      FROM member_qualifications mq
      JOIN members m ON mq.member_id = m.id
      WHERE m.status IN ('Active', 'Probationary')
        AND m.department_id = $1
        AND mq.expiry_date IS NOT NULL
        AND mq.expiry_date != ''
        AND mq.expiry_date ~ '^\\d{4}-\\d{2}-\\d{2}'
        AND mq.expiry_date::date <= CURRENT_DATE + INTERVAL '90 days'
      ORDER BY mq.expiry_date::date ASC
    `, [stationId]);
    const expiringCerts = expiringRes.rows;

    // Get members who haven't trained in 30+ days
    // training."completedDate" is TEXT (e.g. "2025-03-15"), cast where valid
    const inactiveRes = await pool.query(`
      SELECT m.id, m.name,
             MAX(CASE WHEN t."completedDate" ~ '^\\d{4}-\\d{2}-\\d{2}' THEN t."completedDate"::date ELSE NULL END) AS last_training_date,
             CASE
               WHEN MAX(CASE WHEN t."completedDate" ~ '^\\d{4}-\\d{2}-\\d{2}' THEN t."completedDate"::date ELSE NULL END) IS NOT NULL
               THEN (CURRENT_DATE - MAX(CASE WHEN t."completedDate" ~ '^\\d{4}-\\d{2}-\\d{2}' THEN t."completedDate"::date ELSE NULL END))
               ELSE NULL
             END AS days_since_training
      FROM members m
      LEFT JOIN training t ON m.id = t."memberId"
      WHERE m.status IN ('Active', 'Probationary')
        AND m.department_id = $1
      GROUP BY m.id, m.name
      HAVING MAX(CASE WHEN t."completedDate" ~ '^\\d{4}-\\d{2}-\\d{2}' THEN t."completedDate"::date ELSE NULL END) IS NULL
          OR MAX(CASE WHEN t."completedDate" ~ '^\\d{4}-\\d{2}-\\d{2}' THEN t."completedDate"::date ELSE NULL END) <= CURRENT_DATE - INTERVAL '30 days'
      ORDER BY last_training_date ASC NULLS FIRST
    `, [stationId]);
    const inactiveMembers = inactiveRes.rows;

    // Get cert types and calculate adoption percentage
    // No separate qualifications table — aggregate from member_qualifications
    const qualsRes = await pool.query(`
      SELECT mq.cert_name AS name,
             COUNT(DISTINCT mq.member_id) AS members_with_qual,
             CASE WHEN $1 > 0 THEN (COUNT(DISTINCT mq.member_id) * 100.0 / $1) ELSE 0 END AS adoption_percentage
      FROM member_qualifications mq
      JOIN members m ON mq.member_id = m.id
      WHERE m.status IN ('Active', 'Probationary')
        AND m.department_id = $2
        AND mq.status = 'active'
      GROUP BY mq.cert_name
      HAVING COUNT(DISTINCT mq.member_id) < ($1 * 0.5)
      ORDER BY adoption_percentage ASC
    `, [totalMembers || 1, stationId]);
    const gapAreas = qualsRes.rows.map(row => ({
      qualification: row.name,
      membersWithQual: parseInt(row.members_with_qual),
      adoptionPercentage: parseFloat(row.adoption_percentage).toFixed(1)
    }));

    // Calculate average training hours this year
    const hoursRes = await pool.query(`
      SELECT AVG(hours) AS avg_hours
      FROM training
      WHERE "completedDate" ~ '^\\d{4}-'
        AND EXTRACT(YEAR FROM "completedDate"::date) = EXTRACT(YEAR FROM CURRENT_DATE)
        AND department_id = $1
    `, [stationId]);
    const avgTrainingHours = parseFloat(hoursRes.rows[0]?.avg_hours || 0).toFixed(1);

    // Calculate certification compliance rate (members with no expired certs)
    const complianceRes = await pool.query(`
      SELECT COUNT(DISTINCT m.id) AS compliant_members
      FROM members m
      WHERE m.status IN ('Active', 'Probationary')
        AND m.department_id = $1
        AND NOT EXISTS (
          SELECT 1 FROM member_qualifications mq
          WHERE mq.member_id = m.id
            AND mq.expiry_date IS NOT NULL
            AND mq.expiry_date != ''
            AND mq.expiry_date ~ '^\\d{4}-\\d{2}-\\d{2}'
            AND mq.expiry_date::date < CURRENT_DATE
        )
    `, [stationId]);
    const compliantMembers = parseInt(complianceRes.rows[0]?.compliant_members || 0);
    const certComplianceRate = totalMembers > 0 ? ((compliantMembers / totalMembers) * 100).toFixed(1) : 0;

    res.json({
      expiringCerts,
      inactiveMembers,
      gapAreas,
      stats: {
        totalMembers,
        avgTrainingHours: parseFloat(avgTrainingHours),
        certComplianceRate: parseFloat(certComplianceRate)
      }
    });
  } catch (e) {
    console.error('training-ai /gaps error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/training-ai/recommend - AI-powered personalized recommendations
router.post('/recommend', async (req, res) => {
  try {
    const { memberId } = req.body;
    const stationId = req.user.department_id;

    let memberData = null;
    let trainingHistory = [];
    let qualifications = [];

    if (memberId) {
      // Get specific member's data (station-scoped — 404 on cross-station ids)
      const memberRes = await pool.query(
        'SELECT id, name, rank, role FROM members WHERE id = $1 AND department_id = $2',
        [memberId, stationId]
      );
      memberData = memberRes.rows[0];

      if (!memberData) {
        return res.status(404).json({ error: 'Member not found' });
      }

      // Get training history
      const trainingRes = await pool.query(`
        SELECT "completedDate", "courseName", type, hours, instructor
        FROM training
        WHERE "memberId" = $1 AND department_id = $2
        ORDER BY "completedDate" DESC
        LIMIT 10
      `, [memberId, stationId]);
      trainingHistory = trainingRes.rows;

      // Get qualifications/certs
      const qualsRes = await pool.query(`
        SELECT cert_name, cert_type, issued_date, expiry_date, status
        FROM member_qualifications
        WHERE member_id = $1 AND department_id = $2
        ORDER BY issued_date DESC
      `, [memberId, stationId]);
      qualifications = qualsRes.rows;
    } else {
      // Department-wide recommendation
      const memberRes = await pool.query(`
        SELECT m.id, m.name, COUNT(t.id) AS training_count
        FROM members m
        LEFT JOIN training t ON m.id = t."memberId"
        WHERE m.status IN ('Active', 'Probationary')
          AND m.department_id = $1
        GROUP BY m.id, m.name
        ORDER BY training_count ASC
        LIMIT 5
      `, [stationId]);
      memberData = { isDepartmentWide: true, membersNeedingAttention: memberRes.rows };
    }

    const systemPrompt = `You are an expert fire department training coordinator specializing in developing personalized training plans.
Provide recommendations based on NFPA standards, incident response patterns, and certification requirements.
Focus on addressing skill gaps, preventing certificate expirations, and improving department capabilities.`;

    const userPrompt = memberId
      ? `Create a personalized training recommendation for ${memberData.name}, Rank: ${memberData.rank}, Role: ${memberData.role}.

Recent Training History (last 10):
${trainingHistory.map(t => `- ${t.completedDate}: ${t.courseName} / ${t.type} (${t.hours}hrs)`).join('\n')}

Current Certifications:
${qualifications.map(q => `- ${q.cert_name} (${q.cert_type}): issued ${q.issued_date}, expires ${q.expiry_date || 'N/A'}, status: ${q.status}`).join('\n')}

Provide 3-5 specific, actionable training recommendations with priority levels (high/medium/low) and suggested timelines.`
      : `Create department-wide training recommendations based on gaps and compliance needs.

Members most needing attention:
${memberData.membersNeedingAttention.map(m => `- ${m.name} (${m.training_count} trainings)`).join('\n')}

Provide strategic recommendations to improve overall department training and compliance.`;

    const aiResponse = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Data:\n', userPrompt),
      { maxTokens: 4096, temperature: 0.7, heavy: false, meta: { stationId: req.user.department_id, action: 'training_recommend' } },
    );

    // Parse AI response into structured recommendations
    const recommendations = aiResponse.split('\n').filter(line => line.trim()).map((rec, idx) => ({
      id: idx + 1,
      text: rec,
      priority: rec.toLowerCase().includes('high') ? 'high' : rec.toLowerCase().includes('medium') ? 'medium' : 'low'
    }));

    const priority = recommendations.some(r => r.priority === 'high') ? 'high' : recommendations.some(r => r.priority === 'medium') ? 'medium' : 'low';

    res.json({
      memberId,
      memberName: memberData.name || 'Department-Wide',
      recommendations,
      priority,
      summary: aiResponse.substring(0, 200) + '...'
    });
  } catch (e) {
    if (sendAIError(res, e)) return;
    console.error('training-ai /recommend error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// POST /api/training-ai/curriculum - AI-generated training curriculum
router.post('/curriculum', async (req, res) => {
  try {
    const { topic, duration, targetAudience, objectives } = req.body;

    if (!topic || !duration) {
      return res.status(400).json({ error: 'Topic and duration are required' });
    }

    const systemPrompt = `You are an expert fire department training instructor. Create detailed, structured training curricula that meet NFPA standards and practical fire service needs. Format response as valid JSON.`;

    const userPrompt = `Create a structured training curriculum with the following details:
Topic: ${topic}
Duration: ${duration}
Target Audience: ${Array.isArray(targetAudience) ? targetAudience.join(', ') : targetAudience}
Objectives: ${objectives || 'Provide comprehensive training on the topic'}

Respond with ONLY valid JSON in this exact format (no markdown, no code blocks):
{
  "title": "Training Title",
  "overview": "Brief overview",
  "objectives": ["objective1", "objective2"],
  "sessions": [
    {
      "title": "Session Title",
      "duration": "duration",
      "content": "detailed content",
      "materials": ["material1", "material2"],
      "exercises": ["exercise1", "exercise2"]
    }
  ],
  "assessment": "Assessment method description"
}`;

    const aiResponse = await callAI(
      guardedSystemPrompt(systemPrompt),
      guardedUserPrompt('Data:\n', userPrompt),
      { maxTokens: 4096, temperature: 0.7, heavy: false, meta: { stationId: req.user.department_id, action: 'training_curriculum' } },
    );

    // Parse JSON response
    let curriculum;
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
      curriculum = jsonMatch ? JSON.parse(jsonMatch[0]) : {
        title: topic,
        overview: aiResponse,
        objectives: [objectives],
        sessions: [{ title: 'Session 1', duration, content: aiResponse, materials: [], exercises: [] }],
        assessment: 'Practical demonstration and written exam'
      };
    } catch (parseErr) {
      curriculum = {
        title: topic,
        overview: aiResponse,
        objectives: [objectives],
        sessions: [{ title: 'Session 1', duration, content: aiResponse, materials: [], exercises: [] }],
        assessment: 'Practical demonstration and written exam'
      };
    }

    res.json(curriculum);
  } catch (e) {
    if (sendAIError(res, e)) return;
    console.error('training-ai /curriculum error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// GET /api/training-ai/compliance - Compliance dashboard data
router.get('/compliance', async (req, res) => {
  try {
    const stationId = req.user.department_id;
    // Get total active members
    const membersRes = await pool.query(
      `SELECT COUNT(*) AS total FROM members WHERE status IN ('Active', 'Probationary') AND department_id = $1`,
      [stationId]
    );
    const totalMembers = parseInt(membersRes.rows[0].total);

    // Helper: count members with a cert matching a pattern
    async function countCertHolders(pattern) {
      const r = await pool.query(`
        SELECT COUNT(DISTINCT mq.member_id) AS compliant
        FROM member_qualifications mq
        JOIN members m ON mq.member_id = m.id
        WHERE m.status IN ('Active', 'Probationary')
          AND m.department_id = $2
          AND mq.cert_name ILIKE $1
          AND mq.status = 'active'
          AND (mq.expiry_date IS NULL OR mq.expiry_date = ''
               OR NOT mq.expiry_date ~ '^\\d{4}-\\d{2}-\\d{2}'
               OR mq.expiry_date::date >= CURRENT_DATE)
      `, [pattern, stationId]);
      return parseInt(r.rows[0].compliant);
    }

    const nfpa1001Compliant = await countCertHolders('%1001%');
    const nfpa1002Compliant = await countCertHolders('%1002%');
    const nfpa1403Compliant = await countCertHolders('%1403%');
    const nfpa1500Compliant = await countCertHolders('%1500%');
    const oshaCompliant     = await countCertHolders('%OSHA%');

    const pct = (n) => totalMembers > 0 ? ((n / totalMembers) * 100).toFixed(1) : '0.0';

    // Get training hours this year
    const hoursRes = await pool.query(`
      SELECT COALESCE(SUM(hours), 0) AS total_hours
      FROM training
      WHERE "completedDate" ~ '^\\d{4}-'
        AND EXTRACT(YEAR FROM "completedDate"::date) = EXTRACT(YEAR FROM CURRENT_DATE)
        AND department_id = $1
    `, [stationId]);
    const trainingHoursThisYear = parseInt(hoursRes.rows[0]?.total_hours || 0);
    const requiredHoursPerMember = 40;
    const requiredHoursTotal = totalMembers * requiredHoursPerMember;

    // Get member-by-member compliance
    const memberComplianceRes = await pool.query(`
      SELECT m.id, m.name, m.rank AS position,
             COUNT(DISTINCT CASE WHEN mq.cert_name ILIKE '%1001%' AND mq.status = 'active'
                                  AND (mq.expiry_date IS NULL OR mq.expiry_date = ''
                                       OR NOT mq.expiry_date ~ '^\\d{4}-\\d{2}-\\d{2}'
                                       OR mq.expiry_date::date >= CURRENT_DATE)
                                THEN mq.id END) AS has_1001,
             COUNT(DISTINCT CASE WHEN mq.cert_name ILIKE '%1002%' AND mq.status = 'active'
                                  AND (mq.expiry_date IS NULL OR mq.expiry_date = ''
                                       OR NOT mq.expiry_date ~ '^\\d{4}-\\d{2}-\\d{2}'
                                       OR mq.expiry_date::date >= CURRENT_DATE)
                                THEN mq.id END) AS has_1002,
             COUNT(DISTINCT CASE WHEN mq.cert_name ILIKE '%1403%' AND mq.status = 'active'
                                  AND (mq.expiry_date IS NULL OR mq.expiry_date = ''
                                       OR NOT mq.expiry_date ~ '^\\d{4}-\\d{2}-\\d{2}'
                                       OR mq.expiry_date::date >= CURRENT_DATE)
                                THEN mq.id END) AS has_1403,
             COUNT(DISTINCT CASE WHEN mq.cert_name ILIKE '%1500%' AND mq.status = 'active'
                                  AND (mq.expiry_date IS NULL OR mq.expiry_date = ''
                                       OR NOT mq.expiry_date ~ '^\\d{4}-\\d{2}-\\d{2}'
                                       OR mq.expiry_date::date >= CURRENT_DATE)
                                THEN mq.id END) AS has_1500,
             COALESCE(SUM(CASE WHEN t."completedDate" ~ '^\\d{4}-'
                               AND EXTRACT(YEAR FROM t."completedDate"::date) = EXTRACT(YEAR FROM CURRENT_DATE)
                          THEN t.hours ELSE 0 END), 0) AS hours_this_year
      FROM members m
      LEFT JOIN member_qualifications mq ON m.id = mq.member_id
      LEFT JOIN training t ON m.id = t."memberId"
      WHERE m.status IN ('Active', 'Probationary')
        AND m.department_id = $1
      GROUP BY m.id, m.name, m.rank
      ORDER BY m.name
    `, [stationId]);
    const memberCompliance = memberComplianceRes.rows.map(row => ({
      memberId: row.id,
      name: row.name,
      position: row.position,
      nfpa1001: parseInt(row.has_1001) > 0,
      nfpa1002: parseInt(row.has_1002) > 0,
      nfpa1403: parseInt(row.has_1403) > 0,
      nfpa1500: parseInt(row.has_1500) > 0,
      trainingHoursThisYear: parseInt(row.hours_this_year || 0),
      compliant: (parseInt(row.hours_this_year || 0) >= requiredHoursPerMember && parseInt(row.has_1001) > 0 && parseInt(row.has_1002) > 0)
    }));

    res.json({
      summary: {
        totalMembers,
        trainingHoursThisYear,
        requiredHoursTotal,
        targetHoursPerMember: requiredHoursPerMember
      },
      nfpaCompliance: {
        nfpa1001: { compliant: nfpa1001Compliant, percentage: parseFloat(pct(nfpa1001Compliant)) },
        nfpa1002: { compliant: nfpa1002Compliant, percentage: parseFloat(pct(nfpa1002Compliant)) },
        nfpa1403: { compliant: nfpa1403Compliant, percentage: parseFloat(pct(nfpa1403Compliant)) },
        nfpa1500: { compliant: nfpa1500Compliant, percentage: parseFloat(pct(nfpa1500Compliant)) }
      },
      oshaCompliance: {
        compliant: oshaCompliant,
        percentage: parseFloat(pct(oshaCompliant))
      },
      memberCompliance
    });
  } catch (e) {
    console.error('training-ai /compliance error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
