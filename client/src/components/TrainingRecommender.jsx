import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

export default function TrainingRecommender() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [loading, setLoading] = useState(false);

  // Dashboard state
  const [dashboardData, setDashboardData] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(false);

  // Recommendations state
  const [members, setMembers] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState('department');
  const [recommendations, setRecommendations] = useState(null);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);

  // Curriculum state
  const [curriculumForm, setCurriculumForm] = useState({
    topic: '',
    duration: '2hr',
    targetAudience: ['All'],
    objectives: ''
  });
  const [curriculum, setCurriculum] = useState(null);
  const [curriculumLoading, setCurriculumLoading] = useState(false);

  // Compliance state
  const [complianceData, setComplianceData] = useState(null);
  const [complianceLoading, setComplianceLoading] = useState(false);

  // Load dashboard data
  useEffect(() => {
    if (activeTab === 'dashboard') {
      loadDashboard();
    }
  }, [activeTab]);

  // Load members for recommendations dropdown
  useEffect(() => {
    if (activeTab === 'recommendations') {
      loadMembers();
    }
  }, [activeTab]);

  // Load compliance data
  useEffect(() => {
    if (activeTab === 'compliance') {
      loadCompliance();
    }
  }, [activeTab]);

  const loadDashboard = async () => {
    setDashboardLoading(true);
    try {
      const raw = await api.get('/api/training-ai/gaps');
      const data = raw?.data || raw || {};
      setDashboardData(data);
    } catch (err) {
      console.error('Failed to load dashboard:', err);
      setDashboardData(null);
    } finally {
      setDashboardLoading(false);
    }
  };

  const loadMembers = async () => {
    try {
      const raw = await api.get('/api/members');
      const data = Array.isArray(raw?.data) ? raw.data : Array.isArray(raw) ? raw : [];
      setMembers(data);
    } catch (err) {
      console.error('Failed to load members:', err);
      setMembers([]);
    }
  };

  const loadCompliance = async () => {
    setComplianceLoading(true);
    try {
      const raw = await api.get('/api/training-ai/compliance');
      const data = raw?.data || raw || {};
      setComplianceData(data);
    } catch (err) {
      console.error('Failed to load compliance:', err);
      setComplianceData(null);
    } finally {
      setComplianceLoading(false);
    }
  };

  const handleGenerateRecommendations = async () => {
    setRecommendationsLoading(true);
    try {
      const body = selectedMemberId !== 'department' ? { memberId: selectedMemberId } : {};
      const raw = await api.post('/api/training-ai/recommend', body);
      const data = raw?.data || raw || {};
      setRecommendations(data);
    } catch (err) {
      console.error('Failed to generate recommendations:', err);
      alert('Error generating recommendations: ' + err.message);
    } finally {
      setRecommendationsLoading(false);
    }
  };

  const handleGenerateCurriculum = async () => {
    setCurriculumLoading(true);
    try {
      const raw = await api.post('/api/training-ai/curriculum', curriculumForm);
      const data = raw?.data || raw || {};
      setCurriculum(data);
    } catch (err) {
      console.error('Failed to generate curriculum:', err);
      alert('Error generating curriculum: ' + err.message);
    } finally {
      setCurriculumLoading(false);
    }
  };

  const handleCurriculumFieldChange = (field, value) => {
    setCurriculumForm(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleAudienceToggle = (audience) => {
    setCurriculumForm(prev => ({
      ...prev,
      targetAudience: prev.targetAudience.includes(audience)
        ? prev.targetAudience.filter(a => a !== audience)
        : [...prev.targetAudience, audience]
    }));
  };

  const renderDashboard = () => {
    if (dashboardLoading) return <div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>;
    if (!dashboardData) return <div className="text-red-500" style={{ padding: '20px' }}>Failed to load dashboard data</div>;

    const stats = dashboardData.stats || {};
    const expiringCerts = Array.isArray(dashboardData.expiringCerts) ? dashboardData.expiringCerts : [];
    const inactiveMembers = Array.isArray(dashboardData.inactiveMembers) ? dashboardData.inactiveMembers : [];
    const gapAreas = Array.isArray(dashboardData.gapAreas) ? dashboardData.gapAreas : [];

    return (
      <div>
        {/* KPI Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div className="bg-white dark:bg-gray-900" style={{ padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div className="text-gray-500 dark:text-gray-400" style={{ fontSize: '14px', marginBottom: '8px' }}>Total Members</div>
            <div className="text-gray-900 dark:text-gray-100" style={{ fontSize: '28px', fontWeight: 'bold' }}>{stats.totalMembers || 0}</div>
          </div>
          <div className="bg-white dark:bg-gray-900" style={{ padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div className="text-gray-500 dark:text-gray-400" style={{ fontSize: '14px', marginBottom: '8px' }}>Avg Training Hours</div>
            <div className="text-gray-900 dark:text-gray-100" style={{ fontSize: '28px', fontWeight: 'bold' }}>{stats.avgTrainingHours || 0}</div>
          </div>
          <div className="bg-white dark:bg-gray-900" style={{ padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div className="text-gray-500 dark:text-gray-400" style={{ fontSize: '14px', marginBottom: '8px' }}>Cert Compliance</div>
            <div className="text-blue-500 dark:text-blue-400" style={{ fontSize: '28px', fontWeight: 'bold' }}>{stats.certComplianceRate || 0}%</div>
          </div>
          <div className="bg-white dark:bg-gray-900" style={{ padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div className="text-gray-500 dark:text-gray-400" style={{ fontSize: '14px', marginBottom: '8px' }}>Members Needing Training</div>
            <div className="text-red-500" style={{ fontSize: '28px', fontWeight: 'bold' }}>{inactiveMembers.length}</div>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
          {/* Expiring Certifications */}
          <div className="bg-white dark:bg-gray-900" style={{ padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 className="text-gray-900 dark:text-gray-100" style={{ margin: '0 0 16px 0' }}>Expiring Certifications</h3>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {expiringCerts.length === 0 ? (
                <p className="text-gray-400 dark:text-gray-500" style={{ margin: 0 }}>No expiring certifications</p>
              ) : (
                expiringCerts.map((cert, idx) => (
                  <div key={idx} className="bg-gray-50 dark:bg-gray-950 border-l-4 border-red-500" style={{
                    padding: '12px',
                    marginBottom: '8px',
                    borderRadius: '8px'
                  }}>
                    <div className="text-gray-900 dark:text-gray-100" style={{ fontWeight: '600', marginBottom: '4px' }}>{cert.name}</div>
                    <div className="text-gray-500 dark:text-gray-400" style={{ fontSize: '13px', marginBottom: '4px' }}>{cert.qualification_name}</div>
                    <div className={cert.days_until_expiry < 30 ? 'bg-red-200 dark:bg-red-950/50 text-red-800 dark:text-red-300' : 'bg-yellow-300 dark:bg-yellow-950/50 text-amber-900 dark:text-amber-300'} style={{
                      fontSize: '12px',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      display: 'inline-block'
                    }}>
                      {cert.days_until_expiry < 0 ? 'EXPIRED' : `${cert.days_until_expiry} days`}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Inactive Members */}
          <div className="bg-white dark:bg-gray-900" style={{ padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 className="text-gray-900 dark:text-gray-100" style={{ margin: '0 0 16px 0' }}>Inactive Members (30+ days)</h3>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {inactiveMembers.length === 0 ? (
                <p className="text-gray-400 dark:text-gray-500" style={{ margin: 0 }}>All members active</p>
              ) : (
                inactiveMembers.map((member, idx) => (
                  <div key={idx} className="bg-gray-50 dark:bg-gray-950 border-l-4 border-amber-500" style={{
                    padding: '12px',
                    marginBottom: '8px',
                    borderRadius: '8px'
                  }}>
                    <div className="text-gray-900 dark:text-gray-100" style={{ fontWeight: '600', marginBottom: '4px' }}>{member.name}</div>
                    <div className="text-gray-500 dark:text-gray-400" style={{ fontSize: '12px' }}>
                      Last training: {member.last_training_date ? new Date(member.last_training_date).toLocaleDateString() : 'Never'} ({member.days_since_training || '?'} days ago)
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Gap Areas */}
          <div className="bg-white dark:bg-gray-900" style={{ padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 className="text-gray-900 dark:text-gray-100" style={{ margin: '0 0 16px 0' }}>Training Gaps (&lt;50% adoption)</h3>
            <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
              {gapAreas.length === 0 ? (
                <p className="text-gray-400 dark:text-gray-500" style={{ margin: 0 }}>No significant gaps</p>
              ) : (
                gapAreas.map((gap, idx) => (
                  <div key={idx} style={{ marginBottom: '16px' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginBottom: '8px',
                      fontSize: '13px'
                    }}>
                      <span className="text-gray-900 dark:text-gray-100" style={{ fontWeight: '600' }}>{gap.qualification}</span>
                      <span className="text-gray-500 dark:text-gray-400">{gap.adoptionPercentage}%</span>
                    </div>
                    <div className="bg-gray-200 dark:bg-gray-700" style={{
                      height: '8px',
                      borderRadius: '4px',
                      overflow: 'hidden'
                    }}>
                      <div className="bg-blue-500" style={{
                        height: '100%',
                        width: `${gap.adoptionPercentage}%`,
                        transition: 'width 0.3s'
                      }} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderRecommendations = () => {
    return (
      <div>
        <div className="bg-white dark:bg-gray-900" style={{
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '24px'
        }}>
          <h3 className="text-gray-900 dark:text-gray-100" style={{ margin: '0 0 16px 0' }}>Generate Training Recommendations</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label className="text-gray-900 dark:text-gray-100" style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Select Member</label>
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              >
                <option value="department">Whole Department</option>
                {members.map(member => (
                  <option key={member.id} value={member.id}>{member.name}</option>
                ))}
              </select>
            </div>
          </div>
          <button
            onClick={handleGenerateRecommendations}
            disabled={recommendationsLoading}
            className="bg-blue-500 text-white"
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: recommendationsLoading ? 'not-allowed' : 'pointer',
              opacity: recommendationsLoading ? 0.6 : 1
            }}
          >
            {recommendationsLoading ? 'Generating...' : 'Generate Recommendations'}
          </button>
        </div>

        {recommendationsLoading && (
          <div className="bg-white dark:bg-gray-900" style={{
            padding: '40px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <div className="border-4 border-gray-200 dark:border-gray-700 border-t-blue-500" style={{
              display: 'inline-block',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <p className="text-gray-500 dark:text-gray-400" style={{ marginTop: '16px' }}>Generating AI recommendations...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {recommendations && !recommendationsLoading && (
          <div className="bg-white dark:bg-gray-900" style={{ padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div style={{ marginBottom: '16px' }}>
              <h3 className="text-gray-900 dark:text-gray-100" style={{ margin: '0 0 8px 0' }}>
                Recommendations for {recommendations.memberName}
              </h3>
              <div className={recommendations.priority === 'high' ? 'bg-red-200 dark:bg-red-950/50 text-red-800 dark:text-red-300' : recommendations.priority === 'medium' ? 'bg-yellow-300 dark:bg-yellow-950/50 text-amber-900 dark:text-amber-300' : 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300'} style={{
                display: 'inline-block',
                padding: '4px 12px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: '600'
              }}>
                {recommendations.priority.toUpperCase()} PRIORITY
              </div>
            </div>
            <p className="text-gray-500 dark:text-gray-400" style={{ marginBottom: '20px', fontSize: '14px' }}>{recommendations.summary}</p>
            <div className="border-t border-gray-200 dark:border-gray-700" style={{ paddingTop: '16px' }}>
              <h4 className="text-gray-900 dark:text-gray-100" style={{ margin: '0 0 12px 0' }}>Detailed Recommendations:</h4>
              {Array.isArray(recommendations.recommendations) ? (
                recommendations.recommendations.map((rec) => (
                  <div key={rec.id} className="bg-gray-50 dark:bg-gray-950" style={{
                    padding: '12px',
                    marginBottom: '12px',
                    borderRadius: '8px',
                    borderLeft: `4px solid ${rec.priority === 'high' ? '#ef4444' : rec.priority === 'medium' ? '#f59e0b' : '#10b981'}`
                  }}>
                    <div className="text-gray-900 dark:text-gray-100" style={{ fontSize: '13px' }}>{rec.text}</div>
                  </div>
                ))
              ) : (
                <div className="text-gray-500 dark:text-gray-400">No detailed recommendations available</div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCurriculum = () => {
    const audiences = ['All', 'Officers', 'Drivers', 'Firefighters', 'Probationary'];

    return (
      <div>
        <div className="bg-white dark:bg-gray-900" style={{
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '24px'
        }}>
          <h3 className="text-gray-900 dark:text-gray-100" style={{ margin: '0 0 16px 0' }}>Create Training Curriculum</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '16px' }}>
            <div>
              <label className="text-gray-900 dark:text-gray-100" style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Topic</label>
              <input
                type="text"
                value={curriculumForm.topic}
                onChange={(e) => handleCurriculumFieldChange('topic', e.target.value)}
                placeholder="e.g., Hazmat Response"
                className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div>
              <label className="text-gray-900 dark:text-gray-100" style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Duration</label>
              <select
                value={curriculumForm.duration}
                onChange={(e) => handleCurriculumFieldChange('duration', e.target.value)}
                className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              >
                <option value="1hr">1 Hour</option>
                <option value="2hr">2 Hours</option>
                <option value="4hr">4 Hours</option>
                <option value="full-day">Full Day</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label className="text-gray-900 dark:text-gray-100" style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Target Audience</label>
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {audiences.map(audience => (
                <label key={audience} style={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={curriculumForm.targetAudience.includes(audience)}
                    onChange={() => handleAudienceToggle(audience)}
                    style={{ marginRight: '8px', cursor: 'pointer' }}
                  />
                  <span className="text-gray-900 dark:text-gray-100" style={{ fontSize: '14px' }}>{audience}</span>
                </label>
              ))}
            </div>
          </div>

          <div style={{ marginBottom: '16px' }}>
            <label className="text-gray-900 dark:text-gray-100" style={{ display: 'block', fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>Objectives</label>
            <textarea
              value={curriculumForm.objectives}
              onChange={(e) => handleCurriculumFieldChange('objectives', e.target.value)}
              placeholder="Describe the training objectives..."
              className="bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 border border-gray-300 dark:border-gray-600"
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                fontSize: '14px',
                minHeight: '100px',
                fontFamily: 'inherit',
                boxSizing: 'border-box'
              }}
            />
          </div>

          <button
            onClick={handleGenerateCurriculum}
            disabled={!curriculumForm.topic || curriculumLoading}
            className="bg-blue-500 text-white"
            style={{
              padding: '10px 20px',
              border: 'none',
              borderRadius: '8px',
              fontWeight: '600',
              cursor: !curriculumForm.topic || curriculumLoading ? 'not-allowed' : 'pointer',
              opacity: !curriculumForm.topic || curriculumLoading ? 0.6 : 1
            }}
          >
            {curriculumLoading ? 'Generating...' : 'Generate Curriculum'}
          </button>
        </div>

        {curriculumLoading && (
          <div className="bg-white dark:bg-gray-900" style={{
            padding: '40px',
            borderRadius: '12px',
            boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
            textAlign: 'center'
          }}>
            <div className="border-4 border-gray-200 dark:border-gray-700 border-t-blue-500" style={{
              display: 'inline-block',
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite'
            }} />
            <p className="text-gray-500 dark:text-gray-400" style={{ marginTop: '16px' }}>Generating curriculum...</p>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {curriculum && !curriculumLoading && (
          <div className="bg-white dark:bg-gray-900" style={{ padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <h3 className="text-gray-900 dark:text-gray-100" style={{ margin: '0 0 8px 0' }}>{curriculum.title}</h3>
            <p className="text-gray-500 dark:text-gray-400" style={{ marginBottom: '16px', fontSize: '14px' }}>{curriculum.overview}</p>

            <div style={{ marginBottom: '20px' }}>
              <h4 className="text-gray-900 dark:text-gray-100" style={{ margin: '0 0 12px 0' }}>Objectives</h4>
              <ul className="text-gray-500 dark:text-gray-400" style={{ margin: 0, paddingLeft: '20px', fontSize: '14px' }}>
                {Array.isArray(curriculum.objectives) && curriculum.objectives.map((obj, idx) => (
                  <li key={idx} style={{ marginBottom: '8px' }}>{obj}</li>
                ))}
              </ul>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <h4 className="text-gray-900 dark:text-gray-100" style={{ margin: '0 0 12px 0' }}>Sessions</h4>
              {Array.isArray(curriculum.sessions) && curriculum.sessions.map((session, idx) => (
                <details key={idx} style={{ marginBottom: '12px' }}>
                  <summary className="bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100" style={{
                    padding: '12px',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600'
                  }}>
                    {session.title} ({session.duration})
                  </summary>
                  <div className="text-gray-500 dark:text-gray-400" style={{ paddingLeft: '12px', paddingTop: '12px', fontSize: '14px' }}>
                    <p><strong>Content:</strong> {session.content}</p>
                    {Array.isArray(session.materials) && session.materials.length > 0 && (
                      <div>
                        <strong>Materials:</strong>
                        <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                          {session.materials.map((mat, midx) => (
                            <li key={midx}>{mat}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {Array.isArray(session.exercises) && session.exercises.length > 0 && (
                      <div>
                        <strong>Exercises:</strong>
                        <ul style={{ margin: '8px 0', paddingLeft: '20px' }}>
                          {session.exercises.map((ex, eidx) => (
                            <li key={eidx}>{ex}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </details>
              ))}
            </div>

            <div className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400" style={{
              padding: '12px',
              borderRadius: '8px',
              fontSize: '14px'
            }}>
              <strong>Assessment:</strong> {curriculum.assessment}
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderCompliance = () => {
    if (complianceLoading) return <div style={{ padding: '20px', textAlign: 'center' }}>Loading compliance data...</div>;
    if (!complianceData) return <div className="text-red-500" style={{ padding: '20px' }}>Failed to load compliance data</div>;

    const { summary, nfpaCompliance, oshaCompliance, memberCompliance } = complianceData;
    const nfpa = nfpaCompliance || {};

    return (
      <div>
        {/* Summary Cards */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px',
          marginBottom: '24px'
        }}>
          <div className="bg-white dark:bg-gray-900" style={{ padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div className="text-gray-500 dark:text-gray-400" style={{ fontSize: '14px', marginBottom: '8px' }}>Total Members</div>
            <div className="text-gray-900 dark:text-gray-100" style={{ fontSize: '28px', fontWeight: 'bold' }}>{summary?.totalMembers || 0}</div>
          </div>
          <div className="bg-white dark:bg-gray-900" style={{ padding: '20px', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>
            <div className="text-gray-500 dark:text-gray-400" style={{ fontSize: '14px', marginBottom: '8px' }}>Training Hours This Year</div>
            <div className="text-blue-500 dark:text-blue-400" style={{ fontSize: '28px', fontWeight: 'bold' }}>{summary?.trainingHoursThisYear || 0}</div>
            <div className="text-gray-500 dark:text-gray-400" style={{ fontSize: '12px', marginTop: '8px' }}>Target: {summary?.requiredHoursTotal || 0}h</div>
          </div>
        </div>

        {/* NFPA Compliance Bars */}
        <div className="bg-white dark:bg-gray-900" style={{
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '24px'
        }}>
          <h3 className="text-gray-900 dark:text-gray-100" style={{ margin: '0 0 20px 0' }}>NFPA Compliance</h3>
          {['nfpa1001', 'nfpa1002', 'nfpa1403', 'nfpa1500'].map(standard => {
            const data = nfpa[standard];
            const percent = data?.percentage || 0;
            return (
              <div key={standard} style={{ marginBottom: '20px' }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  marginBottom: '8px',
                  fontSize: '14px'
                }}>
                  <span className="text-gray-900 dark:text-gray-100" style={{ fontWeight: '600' }}>NFPA {standard.slice(-4)} ({data?.compliant || 0} members)</span>
                  <span className="text-blue-500 dark:text-blue-400" style={{ fontWeight: '600' }}>{percent.toFixed(1)}%</span>
                </div>
                <div className="bg-gray-200 dark:bg-gray-700" style={{
                  height: '12px',
                  borderRadius: '6px',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    height: '100%',
                    width: `${Math.min(percent, 100)}%`,
                    background: percent >= 80 ? '#10b981' : percent >= 60 ? '#f59e0b' : '#ef4444',
                    transition: 'width 0.3s'
                  }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* OSHA Compliance */}
        <div className="bg-white dark:bg-gray-900" style={{
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          marginBottom: '24px'
        }}>
          <h3 className="text-gray-900 dark:text-gray-100" style={{ margin: '0 0 20px 0' }}>OSHA Compliance</h3>
          <div style={{ marginBottom: '20px' }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '8px',
              fontSize: '14px'
            }}>
              <span className="text-gray-900 dark:text-gray-100" style={{ fontWeight: '600' }}>OSHA ({oshaCompliance?.compliant || 0} members)</span>
              <span className="text-blue-500 dark:text-blue-400" style={{ fontWeight: '600' }}>{(oshaCompliance?.percentage || 0).toFixed(1)}%</span>
            </div>
            <div className="bg-gray-200 dark:bg-gray-700" style={{
              height: '12px',
              borderRadius: '6px',
              overflow: 'hidden'
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min(oshaCompliance?.percentage || 0, 100)}%`,
                background: (oshaCompliance?.percentage || 0) >= 80 ? '#10b981' : (oshaCompliance?.percentage || 0) >= 60 ? '#f59e0b' : '#ef4444',
                transition: 'width 0.3s'
              }} />
            </div>
          </div>
        </div>

        {/* Member Compliance Table */}
        <div className="bg-white dark:bg-gray-900" style={{
          padding: '20px',
          borderRadius: '12px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
          overflowX: 'auto'
        }}>
          <h3 className="text-gray-900 dark:text-gray-100" style={{ margin: '0 0 16px 0' }}>Member Compliance</h3>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '13px'
          }}>
            <thead>
              <tr className="border-b-2 border-gray-200 dark:border-gray-700">
                <th className="text-gray-500 dark:text-gray-400" style={{ padding: '12px', textAlign: 'left', fontWeight: '600' }}>Name</th>
                <th className="text-gray-500 dark:text-gray-400" style={{ padding: '12px', textAlign: 'center', fontWeight: '600' }}>Position</th>
                <th className="text-gray-500 dark:text-gray-400" style={{ padding: '12px', textAlign: 'center', fontWeight: '600' }}>1001</th>
                <th className="text-gray-500 dark:text-gray-400" style={{ padding: '12px', textAlign: 'center', fontWeight: '600' }}>1002</th>
                <th className="text-gray-500 dark:text-gray-400" style={{ padding: '12px', textAlign: 'center', fontWeight: '600' }}>1403</th>
                <th className="text-gray-500 dark:text-gray-400" style={{ padding: '12px', textAlign: 'center', fontWeight: '600' }}>1500</th>
                <th className="text-gray-500 dark:text-gray-400" style={{ padding: '12px', textAlign: 'center', fontWeight: '600' }}>Hours</th>
                <th className="text-gray-500 dark:text-gray-400" style={{ padding: '12px', textAlign: 'center', fontWeight: '600' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {Array.isArray(memberCompliance) && memberCompliance.map((member) => (
                <tr key={member.memberId} className="border-b border-gray-200 dark:border-gray-700">
                  <td className="text-gray-900 dark:text-gray-100" style={{ padding: '12px' }}>{member.name}</td>
                  <td className="text-gray-500 dark:text-gray-400" style={{ padding: '12px', textAlign: 'center' }}>{member.position}</td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span style={{ color: member.nfpa1001 ? '#10b981' : '#ef4444' }}>
                      {member.nfpa1001 ? '✓' : '✗'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span style={{ color: member.nfpa1002 ? '#10b981' : '#ef4444' }}>
                      {member.nfpa1002 ? '✓' : '✗'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span style={{ color: member.nfpa1403 ? '#10b981' : '#ef4444' }}>
                      {member.nfpa1403 ? '✓' : '✗'}
                    </span>
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span style={{ color: member.nfpa1500 ? '#10b981' : '#ef4444' }}>
                      {member.nfpa1500 ? '✓' : '✗'}
                    </span>
                  </td>
                  <td className="text-gray-900 dark:text-gray-100" style={{ padding: '12px', textAlign: 'center' }}>
                    {member.trainingHoursThisYear}
                  </td>
                  <td style={{ padding: '12px', textAlign: 'center' }}>
                    <span className={member.compliant ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300' : 'bg-red-200 dark:bg-red-950/50 text-red-800 dark:text-red-300'} style={{
                      display: 'inline-block',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      {member.compliant ? 'Compliant' : 'Non-Compliant'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
      <h1 className="text-gray-900 dark:text-gray-100" style={{ margin: '0 0 24px 0' }}>AI Training Recommender</h1>

      {/* Tabs */}
      <div className="border-b-2 border-gray-200 dark:border-gray-700" style={{
        display: 'flex',
        gap: '0',
        marginBottom: '24px'
      }}>
        {[
          { id: 'dashboard', label: 'Dashboard' },
          { id: 'recommendations', label: 'Recommendations' },
          { id: 'curriculum', label: 'Curriculum Builder' },
          { id: 'compliance', label: 'Compliance' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={activeTab === tab.id ? 'bg-white dark:bg-gray-900 text-blue-500 dark:text-blue-400' : 'bg-transparent text-gray-500 dark:text-gray-400'}
            style={{
              padding: '12px 20px',
              border: activeTab === tab.id ? '2px solid #3b82f6' : 'none',
              borderBottom: activeTab === tab.id ? '2px solid #3b82f6' : '2px solid transparent',
              cursor: 'pointer',
              fontWeight: activeTab === tab.id ? '600' : '500',
              fontSize: '14px'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === 'dashboard' && renderDashboard()}
        {activeTab === 'recommendations' && renderRecommendations()}
        {activeTab === 'curriculum' && renderCurriculum()}
        {activeTab === 'compliance' && renderCompliance()}
      </div>
    </div>
  );
}
